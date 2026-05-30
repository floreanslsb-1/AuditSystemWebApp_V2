// ============================================================
//  SheetService.gs
//  Semua operasi baca/tulis Google Sheets
// ============================================================

// ── Internal helpers ─────────────────────────────────────────────

function _getMasterSS() {
  return SpreadsheetApp.openById(CONFIG.MASTER_SPREADSHEET_ID);
}

function _getMasterSheet(sheetName) {
  return _getMasterSS().getSheetByName(sheetName);
}

function _getAuditSS(spreadsheetId) {
  return SpreadsheetApp.openById(spreadsheetId);
}

function _getAuditSheet(spreadsheetId, sheetName) {
  return _getAuditSS(spreadsheetId).getSheetByName(sheetName);
}

function _sheetToObjects(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 4) return [];
  const numRows = lastRow - 3;
  if (numRows < 1) return [];
  const data = sheet.getRange(4, 1, numRows, headers.length).getValues();
  return data
    .filter(row => row[0] !== '')
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      obj._rowIndex = data.indexOf(row) + 4;
      return obj;
    });
}

function _appendRow(sheet, rowData) {
  sheet.appendRow(rowData);
  return sheet.getLastRow();
}

function _updateRow(sheet, rowIndex, rowData) {
  sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
}

function _updateCell(sheet, rowIndex, colIndex, value) {
  sheet.getRange(rowIndex, colIndex).setValue(value);
}


// ════════════════════════════════════════════════════════════
//  MASTER — USERS
// ════════════════════════════════════════════════════════════

const USER_HEADERS = ['user_id', 'email', 'nama', 'roles', 'aktif'];

function getAllUsers() {
  const sheet = _getMasterSheet(CONFIG.SHEETS.USERS);
  return _sheetToObjects(sheet, USER_HEADERS);
}

function getUserByEmail(email) {
  return getAllUsers().find(u => normalizeEmail(u.email) === normalizeEmail(email)) || null;
}

function createUser({ email, nama, roles }) {
  const sheet    = _getMasterSheet(CONFIG.SHEETS.USERS);
  const existing = getAllUsers();
 
  if (existing.find(u => normalizeEmail(u.email) === normalizeEmail(email))) {
    throw new Error(`Email ${email} sudah terdaftar.`);
  }
  if (!isAllowedDomain(normalizeEmail(email))) {
    throw new Error(`Email harus menggunakan domain @${CONFIG.ALLOWED_DOMAIN}`);
  }
 
  const rolesArr    = parseRoles(roles);
  const validRoles  = [CONFIG.ROLES.KOORDINATOR, CONFIG.ROLES.AUDITOR];
  const invalidRole = rolesArr.find(r => !validRoles.includes(r));
  if (invalidRole) throw new Error(`Role tidak valid: ${invalidRole}. Pilih dari: ${validRoles.join(', ')}`);
  if (rolesArr.length === 0) throw new Error('Minimal satu role harus dipilih.');
 
  const user_id = generateSequentialId('USR', existing.length);
  const row = [user_id, normalizeEmail(email), nama, toCSV(rolesArr), true];
  _appendRow(sheet, row);
  return { user_id, email, nama, roles: rolesArr };
}

function updateUser(email, updates) {
  const sheet = _getMasterSheet(CONFIG.SHEETS.USERS);
  const users = getAllUsers();
  const user  = users.find(u => normalizeEmail(u.email) === normalizeEmail(email));
  if (!user) throw new Error(`User ${email} tidak ditemukan.`);
 
  if (updates.roles !== undefined) {
    const rolesArr   = parseRoles(updates.roles);
    const validRoles = [CONFIG.ROLES.KOORDINATOR, CONFIG.ROLES.AUDITOR];
    rolesArr.forEach(r => {
      if (!validRoles.includes(r)) throw new Error(`Role tidak valid: ${r}`);
    });
    updates.roles = toCSV(rolesArr);
  }
 
  const C = CONFIG.COLS.USERS;
  if (updates.nama  !== undefined) _updateCell(sheet, user._rowIndex, C.NAMA  + 1, updates.nama);
  if (updates.email !== undefined) _updateCell(sheet, user._rowIndex, C.EMAIL + 1, normalizeEmail(updates.email));
  if (updates.roles !== undefined) _updateCell(sheet, user._rowIndex, C.ROLES + 1, updates.roles);
  return { success: true };
}

function deleteUser(email) {
  const sheet = _getMasterSheet(CONFIG.SHEETS.USERS);
  const users = getAllUsers();
  const user  = users.find(u => normalizeEmail(u.email) === normalizeEmail(email));
  if (!user) throw new Error('User tidak ditemukan: ' + email);
  sheet.deleteRow(user._rowIndex);
}

function batchDeleteUsers(emails) {
  const sheet   = _getMasterSheet(CONFIG.SHEETS.USERS);
  const users   = getAllUsers();
  const targets = emails.map(e => normalizeEmail(e.trim())).filter(Boolean);

  const rows    = [];
  const skipped = [];

  targets.forEach(function(email) {
    const user = users.find(u => normalizeEmail(u.email) === email);
    if (!user) { skipped.push({ email, reason: 'User tidak ditemukan.' }); return; }
    rows.push(user._rowIndex);
  });

  // Hapus dari bawah ke atas agar rowIndex tidak bergeser
  rows.sort((a, b) => b - a).forEach(r => sheet.deleteRow(r));
  return { deleted: rows.length, skipped };
}

function deleteArea(areaId) {
  const sheet = _getMasterSheet(CONFIG.SHEETS.AREAS);
  const areas = getAllAreas();
  const area  = areas.find(a => a.area_id === areaId);
  if (!area) throw new Error('Area tidak ditemukan: ' + areaId);
  sheet.deleteRow(area._rowIndex);
  invalidateAreasCache();
}

function batchDeleteAreas(areaIds) {
  const sheet   = _getMasterSheet(CONFIG.SHEETS.AREAS);
  const areas   = getAllAreas();

  const rows    = [];
  const skipped = [];

  areaIds.forEach(function(areaId) {
    const area = areas.find(a => a.area_id === areaId);
    if (!area) { skipped.push({ area_id: areaId, reason: 'Area tidak ditemukan.' }); return; }
    rows.push(area._rowIndex);
  });

  rows.sort((a, b) => b - a).forEach(r => sheet.deleteRow(r));
  if (rows.length > 0) invalidateAreasCache();
  return { deleted: rows.length, skipped };
}

/**
 * Ambil semua dept unik dari AREAS (untuk dropdown dept di form user)
 */
function getUniqueDepts() {
  return [...new Set(getActiveAreas().map(a => a.dept).filter(Boolean))].sort();
}

/**
 * Ambil semua Koordinator aktif (untuk notifikasi)
 */
function getAllKoordinators() {
  return getAllUsers().filter(u => {
    const roles = parseRoles(u.roles);
    return roles.includes(CONFIG.ROLES.KOORDINATOR) && (u.aktif === true || u.aktif === 'TRUE');
  });
}


// ════════════════════════════════════════════════════════════
//  MASTER — AREAS
// ════════════════════════════════════════════════════════════

const AREA_HEADERS = ['area_id', 'kategori', 'dept', 'dept_head_email', 'dept_head_name', 'area_sampling', 'auditee_emails', 'auditee_names', 'aktif'];

function getAllAreas() {
  const sheet = _getMasterSheet(CONFIG.SHEETS.AREAS);
  return _sheetToObjects(sheet, AREA_HEADERS);
}

const AREAS_CACHE_KEY = 'AREAS_ALL';

