// ============================================================
//  NotificationService.gs
//  Semua notifikasi dikendalikan oleh NOTIFICATIONS_ENABLED di Config.gs.
//  Terminologi: TPP = Tindakan Perbaikan dan Pencegahan (menggantikan CA)
// ============================================================

const APP_URL = ScriptApp.getService().getUrl();

function _appLink(page, params) {
  params = params || {};
  const qs = Object.keys(params)
    .map(function(k) { return k + '=' + encodeURIComponent(params[k]); })
    .join('&');
  return APP_URL + '?page=' + page + (qs ? '&' + qs : '');
}

function _findingInfo(result, agenda) {
  return `
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0;">
      <tr><td style="padding:6px;color:#666;width:160px;">Area</td>
          <td style="padding:6px;font-weight:bold;">${escapeHtml(agenda.dept)}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Check Item</td>
          <td style="padding:6px;">#${result.nomor_persyaratan}.${result.check_item_no} — ${escapeHtml(result.check_item || '')}</td></tr>
      <tr><td style="padding:6px;color:#666;">Standar</td>
          <td style="padding:6px;">${escapeHtml(result.standar_check_item || '-')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Deskripsi Temuan</td>
          <td style="padding:6px;">${escapeHtml(result.deskripsi_temuan || '')}</td></tr>
      <tr><td style="padding:6px;color:#666;">Status</td>
          <td style="padding:6px;font-weight:bold;">${escapeHtml(result.status || '')}</td></tr>
    </table>`;
}


// ════════════════════════════════════════════════════════════
//  AUDIT FLOW
// ════════════════════════════════════════════════════════════

function notifyAuditStarted(agenda) {
  const auditees = parseCSV(agenda.auditee_emails);
  if (!auditees.length) return;
  const period     = getPeriodById(agenda.period_id);
  const namaPeriode = period ? period.nama_periode : 'IMS';
  const body = `
    <p>Pelaksanaan audit <strong>${escapeHtml(namaPeriode)}</strong> untuk area
    <strong>${escapeHtml(agenda.dept)}</strong> telah resmi dimulai dengan detail
    sebagai berikut:</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0;">
      <tr><td style="padding:6px;color:#666;width:160px;">Area</td>
          <td style="padding:6px;font-weight:bold;">${escapeHtml(agenda.dept)}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Tanggal Mulai</td>
          <td style="padding:6px;">${formatDatetimeWIB(agenda.started_at)}</td></tr>
      <tr><td style="padding:6px;color:#666;">Tim Auditor</td>
          <td style="padding:6px;">${escapeHtml(agenda.auditor_emails)}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Area Sampling</td>
          <td style="padding:6px;">${escapeHtml(agenda.area_sampling || '-')}</td></tr>
    </table>
    <p>Mohon menyiapkan dokumen dan bukti yang diperlukan serta memberikan
    pendampingan kepada tim auditor selama proses berlangsung.</p>`;
  sendEmail(auditees,
    `AUDIT DIMULAI — ${agenda.dept}`,
    emailTemplate(`Audit Dimulai: ${agenda.dept}`, body));
}

function notifyAuditCompletedAuditor(agenda, complyCount, nonComplyCount) {
  const recipients = [
    ...parseCSV(agenda.auditor_emails),
    ...parseCSV(agenda.auditee_emails),
  ].filter(function(v, i, a) { return v && a.indexOf(v) === i; });
  if (!recipients.length) return;
  const period      = getPeriodById(agenda.period_id);
  const namaPeriode = period ? period.nama_periode : 'IMS';
  const body = `
    <p>Pelaksanaan audit <strong>${escapeHtml(namaPeriode)}</strong> untuk area
    <strong>${escapeHtml(agenda.dept)}</strong> telah selesai dilaksanakan.
    Berikut ringkasan pelaksanaan:</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0;">
      <tr><td style="padding:6px;color:#666;width:160px;">Area</td>
          <td style="padding:6px;font-weight:bold;">${escapeHtml(agenda.dept)}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Tanggal Selesai</td>
          <td style="padding:6px;">${formatDatetimeWIB(agenda.agreement_at || now())}</td></tr>
      <tr><td style="padding:6px;color:#666;">Diselesaikan oleh</td>
          <td style="padding:6px;">${escapeHtml(agenda.agreement_by || '')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Auditee yang Hadir</td>
          <td style="padding:6px;">${escapeHtml(agenda.auditee_hadir_names || '-')}</td></tr>
      <tr><td style="padding:6px;color:#666;">Temuan Comply</td>
          <td style="padding:6px;">${complyCount} temuan</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Temuan Non Comply</td>
          <td style="padding:6px;font-weight:bold;">${nonComplyCount} temuan</td></tr>
    </table>
    <p>Temuan Non Comply akan diverifikasi terlebih dahulu oleh Koordinator sebelum
    dapat ditindaklanjuti. Anda akan mendapat notifikasi kembali setelah verifikasi
    selesai.</p>`;
  sendEmail(recipients,
    `AUDIT SELESAI — ${agenda.dept}`,
    emailTemplate(`Audit Selesai: ${agenda.dept}`, body));
}

