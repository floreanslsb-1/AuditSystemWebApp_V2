// ============================================================
//  ApprovalService.gs — v2 (refactored)
//  Perubahan dari v1:
//  - submitAgreement() dipindah ke SheetService (update AUDIT_AGENDA langsung)
//  - processApproval(): finding_id → result_id, session_id → agenda_id
//  - massApprove(): findingIds → resultIds, sessionIds → agendaIds
//  - _handleApprove(): updateFindingField → updateResultField, pakai AUDIT_RESULTS cols
//  - _handleReject(): sama
//  - _handleSkip(): sama
//  - _checkAgendaAllClosed(): menggantikan _checkSessionAllClosed()
//    cek semua Non Comply/OFI finding_status CLOSED/OVERDUE di agenda
//  - _validateApprover(): session → agenda, dept_head_email & auditor_emails dari agenda
//  - Semua fungsi lain (APPROVAL_CHAIN, _nextLevel, dll) tidak berubah
// ============================================================

const APPROVAL_CHAIN = ['DeptHead', 'Auditor', 'Koordinator'];

/**
 * Proses approval (approve/reject) untuk satu result (finding).
 * Koordinator bisa skip level tertentu dengan menyertakan skip_reason.
 */
function processApproval({
  spreadsheetId, resultId, agendaId,
  stage, level, action, byEmail,
  komentar = '', skipLevel = null, skipReason = '',
}) {
  // Cari result di AUDIT_RESULTS — filter per agenda untuk efisiensi
  const result = getAuditResultsByAgenda(spreadsheetId, agendaId)
    .find(r => r.result_id === resultId);
  if (!result) throw new Error('Result ' + resultId + ' tidak ditemukan.');

  // Cari agenda untuk validasi approver
  const agenda = getAgendaById(agendaId);
  if (!agenda) throw new Error('Agenda ' + agendaId + ' tidak ditemukan.');

  // Koordinator bisa skip level lain
  if (skipLevel && skipLevel !== level) {
    return _handleSkip({
      spreadsheetId, result, agenda,
      stage, skipLevel, byEmail, skipReason,
    });
  }

  _validateApprover(agenda, level, byEmail);

  if (action === CONFIG.APPROVAL_STATUS.REJECTED) {
    return _handleReject({ spreadsheetId, result, agenda, stage, level, byEmail, komentar });
  }
  return _handleApprove({ spreadsheetId, result, agenda, stage, level, byEmail, komentar });
}

/**
 * Mass approve — koordinator approve banyak result sekaligus.
 */
function massApprove({ spreadsheetId, resultIds, agendaIds, stage, level, byEmail, komentar = '' }) {
  const results = [];
  resultIds.forEach(function(resultId, i) {
    try {
      processApproval({
        spreadsheetId,
        resultId,
        agendaId: agendaIds[i] || agendaIds[0],
        stage,
        level,
        action: CONFIG.APPROVAL_STATUS.APPROVED,
        byEmail,
        komentar,
      });
      results.push({ result_id: resultId, success: true });
    } catch(err) {
      results.push({ result_id: resultId, success: false, reason: err.message });
    }
  });
  return { results, approved: results.filter(r => r.success).length };
}


// ── Handlers ──────────────────────────────────────────────────────

function _handleApprove({ spreadsheetId, result, agenda, stage, level, byEmail, komentar }) {
  const isTPP = stage === 'TPP';
  const C     = CONFIG.AUDIT_COLS.AUDIT_RESULTS;

  appendApprovalLog(spreadsheetId, {
    result_id: result.result_id, agenda_id: agenda.agenda_id,
    stage, level, action: 'APPROVED', by_email: byEmail, komentar,
    skipped: false, skip_reason: '',
  });

  const nextLevel = _nextLevel(level);

  if (nextLevel) {
    // Masih ada level berikutnya — kirim notif ke level berikutnya
    try {
      if (isTPP) {
        if (nextLevel === 'Auditor')     notifyTPPToAuditors(agenda, result);
        if (nextLevel === 'Koordinator') notifyTPPApprovedByAuditor(agenda, result, byEmail);
      } else {
        if (nextLevel === 'Auditor')     notifyImplToAuditors(agenda, result);
        if (nextLevel === 'Koordinator') notifyImplApprovedByAuditor(agenda, result, byEmail);
      }
    } catch(e) { console.warn('Notif approval gagal:', e.message); }
    return { success: true, nextLevel };
  }

  // Level terakhir (Koordinator) approved
  if (isTPP) {
    // TPP approved → OPEN_IMPL (tunggu auditee upload bukti)
    updateResultField(spreadsheetId, result.result_id,
      C.FINDING_STATUS, CONFIG.FINDING_STATUS.OPEN_IMPL);
    updateResultField(spreadsheetId, result.result_id,
      C.TPP_STATUS, CONFIG.APPROVAL_STATUS.APPROVED);
    try { notifyCAFullyApproved(agenda, result); } catch(e) {}
  } else {
    // Stage IMPL approved → CLOSED
    updateResultField(spreadsheetId, result.result_id,
      C.FINDING_STATUS, CONFIG.FINDING_STATUS.CLOSED);
    updateResultField(spreadsheetId, result.result_id,
      C.CLOSED_AT, now());
    try { notifyFindingClosed(agenda, result); } catch(e) {}
    _checkAgendaAllClosed(spreadsheetId, agenda.agenda_id);
  }

  return { success: true, nextLevel: null };
}