function getCachedAreas() {
  const cache = CacheService.getScriptCache();
  if (_isCacheInvalidated(AREAS_CACHE_KEY)) {
    return _refreshAreasCache();
  }
  const cached = cache.get(AREAS_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  return _refreshAreasCache();
}

function _refreshAreasCache() {
  const data = getAllAreas();
  try {
    CacheService.getScriptCache().put(AREAS_CACHE_KEY, JSON.stringify(data), CONFIG.CACHE_TTL_SECONDS);
  } catch(e) { console.warn('Areas cache put failed:', e.message); }
  _setCacheMetaRow(AREAS_CACHE_KEY, false);
  return data;
}

function invalidateAreasCache() {
  CacheService.getScriptCache().remove(AREAS_CACHE_KEY);
  _setCacheMetaInvalidated(AREAS_CACHE_KEY, true);
}

function getAreaById(areaId) {
  return getAllAreas().find(a => a.area_id === areaId) || null;
}

function getActiveAreas() {
  return getAllAreas().filter(a => a.aktif === true || a.aktif === 'TRUE');
}

function createArea({ kategori, dept, dept_head_email, dept_head_name = '', area_sampling = '', auditee_emails = '', auditee_names = '' }) {
  const sheet    = _getMasterSheet(CONFIG.SHEETS.AREAS);
  const existing = getAllAreas();
  if (!isValidEnum(kategori, CONFIG.KATEGORI)) throw new Error('Kategori tidak valid: ' + kategori);
  const area_id = generateSequentialId('AREA', existing.length);
  const row = [area_id, kategori, dept, dept_head_email, dept_head_name, area_sampling, auditee_emails, auditee_names, true];
  _appendRow(sheet, row);
  return { area_id, kategori, dept };
}

function updateArea(areaId, updates) {
  const sheet = _getMasterSheet(CONFIG.SHEETS.AREAS);
  const areas = getAllAreas();
  const area  = areas.find(a => a.area_id === areaId);
  if (!area) throw new Error('Area ' + areaId + ' tidak ditemukan.');
  const C = CONFIG.COLS.AREAS;
  if (updates.kategori        !== undefined) _updateCell(sheet, area._rowIndex, C.KATEGORI        + 1, updates.kategori);
  if (updates.dept            !== undefined) _updateCell(sheet, area._rowIndex, C.DEPT            + 1, updates.dept);
  if (updates.dept_head_email !== undefined) _updateCell(sheet, area._rowIndex, C.DEPT_HEAD_EMAIL + 1, updates.dept_head_email);
  if (updates.dept_head_name   !== undefined) _updateCell(sheet, area._rowIndex, C.DEPT_HEAD_NAME   + 1, updates.dept_head_name);
  if (updates.area_sampling    !== undefined) _updateCell(sheet, area._rowIndex, C.AREA_SAMPLING    + 1, updates.area_sampling);
  if (updates.auditee_emails   !== undefined) _updateCell(sheet, area._rowIndex, C.AUDITEE_EMAILS   + 1, updates.auditee_emails);
  if (updates.auditee_names    !== undefined) _updateCell(sheet, area._rowIndex, C.AUDITEE_NAMES    + 1, updates.auditee_names);
  if (updates.aktif           !== undefined) _updateCell(sheet, area._rowIndex, C.AKTIF           + 1, updates.aktif);
  return { success: true };
}

// ════════════════════════════════════════════════════════════
//  BATCH OPERATIONS — tambahkan di SheetService.gs
//  Letakkan setelah fungsi createArea() dan createUser()
// ════════════════════════════════════════════════════════════

/**
 * Batch create areas.
 * @param {Array<{kategori,dept,dept_head_email,area_sampling}>} items
 * @returns {{ created: number, skipped: Array<{dept,reason}> }}
 */
function batchCreateAreas(items) {
  const sheet    = _getMasterSheet(CONFIG.SHEETS.AREAS);
  const existing = getAllAreas();
  const existingDepts = existing.map(a => a.dept.toLowerCase().trim());

  const rows    = [];
  const skipped = [];
  let   counter = existing.length;

  items.forEach(function(item) {
    const dept     = (item.dept || '').trim();
    const kategori = (item.kategori || '').trim();
    const email    = (item.dept_head_email || '').trim();

    if (!dept || !email) {
      skipped.push({ dept: dept || '(kosong)', reason: 'Dept dan Dept Head wajib diisi.' });
      return;
    }
    if (!item.auditee_emails || !item.auditee_emails.trim()) {
      skipped.push({ dept, reason: 'Auditee wajib diisi.' });
      return;
    }
    if (!isValidEnum(kategori, CONFIG.KATEGORI)) {
      skipped.push({ dept, reason: 'Kategori tidak valid: ' + kategori });
      return;
    }
    if (existingDepts.includes(dept.toLowerCase())) {
      skipped.push({ dept, reason: 'Dept sudah terdaftar.' });
      return;
    }

    const area_id = generateSequentialId('AREA', counter);
    counter++;
    existingDepts.push(dept.toLowerCase()); // cegah duplikat antar baris input
    rows.push([
      area_id, kategori, dept,
      item.dept_head_email || '', item.dept_head_name || '',
      item.area_sampling   || '',
      item.auditee_emails  || '', item.auditee_names  || '',
      true
    ]);
  });

  if (rows.length > 0) {
    // appendRows sekaligus — jauh lebih cepat dari loop appendRow
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }

  return { created: rows.length, skipped };
}


/**
 * Batch create users.
 * @param {Array<{email,nama,roles,dept,catatan}>} items
 * @returns {{ created: number, skipped: Array<{email,reason}> }}
 */
function batchCreateUsers(items) {
  const sheet          = _getMasterSheet(CONFIG.SHEETS.USERS);
  const existing       = getAllUsers();
  const existingEmails = existing.map(u => normalizeEmail(u.email));
  const validRoles     = [CONFIG.ROLES.KOORDINATOR, CONFIG.ROLES.AUDITOR];
 
  const rows    = [];
  const skipped = [];
  let   counter = existing.length;
 
  items.forEach(function(item) {
    const email = normalizeEmail((item.email || '').trim());
    const nama  = (item.nama || '').trim();
 
    if (!email || !nama) {
      skipped.push({ email: email || '(kosong)', reason: 'Email dan nama wajib diisi.' });
      return;
    }
    if (!isAllowedDomain(email)) {
      skipped.push({ email, reason: 'Domain harus @' + CONFIG.ALLOWED_DOMAIN });
      return;
    }
    if (existingEmails.includes(email)) {
      skipped.push({ email, reason: 'Email sudah terdaftar.' });
      return;
    }
 
    const rolesArr    = parseRoles(item.roles || '');
    const invalidRole = rolesArr.find(r => !validRoles.includes(r));
    if (invalidRole || rolesArr.length === 0) {
      skipped.push({ email, reason: 'Role tidak valid. Gunakan: Koordinator, Auditor.' });
      return;
    }
 
    const user_id = generateSequentialId('USR', counter);
    counter++;
    existingEmails.push(email);
    rows.push([user_id, email, nama, toCSV(rolesArr), true]);
  });
 
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
 
  return { created: rows.length, skipped };
}

// ════════════════════════════════════════════════════════════
//  MASTER — CHECKLIST_MASTER
// ════════════════════════════════════════════════════════════

const CHECKLIST_MASTER_HEADERS = [
  'item_id', 'tipe', 'kategori', 'nomor', 'aspek',
  'persyaratan', 'check_item', 'standar_check_item', 'labels', 'aktif'
];

function getAllChecklistMaster() {
  const sheet = _getMasterSheet(CONFIG.SHEETS.CHECKLIST_MASTER);
  if (sheet.getLastRow() < 4) return [];
  const data = sheet.getRange(4, 1, sheet.getLastRow() - 3, CHECKLIST_MASTER_HEADERS.length).getValues();
  return data.filter(r => r[0] !== '').map((row, i) => {
    const obj = {};
    CHECKLIST_MASTER_HEADERS.forEach((h, j) => { obj[h] = row[j]; });
    obj._rowIndex = i + 4;
    return obj;
  });
}

function getChecklistGeneral() {
  return getAllChecklistMaster()
    .filter(t => t.tipe === 'GENERAL' && (t.aktif === true || t.aktif === 'TRUE'))
    .sort((a, b) => Number(a.nomor) - Number(b.nomor));
}

function getChecklistKhusus(kategori) {
  return getAllChecklistMaster()
    .filter(t => t.tipe === 'KHUSUS' && t.kategori === kategori && (t.aktif === true || t.aktif === 'TRUE'))
    .sort((a, b) => Number(a.nomor) - Number(b.nomor));
}

function generateChecklistId(tipe, kategori, existing) {
  const prefixMap = {
    'Laboratorium': 'L',
    'Office':       'O',
    'Maintenance':  'M',
    'Produksi':     'P',
    'Gudang':       'W',  // W = Warehouse, hindari konflik dengan GENERAL
  };
  const prefix = tipe === 'GENERAL' ? 'G' : (prefixMap[kategori] || 'X');
  const count  = existing.filter(function(i) {
    return i && i.item_id && String(i.item_id).startsWith(prefix + '_');
  }).length;
  return prefix + '_' + String(count + 1).padStart(3, '0');
}

function createChecklistItem({ tipe, kategori = '', nomor, aspek, persyaratan, check_item, standar_check_item = '', labels = '' }) {
  const sheet    = _getMasterSheet(CONFIG.SHEETS.CHECKLIST_MASTER);
  const existing = getAllChecklistMaster();
  const item_id  = generateChecklistId(tipe, kategori, existing);
  sheet.appendRow([item_id, tipe, kategori, nomor, aspek, persyaratan, check_item, standar_check_item, labels, true]);
  CacheService_invalidateMaster();
  return { item_id };
}

function updateChecklistItem(itemId, updates) {
  const sheet = _getMasterSheet(CONFIG.SHEETS.CHECKLIST_MASTER);
  const items = getAllChecklistMaster();
  const item  = items.find(x => x.item_id === itemId);
  if (!item) throw new Error(`Item ${itemId} tidak ditemukan.`);

  const C      = CONFIG.COLS.CHECKLIST_MASTER;
  const fields = ['tipe', 'kategori', 'nomor', 'aspek', 'persyaratan', 'check_item', 'standar_check_item', 'labels', 'aktif'];
  const cols   = [C.TIPE, C.KATEGORI, C.NOMOR, C.ASPEK, C.PERSYARATAN, C.CHECK_ITEM, C.STANDAR_CHECK_ITEM, C.LABELS, C.AKTIF];
  fields.forEach((f, i) => {
    if (updates[f] !== undefined) _updateCell(sheet, item._rowIndex, cols[i] + 1, updates[f]);
  });
  CacheService_invalidateMaster();
  return { success: true };
}

function batchDeleteChecklistItems(itemIds) {
  const sheet = _getMasterSheet(CONFIG.SHEETS.CHECKLIST_MASTER);
  const items = getAllChecklistMaster();
  const rows    = [];
  const skipped = [];
  itemIds.forEach(function(id) {
    const item = items.find(x => x.item_id === id);
    if (!item) { skipped.push({ item_id: id, reason: 'Item tidak ditemukan.' }); return; }
    rows.push(item._rowIndex);
  });
  rows.sort((a, b) => b - a).forEach(r => sheet.deleteRow(r));
  if (rows.length > 0) CacheService_invalidateMaster();
  return { deleted: rows.length, skipped };
}

/**
 * Batch insert checklist items dengan tipe dan kategori sama.
 * Nomor di-generate otomatis lanjutan dari data existing.
 * @param {string} tipe  'GENERAL' | 'KHUSUS'
 * @param {string} kategori  kosong jika GENERAL
 * @param {Array<{aspek, persyaratan, check_item, standar_check_item}>} items
 */
function batchCreateChecklistItems(tipe, kategori, items) {
  const sheet    = _getMasterSheet(CONFIG.SHEETS.CHECKLIST_MASTER);
  const existing = getAllChecklistMaster();

  // Nomor lanjutan dari existing tipe+kategori yang sama
  const sameScope = existing.filter(x =>
    x.tipe === tipe && (tipe === 'GENERAL' || x.kategori === kategori)
  );
  let nextNomor = sameScope.length > 0
    ? Math.max(...sameScope.map(x => Number(x.nomor) || 0)) + 1
    : 1;

  const rows    = [];
  const skipped = [];

  items.forEach(function(item) {
    const aspek       = (item.aspek || '').trim();
    const persyaratan = (item.persyaratan || '').trim();
    const check_item  = (item.check_item || '').trim();
    const standar     = (item.standar_check_item || '').trim();

    if (!aspek || !persyaratan || !check_item) {
      skipped.push({ check_item: check_item || '(kosong)', reason: 'Aspek, persyaratan, dan check item wajib diisi.' });
      return;
    }

    const validAspek = ['Plan', 'Do', 'Check', 'Action'];
    if (!validAspek.includes(aspek)) {
      skipped.push({ check_item, reason: 'Aspek tidak valid: ' + aspek + '. Gunakan: Plan, Do, Check, Action.' });
      return;
    }

    const item_id = generateChecklistId(tipe, kategori, [
      ...existing,
      ...rows.map(function(r) { return { item_id: r[0] }; })
    ]);
    const labels = (item.labels || '').trim();
    rows.push([item_id, tipe, kategori, nextNomor++, aspek, persyaratan, check_item, standar, labels, true]);
  });

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    CacheService_invalidateMaster();
  }

  return { created: rows.length, skipped };
}