function notifyAuditCompletedKoordinator(agenda, complyCount, nonComplyCount) {
  const koordinators = getAllKoordinators();
  if (!koordinators.length) return;
  const period      = getPeriodById(agenda.period_id);
  const namaPeriode = period ? period.nama_periode : 'IMS';
  const body = `
    <p>Pelaksanaan audit <strong>${escapeHtml(namaPeriode)}</strong> untuk area
    <strong>${escapeHtml(agenda.dept)}</strong> telah selesai dan foto persetujuan
    telah diupload. Terdapat <strong>${nonComplyCount} temuan Non Comply</strong>
    yang menunggu verifikasi Anda.</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0;">
      <tr><td style="padding:6px;color:#666;width:160px;">Area</td>
          <td style="padding:6px;font-weight:bold;">${escapeHtml(agenda.dept)}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Tanggal Selesai</td>
          <td style="padding:6px;">${formatDatetimeWIB(agenda.agreement_at || now())}</td></tr>
      <tr><td style="padding:6px;color:#666;">Diselesaikan oleh</td>
          <td style="padding:6px;">${escapeHtml(agenda.agreement_by || '')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Auditee yang Hadir</td>
          <td style="padding:6px;">${escapeHtml(agenda.auditee_hadir_names || '-')}</td></tr>
      <tr><td style="padding:6px;color:#666;">Temuan Comply</td>
          <td style="padding:6px;">${complyCount} temuan</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Temuan Non Comply</td>
          <td style="padding:6px;font-weight:bold;">${nonComplyCount} temuan</td></tr>
    </table>
    <p>Silakan verifikasi setiap temuan Non Comply. Anda dapat menyesuaikan deskripsi
    atau mengubah status temuan jika diperlukan sebelum diteruskan ke auditee.</p>`;
  sendEmail(koordinators.map(u => u.email),
    `VERIFIKASI TEMUAN DIPERLUKAN — AUDIT SELESAI | ${agenda.dept}`,
    emailTemplate(`Verifikasi Temuan Diperlukan: ${agenda.dept}`, body,
      'Verifikasi Temuan di My Task', _appLink('mytask')));
}

function notifyFindingsVerified(agenda, findings) {
  const auditees = parseCSV(agenda.auditee_emails);
  if (!auditees.length || !findings.length) return;
  const period      = getPeriodById(agenda.period_id);
  const namaPeriode = period ? period.nama_periode : 'IMS';
  const rows = findings.map(function(f) {
    return `<tr>
      <td style="padding:6px;border-bottom:1px solid #eee;white-space:nowrap;font-size:11px;color:#666;">
        ${escapeHtml(f.result_id || '')}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;">${escapeHtml(f.check_item || '')}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;">${escapeHtml(f.deskripsi_temuan || '')}</td>
    </tr>`;
  }).join('');
  const body = `
    <p>Hasil audit <strong>${escapeHtml(namaPeriode)}</strong> untuk area
    <strong>${escapeHtml(agenda.dept)}</strong> telah diverifikasi oleh Koordinator.
    Terdapat <strong>${findings.length} temuan Non Comply</strong> yang memerlukan
    tindak lanjut berupa pengisian Tindakan Perbaikan dan Pencegahan (TPP).</p>
    <p>Untuk setiap temuan, Anda wajib mengisi:</p>
    <ul style="font-size:13px;line-height:1.9;padding-left:20px;">
      <li><strong>Correction</strong> — tindakan segera untuk mengatasi temuan + due date correction (maks. 3 bulan dari selesai periode)</li>
      <li><strong>Corrective Action</strong> — rencana agar temuan tidak berulang + due date corrective action (maks. 1 tahun dari selesai periode)</li>
    </ul>
    <p style="font-weight:bold;margin-top:20px;">Daftar temuan yang perlu ditindaklanjuti:</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Result ID</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Check Item</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">Deskripsi Temuan</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px;">Silakan masuk ke sistem dan isi TPP untuk setiap temuan.</p>`;
  sendEmail(auditees,
    `TINDAK LANJUT DIPERLUKAN — HASIL AUDIT ${agenda.dept}`,
    emailTemplate(`Tindak Lanjut Diperlukan: ${agenda.dept}`, body,
      'Isi TPP di My Task', _appLink('mytask')));
}


// ════════════════════════════════════════════════════════════
//  TPP (TINDAKAN PERBAIKAN DAN PENCEGAHAN)
// ════════════════════════════════════════════════════════════

