// ============================================================
//  NotificationService.gs — v2 (refactored)
//  Perubahan dari v1:
//  - Semua parameter "session" diganti "agenda" karena SESSIONS dihapus
//  - session.nama_area      → agenda.dept (nama area dari dept)
//  - session.session_id     → agenda.agenda_id
//  - session.auditee_emails → agenda.auditee_emails
//  - session.auditor_emails → agenda.auditor_emails
//  - session.dept_head_email→ agenda.dept_head_email
//  - finding.finding_id     → result.result_id
//  - finding.status_persyaratan → result.status
//  - finding.deskripsi_temuan   → result.deskripsi_temuan
//  - _findingInfo(): pakai result + agenda
//  - _appLink(): param session_id → agenda_id, finding_id → result_id
//  - Semua fungsi notif tetap ada — tidak ada yang dihapus
// ============================================================

const APP_URL = ScriptApp.getService().getUrl();


// ════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ════════════════════════════════════════════════════════════

function _appLink(page, params) {
  params = params || {};
  const qs = Object.keys(params)
    .map(function(k) { return k + '=' + encodeURIComponent(params[k]); })
    .join('&');
  return APP_URL + '?page=' + page + (qs ? '&' + qs : '');
}

/**
 * Tabel info temuan untuk body email.
 * @param {Object} result  — row dari AUDIT_RESULTS
 * @param {Object} agenda  — row dari AUDIT_AGENDA
 */
function _findingInfo(result, agenda) {
  return `
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr>
        <td style="padding:6px;color:#666;width:160px;">Area</td>
        <td style="padding:6px;font-weight:bold;">${escapeHtml(agenda.dept)}</td>
      </tr>
      <tr style="background:#f9f9f9;">
        <td style="padding:6px;color:#666;">Persyaratan</td>
        <td style="padding:6px;">#${result.nomor_persyaratan} — Check Item #${result.check_item_no}</td>
      </tr>
      <tr>
        <td style="padding:6px;color:#666;">Check Item</td>
        <td style="padding:6px;">${escapeHtml(result.check_item || '')}</td>
      </tr>
      <tr style="background:#f9f9f9;">
        <td style="padding:6px;color:#666;">Temuan</td>
        <td style="padding:6px;">${escapeHtml(result.deskripsi_temuan || '')}</td>
      </tr>
      <tr>
        <td style="padding:6px;color:#666;">Status</td>
        <td style="padding:6px;"><strong>${escapeHtml(result.status || '')}</strong></td>
      </tr>
    </table>`;
}


// ════════════════════════════════════════════════════════════
//  NOTIFIKASI — AUDIT FLOW
// ════════════════════════════════════════════════════════════

/**
 * Notif ke auditee saat auditor mulai audit.
 * @param {Object} agenda  — row AUDIT_AGENDA
 */
function notifyAuditStarted(agenda) {
  const auditees = parseCSV(agenda.auditee_emails);
  if (!auditees.length) return;
  const body = `
    <p>Audit untuk area <strong>${escapeHtml(agenda.dept)}</strong>
    telah dimulai pada <strong>${agenda.started_at}</strong>.</p>
    <p>Auditor: <strong>${escapeHtml(agenda.auditor_emails)}</strong></p>
    <p>Kamu terdaftar sebagai <strong>Auditee</strong> untuk sesi ini.</p>`;
  sendEmail(auditees,
    `[Audit System] Audit Dimulai — ${agenda.dept}`,
    emailTemplate('Audit Dimulai: ' + agenda.dept, body,
      'Lihat Detail Audit', _appLink('audit', { agenda_id: agenda.agenda_id })));
}

/**
 * Notif ke auditee bahwa audit selesai dan butuh persetujuan (agreement).
 * @param {Object} agenda
 * @param {number} findingCount  jumlah Non Comply / OFI
 */