// ════════════════════════════════════════════════════════════
//  MASTER — AGENDA_CHECKLIST
// ════════════════════════════════════════════════════════════

const AGENDA_CHECKLIST_HEADERS = [
  'id', 'agenda_id', 'item_id', 'tipe', 'kategori',
  'nomor', 'aspek', 'persyaratan', 'check_item', 'standar_check_item'
];

function getChecklistByAgenda(agendaId, spreadsheetId) {
  // spreadsheetId wajib — checklist ada di spreadsheet periode
  if (!spreadsheetId) {
    // Fallback: cari period dari agenda
    const agenda = getAllAgendas().find(a => a.agenda_id === agendaId);
    if (!agenda) return [];
    const period = getPeriodById(agenda.period_id);
    if (!period || !period.spreadsheet_id) return [];
    spreadsheetId = period.spreadsheet_id;
  }
  const sheet = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.AGENDA_CHECKLIST);
  if (sheet.getLastRow() < 3) return [];
  const headerRow = sheet.getRange(2, 1, 1, AGENDA_CHECKLIST_HEADERS.length).getValues()[0];
  const data      = sheet.getRange(3, 1, sheet.getLastRow() - 2, AGENDA_CHECKLIST_HEADERS.length).getValues();
  return data
    .filter(r => r[0] !== '' && r[1] === agendaId)
    .map(row => {
      const obj = {};
      headerRow.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    })
    .sort((a, b) => {
      if (a.tipe !== b.tipe) return a.tipe === 'GENERAL' ? -1 : 1;
      return Number(a.nomor) - Number(b.nomor);
    });
}

function saveAgendaChecklist(agendaId, itemIds, spreadsheetId) {
  if (!spreadsheetId) {
    const agenda = getAllAgendas().find(a => a.agenda_id === agendaId);
    if (!agenda) throw new Error('Agenda tidak ditemukan: ' + agendaId);
    const period = getPeriodById(agenda.period_id);
    if (!period || !period.spreadsheet_id) throw new Error('Periode tidak ditemukan.');
    spreadsheetId = period.spreadsheet_id;
  }

  const sheet    = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.AGENDA_CHECKLIST);
  const allItems = getAllChecklistMaster();

  // Hapus existing rows untuk agenda ini
  if (sheet.getLastRow() >= 3) {
    const data = sheet.getRange(3, 1, sheet.getLastRow() - 2, 2).getValues();
    const toDelete = [];
    data.forEach((row, i) => { if (row[1] === agendaId) toDelete.push(i + 3); });
    toDelete.reverse().forEach(r => sheet.deleteRow(r));
  }

  const selected = allItems.filter(i => itemIds.includes(i.item_id));
  if (selected.length === 0) return { success: true, count: 0 };

  const rows = selected.map(item => [
    generateId('ACL'), agendaId, item.item_id,
    item.tipe, item.kategori, item.nomor, item.aspek,
    item.persyaratan, item.check_item, item.standar_check_item || ''
  ]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

  return { success: true, count: selected.length };
}


// ════════════════════════════════════════════════════════════
//  MASTER — AUDIT_REGISTRY
// ════════════════════════════════════════════════════════════

const REGISTRY_HEADERS = [
  'period_id', 'nama_periode', 'spreadsheet_id', 'spreadsheet_url',
  'tanggal_mulai', 'tanggal_selesai', 'status', 'created_by', 'created_at',
  'archived', 'archived_at', 'completed_at'
];

function getAllPeriods(includeArchived) {
  const sheet = _getMasterSheet(CONFIG.SHEETS.AUDIT_REGISTRY);
  const all   = _sheetToObjects(sheet, REGISTRY_HEADERS);
  return includeArchived ? all : all.filter(p => !p.archived || p.archived === 'FALSE' || p.archived === false);
}

function getPeriodById(periodId) {
  return getAllPeriods().find(p => p.period_id === periodId) || null;
}

function getActivePeriod() {
  return getAllPeriods().find(p => p.status === CONFIG.PERIOD_STATUS.ACTIVE) || null;
}

function createAuditPeriod({ nama_periode, tanggal_mulai, tanggal_selesai, created_by }) {
  const existing  = getAllPeriods();
  const period_id = nama_periode.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  if (existing.find(p => p.period_id === period_id)) throw new Error(`Period ID "${period_id}" sudah ada.`);

  const { spreadsheet_id, spreadsheet_url } = _createAuditSpreadsheet(period_id, nama_periode);
  const row = [
    period_id, nama_periode, spreadsheet_id, spreadsheet_url,
    tanggal_mulai, tanggal_selesai,
    CONFIG.PERIOD_STATUS.PLANNED, created_by, now()
  ];
  _appendRow(_getMasterSheet(CONFIG.SHEETS.AUDIT_REGISTRY), row);
  return { period_id, spreadsheet_id, spreadsheet_url };
}

function updatePeriodStatus(periodId, status) {
  const sheet   = _getMasterSheet(CONFIG.SHEETS.AUDIT_REGISTRY);
  const periods = getAllPeriods();
  const period  = periods.find(p => p.period_id === periodId);
  if (!period) throw new Error(`Period ${periodId} tidak ditemukan.`);
  const C = CONFIG.COLS.AUDIT_REGISTRY;
  _updateCell(sheet, period._rowIndex, C.STATUS + 1, status);
  if (status === CONFIG.PERIOD_STATUS.COMPLETED) {
    _updateCell(sheet, period._rowIndex, C.COMPLETED_AT + 1, now());
  }
  return { success: true };
}

function archivePeriod(periodId) {
  const sheet   = _getMasterSheet(CONFIG.SHEETS.AUDIT_REGISTRY);
  const periods = getAllPeriods();
  const period  = periods.find(p => p.period_id === periodId);
  if (!period) throw new Error('Periode tidak ditemukan: ' + periodId);
  if (period.status !== CONFIG.PERIOD_STATUS.COMPLETED) {
    throw new Error('Hanya periode COMPLETED yang bisa diarsip.');
  }
  const C = CONFIG.COLS.AUDIT_REGISTRY;
  _updateCell(sheet, period._rowIndex, C.ARCHIVED    + 1, true);
  _updateCell(sheet, period._rowIndex, C.ARCHIVED_AT + 1, now());
  return { success: true };
}

function restoreArchivedPeriod(periodId) {
  const sheet   = _getMasterSheet(CONFIG.SHEETS.AUDIT_REGISTRY);
  const periods = getAllPeriods(true); // include archived
  const period  = periods.find(p => p.period_id === periodId);
  if (!period) throw new Error('Periode tidak ditemukan: ' + periodId);
  const C = CONFIG.COLS.AUDIT_REGISTRY;
  _updateCell(sheet, period._rowIndex, C.ARCHIVED    + 1, false);
  _updateCell(sheet, period._rowIndex, C.ARCHIVED_AT + 1, '');
  return { success: true };
}

function deletePeriod(periodId) {
  const sheet   = _getMasterSheet(CONFIG.SHEETS.AUDIT_REGISTRY);
  const periods = getAllPeriods(true);
  const period  = periods.find(p => p.period_id === periodId);
  if (!period) throw new Error('Periode tidak ditemukan: ' + periodId);

  if (period.status === CONFIG.PERIOD_STATUS.ACTIVE) {
    throw new Error('Periode ACTIVE tidak bisa dihapus.');
  }

  if (period.status === CONFIG.PERIOD_STATUS.COMPLETED) {
    // Cek 3 tahun penuh — boleh hapus mulai 1 Jan (tahun_completed + 4)
    const completedAt  = period.completed_at ? new Date(period.completed_at) : null;
    if (!completedAt)  throw new Error('Tanggal completed tidak ditemukan. Hubungi administrator.');
    const completedYear = completedAt.getFullYear();
    const earliestDelete = new Date(completedYear + 4, 0, 1); // 1 Jan tahun+4
    if (new Date() < earliestDelete) {
      throw new Error(
        'Periode ini baru bisa dihapus mulai 1 Januari ' + (completedYear + 4) + '.'
      );
    }
  }

  // Hapus file Drive
  if (period.spreadsheet_id) {
    try {
      const file = DriveApp.getFileById(period.spreadsheet_id);
      file.setTrashed(true);
    } catch(e) {
      console.warn('Gagal hapus file Drive:', e.message);
    }
  }

  // Hapus agenda terkait
  const agendas = getAgendasByPeriod(periodId);
  if (agendas.length > 0) {
    const agendaSheet = _getMasterSheet(CONFIG.SHEETS.AUDIT_AGENDA);
    const allAgendas  = getAllAgendas();
    const toDelete    = allAgendas
      .filter(a => a.period_id === periodId)
      .map(a => a._rowIndex)
      .sort((a, b) => b - a);
    toDelete.forEach(r => agendaSheet.deleteRow(r));
  }

  // Hapus entry registry
  sheet.deleteRow(period._rowIndex);
  return { success: true };
}