function _handleReject({ spreadsheetId, result, agenda, stage, level, byEmail, komentar }) {
  const isTPP = stage === 'TPP';
  const C     = CONFIG.AUDIT_COLS.AUDIT_RESULTS;

  appendApprovalLog(spreadsheetId, {
    result_id: result.result_id, agenda_id: agenda.agenda_id,
    stage, level, action: 'REJECTED', by_email: byEmail, komentar,
    skipped: false, skip_reason: '',
  });

  // Balik ke status sebelumnya
  updateResultField(spreadsheetId, result.result_id,
    C.FINDING_STATUS,
    isTPP ? CONFIG.FINDING_STATUS.OPEN : CONFIG.FINDING_STATUS.OPEN_IMPL
  );

  if (isTPP) {
    updateResultField(spreadsheetId, result.result_id,
      C.TPP_STATUS, CONFIG.APPROVAL_STATUS.REJECTED);
  }

  try { notifyRejected(agenda, result, stage, byEmail, komentar); } catch(e) {}

  return { success: true, rejected: true };
}

function _handleSkip({ spreadsheetId, result, agenda, stage, skipLevel, byEmail, skipReason }) {
  appendApprovalLog(spreadsheetId, {
    result_id: result.result_id, agenda_id: agenda.agenda_id,
    stage, level: skipLevel, action: 'APPROVED',
    by_email: byEmail, komentar: '',
    skipped: true, skip_reason: skipReason,
  });

  // Lanjut proses approval untuk level skipLevel seolah approve
  return _handleApprove({
    spreadsheetId, result, agenda,
    stage, level: skipLevel,
    byEmail, komentar: '[SKIP] ' + skipReason,
  });
}


// ── Helpers ──────────────────────────────────────────────────────

function _nextLevel(level) {
  const idx = APPROVAL_CHAIN.indexOf(level);
  return idx < APPROVAL_CHAIN.length - 1 ? APPROVAL_CHAIN[idx + 1] : null;
}

/**
 * Validasi bahwa byEmail berhak approve di level ini untuk agenda ini.
 * Menggantikan _validateApprover() lama yang pakai session.
 */
function _validateApprover(agenda, level, email) {
  if (level === 'DeptHead') {
    if (normalizeEmail(agenda.dept_head_email) !== normalizeEmail(email)) {
      throw new Error('Anda bukan Dept Head untuk area ini.');
    }
  } else if (level === 'Auditor') {
    if (!emailInCSV(agenda.auditor_emails, email)) {
      throw new Error('Anda bukan Auditor untuk agenda ini.');
    }
  } else if (level === 'Koordinator') {
    const user = getUserByEmail(email);
    if (!user || !parseRoles(user.roles).includes(CONFIG.ROLES.KOORDINATOR)) {
      throw new Error('Hanya Koordinator yang dapat approve di level ini.');
    }
  }
}

/**
 * Cek apakah semua Non Comply/OFI di agenda ini sudah CLOSED atau OVERDUE.
 * Menggantikan _checkSessionAllClosed() — tidak ada lagi session status.
 * Saat ini tidak ada aksi otomatis saat semua closed (agenda tetap DONE),
 * tapi fungsi ini tetap ada untuk logging / future use.
 */
function _checkAgendaAllClosed(spreadsheetId, agendaId) {
  const findings = getFindingsByAgenda(spreadsheetId, agendaId);
  if (!findings.length) return false;
  const allClosed = findings.every(function(f) {
    return f.finding_status === CONFIG.FINDING_STATUS.CLOSED ||
           f.finding_status === CONFIG.FINDING_STATUS.OVERDUE;
  });
  if (allClosed) {
    console.log('[ApprovalService] Semua finding agenda ' + agendaId + ' sudah CLOSED.');
    try {
      const ag = getAgendaById(agendaId);
      const koordinators = getAllKoordinators();
      if (ag && koordinators.length) {
        const subject = '[Audit System] Semua Temuan Closed — ' + ag.dept;
        const body = 'Semua temuan untuk area ' + ag.dept + ' sudah ditutup (CLOSED).\n\nSalam,\nSistem Audit Internal';
        koordinators.forEach(function(u) {
          try { GmailApp.sendEmail(u.email, subject, body); } catch(e) {}
        });
      }
    } catch(e) { console.warn('Notif all closed gagal:', e.message); }
  }
  return allClosed;
}