function notifyTppDueDateSet(period, dueDate, setByEmail) {
  // Kumpulkan semua penerima: auditee + auditor + koordinator dari semua agenda periode ini
  const agendas = getCachedAgendasByPeriod(period.period_id);
  const emailSet = {};

  agendas.forEach(function(ag) {
    parseCSV(ag.auditee_emails).forEach(function(e) { if (e) emailSet[normalizeEmail(e)] = e; });
    parseCSV(ag.auditor_emails).forEach(function(e) { if (e) emailSet[normalizeEmail(e)] = e; });
  });
  getAllKoordinators().forEach(function(u) { if (u.email) emailSet[normalizeEmail(u.email)] = u.email; });

  const recipients = Object.values(emailSet);
  if (!recipients.length) return;

  const body = `
    <p>Koordinator telah menetapkan batas waktu pengisian rencana Tindakan Perbaikan dan
    Pencegahan (TPP) untuk periode <strong>${escapeHtml(period.nama_periode)}</strong>.</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0">
      <tr><td style="padding:8px;color:#666;width:180px;">Periode Audit</td>
          <td style="padding:8px;font-weight:600">${escapeHtml(period.nama_periode)}</td></tr>
      <tr style="background:#f9f9f9">
          <td style="padding:8px;color:#666">Due Date Rencana TPP</td>
          <td style="padding:8px;font-weight:700;color:#1F3864;font-size:14px">${formatDateOnlyWIB(dueDate)}</td></tr>
    </table>
    <p>Auditee yang memiliki temuan <strong>Non Comply</strong> dengan status <strong>Open TPP</strong>
    wajib mengisi rencana correction dan corrective action sebelum tanggal tersebut.</p>
    <p style="font-size:12px;color:#888;margin-top:16px">
      Jika pengisian dilakukan setelah due date, akan tercatat sebagai <em>Rencana TPP Overdue</em>
      di dashboard monitoring.</p>`;

  sendEmail(
    recipients,
    `DUE DATE RENCANA TPP DITETAPKAN — ${period.nama_periode} | ${formatDateOnlyWIB(dueDate)}`,
    emailTemplate(`Due Date Rencana TPP: ${period.nama_periode}`, body,
      'Isi TPP di My Task', _appLink('mytask'))
  );
}

function notifyTppSubmittedToKoordinator(agenda, result) {
  const koordinators = getAllKoordinators();
  if (!koordinators.length) return;
  const period      = getPeriodById(agenda.period_id);
  const namaPeriode = period ? period.nama_periode : 'IMS';
  const body = `
    <p>Auditee area <strong>${escapeHtml(agenda.dept)}</strong> telah mengajukan
    rencana Tindakan Perbaikan dan Pencegahan (TPP) untuk temuan berikut.</p>
    ${_findingInfo(result, agenda)}
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><td style="padding:6px;color:#666;width:160px;">Correction</td>
          <td style="padding:6px;">${escapeHtml(result.correction || '-')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Due Date Correction</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_correction)}</td></tr>
      <tr><td style="padding:6px;color:#666;">Corrective Action</td>
          <td style="padding:6px;">${escapeHtml(result.corrective_action || '-')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Due Date Corrective Action</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_corrective_action)}</td></tr>
    </table>
    <p style="margin-top:16px;">Rencana TPP telah disubmit dan auditee akan segera
    mengupload bukti implementasi.</p>`;
  sendEmail(koordinators.map(u => u.email),
    `INFORMASI — RENCANA TPP DISUBMIT | ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate(`Rencana TPP Disubmit: ${agenda.dept}`, body));
}

function notifyTppSubmittedToAuditee(agenda, result) {
  const auditees = parseCSV(agenda.auditee_emails);
  if (!auditees.length) return;
  const body = `
    <p>Rencana Tindakan Perbaikan dan Pencegahan (TPP) untuk temuan berikut telah
    berhasil disubmit. Silakan upload bukti implementasi sesuai rencana yang telah dibuat.</p>
    ${_findingInfo(result, agenda)}
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><td style="padding:6px;color:#666;width:160px;">Correction</td>
          <td style="padding:6px;">${escapeHtml(result.correction || '-')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Due Date Correction</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_correction)}</td></tr>
      <tr><td style="padding:6px;color:#666;">Corrective Action</td>
          <td style="padding:6px;">${escapeHtml(result.corrective_action || '-')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Due Date Corrective Action</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_corrective_action)}</td></tr>
    </table>
    <p style="margin-top:16px;">Laksanakan tindakan perbaikan sesuai rencana, kemudian
    upload bukti correction dan corrective action pada sistem.</p>`;
  sendEmail(auditees,
    `RENCANA TPP DISUBMIT — UPLOAD BUKTI IMPLEMENTASI | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate(`Rencana TPP Disubmit: ${agenda.dept}`, body,
      'Upload Bukti di My Task', _appLink('mytask', { result_id: result.result_id })));
}