function _createAuditSpreadsheet(periodId, namaPeriode) {
  const rootFolder   = getOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER_NAME);
  const periodFolder = getOrCreateFolder(periodId, rootFolder);
  const ss           = SpreadsheetApp.create(`AUDIT_${periodId}`);
  const file         = DriveApp.getFileById(ss.getId());
  periodFolder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  _setupAuditSheets(ss, periodId, namaPeriode);
  return { spreadsheet_id: ss.getId(), spreadsheet_url: ss.getUrl() };
}

function _setupAuditSheets(ss, periodId, namaPeriode) {
  const HEADERS = {
    SESSIONS: [
      'session_id','period_id','area_id','nama_area','kategori','dept',
      'dept_head_email','auditor_emails','auditee_emails',
      'started_by','started_at','status',
      'agreement_foto_url','agreement_by','agreement_at','area_sampling',
      'auditee_hadir_names','agenda_id','lead_auditor','jadwal_tanggal',
      'assigned_by','assigned_at',
    ],
    AUDIT_RESULTS: [
      'result_id','session_id','nomor_persyaratan','aspek','persyaratan',
      'check_item_no','check_item','status','detail_temuan','foto_urls',
      'finding_id','auditor_email','saved_at',
    ],
    FINDINGS: [
      'finding_id','session_id','nomor_persyaratan','check_item_no',
      'deskripsi_temuan','status_persyaratan','foto_urls',
      'created_by','created_at','finding_status',
      'verified_by','verified_at','target_date',
      'tpp_status','closed_at',
    ],
    TPP_ITEMS: [
      'tpp_item_id','finding_id','tipe',
      'deskripsi','submitted_by','submitted_at',
      'impl_foto_urls','impl_keterangan','impl_submitted_at','impl_submitted_by',
    ],
    AGENDA_CHECKLIST: [
      'id','agenda_id','item_id','tipe','kategori',
      'nomor','aspek','persyaratan','check_item','standar_check_item',
    ],
    REQUIREMENT_LOCKS: [
      'lock_id','session_id','nomor_persyaratan','locked_by','locked_at','status',
    ],
    APPROVAL_LOG: [
      'log_id','finding_id','session_id','stage','level','action',
      'by_email','at','komentar','skipped','skip_reason',
    ],
  };

  const COLORS = {
    SESSIONS: '2E75B6', AUDIT_RESULTS: '375623',
    FINDINGS: 'C55A11', TPP_ITEMS: 'E06C4B',
    AGENDA_CHECKLIST: '1F6B75',
    REQUIREMENT_LOCKS: '7030A0', APPROVAL_LOG: '404040',
  };

  const defaultSheet = ss.getSheets()[0];

  Object.entries(HEADERS).forEach(([name, headers]) => {
    const ws = ss.insertSheet(name);
    ws.setTabColor(COLORS[name] || '404040');
    ws.getRange(1, 1, 1, headers.length).merge();
    const infoCell = ws.getRange(1, 1);
    infoCell.setValue(`AUDIT ${namaPeriode} — Sheet: ${name}`);
    infoCell.setBackground('#1F3864');
    infoCell.setFontColor('#FFFFFF');
    infoCell.setFontWeight('bold');
    const headerRange = ws.getRange(2, 1, 1, headers.length);
    headerRange.setValues([headers]);
    headerRange.setBackground('#1F3864');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');
    ws.setFrozenRows(2);
    ws.setColumnWidths(1, headers.length, 160);
  });

  try { ss.deleteSheet(defaultSheet); } catch(e) {}

  const infoSheet = ss.insertSheet('_INFO', 0);
  infoSheet.setTabColor('404040');
  infoSheet.getRange('A1').setValue(`File Audit: ${namaPeriode}`);
  infoSheet.getRange('A2').setValue(`Period ID: ${periodId}`);
  infoSheet.getRange('A3').setValue(`Dibuat: ${now()}`);
  infoSheet.getRange('A4').setValue('⚠️ Jangan edit file ini secara manual.');
  infoSheet.getRange('A1:A4').setFontFamily('Arial').setFontSize(10);
  infoSheet.getRange('A1').setFontWeight('bold').setFontSize(13);
}

// ════════════════════════════════════════════════════════════
//  MASTER — AUDIT_AGENDA
// ════════════════════════════════════════════════════════════
// Tambahkan kolom lead_auditor di AGENDA_HEADERS
const AGENDA_HEADERS = [
  'agenda_id', 'period_id', 'area_id', 'dept', 'kategori',
  'auditor_emails', 'lead_auditor',
  'jadwal_tanggal', 'status', 'session_id', 'assigned_by', 'assigned_at'
];

function createAgenda({ period_id, area_id, auditor_emails, lead_auditor = '', jadwal_tanggal = '', assigned_by }) {
  const sheet    = _getMasterSheet(CONFIG.SHEETS.AUDIT_AGENDA);
  const existing = getAllAgendas();

  if (existing.find(a => a.period_id === period_id && a.area_id === area_id)) {
    throw new Error('Agenda untuk dept ' + area_id + ' di periode ' + period_id + ' sudah ada.');
  }

  const auditors = parseCSV(auditor_emails);
  if (auditors.length === 0) throw new Error('Minimal 1 auditor per departemen.');

  const area = getAreaById(area_id);

  // Validasi lead auditor harus ada di daftar auditor
  if (lead_auditor && !auditors.includes(normalizeEmail(lead_auditor))) {
    throw new Error('Lead auditor harus merupakan salah satu dari auditor yang ditugaskan.');
  }

  const agenda_id = generateSequentialId('AGD', existing.length);
  const row = [
    agenda_id, period_id, area_id,
    area ? area.dept : area_id,       // snapshot dept, fallback ke area_id
    area ? area.kategori : '',        // snapshot kategori
    toCSV(auditors), lead_auditor,
    jadwal_tanggal,
    CONFIG.AGENDA_STATUS.PLANNED, '', assigned_by, now()
  ];
  _appendRow(sheet, row);
  return { agenda_id };
}

// Update updateAgendaSessionId — juga set jadwal_tanggal saat start
function updateAgendaSessionId(agendaId, sessionId) {
  const sheet   = _getMasterSheet(CONFIG.SHEETS.AUDIT_AGENDA);
  const agendas = getAllAgendas();
  const agenda  = agendas.find(a => a.agenda_id === agendaId);
  if (!agenda) throw new Error('Agenda ' + agendaId + ' tidak ditemukan.');
  _updateCell(sheet, agenda._rowIndex, CONFIG.COLS.AUDIT_AGENDA.SESSION_ID + 1, sessionId);
  _updateCell(sheet, agenda._rowIndex, CONFIG.COLS.AUDIT_AGENDA.JADWAL_TANGGAL + 1, now());
  _updateCell(sheet, agenda._rowIndex, CONFIG.COLS.AUDIT_AGENDA.STATUS + 1, CONFIG.AGENDA_STATUS.STARTED);
  return { success: true };
}

function getAllAgendas() {
  const sheet = _getMasterSheet(CONFIG.SHEETS.AUDIT_AGENDA);
  return _sheetToObjects(sheet, AGENDA_HEADERS);
}

function getAgendasByPeriod(periodId) {
  return getAllAgendas().filter(a => a.period_id === periodId);
}

function getAgendaByAreaAndPeriod(areaId, periodId) {
  return getAllAgendas().find(a => a.area_id === areaId && a.period_id === periodId) || null;
}

function markAgendaDone(agendaId) {
  const sheet   = _getMasterSheet(CONFIG.SHEETS.AUDIT_AGENDA);
  const agendas = getAllAgendas();
  const agenda  = agendas.find(a => a.agenda_id === agendaId);
  if (!agenda) throw new Error(`Agenda ${agendaId} tidak ditemukan.`);
  _updateCell(sheet, agenda._rowIndex, CONFIG.COLS.AUDIT_AGENDA.STATUS + 1, CONFIG.AGENDA_STATUS.DONE);
  return { success: true };
}


// ════════════════════════════════════════════════════════════
//  FILE AUDIT — SESSIONS
// ════════════════════════════════════════════════════════════

function getSessionsByPeriod(spreadsheetId) {
  const sheet     = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.SESSIONS);
  const headerRow = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (sheet.getLastRow() < 3) return [];
  const data = sheet.getRange(3, 1, sheet.getLastRow() - 2, headerRow.length).getValues();
  const filtered = [];
  data.forEach((row, i) => {
    if (row[0] === '') return;
    const obj = {};
    headerRow.forEach((h, j) => { obj[h] = row[j]; });
    obj._rowIndex = i + 3;
    filtered.push(obj);
  });
  return filtered;
}

function getSessionById(spreadsheetId, sessionId) {
  return getSessionsByPeriod(spreadsheetId).find(s => s.session_id === sessionId) || null;
}

