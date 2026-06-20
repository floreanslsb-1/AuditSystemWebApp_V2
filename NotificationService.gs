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
      <tr><td style="padding:6px;color:#666;width:160px;">Result ID</td>
          <td style="padding:6px;font-family:monospace;">${escapeHtml(result.result_id || '')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Deskripsi Temuan</td>
          <td style="padding:6px;">${escapeHtml(result.deskripsi_temuan || '')}</td></tr>
      <tr><td style="padding:6px;color:#666;">Lokasi Temuan</td>
          <td style="padding:6px;">${escapeHtml(result.lokasi_temuan || '-')}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Correction</td>
          <td style="padding:6px;">${escapeHtml(result.correction || '-')}</td></tr>
      <tr><td style="padding:6px;color:#666;">Due Date Correction</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_correction)}</td></tr>
      <tr style="background:#f9f9f9;">
          <td style="padding:6px;color:#666;">Corrective Action</td>
          <td style="padding:6px;">${escapeHtml(result.corrective_action || '-')}</td></tr>
      <tr><td style="padding:6px;color:#666;">Due Date Corrective Action</td>
          <td style="padding:6px;">${formatDateOnlyWIB(result.due_date_corrective_action)}</td></tr>
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

function notifyTppSubmittedToAuditee(agenda, result) {
  const auditees = parseCSV(agenda.auditee_emails);
  if (!auditees.length) return;
  const body = `
    <p>Rencana Tindakan Perbaikan dan Pencegahan (TPP) untuk temuan berikut telah
    berhasil disubmit. Silakan upload bukti implementasi sesuai rencana yang telah dibuat.</p>
    ${_findingInfo(result, agenda)}
    <p style="margin-top:16px;">Laksanakan tindakan perbaikan sesuai rencana, kemudian
    upload bukti correction dan corrective action pada sistem.</p>`;
  sendEmail(auditees,
    `RENCANA TPP DISUBMIT — UPLOAD BUKTI IMPLEMENTASI | Temuan #${result.result_id}`,
    emailTemplate(`Rencana TPP Disubmit: ${agenda.dept}`, body,
      'Upload Bukti di My Task', _appLink('mytask', { result_id: result.result_id })));
}

function notifyCorrectionSubmitted(agenda, result) {
  const recipients = parseCSV(agenda.auditee_emails);
  if (!recipients.length) return;
  const body = `
    <p>Auditee area <strong>${escapeHtml(agenda.dept)}</strong> telah mengupload
    bukti <strong>Correction</strong> untuk temuan berikut.</p>
    ${_findingInfo(result, agenda)}
    <p style="margin-top:16px;">Bukti correction telah dicatat. Tidak ada approval
    diperlukan untuk correction. Anda masih dapat mengupload ulang bukti correction
    sampai corrective action disubmit.</p>`;
  sendEmail(recipients,
    `INFORMASI — CORRECTION DISUBMIT | ${agenda.dept} | Temuan #${result.result_id}`,
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
    `PERSETUJUAN DIPERLUKAN — IMPLEMENTASI ${agenda.dept} | Temuan #${result.result_id}`,
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
    `PERSETUJUAN DIPERLUKAN — IMPLEMENTASI (AUDITOR) ${agenda.dept} | Temuan #${result.result_id}`,
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
    `PERSETUJUAN FINAL DIPERLUKAN — PENUTUPAN TEMUAN ${agenda.dept} | Temuan #${result.result_id}`,
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
    `TEMUAN CLOSED — ${agenda.dept} | Temuan #${result.result_id}`,
    emailTemplate('Temuan Resmi Ditutup', body,
      'Lihat Dashboard', _appLink('dashboard')));
}