function notifyTPPToAuditors(agenda, result) {
  const auditors = parseCSV(agenda.auditor_emails);
  if (!auditors.length) return;
  const body = `
    <p>Dept Head telah menyetujui Tindakan Perbaikan dan Pencegahan (TPP) untuk
    temuan berikut. Diperlukan persetujuan dari salah satu Auditor sebagai tahap kedua.</p>
    ${_findingInfo(result, agenda)}
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><td style="padding:6px;color:#666;width:160px;">Correction</td>
          <td style="padding:6px;">${escapeHtml(result.correction || '-')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Due Date Correction</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_correction)}</td></tr>
      <tr><td style="padding:6px;color:#666;">Corrective Action</td>
          <td style="padding:6px;">${escapeHtml(result.corrective_action || '-')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Due Date Corrective Action</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_corrective_action)}</td></tr>
    </table>
    <p style="margin-top:16px;">Cukup satu Auditor dari tim yang memberikan persetujuan.
    Auditor lain akan menerima notifikasi informasi secara otomatis.</p>`;
  sendEmail(auditors,
    `PERSETUJUAN DIPERLUKAN — TPP (AUDITOR) ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Persetujuan TPP oleh Auditor Diperlukan', body,
      'Tinjau & Setujui di My Task', _appLink('mytask', { result_id: result.result_id })));
}

function notifyTPPApprovedByAuditor(agenda, result, approverEmail) {
  const otherAuditors = parseCSV(agenda.auditor_emails)
    .filter(a => normalizeEmail(a) !== normalizeEmail(approverEmail));
  if (otherAuditors.length) {
    sendEmail(otherAuditors,
      `INFORMASI — TPP SUDAH DISETUJUI AUDITOR | ${agenda.dept}`,
      emailTemplate('Informasi: TPP Sudah Disetujui', `
        <p>Tindakan Perbaikan dan Pencegahan (TPP) untuk temuan berikut telah disetujui oleh
        <strong>${escapeHtml(approverEmail)}</strong> atas nama tim Auditor.
        Persetujuan Anda tidak diperlukan untuk temuan ini.</p>
        ${_findingInfo(result, agenda)}
        <p>Proses approval dilanjutkan ke tahap Koordinator.</p>`,
        'Lihat Dashboard', _appLink('dashboard')));
  }
  const koordinators = getAllKoordinators();
  if (!koordinators.length) return;
  const body = `
    <p>Dept Head dan Auditor telah menyetujui Tindakan Perbaikan dan Pencegahan (TPP)
    untuk temuan berikut. Diperlukan persetujuan final dari Koordinator sebelum
    auditee melanjutkan ke tahap implementasi.</p>
    ${_findingInfo(result, agenda)}
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><td style="padding:6px;color:#666;width:160px;">Due Date Correction</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_correction)}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Due Date Corrective Action</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_corrective_action)}</td></tr>
      <tr><td style="padding:6px;color:#666;">Disetujui Dept Head</td>
          <td style="padding:6px;">Ya</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Disetujui Auditor</td>
          <td style="padding:6px;">Ya</td></tr>
    </table>`;
  sendEmail(koordinators.map(u => u.email),
    `PERSETUJUAN FINAL DIPERLUKAN — TPP ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Persetujuan Final TPP oleh Koordinator', body,
      'Tinjau & Setujui di My Task', _appLink('mytask', { result_id: result.result_id })));
}

function notifyTPPFullyApproved(agenda, result) {
  const auditees = parseCSV(agenda.auditee_emails);
  if (!auditees.length) return;
  const body = `
    <p>Tindakan Perbaikan dan Pencegahan (TPP) yang Anda ajukan untuk temuan berikut
    telah disetujui oleh seluruh pihak (Dept Head, Auditor, dan Koordinator).</p>
    ${_findingInfo(result, agenda)}
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><td style="padding:6px;color:#666;width:160px;">Due Date Correction</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_correction)}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Due Date Corrective Action</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_corrective_action)}</td></tr>
    </table>
    <p style="margin-top:16px;">Laksanakan tindakan perbaikan dan pencegahan sesuai rencana
    yang telah disetujui. Upload bukti correction sebelum due date correction, dan bukti
    corrective action sebelum due date corrective action.</p>`;
  sendEmail(auditees,
    `TPP DISETUJUI — LANJUTKAN KE IMPLEMENTASI | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('TPP Disetujui: Lanjutkan ke Implementasi', body,
      'Upload Bukti Implementasi di My Task', _appLink('mytask', { result_id: result.result_id })));
}

function notifyCorrectionSubmitted(agenda, result) {
  const recipients = [
    ...parseCSV(agenda.auditee_emails),
    ...getAllKoordinators().map(function(u) { return u.email; }),
  ].filter(function(v, i, a) { return v && a.indexOf(v) === i; });
  if (!recipients.length) return;
  const body = `
    <p>Auditee area <strong>${escapeHtml(agenda.dept)}</strong> telah mengupload
    bukti <strong>Correction</strong> untuk temuan berikut.</p>
    ${_findingInfo(result, agenda)}
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><td style="padding:6px;color:#666;width:160px;">Correction</td>
          <td style="padding:6px;">${escapeHtml(result.correction || '-')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Due Date Correction</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_correction)}</td></tr>
      <tr><td style="padding:6px;color:#666;">Disubmit pada</td>
          <td style="padding:6px;">${formatDatetimeWIB(result.impl_correction_submitted_at)}</td></tr>
    </table>
    <p style="margin-top:16px;">Bukti correction telah dicatat. Tidak ada approval
    diperlukan untuk correction. Auditee masih dapat mengupload ulang bukti correction
    sampai corrective action disubmit.</p>`;
  sendEmail(recipients,
    `INFORMASI — CORRECTION DISUBMIT | ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Correction Disubmit', body));
}