function createSession({ spreadsheetId, agendaId, periodId, areaId, auditeeEmails, startedBy }) {
  const area = getAreaById(areaId);
  if (!area) throw new Error('Area ' + areaId + ' tidak ditemukan.');

  const agenda = getAgendaByAreaAndPeriod(areaId, periodId);
  if (!agenda) throw new Error('Agenda untuk area ' + areaId + ' periode ' + periodId + ' tidak ditemukan.');

  // Auditee: dari parameter (jika ada) atau otomatis dari USERS.dept
  var finalAuditees = auditeeEmails
    ? parseCSV(auditeeEmails)
    : parseCSV(area.auditee_emails || '');

  // Selalu tambahkan dept head jika belum ada
  var deptHeadEmail = normalizeEmail(area.dept_head_email);
  if (deptHeadEmail && !finalAuditees.map(normalizeEmail).includes(deptHeadEmail)) {
    finalAuditees.push(deptHeadEmail);
  }

  const session_id = generateId('SES');
  const sheet      = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.SESSIONS);

  const row = [
    session_id, periodId,
    area.area_id, area.dept, area.kategori, area.dept,
    area.dept_head_email,
    agenda.auditor_emails,
    toCSV(finalAuditees),
    startedBy, now(),
    CONFIG.SESSION_STATUS.IN_PROGRESS,
    '', '', '',
    area.area_sampling || '',
    '',
    agenda.agenda_id,
    agenda.lead_auditor || '',
    agenda.jadwal_tanggal || '',
    agenda.assigned_by || '',
    agenda.assigned_at || '',
  ];
  _appendRow(sheet, row);
  updateAgendaSessionId(agendaId, session_id);
  return { session_id };
}

function updateSessionStatus(spreadsheetId, sessionId, status, extraFields = {}) {
  const sheet    = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.SESSIONS);
  const sessions = getSessionsByPeriod(spreadsheetId);
  const session  = sessions.find(s => s.session_id === sessionId);
  if (!session) throw new Error(`Session ${sessionId} tidak ditemukan.`);

  const C = CONFIG.AUDIT_COLS.SESSIONS;
  _updateCell(sheet, session._rowIndex, C.STATUS + 1, status);
  if (extraFields.agreement_foto_url) _updateCell(sheet, session._rowIndex, C.AGREEMENT_FOTO_URL + 1, extraFields.agreement_foto_url);
  if (extraFields.agreement_by)       _updateCell(sheet, session._rowIndex, C.AGREEMENT_BY       + 1, extraFields.agreement_by);
  if (extraFields.agreement_at)       _updateCell(sheet, session._rowIndex, C.AGREEMENT_AT       + 1, extraFields.agreement_at);
  return { success: true };
}

function finishSession(periodId, sessionId, auditorEmail) {
  const reg = getPeriodById(periodId);
  if (!reg) throw new Error('Periode tidak ditemukan: ' + periodId);

  const session = getSessionById(reg.spreadsheet_id, sessionId);
  if (!session) throw new Error('Session tidak ditemukan: ' + sessionId);

  if (session.status !== CONFIG.SESSION_STATUS.IN_PROGRESS) {
    throw new Error('Session sudah selesai atau tidak dalam status IN_PROGRESS.');
  }

  // Cek semua checklist sudah diisi
  const agendas = getAgendasByPeriod(periodId);
  const agenda  = agendas.find(a => a.area_id === session.area_id);
  if (!agenda) throw new Error('Agenda tidak ditemukan.');

  const checklist    = getChecklistByAgenda(agenda.agenda_id, reg.spreadsheet_id);
  const auditResults = getAuditResults(periodId, sessionId);

  if (auditResults.length < checklist.length) {
    const remaining = checklist.length - auditResults.length;
    throw new Error(remaining + ' check item belum diisi. Selesaikan semua sebelum mengakhiri audit.');
  }

  // Update status session → PENDING_AGREEMENT
  updateSessionStatus(reg.spreadsheet_id, sessionId,
    CONFIG.SESSION_STATUS.PENDING_AGREEMENT
  );

  // Update status agenda → DONE
  markAgendaDone(agenda.agenda_id);

  // Set semua finding di session ini ke PENDING_VERIFICATION
  const reg2     = getPeriodById(periodId);
  const findings = getFindingsBySession(reg2.spreadsheet_id, sessionId);
  const C        = CONFIG.AUDIT_COLS.FINDINGS;
  findings.forEach(function(f) {
    if (f.finding_status === CONFIG.FINDING_STATUS.PENDING_VERIFICATION) return; // sudah benar
    updateFindingField(reg2.spreadsheet_id, f.finding_id, C.FINDING_STATUS,
      CONFIG.FINDING_STATUS.PENDING_VERIFICATION);
  });

  // Notifikasi ke auditee (dept head + auditee emails)
  try {
    const auditeeEmails = parseCSV(session.auditee_emails || '');
    const findings      = getFindingsBySession(reg.spreadsheet_id, sessionId);
    const nonComply     = findings.length;
    const subject       = `[Audit] Persetujuan Hasil Audit — ${session.nama_area}`;
    const body          = `Yth. Tim ${session.nama_area},\n\n` +
      `Audit oleh ${auditorEmail} telah selesai dan memerlukan persetujuan Anda.\n\n` +
      `Ringkasan:\n` +
      `• Area: ${session.nama_area}\n` +
      `• Total temuan: ${nonComply}\n\n` +
      `Silakan buka sistem audit untuk memberikan persetujuan.\n\n` +
      `Salam,\nSistem Audit Internal WingsCorP`;

    auditeeEmails.forEach(function(email) {
      if (email && isAllowedDomain(normalizeEmail(email))) {
        try {
          GmailApp.sendEmail(normalizeEmail(email), subject, body);
        } catch(e) {
          console.warn('Gagal kirim email ke ' + email + ':', e.message);
        }
      }
    });
  } catch(e) {
    console.warn('Notifikasi gagal (non-fatal):', e.message);
  }

  return { success: true, status: CONFIG.SESSION_STATUS.PENDING_AGREEMENT };
}


// ════════════════════════════════════════════════════════════
//  FILE AUDIT — REQUIREMENT_LOCKS
// ════════════════════════════════════════════════════════════

function getLocks(spreadsheetId, sessionId) {
  const sheet     = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.REQUIREMENT_LOCKS);
  const headerRow = sheet.getRange(2, 1, 1, 6).getValues()[0];
  if (sheet.getLastRow() < 3) return [];
  const data = sheet.getRange(3, 1, sheet.getLastRow() - 2, 6).getValues();
  return data.filter(r => r[0] !== '' && r[1] === sessionId).map((row, i) => {
    const obj = {};
    headerRow.forEach((h, j) => { obj[h] = row[j]; });
    obj._rowIndex = i + 3;
    return obj;
  });
}

function lockRequirement(spreadsheetId, sessionId, nomorPersyaratan, auditorEmail) {
  const sheet  = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.REQUIREMENT_LOCKS);
  const locks  = getLocks(spreadsheetId, sessionId);
  const active = locks.find(l =>
    Number(l.nomor_persyaratan) === Number(nomorPersyaratan) && l.status === 'LOCKED'
  );

  if (active) {
    if (isLockExpired(active.locked_at)) {
      _updateCell(sheet, active._rowIndex, 6, 'RELEASED');
      // Jatuh ke bawah — buat lock baru di akhir fungsi
    } else if (active.locked_by !== auditorEmail) {
      return { locked: false, lockedBy: active.locked_by };
    } else {
      // Pemilik yang sama panggil ulang = heartbeat. Perpanjang locked_at.
      _updateCell(sheet, active._rowIndex, 5, now());
      return { locked: true, lockedBy: auditorEmail, renewed: true };
    }
  }

  const lock_id = generateId('LCK');
  _appendRow(sheet, [lock_id, sessionId, nomorPersyaratan, auditorEmail, now(), 'LOCKED']);
  return { locked: true, lockedBy: auditorEmail };
}

function releaseLock(spreadsheetId, sessionId, nomorPersyaratan, auditorEmail) {
  const sheet = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.REQUIREMENT_LOCKS);
  const locks = getLocks(spreadsheetId, sessionId);
  const lock  = locks.find(l =>
    Number(l.nomor_persyaratan) === Number(nomorPersyaratan) &&
    l.locked_by === auditorEmail && l.status === 'LOCKED'
  );
  if (lock) {
    _updateCell(sheet, lock._rowIndex, 6, 'RELEASED');
    return { success: true };
  }
  return { success: false, message: 'Lock tidak ditemukan.' };
}


// ════════════════════════════════════════════════════════════
//  FILE AUDIT — AUDIT_RESULTS & FINDINGS
// ════════════════════════════════════════════════════════════

function saveAuditResult(spreadsheetId, sessionId, result) {
  const sheet     = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.AUDIT_RESULTS);
  const result_id = generateId('RES');
  const row = [
    result_id, sessionId,
    result.nomor_persyaratan, result.aspek, result.persyaratan,
    result.check_item_no, result.check_item,
    result.status, result.detail_temuan, result.foto_urls || '',
    result.finding_id || '', result.auditor_email, now()
  ];
  _appendRow(sheet, row);
  return { result_id };
}

// ── getAuditResults ──────────────────────────────────────────
// Ambil semua hasil audit untuk session tertentu
function getAuditResults(periodId, sessionId) {
  const reg   = getPeriodById(periodId);
  if (!reg)   throw new Error('Periode tidak ditemukan: ' + periodId);
  const sheet = _getAuditSheet(reg.spreadsheet_id, CONFIG.AUDIT_SHEETS.AUDIT_RESULTS);
  if (sheet.getLastRow() < 3) return [];
  const headerRow = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data      = sheet.getRange(3, 1, sheet.getLastRow() - 2, headerRow.length).getValues();
  const allRows = [];
  data.forEach((row, i) => {
    if (row[0] === '') return;
    const obj = {};
    headerRow.forEach((h, j) => { obj[h] = row[j]; });
    obj._rowIndex = i + 3;
    allRows.push(obj);
  });
  return allRows.filter(r => r.session_id === sessionId);
}