function notifyRequestAgreement(agenda, findingCount) {
  const auditees = parseCSV(agenda.auditee_emails);
  if (!auditees.length) return;
  const body = `
    <p>Audit area <strong>${escapeHtml(agenda.dept)}</strong> telah selesai.</p>
    <p>Ditemukan <strong>${findingCount} temuan</strong> (Non Comply / OFI).</p>
    <p>Diperlukan <strong>persetujuan hasil audit</strong> dari Anda.</p>`;
  sendEmail(auditees,
    `[Audit System] Diperlukan: Persetujuan Hasil Audit — ${agenda.dept}`,
    emailTemplate('Persetujuan Hasil Audit Diperlukan', body,
      'Berikan Persetujuan', _appLink('agreement', { agenda_id: agenda.agenda_id })));
}

/**
 * Notif ke auditee bahwa agreement diterima dan perlu isi CA (TPP).
 * @param {Object} agenda
 * @param {Object[]} results  — array row AUDIT_RESULTS (Non Comply / OFI)
 */
function notifyRequestCA(agenda, results) {
  const auditees = parseCSV(agenda.auditee_emails);
  if (!auditees.length) return;
  const body = `
    <p>Persetujuan hasil audit untuk area <strong>${escapeHtml(agenda.dept)}</strong> telah diterima.</p>
    <p>Silakan isi <strong>Correction dan Rencana Corrective Action</strong>
    untuk <strong>${results.length} temuan</strong>.</p>`;
  sendEmail(auditees,
    `[Audit System] Diperlukan: Isi Corrective Action — ${agenda.dept}`,
    emailTemplate('Isi Corrective Action', body,
      'Isi CA Sekarang', _appLink('corrective-action', { agenda_id: agenda.agenda_id })));
}


// ════════════════════════════════════════════════════════════
//  NOTIFIKASI — TPP / CA APPROVAL CHAIN
// ════════════════════════════════════════════════════════════

/**
 * Notif ke DeptHead saat auditee submit CA (TPP).
 * @param {Object} agenda
 * @param {Object} result  — row AUDIT_RESULTS
 */
function notifyCASubmitted(agenda, result) {
  if (!agenda.dept_head_email) return;
  const body = `
    <p>Corrective Action untuk temuan berikut menunggu persetujuan Anda:</p>
    ${_findingInfo(result, agenda)}
    <p><strong>Target Selesai:</strong> ${result.target_date || '-'}</p>`;
  sendEmail(agenda.dept_head_email,
    `[Audit System] Approve CA — ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Persetujuan Corrective Action Diperlukan', body,
      'Review & Approve', _appLink('approval', { result_id: result.result_id, stage: 'TPP', level: 'DeptHead' })));
}

/**
 * Notif ke auditor saat DeptHead approve CA.
 * @param {Object} agenda
 * @param {Object} result
 */
function notifyCAToAuditors(agenda, result) {
  const auditors = parseCSV(agenda.auditor_emails);
  if (!auditors.length) return;
  const body = `
    <p>Dept Head telah menyetujui CA. Diperlukan persetujuan <strong>salah satu Auditor</strong>:</p>
    ${_findingInfo(result, agenda)}`;
  sendEmail(auditors,
    `[Audit System] Approve CA (Auditor) — ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Persetujuan CA oleh Auditor Diperlukan', body,
      'Review & Approve', _appLink('approval', { result_id: result.result_id, stage: 'TPP', level: 'Auditor' })));
}

/**
 * Notif ke auditor lain (gugur) + Koordinator saat salah satu auditor approve CA.
 * @param {Object} agenda
 * @param {Object} result
 * @param {string} approverEmail
 */