// ════════════════════════════════════════════════════════════
//  IMPLEMENTASI
// ════════════════════════════════════════════════════════════

function notifyImplSubmitted(agenda, result) {
  if (!agenda.dept_head_email) return;
  const body = `
    <p>Auditee area <strong>${escapeHtml(agenda.dept)}</strong> telah mengunggah bukti
    implementasi untuk temuan berikut dan memerlukan persetujuan Anda.</p>
    ${_findingInfo(result, agenda)}
    <p>Silakan tinjau bukti implementasi yang telah diupload dan berikan persetujuan
    atau penolakan beserta komentar.</p>`;
  sendEmail(agenda.dept_head_email,
    `PERSETUJUAN DIPERLUKAN — IMPLEMENTASI ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Persetujuan Implementasi Diperlukan', body,
      'Tinjau Bukti & Setujui di My Task', _appLink('mytask', { result_id: result.result_id })));
}

function notifyImplToAuditors(agenda, result) {
  const auditors = parseCSV(agenda.auditor_emails);
  if (!auditors.length) return;
  const body = `
    <p>Dept Head telah menyetujui bukti implementasi untuk temuan berikut.
    Diperlukan persetujuan dari salah satu Auditor.</p>
    ${_findingInfo(result, agenda)}
    <p>Cukup satu Auditor dari tim yang memberikan persetujuan.
    Auditor lain akan menerima notifikasi informasi secara otomatis.</p>`;
  sendEmail(auditors,
    `PERSETUJUAN DIPERLUKAN — IMPLEMENTASI (AUDITOR) ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Persetujuan Implementasi oleh Auditor Diperlukan', body,
      'Tinjau Bukti & Setujui di My Task', _appLink('mytask', { result_id: result.result_id })));
}

function notifyImplApprovedByAuditor(agenda, result, approverEmail) {
  const otherAuditors = parseCSV(agenda.auditor_emails)
    .filter(a => normalizeEmail(a) !== normalizeEmail(approverEmail));
  if (otherAuditors.length) {
    sendEmail(otherAuditors,
      `INFORMASI — IMPLEMENTASI SUDAH DISETUJUI AUDITOR | ${agenda.dept}`,
      emailTemplate('Informasi: Implementasi Sudah Disetujui', `
        <p>Bukti implementasi untuk temuan berikut telah disetujui oleh
        <strong>${escapeHtml(approverEmail)}</strong>. Persetujuan Anda tidak diperlukan.</p>
        ${_findingInfo(result, agenda)}
        <p>Proses dilanjutkan ke tahap persetujuan final Koordinator untuk penutupan temuan.</p>`,
        'Lihat Dashboard', _appLink('dashboard')));
  }
  const koordinators = getAllKoordinators();
  if (!koordinators.length) return;
  const body = `
    <p>Dept Head dan Auditor telah menyetujui bukti implementasi untuk temuan berikut.
    Diperlukan persetujuan final dari Koordinator untuk resmi menutup temuan ini.</p>
    ${_findingInfo(result, agenda)}
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;width:160px;">Disetujui Dept Head</td>
          <td style="padding:6px;">Ya</td></tr>
      <tr><td style="padding:6px;color:#666;">Disetujui Auditor</td>
          <td style="padding:6px;">Ya</td></tr>
    </table>`;
  sendEmail(koordinators.map(u => u.email),
    `PERSETUJUAN FINAL DIPERLUKAN — PENUTUPAN TEMUAN ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Persetujuan Final: Penutupan Temuan', body,
      'Tinjau & Tutup Temuan di My Task', _appLink('mytask', { result_id: result.result_id })));
}

function notifyFindingClosed(agenda, result) {
  const recipients = [
    ...parseCSV(agenda.auditee_emails),
    ...parseCSV(agenda.auditor_emails),
    agenda.dept_head_email,
    ...getAllKoordinators().map(u => u.email),
  ].filter(function(v, i, a) { return v && a.indexOf(v) === i; });
  const body = `
    <p>Temuan berikut telah resmi ditutup (CLOSED) setelah seluruh tahapan tindak
    lanjut diselesaikan dan disetujui.</p>
    ${_findingInfo(result, agenda)}
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><td style="padding:6px;color:#666;width:160px;">Ditutup pada</td>
          <td style="padding:6px;">${formatDatetimeWIB(now())}</td></tr>
    </table>
    <p style="margin-top:16px;">Terima kasih atas kerja sama semua pihak dalam
    menyelesaikan tindak lanjut temuan audit ini.</p>`;
  sendEmail(recipients,
    `TEMUAN CLOSED — ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate('Temuan Resmi Ditutup', body,
      'Lihat Dashboard', _appLink('dashboard')));
}