function _getSessionById(spreadsheetId, sessionId) {
  const sheet = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.SESSIONS);
  if (sheet.getLastRow() < 3) return null;
  const headerRow = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data      = sheet.getRange(3, 1, sheet.getLastRow() - 2, headerRow.length).getValues();
  const row       = data.find(r => r[0] === sessionId);
  if (!row) return null;
  const obj = {};
  headerRow.forEach((h, j) => { obj[h] = row[j]; });
  return obj;
}

// ── saveCheckItemResult ──────────────────────────────────────
// Simpan hasil satu check item (COMPLY / NON_COMPLY)
// Jika NON_COMPLY, buat finding baru dan return finding_id
function saveCheckItemResult({ period_id, session_id, item_id, nomor_persyaratan, check_item_no, status }) {
  const reg = getPeriodById(period_id);
  if (!reg) throw new Error('Periode tidak ditemukan: ' + period_id);

  // ── Cek duplikat: sudah ada result untuk check item ini di session ini? ──
  // getAuditResults sudah filter by session_id → tidak bisa mixed up dengan session lain
  const existing     = getAuditResults(period_id, session_id);
  const alreadySaved = existing.find(r =>
    Number(r.nomor_persyaratan) === Number(nomor_persyaratan) &&
    Number(r.check_item_no)     === Number(check_item_no)
  );

  if (alreadySaved) {
    // Item sudah ada — update status saja (kasus edit comply ↔ non comply)
    const resultSheet = _getAuditSheet(reg.spreadsheet_id, CONFIG.AUDIT_SHEETS.AUDIT_RESULTS);
    const C = CONFIG.AUDIT_COLS.AUDIT_RESULTS;
    _updateCell(resultSheet, alreadySaved._rowIndex, C.STATUS    + 1, status);
    _updateCell(resultSheet, alreadySaved._rowIndex, C.SAVED_AT  + 1, now());

    // Berubah ke NON_COMPLY dan belum ada finding → buat finding baru
    if (status === 'NON_COMPLY' && !String(alreadySaved.finding_id || '').trim()) {
      const finding = createFinding(reg.spreadsheet_id, session_id, {
        nomor_persyaratan, check_item_no,
        deskripsi_temuan: '', status_persyaratan: 'NON_COMPLY',
        foto_urls: '', created_by: getCurrentUserEmail(),
      });
      _updateCell(resultSheet, alreadySaved._rowIndex, C.FINDING_ID + 1, finding.finding_id);
      return { result_id: alreadySaved.result_id, finding_id: finding.finding_id };
    }

    // Berubah ke COMPLY dan ada finding → hapus finding lama
    if (status === 'COMPLY') {
      const existingFindingId = String(alreadySaved.finding_id || '').trim();
      if (existingFindingId) {
        try {
          const findingSheet = _getAuditSheet(reg.spreadsheet_id, CONFIG.AUDIT_SHEETS.FINDINGS);
          // Cari by finding_id yang unik — tidak ada risiko mixed up session
          const allFindings = getFindingsBySession(reg.spreadsheet_id, null);
          const finding     = allFindings.find(f => String(f.finding_id).trim() === existingFindingId);
          if (finding) {
            findingSheet.deleteRow(finding._rowIndex);
          } else {
            console.warn('[saveCheckItemResult] Finding tidak ditemukan untuk dihapus:', existingFindingId);
          }
        } catch(e) {
          console.warn('[saveCheckItemResult] Gagal hapus finding:', e.message);
        }
        _updateCell(resultSheet, alreadySaved._rowIndex, C.FINDING_ID + 1, '');
      }
    }

    return { result_id: alreadySaved.result_id, finding_id: alreadySaved.finding_id || '' };
  }

  // ── Item baru: cari detail check item dari AGENDA_CHECKLIST ──
  // Seluruh lookup dibawah ini terikat ke session_id → area_id → agenda_id
  // yang spesifik. Tidak ada risiko mixed up dengan session/area lain.
  const agendas = getAgendasByPeriod(period_id);
  const session = _getSessionById(reg.spreadsheet_id, session_id);
  if (!session) throw new Error('Session tidak ditemukan: ' + session_id);

  const agenda = agendas.find(a => a.area_id === session.area_id);
  if (!agenda)  throw new Error('Agenda tidak ditemukan untuk session: ' + session_id);

  // allChecklistItems sudah di-sort oleh getChecklistByAgenda:
  //   GENERAL dulu → KHUSUS, lalu by nomor ascending
  // Ini persis sama dengan urutan yang dipakai _buildGroups di frontend
  const allChecklistItems = getChecklistByAgenda(agenda.agenda_id, reg.spreadsheet_id);

  // ── Cari item: prioritas item_id, fallback ke nomor+posisi ──
  var item = null;

  // Cara 1: by item_id — paling tepat, tidak ada ambiguitas
  if (item_id && String(item_id).trim()) {
    item = allChecklistItems.find(i => i.item_id === String(item_id).trim()) || null;
  }

  // Cara 2: fallback by nomor_persyaratan + check_item_no
  // Dipakai kalau item_id kosong (bug draft di frontend tidak sertakan item_id)
  // check_item_no adalah urutan 1-based dalam satu persyaratan (group nomor yang sama)
  if (!item) {
    // Kumpulkan semua item dengan nomor_persyaratan yang sama,
    // dalam urutan yang sudah ada (sudah di-sort oleh getChecklistByAgenda)
    const sameGroup = allChecklistItems.filter(i =>
      Number(i.nomor) === Number(nomor_persyaratan)
    );
    // check_item_no = 1 → index 0, check_item_no = 2 → index 1, dst.
    const idx = Number(check_item_no) - 1;
    if (idx >= 0 && idx < sameGroup.length) {
      item = sameGroup[idx];
    }
  }

  if (!item) {
    throw new Error(
      'Check item tidak ditemukan di agenda' +
      ' (nomor_persyaratan=' + nomor_persyaratan +
      ', check_item_no=' + check_item_no +
      ', item_id=' + (item_id || 'kosong') +
      ', agenda_id=' + agenda.agenda_id + ')'
    );
  }

  // ── Simpan ke AUDIT_RESULTS ──
  const resultData = saveAuditResult(reg.spreadsheet_id, session_id, {
    nomor_persyaratan,
    aspek:         item.aspek,
    persyaratan:   item.persyaratan,
    check_item_no,
    check_item:    item.check_item,
    status,
    detail_temuan: '',
    foto_urls:     '',
    finding_id:    '',
    auditor_email: getCurrentUserEmail(),
  });

  if (status !== 'NON_COMPLY') {
    return { result_id: resultData.result_id };
  }

  // ── Buat finding kosong untuk NON_COMPLY ──
  // Deskripsi dan foto diisi kemudian oleh saveFindingDetail
  const finding = createFinding(reg.spreadsheet_id, session_id, {
    nomor_persyaratan,
    check_item_no,
    deskripsi_temuan:   '',
    status_persyaratan: 'NON_COMPLY',
    foto_urls:          '',
    created_by:         getCurrentUserEmail(),
  });

  // Update AUDIT_RESULTS row yang baru dibuat dengan finding_id
  const C           = CONFIG.AUDIT_COLS.AUDIT_RESULTS;
  const resultSheet = _getAuditSheet(reg.spreadsheet_id, CONFIG.AUDIT_SHEETS.AUDIT_RESULTS);
  const newRowIndex = resultSheet.getLastRow(); // appendRow selalu di baris terakhir
  _updateCell(resultSheet, newRowIndex, C.FINDING_ID + 1, finding.finding_id);

  return { result_id: resultData.result_id, finding_id: finding.finding_id };
}


// ── saveFindingDetail ────────────────────────────────────────
// Update deskripsi dan foto pada finding yang sudah dibuat
function saveFindingDetail({ finding_id, session_id, period_id, deskripsi_temuan, foto_urls }) {
  const reg   = getPeriodById(period_id);
  if (!reg)   throw new Error('Periode tidak ditemukan: ' + period_id);
  const sheet = _getAuditSheet(reg.spreadsheet_id, CONFIG.AUDIT_SHEETS.FINDINGS);

  // Cari row finding
  if (sheet.getLastRow() < 2) throw new Error('Finding tidak ditemukan: ' + finding_id);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  let rowIndex = -1;
  data.forEach((row, i) => { if (row[0] === finding_id) rowIndex = i + 2; });
  if (rowIndex < 0) throw new Error('Finding tidak ditemukan: ' + finding_id);

  const C = CONFIG.AUDIT_COLS.FINDINGS;
  _updateCell(sheet, rowIndex, C.DESKRIPSI_TEMUAN + 1, deskripsi_temuan);
  if (foto_urls) _updateCell(sheet, rowIndex, C.FOTO_URLS + 1, foto_urls);

  return { success: true };
}

function createFinding(spreadsheetId, sessionId, finding) {
  const sheet      = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.FINDINGS);
  const finding_id = generateId('FND');
  const row = new Array(15).fill('');
  const C   = CONFIG.AUDIT_COLS.FINDINGS;
  row[C.FINDING_ID]         = finding_id;
  row[C.SESSION_ID]         = sessionId;
  row[C.NOMOR_PERSYARATAN]  = finding.nomor_persyaratan;
  row[C.CHECK_ITEM_NO]      = finding.check_item_no;
  row[C.DESKRIPSI_TEMUAN]   = finding.deskripsi_temuan;
  row[C.STATUS_PERSYARATAN] = finding.status_persyaratan;
  row[C.FOTO_URLS]          = finding.foto_urls || '';
  row[C.CREATED_BY]         = finding.created_by;
  row[C.CREATED_AT]         = now();
  row[C.FINDING_STATUS]     = CONFIG.FINDING_STATUS.PENDING_VERIFICATION;
  _appendRow(sheet, row);
  return { finding_id };
}