function notifyCAApprovedByAuditor(agenda, result, approverEmail) {
  // Auditor lain yang gugur
  const otherAuditors = parseCSV(agenda.auditor_emails)
    .filter(a => normalizeEmail(a) !== normalizeEmail(approverEmail));
  if (otherAuditors.length) {
    sendEmail(otherAuditors,
      `[Audit System] Info: CA Sudah Di-approve — ${agenda.dept}`,
      emailTemplate('Info: CA Sudah Di-approve', `
        <p>CA telah disetujui oleh <strong>${escapeHtml(approverEmail)}</strong>.</p>
        ${_findingInfo(result, agenda)}
        <p>Approval Anda tidak diperlukan. Proses dilanjutkan ke Koordinator.</p>`));
  }
  // Koordinator
  const koordinators = getAllKoordinators();
  if (!koordinators.length) return;
  const body = `
    <p>Dept Head dan Auditor telah menyetujui CA. Diperlukan persetujuan final <strong>Koordinator</strong>:</p>
    ${_findingInfo(result, agenda)}`;
  sendEmail(koordinators.map(u => u.email),
    `[Audit System] Approve CA (Koordinator) — ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Persetujuan CA oleh Koordinator Diperlukan', body,
      'Review & Approve', _appLink('approval', { result_id: result.result_id, stage: 'TPP', level: 'Koordinator' })));
}

/**
 * Notif ke auditee saat CA fully approved — minta upload bukti implementasi.
 * @param {Object} agenda
 * @param {Object} result
 */
function notifyCAFullyApproved(agenda, result) {
  const auditees = parseCSV(agenda.auditee_emails);
  if (!auditees.length) return;
  const body = `
    <p>CA telah disetujui oleh semua pihak (Dept Head, Auditor, dan Koordinator).</p>
    ${_findingInfo(result, agenda)}
    <p>Silakan lakukan implementasi dan <strong>upload bukti</strong>.</p>
    <p><strong>Target Selesai:</strong> ${result.target_date || '-'}</p>`;
  sendEmail(auditees,
    `[Audit System] CA Disetujui — Upload Bukti Implementasi`,
    emailTemplate('CA Disetujui: Silakan Upload Bukti', body,
      'Upload Bukti Sekarang', _appLink('implementation', { result_id: result.result_id })));
}


// ════════════════════════════════════════════════════════════
//  NOTIFIKASI — IMPLEMENTASI APPROVAL CHAIN
// ════════════════════════════════════════════════════════════

/**
 * Notif ke DeptHead saat auditee upload bukti implementasi.
 * @param {Object} agenda
 * @param {Object} result
 */
function notifyImplSubmitted(agenda, result) {
  if (!agenda.dept_head_email) return;
  const body = `
    <p>Auditee telah mengunggah bukti implementasi. Diperlukan persetujuan Anda:</p>
    ${_findingInfo(result, agenda)}`;
  sendEmail(agenda.dept_head_email,
    `[Audit System] Approve Implementasi — ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Persetujuan Bukti Implementasi Diperlukan', body,
      'Review & Approve', _appLink('approval', { result_id: result.result_id, stage: 'IMPL', level: 'DeptHead' })));
}

/**
 * Notif ke auditor saat DeptHead approve implementasi.
 * @param {Object} agenda
 * @param {Object} result
 */
function notifyImplToAuditors(agenda, result) {
  const auditors = parseCSV(agenda.auditor_emails);
  if (!auditors.length) return;
  const body = `
    <p>Dept Head telah menyetujui bukti implementasi.
    Diperlukan persetujuan <strong>salah satu Auditor</strong>:</p>
    ${_findingInfo(result, agenda)}`;
  sendEmail(auditors,
    `[Audit System] Approve Implementasi (Auditor) — ${agenda.dept}`,
    emailTemplate('Persetujuan Implementasi oleh Auditor Diperlukan', body,
      'Review & Approve', _appLink('approval', { result_id: result.result_id, stage: 'IMPL', level: 'Auditor' })));
}

/**
 * Notif ke auditor lain (gugur) + Koordinator saat salah satu auditor approve implementasi.
 * @param {Object} agenda
 * @param {Object} result
 * @param {string} approverEmail
 */