function notifyRejected(agenda, result, stage, rejecterEmail, komentar) {
  const allParties = [
    ...parseCSV(agenda.auditee_emails),
    ...parseCSV(agenda.auditor_emails),
    agenda.dept_head_email,
  ].filter(function(v, i, a) { return v && a.indexOf(v) === i; });
  const stageLabel   = stage === 'TPP' ? 'Tindakan Perbaikan dan Pencegahan (TPP)' : 'Implementasi';
  const stageSubject = stage === 'TPP' ? 'TPP' : 'IMPLEMENTASI';
  const body = `
    <p><strong>${escapeHtml(stageLabel)}</strong> untuk temuan berikut telah
    <strong>ditolak</strong> dan perlu diperbaiki sebelum diajukan kembali.</p>
    ${_findingInfo(result, agenda)}
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <tr><td style="padding:6px;color:#666;width:160px;">Ditolak oleh</td>
          <td style="padding:6px;">${escapeHtml(rejecterEmail)}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Alasan Penolakan</td>
          <td style="padding:6px;">${escapeHtml(komentar) || '-'}</td></tr>
    </table>
    <p style="margin-top:16px;">Auditee dimohon memperbaiki dan mengajukan ulang.
    Proses approval akan dimulai kembali dari tahap Dept Head.</p>`;
  sendEmail(allParties,
    `DITOLAK — ${stageSubject} ${agenda.dept} | Temuan #${result.nomor_persyaratan}.${result.check_item_no}`,
    emailTemplate(`${stageLabel} Ditolak`, body,
      'Perbaiki & Ajukan Ulang di My Task', _appLink('mytask', { result_id: result.result_id })));
}

// ════════════════════════════════════════════════════════════
//  REMINDER & DIGEST — dipanggil oleh runDailyReminders (Code.gs)
// ════════════════════════════════════════════════════════════

function notifyTppDueDateReminder(period, daysLeft, findings) {
  // Hanya auditee yang masih punya finding status OPEN + Koordinator
  const emailSet = {};
  (findings || []).forEach(function(f) {
    var ag = f._agenda;
    if (!ag) return;
    parseCSV(ag.auditee_emails).forEach(function(e) { if (e) emailSet[normalizeEmail(e)] = e; });
  });
  getAllKoordinators().forEach(function(u) { if (u.email) emailSet[normalizeEmail(u.email)] = u.email; });
  const recipients = Object.values(emailSet);
  if (!recipients.length) return;

  const isUrgent = daysLeft <= 3;
  const body = `
    <p ${isUrgent ? 'style="color:#f43f5e"' : ''}>
      ${isUrgent ? '⚠ ' : ''}Batas waktu pengisian rencana Tindakan Perbaikan dan Pencegahan (TPP)
      untuk periode <strong>${escapeHtml(period.nama_periode)}</strong>
      tinggal <strong>${daysLeft} hari lagi</strong>.
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0">
      <tr><td style="padding:8px;color:#666;width:180px">Periode Audit</td>
          <td style="padding:8px;font-weight:600">${escapeHtml(period.nama_periode)}</td></tr>
      <tr style="background:#f9f9f9">
          <td style="padding:8px;color:#666">Due Date Rencana TPP</td>
          <td style="padding:8px;font-weight:700;color:#1F3864;font-size:14px">${formatDateOnlyWIB(period.tpp_plan_due_date)}</td></tr>
      <tr><td style="padding:8px;color:#666">Sisa Waktu</td>
          <td style="padding:8px;font-weight:700;color:${isUrgent ? '#f43f5e' : '#f59e0b'}">${daysLeft} hari</td></tr>
    </table>
    <p>Auditee yang memiliki temuan <strong>Non Comply</strong> dengan status <strong>Open TPP</strong>
    segera mengisi rencana correction dan corrective action sebelum batas waktu.</p>
    <p style="font-size:12px;color:#888;margin-top:16px">
      Jika pengisian dilakukan setelah due date, akan tercatat sebagai
      <em>Rencana TPP Overdue</em> di dashboard monitoring.</p>`;

  sendEmail(
    recipients,
    `${isUrgent ? '⚠ SEGERA — ' : ''}REMINDER: Due Date Rencana TPP ${daysLeft} Hari Lagi — ${period.nama_periode}`,
    emailTemplate(`Reminder: ${daysLeft} Hari Lagi — Due Date Rencana TPP`, body,
      'Isi TPP di My Task', _appLink('mytask'))
  );
}