// ════════════════════════════════════════════════════════════
//  FINDINGS — fungsi baru
// ════════════════════════════════════════════════════════════

/**
 * Verifikasi semua finding dalam satu session sekaligus.
 * Koordinator bisa edit deskripsi, foto, ubah jenis temuan.
 * @param {string} spreadsheetId
 * @param {string} sessionId
 * @param {Array<{finding_id, deskripsi_temuan, status_persyaratan, foto_urls}>} updates
 * @param {string} verifiedBy
 */
function verifyFindings(spreadsheetId, sessionId, updates, verifiedBy) {
  const sheet    = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.FINDINGS);
  const findings = getFindingsBySession(spreadsheetId, sessionId);
  const C        = CONFIG.AUDIT_COLS.FINDINGS;

  const ALLOWED_TRANSITIONS = {
    'Non Comply': ['OFI', 'Comply'],
    'OFI':        ['Non Comply', 'Comply'],
    'Comply':     [], // tidak bisa diubah ke apapun
  };

  updates.forEach(function(u) {
    const finding = findings.find(f => f.finding_id === u.finding_id);
    if (!finding) return;

    // Validasi transisi status
    if (u.status_persyaratan && u.status_persyaratan !== finding.status_persyaratan) {
      const allowed = ALLOWED_TRANSITIONS[finding.status_persyaratan] || [];
      if (!allowed.includes(u.status_persyaratan)) {
        throw new Error(
          `Tidak bisa mengubah ${finding.status_persyaratan} → ${u.status_persyaratan}`
        );
      }
    }

    if (u.deskripsi_temuan !== undefined)
      _updateCell(sheet, finding._rowIndex, C.DESKRIPSI_TEMUAN   + 1, u.deskripsi_temuan);
    if (u.foto_urls !== undefined)
      _updateCell(sheet, finding._rowIndex, C.FOTO_URLS          + 1, u.foto_urls);
    if (u.status_persyaratan !== undefined)
      _updateCell(sheet, finding._rowIndex, C.STATUS_PERSYARATAN + 1, u.status_persyaratan);

    // Kalau jadi Comply → langsung closed, tidak perlu TPP
    const finalStatus = u.status_persyaratan || finding.status_persyaratan;
    const newStatus   = finalStatus === 'Comply'
      ? CONFIG.FINDING_STATUS.CLOSED
      : CONFIG.FINDING_STATUS.OPEN;

    _updateCell(sheet, finding._rowIndex, C.FINDING_STATUS + 1, newStatus);
    _updateCell(sheet, finding._rowIndex, C.VERIFIED_BY    + 1, verifiedBy);
    _updateCell(sheet, finding._rowIndex, C.VERIFIED_AT    + 1, now());
    if (finalStatus === 'Comply') {
      _updateCell(sheet, finding._rowIndex, C.CLOSED_AT + 1, now());
    }
  });

  return { success: true, verified: updates.length };
}

/**
 * Hapus satu finding saat verifikasi.
 * Hanya bisa dilakukan selama status PENDING_VERIFICATION.
 */
function deleteFinding(spreadsheetId, findingId) {
  const sheet    = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.FINDINGS);
  const findings = getFindingsBySession(spreadsheetId, null);
  const finding  = findings.find(f => f.finding_id === findingId);
  if (!finding) throw new Error('Finding tidak ditemukan: ' + findingId);
  if (finding.finding_status !== CONFIG.FINDING_STATUS.PENDING_VERIFICATION) {
    throw new Error('Hanya finding berstatus PENDING_VERIFICATION yang bisa dihapus.');
  }
  sheet.deleteRow(finding._rowIndex);
  return { success: true };
}

/**
 * Set target_date untuk satu finding (dilakukan koordinator saat verifikasi
 * atau auditee saat submit TPP).
 */
function setFindingTargetDate(spreadsheetId, findingId, targetDate) {
  const C = CONFIG.AUDIT_COLS.FINDINGS;
  return updateFindingField(spreadsheetId, findingId, C.TARGET_DATE, targetDate);
}

// ════════════════════════════════════════════════════════════
//  TPP_ITEMS — CRUD
// ════════════════════════════════════════════════════════════

const TPP_ITEM_HEADERS = [
  'tpp_item_id', 'finding_id', 'tipe',
  'deskripsi', 'submitted_by', 'submitted_at',
  'impl_foto_urls', 'impl_keterangan',
  'impl_submitted_at', 'impl_submitted_by',
];

function getTppItemsByFinding(spreadsheetId, findingId) {
  const sheet = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.TPP_ITEMS);
  if (sheet.getLastRow() < 3) return [];
  const headerRow = sheet.getRange(2, 1, 1, TPP_ITEM_HEADERS.length).getValues()[0];
  const data      = sheet.getRange(3, 1, sheet.getLastRow() - 2, TPP_ITEM_HEADERS.length).getValues();
  return data
    .filter(r => r[0] !== '' && r[1] === findingId)
    .map((row, i) => {
      const obj = {};
      headerRow.forEach((h, j) => { obj[h] = row[j]; });
      obj._rowIndex = i + 3;
      return obj;
    });
}

function getTppItemsBySession(spreadsheetId, sessionId) {
  const findings = getFindingsBySession(spreadsheetId, sessionId);
  const result   = [];
  findings.forEach(function(f) {
    const items = getTppItemsByFinding(spreadsheetId, f.finding_id);
    items.forEach(function(i) { i._finding = f; result.push(i); });
  });
  return result;
}

/**
 * Submit TPP untuk satu finding.
 * items: Array<{ tipe: 'CORRECTION'|'CORRECTIVE_ACTION', deskripsi: string }>
 * target_date: string (satu per finding)
 */
function submitTpp(spreadsheetId, findingId, sessionId, items, targetDate, submittedBy) {
  const C     = CONFIG.AUDIT_COLS.FINDINGS;
  const sheet = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.TPP_ITEMS);

  // Hapus TPP lama kalau ada (resubmit setelah reject)
  if (sheet.getLastRow() >= 3) {
    const data = sheet.getRange(3, 1, sheet.getLastRow() - 2, 2).getValues();
    const toDelete = [];
    data.forEach((row, i) => { if (row[1] === findingId) toDelete.push(i + 3); });
    toDelete.reverse().forEach(r => sheet.deleteRow(r));
  }

  // Insert items baru
  const tppRows = items.map(function(item) {
    const tpp_item_id = generateId('TPP');
    return [
      tpp_item_id, findingId, item.tipe,
      item.deskripsi, submittedBy, now(),
      '', '', '', '',
    ];
  });

  if (tppRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, tppRows.length, tppRows[0].length)
      .setValues(tppRows);
  }

  // Update finding: target_date, status, tpp_status
  updateFindingField(spreadsheetId, findingId, C.TARGET_DATE,   targetDate);
  updateFindingField(spreadsheetId, findingId, C.FINDING_STATUS, CONFIG.FINDING_STATUS.PENDING_TPP);
  updateFindingField(spreadsheetId, findingId, C.TPP_STATUS,     CONFIG.APPROVAL_STATUS.PENDING);

  appendApprovalLog(spreadsheetId, {
    finding_id: findingId, session_id: sessionId,
    stage: 'TPP', level: 'AUDITEE', action: 'SUBMITTED',
    by_email: submittedBy, skipped: false, skip_reason: '',
  });

  return { success: true, tpp_item_count: tppRows.length };
}

/**
 * Submit implementasi untuk satu TPP item.
 */
function submitTppItemImpl(spreadsheetId, tppItemId, implFotoUrls, implKeterangan, submittedBy) {
  const sheet = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.TPP_ITEMS);
  if (sheet.getLastRow() < 3) throw new Error('TPP item tidak ditemukan.');

  const data = sheet.getRange(3, 1, sheet.getLastRow() - 2, TPP_ITEM_HEADERS.length).getValues();
  let rowIndex = -1;
  data.forEach((row, i) => { if (row[0] === tppItemId) rowIndex = i + 3; });
  if (rowIndex < 0) throw new Error('TPP item tidak ditemukan: ' + tppItemId);

  const C = CONFIG.AUDIT_COLS.TPP_ITEMS;
  _updateCell(sheet, rowIndex, C.IMPL_FOTO_URLS    + 1, toCSV(implFotoUrls));
  _updateCell(sheet, rowIndex, C.IMPL_KETERANGAN   + 1, implKeterangan || '');
  _updateCell(sheet, rowIndex, C.IMPL_SUBMITTED_AT + 1, now());
  _updateCell(sheet, rowIndex, C.IMPL_SUBMITTED_BY + 1, submittedBy);

  return { success: true };
}

/**
 * Cek apakah semua TPP items untuk satu finding sudah submit implementasi.
 */
function allTppItemsImplSubmitted(spreadsheetId, findingId) {
  const items = getTppItemsByFinding(spreadsheetId, findingId);
  if (!items.length) return false;
  return items.every(i => !!i.impl_submitted_at);
}

function updateFindingField(spreadsheetId, findingId, colIndex, value) {
  const sheet    = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.FINDINGS);
  const findings = getFindingsBySession(spreadsheetId, null);
  const finding  = findings.find(f => f.finding_id === findingId);
  if (!finding) throw new Error(`Finding ${findingId} tidak ditemukan.`);
  _updateCell(sheet, finding._rowIndex, colIndex + 1, value);
  return { success: true };
}

