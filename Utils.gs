// ============================================================
//  Utils.gs
//  Helper functions — dipakai di seluruh project
// ============================================================


// ── ID Generator ─────────────────────────────────────────────────

/**
 * Generate unique ID dengan prefix dan timestamp
 * @param {string} prefix  e.g. 'USR', 'AREA', 'FND'
 * @returns {string}       e.g. 'USR_20250701_143022_4f3a'
 */
function generateId(prefix) {
  const now = new Date();
  const datePart = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyyMMdd_HHmmss');
  const randPart = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${datePart}_${randPart}`;
}

/**
 * Generate ID pendek berurutan berdasarkan jumlah data existing
 * Dipakai untuk ID yang human-readable: USR_001, AREA_003, dll
 * @param {string} prefix
 * @param {number} existingCount  jumlah row data yang sudah ada
 * @returns {string}
 */
function generateSequentialId(prefix, existingCount) {
  const num = String(existingCount + 1).padStart(3, '0');
  return `${prefix}_${num}`;
}


// ── Date & Time ──────────────────────────────────────────────────

/**
 * Timestamp sekarang dalam timezone Jakarta
 * @returns {string}  e.g. '2025-07-01 14:30:22'
 */
function now() {
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Format tanggal ke yyyy-MM-dd
 * @param {Date|string} date
 * @returns {string}
 */
function formatDate(date) {
  if (!date) return '';
  const d = (date instanceof Date) ? date : new Date(date);
  return Utilities.formatDate(d, 'Asia/Jakarta', 'yyyy-MM-dd');
}

/**
 * Cek apakah sebuah lock sudah timeout
 * @param {string} lockedAt  timestamp string
 * @returns {boolean}
 */
function isLockExpired(lockedAt) {
  if (!lockedAt) return true;
  const lockTime = new Date(lockedAt).getTime();
  const timeoutMs = CONFIG.LOCK_TIMEOUT_MINUTES * 60 * 1000;
  return (Date.now() - lockTime) > timeoutMs;
}


// ── String & Array Helpers ───────────────────────────────────────

/**
 * Parse string comma-separated jadi array, trim tiap item
 * @param {string} str  e.g. 'a@x.com, b@x.com , c@x.com'
 * @returns {string[]}
 */
function parseCSV(str) {
  if (!str) return [];
  return String(str).split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Gabung array jadi string comma-separated
 * @param {string[]} arr
 * @returns {string}
 */
function toCSV(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.filter(Boolean).join(',');
}

/**
 * Cek apakah email ada dalam string comma-separated
 * @param {string} csvEmails
 * @param {string} email
 * @returns {boolean}
 */
function emailInCSV(csvEmails, email) {
  return parseCSV(csvEmails).includes(email.trim().toLowerCase());
}

/**
 * Normalize email ke lowercase
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

/**
 * Escape HTML untuk mencegah XSS di output Web App
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// ── Response Builder ─────────────────────────────────────────────

/**
 * Standar response sukses untuk doPost/doGet handler
 * @param {*}      data     payload
 * @param {string} message  pesan opsional
 * @returns {Object}
 */
function successResponse(data, message = 'OK') {
  return { success: true, message, data };
}

/**
 * Standar response error
 * @param {string} message  pesan error
 * @param {number} code     error code opsional
 * @returns {Object}
 */
function errorResponse(message, code = 400) {
  return { success: false, message, code };
}

/**
 * Wrap response jadi ContentService JSON output
 * @param {Object} obj
 * @returns {ContentService.TextOutput}
 */
function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ── Email Sender ─────────────────────────────────────────────────

/**
 * Kirim notifikasi email
 * @param {string|string[]} to       satu email atau array
 * @param {string}          subject
 * @param {string}          htmlBody HTML body
 */
function sendEmail(to, subject, htmlBody) {
  try {
    const recipients = Array.isArray(to) ? to.join(',') : to;
    GmailApp.sendEmail(recipients, subject, '', { htmlBody });
  } catch (e) {
    console.error('sendEmail error:', e.message);
  }
}

/**
 * Template email standar sistem
 * @param {string} title    judul utama
 * @param {string} body     konten HTML (paragraf, list, dll)
 * @param {string} ctaLabel teks tombol CTA (opsional)
 * @param {string} ctaUrl   URL tombol CTA (opsional)
 * @returns {string}        HTML string
 */
function emailTemplate(title, body, ctaLabel = '', ctaUrl = '') {
  const cta = ctaLabel && ctaUrl
    ? `<div style="margin:24px 0;">
         <a href="${ctaUrl}" style="background:#1F3864;color:#fff;padding:12px 24px;
            border-radius:4px;text-decoration:none;font-weight:bold;">${ctaLabel}</a>
       </div>`
    : '';
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
      <div style="background:#1F3864;padding:20px 24px;">
        <h2 style="color:#fff;margin:0;font-size:16px;">🔍 Audit System</h2>
      </div>
      <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;">
        <h3 style="color:#1F3864;margin-top:0;">${title}</h3>
        ${body}
        ${cta}
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="font-size:11px;color:#999;">
          Email ini dikirim otomatis oleh Audit System. Jangan reply email ini.
        </p>
      </div>
    </div>`;
}


// ── Google Drive Helpers ─────────────────────────────────────────

/**
 * Ambil atau buat folder di Drive
 * @param {string}              name          nama folder
 * @param {DriveApp.Folder}     parentFolder  parent (opsional, default root)
 * @returns {DriveApp.Folder}
 */
function getOrCreateFolder(name, parentFolder = null) {
  const parent = parentFolder || DriveApp.getRootFolder();
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(name);
}

/**
 * Buat struktur folder untuk satu finding
 * Path: AUDIT_SYSTEM / {period_id} / {area_id} / {finding_id}
 * @param {string} periodId
 * @param {string} areaId
 * @param {string} findingId
 * @returns {DriveApp.Folder}
 */
function createFindingFolder(periodId, areaId, findingId) {
  const root    = getOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER_NAME);
  const period  = getOrCreateFolder(periodId, root);
  const area    = getOrCreateFolder(areaId, period);
  return getOrCreateFolder(findingId, area);
}

/**
 * Upload file ke folder finding
 * @param {string} base64Data   base64 encoded file content
 * @param {string} fileName
 * @param {string} mimeType
 * @param {DriveApp.Folder} folder
 * @returns {string}  URL file di Drive
 */
function uploadFileToDrive(base64Data, fileName, mimeType, folder) {
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data), mimeType, fileName
  );
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileId = file.getId();
  return 'https://drive.google.com/uc?export=view&id=' + fileId;
}


// ── Validation Helpers ───────────────────────────────────────────

/**
 * Validasi format email
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validasi bahwa semua field required tidak kosong
 * @param {Object}   data
 * @param {string[]} requiredFields
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateRequired(data, requiredFields) {
  const missing = requiredFields.filter(f => !data[f] && data[f] !== false && data[f] !== 0);
  return { valid: missing.length === 0, missing };
}

/**
 * Cek apakah nilai masuk dalam enum yang diijinkan
 * @param {*}     value
 * @param {Array} allowed
 * @returns {boolean}
 */
function isValidEnum(value, allowed) {
  return allowed.includes(value);
}