function notifyTppOverdueReminder(period, openFindings) {
  // Hanya auditee dengan finding status OPEN + Koordinator
  const emailSet = {};
  openFindings.forEach(function(f) {
    var ag = f._agenda;
    if (!ag) return;
    parseCSV(ag.auditee_emails).forEach(function(e) { if (e) emailSet[normalizeEmail(e)] = e; });
  });
  getAllKoordinators().forEach(function(u) { if (u.email) emailSet[normalizeEmail(u.email)] = u.email; });

  // Kirim per auditee — hanya findingnya sendiri yang ditampilkan
  const auditeeEmails = {};
  openFindings.forEach(function(f) {
    var ag = f._agenda;
    if (!ag) return;
    parseCSV(ag.auditee_emails).forEach(function(email) {
      if (!email) return;
      var key = normalizeEmail(email);
      if (!auditeeEmails[key]) auditeeEmails[key] = { email: email, findings: [] };
      auditeeEmails[key].findings.push(f);
    });
  });

  Object.values(auditeeEmails).forEach(function(rec) {
    var rows = rec.findings.map(function(f) {
      var ag = f._agenda || {};
      return `<tr>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;color:#888">${escapeHtml(f.result_id || '')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(ag.dept || '')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px">${escapeHtml(f.deskripsi_temuan || '-')}</td>
      </tr>`;
    }).join('');

    const body = `
      <p style="color:#f43f5e">⚠ Batas waktu pengisian rencana TPP untuk periode
      <strong>${escapeHtml(period.nama_periode)}</strong> sudah <strong>lewat</strong>.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0">
        <tr><td style="padding:8px;color:#666;width:180px">Due Date Rencana TPP</td>
            <td style="padding:8px;font-weight:700;color:#f43f5e">${formatDateOnlyWIB(period.tpp_plan_due_date)}</td></tr>
      </table>
      <p>Anda memiliki <strong>${rec.findings.length} temuan</strong> yang belum diisi rencana TPP-nya:</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0">
        <thead><tr style="background:#fff1f2">
          <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">RESULT ID</th>
          <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">DEPT</th>
          <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">DESKRIPSI</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Segera isi rencana TPP meskipun sudah terlambat — keterlambatan tetap
      tercatat di sistem monitoring.</p>`;

    sendEmail(
      rec.email,
      `⚠ RENCANA TPP OVERDUE — ${rec.findings.length} Temuan Belum Diisi — ${period.nama_periode}`,
      emailTemplate('Rencana TPP Overdue', body, 'Isi TPP di My Task', _appLink('mytask'))
    );
  });

  // Email ringkas ke Koordinator (tidak per-finding detail, cukup total)
  const koordEmails = getAllKoordinators().map(function(u) { return u.email; });
  if (koordEmails.length) {
    const totalFindings = openFindings.length;
    const totalAuditees  = Object.keys(auditeeEmails).length;
    const body = `
      <p style="color:#f43f5e">⚠ Terdapat <strong>${totalFindings} temuan</strong> dari
      <strong>${totalAuditees} auditee</strong> yang belum mengisi rencana TPP, melewati
      due date <strong>${formatDateOnlyWIB(period.tpp_plan_due_date)}</strong> untuk periode
      <strong>${escapeHtml(period.nama_periode)}</strong>.</p>
      <p>Auditee terkait sudah menerima reminder otomatis. Pertimbangkan tindak lanjut manual
      jika diperlukan.</p>`;
    sendEmail(
      koordEmails,
      `⚠ RENCANA TPP OVERDUE — ${totalFindings} Temuan, ${totalAuditees} Auditee — ${period.nama_periode}`,
      emailTemplate('Rencana TPP Overdue (Ringkasan)', body, 'Lihat Hasil Audit', _appLink('hasil-audit'))
    );
  }
}

function notifyPendingApprovalDigest(period, findings, agendas) {
  var recipientMap = {};

  function _addToMap(email, finding) {
    if (!email) return;
    var key = normalizeEmail(email);
    if (!recipientMap[key]) recipientMap[key] = { email: email, findings: [] };
    recipientMap[key].findings.push(finding);
  }

  findings.forEach(function(f) {
    var ag = f._agenda;
    if (!ag) return;
    if (f.finding_status === CONFIG.FINDING_STATUS.APP_DEPT_HEAD) {
      _addToMap(ag.dept_head_email, f);
    } else if (f.finding_status === CONFIG.FINDING_STATUS.APP_AUDITOR) {
      parseCSV(ag.auditor_emails).forEach(function(e) { _addToMap(e, f); });
    } else if (f.finding_status === CONFIG.FINDING_STATUS.APP_KOORDINATOR) {
      getAllKoordinators().forEach(function(u) { _addToMap(u.email, f); });
    }
  });

  Object.values(recipientMap).forEach(function(rec) {
    if (!rec.findings.length) return;
    var rows = rec.findings.map(function(f) {
      var ag = f._agenda || {};
      var statusLabel = {
        'APP_DEPT_HEAD':   'Menunggu Dept Head',
        'APP_AUDITOR':     'Menunggu Auditor',
        'APP_KOORDINATOR': 'Menunggu Koordinator',
      }[f.finding_status] || f.finding_status;
      return `<tr>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;color:#888">${escapeHtml(f.result_id || '')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(ag.dept || '')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px">${escapeHtml(f.deskripsi_temuan || '-')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:11px;color:#8b5cf6;font-weight:600">${statusLabel}</td>
      </tr>`;
    }).join('');

    const body = `
      <p>Anda memiliki <strong>${rec.findings.length} temuan</strong> yang menunggu
      persetujuan Anda di periode <strong>${escapeHtml(period.nama_periode)}</strong>.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">RESULT ID</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">DEPT</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">DESKRIPSI</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">STATUS</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Silakan buka My Task untuk meninjau dan memberikan persetujuan.</p>`;

    sendEmail(
      rec.email,
      `[REMINDER] ${rec.findings.length} Temuan Menunggu Persetujuan Anda — ${period.nama_periode}`,
      emailTemplate('Reminder: Temuan Menunggu Persetujuan', body, 'Buka My Task', _appLink('mytask'))
    );
  });
}