function getFindingsBySession(spreadsheetId, sessionId) {
  const sheet = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.FINDINGS);
  if (sheet.getLastRow() < 3) return [];
  const headerRow = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data      = sheet.getRange(3, 1, sheet.getLastRow() - 2, headerRow.length).getValues();
  const allRows = [];
  data.forEach((row, i) => {
    if (row[0] === '') return;
    const obj = {};
    headerRow.forEach((h, j) => { obj[h] = row[j]; });
    obj._rowIndex = i + 3;
    allRows.push(obj);
  });
  return allRows.filter(r => sessionId === null || r.session_id === sessionId);
}

/**
 * Hapus semua rows dengan session_id tertentu dari sebuah sheet audit
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @param {number} sessionIdColIndex  0-based kolom session_id
 * @param {string} sessionId
 */
function _deleteRowsBySessionId(spreadsheetId, sheetName, sessionIdColIndex, sessionId) {
  var sheet = _getAuditSheet(spreadsheetId, sheetName);
  if (sheet.getLastRow() < 3) return 0;
  var data     = sheet.getRange(3, 1, sheet.getLastRow() - 2, sessionIdColIndex + 1).getValues();
  var toDelete = [];
  data.forEach(function(row, i) {
    if (row[sessionIdColIndex] === sessionId) toDelete.push(i + 3);
  });
  // Hapus dari bawah ke atas supaya rowIndex tidak bergeser
  toDelete.reverse().forEach(function(r) { sheet.deleteRow(r); });
  return toDelete.length;
}

/**
 * Reset session: hapus session + audit_results + findings + approval_log + tpp_items
 * Dipanggil saat edit agenda dengan session aktif
 */
function resetSessionData(spreadsheetId, sessionId) {
  var C = CONFIG.AUDIT_COLS;
  _deleteRowsBySessionId(spreadsheetId, CONFIG.AUDIT_SHEETS.AUDIT_RESULTS,
    C.AUDIT_RESULTS.SESSION_ID, sessionId);
  _deleteRowsBySessionId(spreadsheetId, CONFIG.AUDIT_SHEETS.REQUIREMENT_LOCKS,
    C.REQUIREMENT_LOCKS.SESSION_ID, sessionId);
  _deleteRowsBySessionId(spreadsheetId, CONFIG.AUDIT_SHEETS.APPROVAL_LOG,
    C.APPROVAL_LOG.SESSION_ID, sessionId);

  // Findings dihapus dulu, lalu TPP_ITEMS per finding
  var findings = getFindingsBySession(spreadsheetId, sessionId);
  findings.forEach(function(f) {
    _deleteRowsByFindingId(spreadsheetId, f.finding_id);
  });
  _deleteRowsBySessionId(spreadsheetId, CONFIG.AUDIT_SHEETS.FINDINGS,
    C.FINDINGS.SESSION_ID, sessionId);

  // Hapus session row
  var sheet    = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.SESSIONS);
  var sessions = getSessionsByPeriod(spreadsheetId);
  var session  = sessions.find(function(s) { return s.session_id === sessionId; });
  if (session) sheet.deleteRow(session._rowIndex);

  return { success: true };
}

function _deleteRowsByFindingId(spreadsheetId, findingId) {
  var sheet = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.TPP_ITEMS);
  if (sheet.getLastRow() < 3) return;
  var data     = sheet.getRange(3, 1, sheet.getLastRow() - 2, 2).getValues();
  var toDelete = [];
  data.forEach(function(row, i) {
    if (row[1] === findingId) toDelete.push(i + 3);
  });
  toDelete.reverse().forEach(function(r) { sheet.deleteRow(r); });
}

/**
 * Hapus agenda + reset session terkait
 */
function deleteAgenda(agendaId, periodId) {
  // Cari session terkait
  var period = getPeriodById(periodId);
  if (period && period.spreadsheet_id) {
    var agendas  = getAllAgendas();
    var agenda   = agendas.find(function(a) { return a.agenda_id === agendaId; });
    if (agenda && agenda.session_id) {
      resetSessionData(period.spreadsheet_id, agenda.session_id);
    }
    // Hapus agenda checklist dari file periode
    if (period.spreadsheet_id) {
      try {
        var acSheet = _getAuditSheet(period.spreadsheet_id, CONFIG.AUDIT_SHEETS.AGENDA_CHECKLIST);
        if (acSheet && acSheet.getLastRow() >= 3) {
          var acData = acSheet.getRange(3, 1, acSheet.getLastRow() - 2, 2).getValues();
          var toDelete = [];
          acData.forEach(function(row, i) {
            if (row[1] === agendaId) toDelete.push(i + 3);
          });
          toDelete.reverse().forEach(function(r) { acSheet.deleteRow(r); });
        }
      } catch(e) { console.warn('Gagal hapus agenda checklist:', e.message); }
    }
  }
  // Hapus agenda row
  var sheet   = _getMasterSheet(CONFIG.SHEETS.AUDIT_AGENDA);
  var agendas = getAllAgendas();
  var agenda  = agendas.find(function(a) { return a.agenda_id === agendaId; });
  if (!agenda) throw new Error('Agenda tidak ditemukan: ' + agendaId);
  sheet.deleteRow(agenda._rowIndex);
  return { success: true };
}

/**
 * Arsipkan semua agenda periode ke file periode, lalu hapus dari MASTER.
 * Dipanggil saat periode di-complete atau di-archive.
 */
function archiveAgendaToFile(periodId, spreadsheetId) {
  const agendas = getAgendasByPeriod(periodId);
  if (!agendas.length) return { success: true, count: 0 };

  const sessions = getSessionsByPeriod(spreadsheetId);
  const sheet    = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.SESSIONS);
  const C        = CONFIG.AUDIT_COLS.SESSIONS;

  // Update kolom agenda ke session yang sudah ada
  // (session sudah punya agenda_id dari createSession)
  // Untuk agenda yang belum punya session (belum dimulai), skip — tidak ada row session
  agendas.forEach(function(a) {
    if (!a.session_id) return; // belum dimulai, tidak ada session row
    const session = sessions.find(function(s) { return s.session_id === a.session_id; });
    if (!session) return;
    // Data agenda sudah diisi saat createSession, tapi pastikan sync
    _updateCell(sheet, session._rowIndex, C.AGENDA_ID      + 1, a.agenda_id);
    _updateCell(sheet, session._rowIndex, C.LEAD_AUDITOR   + 1, a.lead_auditor   || '');
    _updateCell(sheet, session._rowIndex, C.JADWAL_TANGGAL + 1, a.jadwal_tanggal || '');
    _updateCell(sheet, session._rowIndex, C.ASSIGNED_BY    + 1, a.assigned_by    || '');
    _updateCell(sheet, session._rowIndex, C.ASSIGNED_AT    + 1, a.assigned_at    || '');
  });

  // Hapus dari MASTER
  const masterSheet = _getMasterSheet(CONFIG.SHEETS.AUDIT_AGENDA);
  const allAgendas  = getAllAgendas();
  const toDelete    = allAgendas
    .filter(function(a) { return a.period_id === periodId; })
    .map(function(a) { return a._rowIndex; })
    .sort(function(a, b) { return b - a; });
  toDelete.forEach(function(r) { masterSheet.deleteRow(r); });

  return { success: true, count: agendas.length };
}

/**
 * Update auditor dan lead auditor pada agenda
 */
function updateAgenda(agendaId, updates) {
  var sheet   = _getMasterSheet(CONFIG.SHEETS.AUDIT_AGENDA);
  var agendas = getAllAgendas();
  var agenda  = agendas.find(function(a) { return a.agenda_id === agendaId; });
  if (!agenda) throw new Error('Agenda tidak ditemukan: ' + agendaId);
  var C = CONFIG.COLS.AUDIT_AGENDA;
  if (updates.auditor_emails !== undefined)
    _updateCell(sheet, agenda._rowIndex, C.AUDITOR_EMAILS + 1, updates.auditor_emails);
  if (updates.lead_auditor !== undefined)
    _updateCell(sheet, agenda._rowIndex, C.LEAD_AUDITOR + 1, updates.lead_auditor);
  return { success: true };
}


// ════════════════════════════════════════════════════════════
//  FILE AUDIT — APPROVAL_LOG
// ════════════════════════════════════════════════════════════

function appendApprovalLog(spreadsheetId, {
  finding_id, session_id, stage, level, action,
  by_email, komentar = '', skipped = false, skip_reason = ''
}) {
  const sheet  = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.APPROVAL_LOG);
  const log_id = generateId('LOG');
  _appendRow(sheet, [
    log_id, finding_id, session_id, stage, level, action,
    by_email, now(), komentar, skipped, skip_reason,
  ]);
  return { log_id };
}

function getApprovalLogByFinding(spreadsheetId, findingId) {
  const sheet = _getAuditSheet(spreadsheetId, CONFIG.AUDIT_SHEETS.APPROVAL_LOG);
  if (sheet.getLastRow() < 3) return [];
  const headerRow = sheet.getRange(2, 1, 1, 11).getValues()[0];
  const data      = sheet.getRange(3, 1, sheet.getLastRow() - 2, 11).getValues();
  return data
    .filter(r => r[0] !== '' && r[1] === findingId)
    .map(row => {
      const obj = {};
      headerRow.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    });
}

function testBothCalls() {
  try {
    const profile = handleApiCall('GET_PROFILE', {});
    console.log('profile success:', profile?.success);
    console.log('profile isKoordinator:', profile?.data?.isKoordinator);

    const periods = handleApiCall('GET_PERIODS', {});
    console.log('periods success:', periods?.success);
    console.log('periods data:', JSON.stringify(periods?.data));
    console.log('periods null?:', periods === null);

  } catch(err) {
    console.error(err);
  }
}