function notifyRejected(agenda, result, stage, level, rejecterEmail, komentar) {
  // Penerima berbeda tergantung siapa yang melakukan reject.
  // Reject hanya terjadi di tahap Implementasi (DeptHead / Auditor / Koordinator).
  const koordEmails = getAllKoordinators().map(function(u) { return u.email; });
  let recipients = [];

  if (level === 'DeptHead') {
    recipients = [...parseCSV(agenda.auditee_emails), ...koordEmails];
  } else if (level === 'Auditor') {
    recipients = [agenda.dept_head_email, ...koordEmails, ...parseCSV(agenda.auditee_emails)];
  } else if (level === 'Koordinator') {
    recipients = [
      ...parseCSV(agenda.auditee_emails),
      agenda.dept_head_email,
      ...parseCSV(agenda.auditor_emails),
      ...koordEmails,
    ];
  } else {
    recipients = [...parseCSV(agenda.auditee_emails), ...parseCSV(agenda.auditor_emails), agenda.dept_head_email, ...koordEmails];
  }
  recipients = recipients.filter(function(v, i, a) { return v && a.indexOf(v) === i; });

  const stageLabel   = 'Implementasi';
  const stageSubject = 'IMPLEMENTASI';
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
    <p style="margin-top:16px;">Auditee dimohon memperbaiki dan mengajukan ulang bukti
    implementasi. Proses approval akan dimulai kembali dari tahap Dept Head.</p>`;
  sendEmail(recipients,
    `DITOLAK — ${stageSubject} ${agenda.dept} | Temuan #${result.result_id}`,
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

/**
 * Reminder bulanan gabungan — temuan OPEN (belum isi rencana TPP, overdue) +
 * OPEN_IMPL (sudah isi rencana, belum lengkap bukti correction/CA).
 * Dikirim 1x per auditee, list semua temuan miliknya dalam 1 tabel.
 * Item yang overdue (due date lewat / belum isi rencana TPP setelah due date lewat)
 * ditandai merah + ada keterangan overdue di bawah tabel.
 * Tidak ada limit pengiriman — terus terkirim sampai status berubah atau periode non-aktif.
 */
function notifyTppAndImplMonthlyReminder(period, openFindings, openImplFindings) {
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var recipientMap = {};

  function _addItem(email, item) {
    if (!email) return;
    var key = normalizeEmail(email);
    if (!recipientMap[key]) recipientMap[key] = { email: email, items: [] };
    recipientMap[key].items.push(item);
  }

  // ── OPEN: belum isi rencana TPP, due date sudah lewat (selalu overdue) ──
  (openFindings || []).forEach(function(f) {
    var ag = f._agenda;
    if (!ag) return;
    parseCSV(ag.auditee_emails).forEach(function(email) {
      _addItem(email, {
        finding:   f,
        ag:        ag,
        jenis:     'Rencana TPP',
        deskripsi: f.deskripsi_temuan || '-',
        dueDate:   period.tpp_plan_due_date,
        isOverdue: true,
      });
    });
  });

  // ── OPEN_IMPL: belum lengkap correction dan/atau corrective action ──
  (openImplFindings || []).forEach(function(f) {
    var ag = f._agenda;
    if (!ag) return;
    var needsCorrection = !f.impl_correction_submitted_at;
    var needsCA         = !f.impl_submitted_at;

    if (needsCorrection) {
      var corrDue       = f.due_date_correction ? new Date(f.due_date_correction) : null;
      var corrIsOverdue = corrDue ? (today > new Date(corrDue.getFullYear(), corrDue.getMonth(), corrDue.getDate())) : false;
      parseCSV(ag.auditee_emails).forEach(function(email) {
        _addItem(email, {
          finding:   f,
          ag:        ag,
          jenis:     'Correction',
          deskripsi: f.deskripsi_temuan || '-',
          dueDate:   f.due_date_correction,
          isOverdue: corrIsOverdue,
        });
      });
    }

    if (needsCA) {
      var caDue       = f.due_date_corrective_action ? new Date(f.due_date_corrective_action) : null;
      var caIsOverdue = caDue ? (today > new Date(caDue.getFullYear(), caDue.getMonth(), caDue.getDate())) : false;
      parseCSV(ag.auditee_emails).forEach(function(email) {
        _addItem(email, {
          finding:   f,
          ag:        ag,
          jenis:     'Corrective Action',
          deskripsi: f.deskripsi_temuan || '-',
          dueDate:   f.due_date_corrective_action,
          isOverdue: caIsOverdue,
        });
      });
    }
  });

  Object.values(recipientMap).forEach(function(rec) {
    if (!rec.items.length) return;

    var hasOverdue = rec.items.some(function(it) { return it.isOverdue; });

    var rows = rec.items.map(function(it) {
      var rowStyle  = it.isOverdue ? ' style="color:#f43f5e"' : '';
      var dueLabel  = formatDateOnlyWIB(it.dueDate) + (it.isOverdue ? ' (Overdue)' : '');
      return `<tr${rowStyle}>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;color:#888">${escapeHtml(it.finding.result_id || '')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(it.ag.dept || '')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:11px;font-weight:600">${escapeHtml(it.jenis)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:12px">${escapeHtml(it.deskripsi)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:11px;font-weight:${it.isOverdue ? '700' : '400'}">${dueLabel}</td>
      </tr>`;
    }).join('');

    var overdueNote = hasOverdue
      ? `<p style="color:#f43f5e;font-size:12px;margin-top:12px">
           ⚠ Item berwarna merah pada tabel di atas sudah <strong>melewati due date</strong>
           dan tercatat sebagai overdue di dashboard monitoring. Segera lengkapi.
         </p>`
      : '';

    var body = `
      <p>Berikut rangkuman temuan yang masih perlu Anda selesaikan di periode
      <strong>${escapeHtml(period.nama_periode)}</strong>:</p>
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
      ${overdueNote}
      <p style="margin-top:16px;">Silakan buka My Task untuk mengisi rencana TPP atau
      mengupload bukti yang belum lengkap.</p>`;

    sendEmail(
      rec.email,
      `[BULANAN] ${rec.items.length} Tindak Lanjut Belum Lengkap — ${period.nama_periode}`,
      emailTemplate('Rangkuman Bulanan: Tindak Lanjut Belum Lengkap', body, 'Buka My Task', _appLink('mytask'))
    );
  });
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