function notifyCorrectionAndCAReminder(period, findings) {
  var recipientMap = {};

  findings.forEach(function(f) {
    var ag = f._agenda;
    if (!ag) return;
    var needsCorrection = !f.impl_correction_submitted_at;
    var needsCA         = !f.impl_submitted_at;
    if (!needsCorrection && !needsCA) return; // sudah lengkap, skip

    parseCSV(ag.auditee_emails).forEach(function(email) {
      if (!email) return;
      var key = normalizeEmail(email);
      if (!recipientMap[key]) recipientMap[key] = { email: email, items: [] };
      recipientMap[key].items.push({
        finding: f, ag: ag,
        needsCorrection: needsCorrection,
        needsCA: needsCA,
      });
    });
  });

  Object.values(recipientMap).forEach(function(rec) {
    if (!rec.items.length) return;
    var rows = rec.items.map(function(it) {
      var f = it.finding, ag = it.ag;
      var rowsHtml = '';
      if (it.needsCorrection) {
        rowsHtml += `<tr>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;color:#888">${escapeHtml(f.result_id || '')}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(ag.dept || '')}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:11px;color:#3b82f6;font-weight:600">Correction</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px">${escapeHtml(f.deskripsi_temuan || '-')}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:11px">${formatDateOnlyWIB(f.due_date_correction)}</td>
        </tr>`;
      }
      if (it.needsCA) {
        rowsHtml += `<tr>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;color:#888">${escapeHtml(f.result_id || '')}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(ag.dept || '')}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:11px;color:#8b5cf6;font-weight:600">Corrective Action</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px">${escapeHtml(f.deskripsi_temuan || '-')}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:11px">${formatDateOnlyWIB(f.due_date_corrective_action)}</td>
        </tr>`;
      }
      return rowsHtml;
    }).join('');

    const body = `
      <p>Berikut rangkuman bulanan tindakan implementasi yang masih perlu Anda selesaikan
      di periode <strong>${escapeHtml(period.nama_periode)}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">RESULT ID</th>
          <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">DEPT</th>
          <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">JENIS</th>
          <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">DESKRIPSI</th>
          <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">DUE DATE</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Silakan upload bukti implementasi yang belum disubmit melalui My Task.</p>`;

    sendEmail(
      rec.email,
      `[BULANAN] Tindakan Implementasi Belum Lengkap — ${period.nama_periode}`,
      emailTemplate('Rangkuman Bulanan: Implementasi Belum Lengkap', body, 'Upload Bukti di My Task', _appLink('mytask'))
    );
  });
}

function notifyCorrectionOverdueDigest(period, findings, agendas) {
  var recipientMap = {};

  findings.forEach(function(f) {
    var ag = f._agenda;
    if (!ag) return;
    parseCSV(ag.auditee_emails).forEach(function(email) {
      if (!email) return;
      var key = normalizeEmail(email);
      if (!recipientMap[key]) recipientMap[key] = { email: email, findings: [] };
      recipientMap[key].findings.push(f);
    });
  });

  Object.values(recipientMap).forEach(function(rec) {
    if (!rec.findings.length) return;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var rows = rec.findings.map(function(f) {
      var ag       = f._agenda || {};
      var corrDue  = new Date(f.due_date_correction); corrDue.setHours(0, 0, 0, 0);
      var lateDays = Math.round((today - corrDue) / (1000 * 60 * 60 * 24));
      return `<tr>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;color:#888">${escapeHtml(f.result_id || '')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(ag.dept || '')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px">${escapeHtml(f.deskripsi_temuan || '-')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:11px;color:#f43f5e;font-weight:700">${formatDateOnlyWIB(f.due_date_correction)} (${lateDays} hari terlambat)</td>
      </tr>`;
    }).join('');

    const body = `
      <p>Anda memiliki <strong>${rec.findings.length} temuan</strong> dengan bukti
      <strong>Correction yang sudah melewati due date</strong> di periode
      <strong>${escapeHtml(period.nama_periode)}</strong>.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin:16px 0">
        <thead>
          <tr style="background:#fff1f2">
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">RESULT ID</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">DEPT</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">DESKRIPSI</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;color:#6b7280">DUE DATE</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Segera upload bukti correction meskipun sudah terlambat — keterlambatan tetap
      tercatat di sistem monitoring.</p>`;

    sendEmail(
      rec.email,
      `⚠ CORRECTION OVERDUE — ${rec.findings.length} Temuan Belum Diupload — ${period.nama_periode}`,
      emailTemplate('Correction Overdue: Segera Upload Bukti', body, 'Upload Bukti di My Task', _appLink('mytask'))
    );
  });
}