function notifyImplApprovedByAuditor(agenda, result, approverEmail) {
  const otherAuditors = parseCSV(agenda.auditor_emails)
    .filter(a => normalizeEmail(a) !== normalizeEmail(approverEmail));
  if (otherAuditors.length) {
    sendEmail(otherAuditors,
      `[Audit System] Info: Implementasi Sudah Di-approve — ${agenda.dept}`,
      emailTemplate('Info: Implementasi Di-approve', `
        <p>Bukti implementasi telah disetujui oleh <strong>${escapeHtml(approverEmail)}</strong>.</p>
        ${_findingInfo(result, agenda)}
        <p>Proses dilanjutkan ke Koordinator.</p>`));
  }
  const koordinators = getAllKoordinators();
  if (!koordinators.length) return;
  const body = `
    <p>Dept Head dan Auditor telah menyetujui bukti implementasi.
    Diperlukan persetujuan final <strong>Koordinator</strong> untuk menutup temuan:</p>
    ${_findingInfo(result, agenda)}`;
  sendEmail(koordinators.map(u => u.email),
    `[Audit System] Approve Implementasi (Koordinator) — Final | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Persetujuan Implementasi oleh Koordinator', body,
      'Review & Close Finding', _appLink('approval', { result_id: result.result_id, stage: 'IMPL', level: 'Koordinator' })));
}

/**
 * Notif ke semua pihak saat temuan resmi ditutup (CLOSED).
 * @param {Object} agenda
 * @param {Object} result
 */
function notifyFindingClosed(agenda, result) {
  const recipients = [
    ...parseCSV(agenda.auditee_emails),
    ...parseCSV(agenda.auditor_emails),
    agenda.dept_head_email,
    ...getAllKoordinators().map(u => u.email),
  ].filter(function(v, i, a) { return v && a.indexOf(v) === i; });

  const body = `
    <p>Temuan berikut telah <strong>resmi ditutup (CLOSED)</strong>.</p>
    ${_findingInfo(result, agenda)}
    <p>Ditutup pada: <strong>${now()}</strong></p>`;
  sendEmail(recipients,
    `[Audit System] Temuan CLOSED — ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Temuan Berhasil Ditutup', body,
      'Lihat Detail', _appLink('finding', { result_id: result.result_id })));
}

/**
 * Notif ke semua pihak saat CA atau implementasi ditolak.
 * @param {Object} agenda
 * @param {Object} result
 * @param {string} stage         'TPP' | 'IMPL'
 * @param {string} rejecterEmail
 * @param {string} komentar
 */
function notifyRejected(agenda, result, stage, rejecterEmail, komentar) {
  const allParties = [
    ...parseCSV(agenda.auditee_emails),
    ...parseCSV(agenda.auditor_emails),
    agenda.dept_head_email,
  ].filter(function(v, i, a) { return v && a.indexOf(v) === i; });

  const stageLabel = stage === 'TPP' ? 'Corrective Action' : 'Bukti Implementasi';
  const body = `
    <p><strong>${stageLabel}</strong> untuk temuan berikut telah
    <strong>DITOLAK</strong> oleh <strong>${escapeHtml(rejecterEmail)}</strong>.</p>
    ${_findingInfo(result, agenda)}
    <p><strong>Alasan:</strong><br>${escapeHtml(komentar) || '<em>tidak ada komentar</em>'}</p>
    <p>Auditee perlu memperbaiki dan mengajukan ulang. Approval dimulai dari awal.</p>`;
  sendEmail(allParties,
    `[Audit System] ${stageLabel} Ditolak — ${agenda.dept}`,
    emailTemplate(stageLabel + ' Ditolak', body,
      'Perbaiki Sekarang', _appLink(
        stage === 'TPP' ? 'corrective-action' : 'implementation',
        { result_id: result.result_id }
      )));
}
