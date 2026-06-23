// ============================================================
//  Code.gs — v2 (refactored)
//  Perubahan dari v1:
//  - Hapus: CREATE_SESSION, GET_SESSION, GET_SESSIONS_BY_PERIOD
//  - Hapus: GET_FINDINGS, GET_ALL_FINDINGS_BY_PERIOD, DELETE_FINDING
//  - Hapus: SAVE_AUDIT_RESULT, SAVE_FINDING_DETAIL, GET_CHECKLIST_BY_AGENDA
//  - Hapus: SAVE_AGENDA_CHECKLIST (diganti SAVE_AGENDA yang sudah include populate)
//  - Tambah: START_AUDIT, GET_AGENDA, GET_AGENDAS_BY_PERIOD
//  - Ubah: SAVE_REQUIREMENT_BATCH — pakai agenda_id, result_id, tanpa finding_id terpisah
//  - Ubah: FINISH_AUDIT — menggantikan FINISH_SESSION
//  - Ubah: SUBMIT_AGREEMENT — pakai agenda_id
//  - Ubah: GET_AUDIT_RESULTS — pakai agenda_id
//  - Ubah: SUBMIT_TPP / GET_TPP_ITEMS — pakai result_id
//  - Ubah: PROCESS_APPROVAL / MASS_APPROVE — pakai result_id, agenda_id
//  - Ubah: VERIFY_FINDINGS — pakai agenda_id
//  - Ubah: GET_APPROVAL_LOG — pakai result_id
//  - Ubah: SUBMIT_IMPLEMENTATION — pakai result_id
//  - Dashboard: getFindingsByAgenda / getAllFindingsByPeriod
// ============================================================

function doGet(e) {
  const profile = getCurrentUserProfile();
  if (!profile.isAuthorized) {
    return HtmlService
      .createHtmlOutput(_unauthorizedPage(profile.error))
      .setTitle('Audit System — Akses Ditolak')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  const params  = (e && e.parameter) ? e.parameter : {};
  const tmpl    = HtmlService.createTemplateFromFile('Index');
  var _rawPage   = params.page || '';
  tmpl.initPage  = _rawPage === 'my-task' ? 'mytask' : _rawPage;
  tmpl.initParam = params.result_id || params.agenda_id || '';
  tmpl.initKey   = params.result_id ? 'result_id' : (params.agenda_id ? 'agenda_id' : '');
  return tmpl
    .evaluate()
    .setTitle('Audit System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  try {
    const body    = JSON.parse(e.postData.contents);
    const action  = body.action;
    const payload = body.payload || {};
    const profile = getCurrentUserProfile();
    if (!profile.isAuthorized) return jsonOutput(errorResponse('Tidak terotorisasi.', 401));
    const result = _routeAction(action, payload, profile);
    return jsonOutput(successResponse(result));
  } catch (err) {
    console.error('doPost error:', err.message, err.stack);
    return jsonOutput(errorResponse(err.message));
  }
}

function _routeAction(action, payload, profile) {
  switch (action) {

    // ── Auth ──────────────────────────────────────────────────
    case 'GET_PROFILE':
      return _sanitizeObj(profile);

    case 'GET_INIT_DATA': {
      const p       = profile;
      const periods = getCachedPeriods(false).map(_sanitizeObj);
      return {
        profileJson: JSON.stringify({
          email:         p.email,
          nama:          p.nama,
          auditeeAreaId: p.auditeeAreaId || '',
          aktif:         p.aktif,
          isAuthorized:  p.isAuthorized,
          isKoordinator: p.isKoordinator,
          isDeptHead:    p.isDeptHead,
          isAuditor:     p.isAuditor,
          isAuditee:     p.isAuditee,
          isViewer:      p.isViewer,
          deptHeadAreas: (p.deptHeadAreas || []).join(','),
          auditorAreas:  (p.auditorAreas  || []).join(','),
          roles:         Array.isArray(p.roles) ? p.roles.join(',') : (p.roles || ''),
        }),
        periodsJson: JSON.stringify(periods),
      };
    }

    // ── User Management ───────────────────────────────────────
    case 'GET_USERS':
      requireAccess(['isKoordinator'], profile);
      return getCachedUsers().map(_sanitizeObj);

    case 'CREATE_USER':
      requireAccess(['isKoordinator'], profile);
      invalidateUsersCache();
      return createUser(payload);

    case 'UPDATE_USER':
      requireAccess(['isKoordinator'], profile);
      invalidateProfileCache(payload.email);
      invalidateUsersCache();
      return updateUser(payload.email, payload.updates);

    case 'BATCH_CREATE_USERS':
      requireAccess(['isKoordinator'], profile);
      invalidateUsersCache();
      return batchCreateUsers(payload.items);

    case 'DELETE_USER':
      requireAccess(['isKoordinator'], profile);
      invalidateProfileCache(payload.email);
      invalidateUsersCache();
      return deleteUser(payload.email);

    case 'BATCH_DELETE_USERS':
      requireAccess(['isKoordinator'], profile);
      invalidateUsersCache();
      return batchDeleteUsers(payload.emails);

    case 'GET_UNIQUE_DEPTS':
      requireAccess(['isKoordinator'], profile);
      return getUniqueDepts();

    // ── Area Management ───────────────────────────────────────
    case 'GET_AREAS':
      return getActiveAreas().map(_sanitizeObj);

    case 'CREATE_AREA':
      requireAccess(['isKoordinator'], profile);
      invalidateAreasCache();
      return createArea(payload);

    case 'UPDATE_AREA':
      requireAccess(['isKoordinator'], profile);
      invalidateAreasCache();
      return updateArea(payload.area_id, payload.updates);

    case 'DELETE_AREA':
      requireAccess(['isKoordinator'], profile);
      invalidateAreasCache();
      return deleteArea(payload.area_id);

    case 'BATCH_DELETE_AREAS':
      requireAccess(['isKoordinator'], profile);
      return batchDeleteAreas(payload.area_ids);

    case 'BATCH_CREATE_AREAS':
      requireAccess(['isKoordinator'], profile);
      invalidateAreasCache();
      return batchCreateAreas(payload.items);

    // ── Checklist Master ──────────────────────────────────────
    case 'GET_CHECKLIST_MASTER':
      return getAllChecklistMaster().map(_sanitizeObj);

    case 'GET_CHECKLIST_GENERAL':
      return getChecklistGeneral().map(_sanitizeObj);

    case 'GET_CHECKLIST_KHUSUS':
      return getChecklistKhusus(payload.kategori).map(_sanitizeObj);

    case 'GET_CHECKLIST_FOR_AGENDA':
      return [
        ...getChecklistGeneral(),
        ...getChecklistKhusus(payload.kategori),
      ].map(_sanitizeObj);

    case 'CREATE_CHECKLIST_ITEM':
      requireAccess(['isKoordinator'], profile);
      return createChecklistItem(payload);

    case 'UPDATE_CHECKLIST_ITEM':
      requireAccess(['isKoordinator'], profile);
      return updateChecklistItem(payload.item_id, payload.updates);

    case 'BATCH_DELETE_CHECKLIST_ITEMS':
      requireAccess(['isKoordinator'], profile);
      return batchDeleteChecklistItems(payload.item_ids);

    case 'BATCH_CREATE_CHECKLIST_ITEMS':
      requireAccess(['isKoordinator'], profile);
      return batchCreateChecklistItems(payload.tipe, payload.kategori, payload.items);

    // ── Audit Periods ─────────────────────────────────────────
    case 'GET_PERIODS':
      return getCachedPeriods(false).map(_sanitizeObj);

    case 'GET_ACTIVE_PERIOD':
      return _sanitizeObj(getCachedPeriods(false).find(p => p.status === CONFIG.PERIOD_STATUS.ACTIVE) || null);

    case 'CREATE_PERIOD':
      requireAccess(['isKoordinator'], profile);
      invalidatePeriodsCache();
      return createPeriod({
        namaPeriode:    payload.nama_periode,
        tanggalMulai:   payload.tanggal_mulai,
        tanggalSelesai: payload.tanggal_selesai,
        createdBy:      profile.email,
      });

    case 'UPDATE_PERIOD':
      requireAccess(['isKoordinator'], profile);
      invalidatePeriodsCache();
      return updatePeriod(payload.period_id, payload.updates);

    case 'ACTIVATE_PERIOD':
      requireAccess(['isKoordinator'], profile);
      invalidatePeriodsCache();
      return activatePeriod(payload.period_id);

    // Alias untuk Page_Admin yang masih pakai UPDATE_PERIOD_STATUS
    case 'UPDATE_PERIOD_STATUS':
      requireAccess(['isKoordinator'], profile);
      invalidatePeriodsCache();
      if (payload.status === CONFIG.PERIOD_STATUS.ACTIVE) {
        return activatePeriod(payload.period_id);
      }
      if (payload.status === CONFIG.PERIOD_STATUS.COMPLETED) {
        return completePeriod(payload.period_id, profile.email, payload.force === true);
      }
      return updatePeriodStatus(payload.period_id, payload.status);

    case 'COMPLETE_PERIOD':
      requireAccess(['isKoordinator'], profile);
      invalidatePeriodsCache();
      return completePeriod(payload.period_id, profile.email, payload.force === true);

    case 'DELETE_PERIOD':
      requireAccess(['isKoordinator'], profile);
      invalidatePeriodsCache();
      return deletePeriod(payload.period_id);

    case 'ARCHIVE_PERIOD':
      requireAccess(['isKoordinator'], profile);
      invalidatePeriodsCache();
      return archivePeriod(payload.period_id);

    case 'RESTORE_ARCHIVED_PERIOD':
      requireAccess(['isKoordinator'], profile);
      invalidatePeriodsCache();
      return restoreArchivedPeriod(payload.period_id);

    // ── Audit Agenda ──────────────────────────────────────────
    case 'GET_AGENDAS_BY_PERIOD': {
      return getCachedAgendasByPeriod(payload.period_id).map(_sanitizeObj);
    }

    case 'GET_AGENDA': {
      const ag = getAgendaById(payload.agenda_id);
      if (!ag) throw new Error('Agenda tidak ditemukan.');
      return _sanitizeObj(ag);
    }

    case 'CREATE_AGENDA': {
      // Buat agenda + langsung populate AUDIT_RESULTS (Opsi B)
      requireAccess(['isKoordinator'], profile);
      const period_ca = getPeriodById(payload.period_id);
      if (!period_ca) throw new Error('Periode tidak ditemukan.');
      if (period_ca.status === CONFIG.PERIOD_STATUS.COMPLETED)
        throw new Error('Tidak bisa menambah agenda pada periode yang sudah selesai.');

      const result_ca = createAgenda({
        periodId:      payload.period_id,
        areaId:        payload.area_id,
        auditorEmails: payload.auditor_emails,
        leadAuditor:   payload.lead_auditor || '',
        assignedBy:    profile.email,
      });

      // Populate AUDIT_RESULTS segera setelah agenda dibuat
      if (payload.item_ids && payload.item_ids.length) {
        populateAuditResults(
          result_ca.agenda_id,
          payload.item_ids,
          period_ca.spreadsheet_id,
          payload.period_id
        );
      }

      return result_ca;
    }

    case 'UPDATE_AGENDA': {
      requireAccess(['isKoordinator'], profile);
      const period_ua = getPeriodById(payload.period_id);
      if (!period_ua) throw new Error('Periode tidak ditemukan.');
      if (period_ua.status === CONFIG.PERIOD_STATUS.COMPLETED)
        throw new Error('Tidak bisa mengedit agenda pada periode yang sudah selesai.');

      const agenda_ua = getAgendaById(payload.agenda_id);
      if (!agenda_ua) throw new Error('Agenda tidak ditemukan.');

      // Kalau checklist berubah: populate ulang AUDIT_RESULTS
      // Kalau agenda sudah STARTED: reset dulu data hasil audit (Grup 3 & 4)
      if (payload.item_ids) {
        if (agenda_ua.status === CONFIG.AGENDA_STATUS.STARTED) {
          resetAgendaData(period_ua.spreadsheet_id, payload.agenda_id);
        }
        populateAuditResults(
          payload.agenda_id,
          payload.item_ids,
          period_ua.spreadsheet_id,
          payload.period_id
        );
      }

      // Update field lain di AUDIT_AGENDA
      const agUpdates = {};
      if (payload.auditor_emails  !== undefined) agUpdates.auditor_emails  = payload.auditor_emails;
      if (payload.lead_auditor    !== undefined) agUpdates.lead_auditor    = payload.lead_auditor;
      if (Object.keys(agUpdates).length) updateAgenda(payload.agenda_id, agUpdates);
      return { success: true };
    }

    case 'DELETE_AGENDA': {
      requireAccess(['isKoordinator'], profile);
      const period_da = getPeriodById(payload.period_id);
      if (!period_da) throw new Error('Periode tidak ditemukan.');
      if (period_da.status === CONFIG.PERIOD_STATUS.COMPLETED)
        throw new Error('Tidak bisa menghapus agenda pada periode yang sudah selesai.');
      return deleteAgenda(payload.agenda_id, payload.period_id);
    }

    // ── Audit Flow ────────────────────────────────────────────

    case 'START_AUDIT': {
      // Auditor mulai audit — update AUDIT_AGENDA status → STARTED
      requireAccess(['isAuditor'], profile);
      const period_sta = getPeriodById(payload.period_id);
      if (!period_sta) throw new Error('Periode tidak ditemukan.');
      if (!canAccessArea(profile, payload.area_id, payload.period_id))
        throw new Error('Anda tidak ditugaskan di area ini.');
      return startAudit({
        agendaId:  payload.agenda_id,
        periodId:  payload.period_id,
        areaId:    payload.area_id,
        startedBy: profile.email,
      });
    }

    case 'FINISH_AUDIT': {
      // Auditor selesai isi semua checklist
      requireAccess(['isAuditor'], profile);
      return finishAudit(payload.period_id, payload.agenda_id, profile.email);
    }

    case 'SUBMIT_AGREEMENT': {
      // Auditor upload foto agreement — status agenda → DONE, finding_status → PENDING_VERIFICATION
      requireAccess(['isAuditor'], profile);
      const period_sa  = getPeriodById(payload.period_id);
      const folder_sa  = getOrCreateFolder(
        payload.agenda_id,
        getOrCreateFolder(payload.period_id, getOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER_NAME))
      );
      const fileUrl_sa = uploadFileToDrive(
        payload.file_base64, payload.file_name, payload.mime_type, folder_sa
      );
    submitAgreement(
      period_sa.spreadsheet_id,
      payload.agenda_id,
      fileUrl_sa,
      profile.email,
      payload.ofi               || '',   // ← TAMBAH
      payload.auditee_hadir_names || ''
    );
      return { success: true, file_url: fileUrl_sa };
    }

    // ── Requirement Locking ───────────────────────────────────
    case 'LOCK_REQUIREMENT': {
      requireAccess(['isAuditor'], profile);
      const period_lr = getPeriodById(payload.period_id);
      return lockRequirement(
        period_lr.spreadsheet_id,
        payload.agenda_id,
        payload.nomor_persyaratan,
        profile.email
      );
    }

    case 'RELEASE_LOCK': {
      requireAccess(['isAuditor'], profile);
      const period_rl = getPeriodById(payload.period_id);
      return releaseLock(
        period_rl.spreadsheet_id,
        payload.agenda_id,
        payload.nomor_persyaratan,
        profile.email
      );
    }

    case 'GET_LOCKS': {
      const period_gl = getPeriodById(payload.period_id);
      return getLocks(period_gl.spreadsheet_id, payload.agenda_id).map(_sanitizeObj);
    }

    // ── Audit Results ─────────────────────────────────────────
    case 'GET_AUDIT_RESULTS': {
      // Kembalikan semua result untuk satu agenda (termasuk yang belum diisi)
      const period_gar = getPeriodById(payload.period_id);
      if (!period_gar) throw new Error('Periode tidak ditemukan.');
      return getAuditResultsByAgenda(period_gar.spreadsheet_id, payload.agenda_id).map(_sanitizeObj);
    }

    case 'GET_FINDINGS_BY_AGENDA': {
      // Hanya Non Comply — untuk halaman verifikasi koordinator
      const period_gfa = getPeriodById(payload.period_id);
      if (!period_gfa) throw new Error('Periode tidak ditemukan.');
      return getFindingsByAgenda(period_gfa.spreadsheet_id, payload.agenda_id).map(_sanitizeObj);
    }

    case 'GET_ALL_FINDINGS_BY_PERIOD': {
      // Semua Non Comply lintas agenda — untuk dashboard
      const period_gafp = getPeriodById(payload.period_id);
      if (!period_gafp || !period_gafp.spreadsheet_id) return [];
      return getAllFindingsByPeriod(period_gafp.spreadsheet_id, payload.period_id).map(_sanitizeObj);
    }

    case 'SAVE_REQUIREMENT_BATCH': {
      // Batch save hasil audit untuk satu persyaratan (grup check item)
      requireAccess(['isAuditor'], profile);
      const period_srb = getPeriodById(payload.period_id);
      if (!period_srb) throw new Error('Periode tidak ditemukan.');
      if (!canAccessArea(profile, payload.area_id, payload.period_id))
        throw new Error('Anda tidak ditugaskan di area ini.');

      const saved_srb   = [];
      const skipped_srb = [];

      (payload.items || []).forEach(function(item) {
        try {
          // Upload foto baru kalau ada, merge dengan foto lama yang masih ada
          var fotoUrls = '';
          if (item.status !== 'Comply') {
            // Foto lama yang masih dipertahankan (tidak dihapus user)
            var existingUrls = (item.existing_foto_urls || '').split(',').filter(Boolean);

            var newUrls = [];
            if (item.files && item.files.length) {
              console.log('[UPLOAD_START] ci=' + item.check_item_no + ' files=' + item.files.length + ' result_id=' + item.result_id);
              try {
                const folder_srb = getOrCreateFolder(
                  'evidence',
                  getOrCreateFolder(
                    item.result_id,
                    getOrCreateFolder(
                      payload.agenda_id,
                      getOrCreateFolder(payload.period_id, getOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER_NAME))
                    )
                  )
                );
                newUrls = item.files.map(function(f) {
                  console.log('[UPLOAD_FILE] name=' + f.name + ' mime=' + f.mime_type + ' base64len=' + (f.base64 || '').length);
                  var url = uploadFileToDrive(f.base64, f.name, f.mime_type, folder_srb);
                  console.log('[UPLOAD_OK] url=' + url);
                  return url;
                });
              } catch(uploadErr) {
                console.error('[UPLOAD_FAIL] ci=' + item.check_item_no + ' :: ' + uploadErr.message + ' :: stack: ' + (uploadErr.stack || 'no stack'));
                throw uploadErr;
              }
            }

            // Gabung: foto lama yang masih ada + foto baru
            fotoUrls = existingUrls.concat(newUrls).join(',');
            console.log('[FOTO_MERGE] ci=' + item.check_item_no + ' existing=' + existingUrls.length + ' new=' + newUrls.length + ' total_len=' + fotoUrls.length);
          }

          // Gabungkan foto existing + baru, hapus duplikat
          var _existingUrls = (item.existing_foto_urls || '').split(',').filter(Boolean);
          var _newUrls = fotoUrls ? fotoUrls.split(',').filter(Boolean) : [];
          var _newOnly = _newUrls.filter(function(u) { return _existingUrls.indexOf(u) === -1; });
          var allFotoUrls = _existingUrls.concat(_newOnly).join(',');

          // Simpan ke AUDIT_RESULTS — update row yang sudah ada (pre-populated)
          const res = saveCheckItemResult({
            period_id:        payload.period_id,
            agenda_id:        payload.agenda_id,
            result_id:        item.result_id,
            item_id:          item.item_id,
            status:           item.status,
            deskripsi_temuan: item.deskripsi_temuan || '',
            lokasi_temuan:    item.lokasi_temuan    || '',
            foto_urls:        allFotoUrls,
            auditor_email:    profile.email,
          });

          saved_srb.push({
            check_item_no: item.check_item_no,
            result_id:     res.result_id,
            foto_urls:     allFotoUrls,
          });
        } catch(err) {
          console.error('[SAVE_REQUIREMENT_BATCH] ci=' + item.check_item_no +
            ' | error: ' + err.message +
            ' | result_id: ' + item.result_id +
            ' | status: ' + item.status +
            ' | files_count: ' + (item.files ? item.files.length : 0) +
            ' | existing_foto_urls: ' + (item.existing_foto_urls || '') +
            ' | stack: ' + (err.stack || 'no stack'));
          skipped_srb.push({
            check_item_no: item.check_item_no,
            reason:        err.message,
          });
        }
      });

      // Lepas lock — non-fatal
      try {
        releaseLock(
          period_srb.spreadsheet_id,
          payload.agenda_id,
          payload.nomor_persyaratan,
          profile.email
        );
      } catch(e) {
        console.warn('releaseLock gagal:', e.message);
      }

      return {
        saved:   saved_srb,
        skipped: skipped_srb,
        success: skipped_srb.length === 0,
      };
    }

    // ── Verifikasi Koordinator ────────────────────────────────
    case 'VERIFY_FINDINGS': {
      requireAccess(['isKoordinator'], profile);
      const period_vf = getPeriodById(payload.period_id);
      const folder_vf = getOrCreateFolder(
        payload.agenda_id,
        getOrCreateFolder(payload.period_id, getOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER_NAME))
      );
      // Upload foto baru per item (kalau ada), gabungkan dengan existing_foto_urls
      const updates_vf = (payload.updates || []).map(function(upd) {
        if (upd.existing_foto_urls === undefined) return upd; // unchanged finding — tidak ada foto field
        var uploadedUrls = (upd.new_files && upd.new_files.length)
          ? upd.new_files.map(function(f) {
              return uploadFileToDrive(f.base64, f.name, f.mime_type, folder_vf);
            })
          : [];
        var existingUrls = (upd.existing_foto_urls || '').split(',').filter(Boolean);
        var allUrls      = existingUrls.concat(uploadedUrls);
        return Object.assign({}, upd, { foto_urls: allUrls.join(','), new_files: [] });
      });
      return verifyFindings(
        period_vf.spreadsheet_id,
        payload.agenda_id,
        updates_vf,
        profile.email
      );
    }

    // ── TPP (Tindakan Perbaikan dan Pencegahan) ───────────────
    case 'SUBMIT_TPP': {
      requireAccess(['isAuditee', 'isDeptHead'], profile);
      const period_tpp = getPeriodById(payload.period_id);
      return submitTpp(
        period_tpp.spreadsheet_id,
        payload.result_id,
        payload.agenda_id,
        {
          correction:                 payload.correction,
          due_date_correction:        payload.due_date_correction,
          corrective_action:          payload.corrective_action,
          due_date_corrective_action: payload.due_date_corrective_action,
        },
        profile.email
      );
    }

    case 'GET_TPP_ITEMS': {
      // TPP_ITEMS sheet sudah tidak ada — ambil langsung dari AUDIT_RESULTS
      const period_gti = getPeriodById(payload.period_id);
      const result_gti = getAuditResultsByAgenda(period_gti.spreadsheet_id, payload.agenda_id)
        .find(function(r) { return r.result_id === payload.result_id; });
      return result_gti ? [_sanitizeObj(result_gti)] : [];
    }

    case 'NOTIFY_TPP_DUE_DATE_SET': {
      requireAccess(['isKoordinator'], profile);
      const period_ntds = getPeriodById(payload.period_id);
      if (!period_ntds) throw new Error('Periode tidak ditemukan.');
      try { notifyTppDueDateSet(period_ntds, payload.due_date, profile.email); }
      catch(e) { console.warn('notifyTppDueDateSet error:', e.message); }
      return { success: true };
    }

    case 'UPDATE_TPP_PLAN': {
      requireAccess(['isAuditee', 'isDeptHead'], profile);
      const period_utp = getPeriodById(payload.period_id);
      return updateTppPlan(
        period_utp.spreadsheet_id,
        payload.result_id,
        {
          correction:                 payload.correction,
          due_date_correction:        payload.due_date_correction,
          corrective_action:          payload.corrective_action,
          due_date_corrective_action: payload.due_date_corrective_action,
        }
      );
    }

    // ── Approval ──────────────────────────────────────────────
    case 'PROCESS_APPROVAL': {
      requireAccess(['isDeptHead', 'isAuditor', 'isKoordinator'], profile);
      const period_pa = getPeriodById(payload.period_id);
      return processApproval({
        spreadsheetId: period_pa.spreadsheet_id,
        resultId:      payload.result_id,
        agendaId:      payload.agenda_id,
        action:        payload.action,
        byEmail:       profile.email,
        komentar:      payload.komentar || '',
        // stage, level, skipLevel, skipReason dihapus — derive dari finding_status
      });
    }

    case 'MASS_APPROVE': {
      requireAccess(['isKoordinator'], profile);
      const period_ma = getPeriodById(payload.period_id);
      return massApprove({
        spreadsheetId: period_ma.spreadsheet_id,
        resultIds:     payload.result_ids,
        agendaIds:     payload.agenda_ids,
        byEmail:       profile.email,
        komentar:      payload.komentar || '',
        // stage & level dihapus — derive dari finding_status
      });
    }

    case 'GET_APPROVAL_LOG': {
      const period_al = getPeriodById(payload.period_id);
      return getApprovalLogByResult(period_al.spreadsheet_id, payload.result_id).map(_sanitizeObj);
    }

    // ── Implementasi ──────────────────────────────────────────
    case 'SUBMIT_CORRECTION_IMPL': {
      requireAccess(['isAuditee', 'isDeptHead'], profile);
      const period_sci = getPeriodById(payload.period_id);

      // Folder: ROOT / period_id / agenda_id / result_id / correction
      const folder_sci = getOrCreateFolder(
        'correction',
        getOrCreateFolder(
          payload.result_id,
          getOrCreateFolder(
            payload.agenda_id,
            getOrCreateFolder(
              payload.period_id, getOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER_NAME))
          )
        )
      );
      const urls_sci = (payload.files || []).map(function(f) {
        var url = uploadFileToDrive(f.base64, f.name, f.mime_type, folder_sci);
        return url + '::' + (f.name || '');
      });
      const existing_sci = (payload.existing_foto_urls || '').split(',').filter(Boolean);

      submitCorrectionImpl(
        period_sci.spreadsheet_id,
        payload.result_id,
        payload.agenda_id,
        urls_sci,
        payload.keterangan || '',
        profile.email,
        existing_sci
      );

      return { success: true, urls: urls_sci };
    }

    case 'SUBMIT_CORRECTIVE_ACTION_IMPL': {
      requireAccess(['isAuditee', 'isDeptHead'], profile);
      const period_scai = getPeriodById(payload.period_id);

      // Folder: ROOT / period_id / agenda_id / result_id / corrective_action
      const folder_scai = getOrCreateFolder(
        'corrective_action',
        getOrCreateFolder(
          payload.result_id,
          getOrCreateFolder(
            payload.agenda_id,
            getOrCreateFolder(
              payload.period_id, getOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER_NAME))
          )
        )
      );
      const urls_scai = (payload.files || []).map(function(f) {
        var url = uploadFileToDrive(f.base64, f.name, f.mime_type, folder_scai);
        return url + '::' + (f.name || '');
      });
      const existing_scai = (payload.existing_foto_urls || '').split(',').filter(Boolean);

      submitCorrectiveActionImpl(
        period_scai.spreadsheet_id,
        payload.result_id,
        payload.agenda_id,
        urls_scai,
        payload.keterangan || '',
        profile.email,
        existing_scai
      );

      return { success: true, urls: urls_scai };
    }

    case 'SUBMIT_CORRECTION_AND_CA_IMPL': {
      requireAccess(['isAuditee', 'isDeptHead'], profile);
      const period_scca = getPeriodById(payload.period_id);

      const folder_corr_scca = getOrCreateFolder(
        'correction',
        getOrCreateFolder(
          payload.result_id,
          getOrCreateFolder(
            payload.agenda_id,
            getOrCreateFolder(payload.period_id, getOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER_NAME))
          )
        )
      );
      const urls_corr_scca = (payload.correction_files || []).map(function(f) {
        var url = uploadFileToDrive(f.base64, f.name, f.mime_type, folder_corr_scca);
        return url + '::' + (f.name || '');
      });

      const folder_ca_scca = getOrCreateFolder(
        'corrective_action',
        getOrCreateFolder(
          payload.result_id,
          getOrCreateFolder(
            payload.agenda_id,
            getOrCreateFolder(payload.period_id, getOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER_NAME))
          )
        )
      );
      const urls_ca_scca = (payload.ca_files || []).map(function(f) {
        var url = uploadFileToDrive(f.base64, f.name, f.mime_type, folder_ca_scca);
        return url + '::' + (f.name || '');
      });

      submitCorrectionAndCorrectiveActionImpl(
        period_scca.spreadsheet_id,
        payload.result_id,
        payload.agenda_id,
        urls_corr_scca,
        payload.correction_keterangan || '',
        urls_ca_scca,
        payload.ca_keterangan || '',
        profile.email
      );

      return { success: true, correction_urls: urls_corr_scca, ca_urls: urls_ca_scca };
    }

    // ── File Management ───────────────────────────────────────
    case 'GET_DRIVE_IMAGE_BASE64': {
      // Ambil gambar Drive sebagai base64 data URI — server-side untuk bypass firewall
      var imgResult = getDriveFileBase64(payload.url);
      return imgResult || '';
    }

    case 'DELETE_DRIVE_FILE': {
      requireAccess(['isAuditor'], profile);
      const fileUrl = payload.file_url;
      if (!fileUrl) throw new Error('file_url wajib diisi.');
      deleteDriveFile(fileUrl);
      return { success: true };
    }

    case 'UPDATE_FINDING_FOTO_URLS': {
      requireAccess(['isAuditor'], profile);
      const period_ufu = getPeriodById(payload.period_id);
      if (!period_ufu || !period_ufu.spreadsheet_id) throw new Error('Periode tidak ditemukan.');
      updateAuditResultFotoUrls(period_ufu.spreadsheet_id, payload.result_id, payload.foto_urls);
      return { success: true };
    }

    case 'UPDATE_IMPL_FOTO_URLS': {
      // Update foto URLs implementasi tanpa side effect (no approval trigger, no notification)
      requireAccess(['isAuditee', 'isDeptHead'], profile);
      const period_uifu = getPeriodById(payload.period_id);
      if (!period_uifu || !period_uifu.spreadsheet_id) throw new Error('Periode tidak ditemukan.');
      const C_uifu = CONFIG.AUDIT_COLS.AUDIT_RESULTS;
      const colMap = {
        'impl_correction_foto_urls':        C_uifu.IMPL_CORRECTION_FOTO_URLS,
        'impl_corrective_action_foto_urls': C_uifu.IMPL_CORRECTIVE_ACTION_FOTO_URLS,
      };
      const col = colMap[payload.field];
      if (!col && col !== 0) throw new Error('Field tidak dikenal: ' + payload.field);
      updateResultField(period_uifu.spreadsheet_id, payload.result_id, col, payload.foto_urls);
      return { success: true };
    }

    case 'GET_HASIL_AUDIT': {
      const period_ha = payload.period_id ? getPeriodById(payload.period_id) : getActivePeriod();
      if (!period_ha || !period_ha.spreadsheet_id) return [];
      const findings_ha = getAllFindingsByPeriod(period_ha.spreadsheet_id, period_ha.period_id);
      const agendas_ha  = getCachedAgendasByPeriod(period_ha.period_id);
      return findings_ha
        .filter(function(f) { return f.status === CONFIG.RESULT_STATUS.NON_COMPLY; })
        .map(function(f) {
          var ag = agendas_ha.find(function(a) { return a.agenda_id === f.agenda_id; });
          return _sanitizeObj(Object.assign({}, f, {
            dept:     ag ? ag.dept     : '',
            kategori: ag ? ag.kategori : '',
          }));
        });
    }

    // ── Dashboard ─────────────────────────────────────────────
    case 'GET_DASHBOARD':
    case 'GET_DASHBOARD_SUMMARY':
      return JSON.stringify(_getDashboardData(profile, payload.period_id));

    default:
      throw new Error('Action tidak dikenal: ' + action);
  }
}


// ════════════════════════════════════════════════════════════
//  DASHBOARD AGGREGATOR
// ════════════════════════════════════════════════════════════

function _getDashboardData(profile, periodId) {
  try {
    const period = periodId ? getPeriodById(periodId) : getActivePeriod();
    if (!period || !period.spreadsheet_id || !period.spreadsheet_id.trim()) {
      return {
        agendas:  [],
        findings: [],
        summary:  _emptySummary(),
        period:   _sanitizeObj(period) || null,
      };
    }

    const agendas  = getCachedAgendasByPeriod(period.period_id).map(_sanitizeObj);
    let   findings = getAllFindingsByPeriod(period.spreadsheet_id, period.period_id);

    // Filter: hanya masukkan findings dari agenda yang sudah DONE
    const doneAgendaIds = new Set(
      agendas
        .filter(a => a.status === CONFIG.AGENDA_STATUS.DONE)
        .map(a => a.agenda_id)
    );
    findings = findings.filter(f => doneAgendaIds.has(f.agenda_id));

    // Filter kalau bukan Koordinator — hanya tampilkan area yang relevan
    if (!profile.isKoordinator && profile.relevantAreas && profile.relevantAreas.length > 0) {
      const myAreaIds  = profile.relevantAreas;
      const allAreaIds = getActiveAreas().map(a => a.area_id);
      const isAllAreas = allAreaIds.every(id => myAreaIds.includes(id));
      if (!isAllAreas) {
        const myAgendaIds = agendas
          .filter(a => myAreaIds.includes(a.area_id))
          .map(a => a.agenda_id);
        findings = findings.filter(f => myAgendaIds.includes(f.agenda_id));
      }
    }

    const fs = CONFIG.FINDING_STATUS;
    const summary = {
      total:                findings.length,
      pending_verification: findings.filter(f => f.finding_status === fs.PENDING_VERIFICATION).length,
      open:                 findings.filter(f => f.finding_status === fs.OPEN).length,
      open_impl:            findings.filter(f => f.finding_status === fs.OPEN_IMPL).length,
      app_dept_head:        findings.filter(f => f.finding_status === fs.APP_DEPT_HEAD).length,
      app_auditor:          findings.filter(f => f.finding_status === fs.APP_AUDITOR).length,
      app_koordinator:      findings.filter(f => f.finding_status === fs.APP_KOORDINATOR).length,
      closed:               findings.filter(f => f.finding_status === fs.CLOSED).length,
      overdue:              findings.filter(f => f.finding_status === fs.OVERDUE).length,
      agenda_planned:       agendas.filter(a => a.status === CONFIG.AGENDA_STATUS.PLANNED).length,
      agenda_started:       agendas.filter(a => a.status === CONFIG.AGENDA_STATUS.STARTED).length,
      agenda_done:          agendas.filter(a => a.status === CONFIG.AGENDA_STATUS.DONE).length,
    };

    return {
      agendas:  agendas,
      findings: findings.map(_sanitizeObj),
      summary:  summary,
      period:   _sanitizeObj(period),
    };
  } catch(e) {
    console.error('[_getDashboardData] error:', e.message);
    return { agendas: [], findings: [], summary: _emptySummary(), period: null };
  }
}

function _emptySummary() {
  return {
    total: 0,
    pending_verification: 0,
    open: 0,
    open_impl: 0,
    app_dept_head: 0, app_auditor: 0, app_koordinator: 0,
    closed: 0,
    overdue: 0,
    agenda_planned: 0, agenda_started: 0, agenda_done: 0,
  };
}

// ════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS — tidak berubah dari v1
// ════════════════════════════════════════════════════════════

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function _sanitizeObj(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  Object.keys(obj).forEach(function(k) {
    if (k !== '_rowIndex') clean[k] = obj[k];
  });
  return clean;
}

/**
 * handleApiCall — dipanggil dari frontend via google.script.run
 */
function handleApiCall(action, payload) {
  try {
    const profile = getCurrentUserProfile();
    if (!profile.isAuthorized) return errorResponse('Tidak terotorisasi.', 401);
    const result    = _routeAction(action, payload || {}, profile);
    const safeResult = JSON.stringify(result !== undefined ? result : null);
    return successResponse(safeResult);
  } catch(err) {
    console.error('handleApiCall error:', err.message);
    return errorResponse(err.message);
  }
}

function _unauthorizedPage(errorMsg) {
  return `<!DOCTYPE html><html><head><title>Akses Ditolak</title>
    <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;
    justify-content:center;height:100vh;margin:0;background:#f5f5f5;}
    .box{background:#fff;padding:40px;border-radius:8px;text-align:center;
    box-shadow:0 2px 8px rgba(0,0,0,.1);max-width:400px;}
    h2{color:#c0392b;margin-top:0;}p{color:#555;}</style></head>
    <body><div class="box"><h2>🚫 Akses Ditolak</h2>
    <p>${errorMsg || 'Anda tidak memiliki izin untuk mengakses aplikasi ini.'}</p>
    <p style="font-size:12px;color:#999;">Hubungi administrator jika ini adalah kesalahan.</p>
    </div></body></html>`;
}

// Test helper — tidak dihapus agar tidak break test yang sudah ada
function testInitDataFlat() {
  const p = getCurrentUserProfile();
  const trimmedProfile = {
    email: p.email, nama: p.nama, auditeeAreaId: p.auditeeAreaId || '',
    aktif: p.aktif, isAuthorized: p.isAuthorized, isKoordinator: p.isKoordinator,
    isDeptHead: p.isDeptHead, isAuditor: p.isAuditor, isAuditee: p.isAuditee,
    isViewer: p.isViewer,
    deptHeadAreas: (p.deptHeadAreas || []).join(','),
    auditorAreas:  (p.auditorAreas  || []).join(','),
    roles: Array.isArray(p.roles) ? p.roles.join(',') : (p.roles || ''),
  };
  const periods = getAllPeriods().map(_sanitizeObj);
  const result  = handleApiCall('GET_INIT_DATA', {});
  console.log('result null?:', result === null);
  console.log('result:', JSON.stringify(result));
}

function jsonStr(data) {
  return JSON.stringify(data);
}

// ════════════════════════════════════════════════════════════
//  DAILY DIGEST REMINDER — dipanggil oleh time-based trigger harian
//  Setup trigger manual di GAS Editor:
//    Triggers → Add Trigger
//    Function : runDailyReminders
//    Event    : Time-driven → Day timer → 08:00 - 09:00 WIB
//
//  Yang dicek setiap hari:
//  1. TPP Plan Due Date reminder      — H-7 dan H-3 dari tpp_plan_due_date,
//                                        broadcast ke SEMUA auditee + Koordinator
//                                        (terlepas status submit, karena bersifat broadcast)
//  2. Reminder bulanan OPEN+OPEN_IMPL — Senin minggu ke-1 tiap bulan, TANPA limit,
//                                        terus terkirim sampai temuan CLOSED atau
//                                        periode tidak lagi ACTIVE
//  3. Pending approval digest         — Senin minggu ke-1 & ke-3, maksimal 6x per status
// ════════════════════════════════════════════════════════════

/**
 * True jika `date` adalah Senin minggu ke-1 dalam bulan berjalan.
 */
function _isFirstMonday(date) {
  if (date.getDay() !== 1) return false; // bukan Senin sama sekali

  var firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  var firstMonday  = new Date(firstOfMonth);
  var offsetToMon  = (8 - firstOfMonth.getDay()) % 7; // 0 kalau tgl 1 sudah Senin
  firstMonday.setDate(1 + offsetToMon);

  var diffWeeks  = Math.round((date - firstMonday) / (7 * 24 * 60 * 60 * 1000));
  var weekNumber = diffWeeks + 1; // Senin pertama = minggu ke-1

  return weekNumber === 1;
}

/**
 * True jika `date` adalah Senin minggu ke-1 ATAU minggu ke-3 dalam bulan berjalan.
 * "Minggu ke-N" dihitung dari Senin pertama bulan tersebut sebagai minggu ke-1.
 */
function _isFirstOrThirdMonday(date) {
  if (date.getDay() !== 1) return false; // bukan Senin sama sekali

  var firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  var firstMonday  = new Date(firstOfMonth);
  var offsetToMon  = (8 - firstOfMonth.getDay()) % 7; // 0 kalau tgl 1 sudah Senin
  firstMonday.setDate(1 + offsetToMon);

  var diffWeeks  = Math.round((date - firstMonday) / (7 * 24 * 60 * 60 * 1000));
  var weekNumber = diffWeeks + 1; // Senin pertama = minggu ke-1

  return weekNumber === 1 || weekNumber === 3;
}

function runDailyReminders() {
  var today  = new Date(); today.setHours(0, 0, 0, 0);
  var period = getActivePeriod();
  if (!period || !period.spreadsheet_id) {
    console.log('[DAILY] Tidak ada periode aktif.');
    return;
  }

  console.log('[DAILY] Menjalankan reminder untuk periode: ' + period.period_id);

  var findings = [], agendas = [];
  try {
    findings = getAllFindingsByPeriod(period.spreadsheet_id, period.period_id);
    agendas  = getCachedAgendasByPeriod(period.period_id);
    findings.forEach(function(f) {
      f._agenda = agendas.find(function(a) { return a.agenda_id === f.agenda_id; });
    });
  } catch(e) {
    console.warn('[DAILY] Gagal ambil findings:', e.message);
    return;
  }

  var dueDatePassed = false;
  if (period.tpp_plan_due_date) {
    var planDue = new Date(period.tpp_plan_due_date); planDue.setHours(0, 0, 0, 0);
    dueDatePassed = today > planDue;
  }

  // ── 1. TPP Plan Due Date reminder — H-7 & H-3, BROADCAST ke semua auditee + Koordinator ──
  //      Tidak peduli status submit — semua auditee yang punya temuan Non Comply di periode ini dapat.
  if (period.tpp_plan_due_date && !dueDatePassed) {
    var planDueNormalized = new Date(period.tpp_plan_due_date);
    planDueNormalized.setHours(0, 0, 0, 0);
    var diffDays = Math.round((planDueNormalized - today) / (1000 * 60 * 60 * 24));
    if (diffDays === 7 || diffDays === 3) {
      var allNonComplyFindings = findings.filter(function(f) { return !!f._agenda; });
      try {
        notifyTppDueDateReminder(period, diffDays, allNonComplyFindings);
        console.log('[DAILY] TPP due date reminder (H-' + diffDays + ') sent (broadcast)');
      } catch(e) { console.warn('[DAILY] TPP reminder gagal:', e.message); }
    }
  }

  // ── 2. Reminder bulanan gabungan OPEN + OPEN_IMPL — Senin wk1, TANPA limit ──
  //      OPEN      : hanya setelah TPP plan due date lewat (belum isi rencana TPP)
  //      OPEN_IMPL : selalu, terlepas due date, untuk yang belum lengkap correction/CA
  //      Terus terkirim sampai temuan berubah status atau periode tidak ACTIVE lagi.
  if (_isFirstMonday(today)) {
    var openFindingsMonthly = dueDatePassed
      ? findings.filter(function(f) { return f.finding_status === CONFIG.FINDING_STATUS.OPEN && f._agenda; })
      : [];
    var openImplFindingsMonthly = findings.filter(function(f) {
      return f.finding_status === CONFIG.FINDING_STATUS.OPEN_IMPL && f._agenda &&
        (!f.impl_correction_submitted_at || !f.impl_submitted_at);
    });

    if (openFindingsMonthly.length > 0 || openImplFindingsMonthly.length > 0) {
      try {
        notifyTppAndImplMonthlyReminder(period, openFindingsMonthly, openImplFindingsMonthly);
        console.log('[DAILY] Monthly OPEN+OPEN_IMPL reminder sent: ' +
          openFindingsMonthly.length + ' OPEN, ' + openImplFindingsMonthly.length + ' OPEN_IMPL');
      } catch(e) { console.warn('[DAILY] Monthly OPEN+OPEN_IMPL reminder gagal:', e.message); }
    }
  }

  // ── 3. Pending approval digest — Senin wk1/wk3, max 6x per level ──
  if (_isFirstOrThirdMonday(today)) {
    var approvalStatuses = [
      CONFIG.FINDING_STATUS.APP_DEPT_HEAD,
      CONFIG.FINDING_STATUS.APP_AUDITOR,
      CONFIG.FINDING_STATUS.APP_KOORDINATOR,
    ];
    var pendingApproval = findings.filter(function(f) {
      return approvalStatuses.indexOf(f.finding_status) !== -1 && f._agenda;
    });

    var eligibleApproval = [];
    pendingApproval.forEach(function(f) {
      var check = _checkReminderCounter(f);
      if (check.shouldSend) {
        eligibleApproval.push(f);
        try {
          _updateReminderTracking(period.spreadsheet_id, f.result_id, check.newCount, f.finding_status);
        } catch(e) { console.warn('[DAILY] Update reminder tracking gagal:', e.message); }
      }
    });

    if (eligibleApproval.length > 0) {
      try {
        notifyPendingApprovalDigest(period, eligibleApproval, agendas);
        console.log('[DAILY] Pending approval digest sent: ' + eligibleApproval.length + ' findings');
      } catch(e) { console.warn('[DAILY] Pending approval digest gagal:', e.message); }
    }
  }

  console.log('[DAILY] Selesai.');
}

// ════════════════════════════════════════════════════════════
//  TEST HELPER — simulasi runDailyReminders dengan tanggal palsu
//  HAPUS setelah testing selesai. Jalankan manual dari GAS Editor.
// ════════════════════════════════════════════════════════════
function TEST_runDailyRemindersWithFakeDate(fakeDateStr) {
  // fakeDateStr format: 'YYYY-MM-DD', contoh '2026-06-22' untuk simulasi Senin
  var fakeToday = new Date(fakeDateStr); fakeToday.setHours(0, 0, 0, 0);
  console.log('[TEST] Simulasi runDailyReminders dengan today = ' + fakeToday.toDateString() +
    ' (hari: ' + ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][fakeToday.getDay()] + ')');

  var period = getActivePeriod();
  if (!period || !period.spreadsheet_id) {
    console.log('[TEST] Tidak ada periode aktif.');
    return;
  }

  var findings = getAllFindingsByPeriod(period.spreadsheet_id, period.period_id);
  var agendas  = getCachedAgendasByPeriod(period.period_id);
  findings.forEach(function(f) {
    f._agenda = agendas.find(function(a) { return a.agenda_id === f.agenda_id; });
  });

  var dueDatePassed = false;
  if (period.tpp_plan_due_date) {
    var planDue = new Date(period.tpp_plan_due_date); planDue.setHours(0, 0, 0, 0);
    dueDatePassed = fakeToday > planDue;
  }
  console.log('[TEST] tpp_plan_due_date=' + period.tpp_plan_due_date + ' dueDatePassed=' + dueDatePassed);
  console.log('[TEST] isFirstMonday=' + _isFirstMonday(fakeToday) + ' isFirstOrThirdMonday=' + _isFirstOrThirdMonday(fakeToday));

  // ── 1. H-7/H-3 broadcast ──
  if (period.tpp_plan_due_date && !dueDatePassed) {
    var planDueNormalized = new Date(period.tpp_plan_due_date);
    planDueNormalized.setHours(0, 0, 0, 0);
    var diffDays = Math.round((planDueNormalized - fakeToday) / (1000 * 60 * 60 * 24));
    console.log('[TEST] diffDays to tpp_plan_due_date = ' + diffDays);
    if (diffDays === 7 || diffDays === 3) {
      var allNonComplyFindings = findings.filter(function(f) { return !!f._agenda; });
      notifyTppDueDateReminder(period, diffDays, allNonComplyFindings);
      console.log('[TEST] ✅ H-' + diffDays + ' broadcast reminder sent: ' + allNonComplyFindings.length + ' findings');
    } else {
      console.log('[TEST] ⏭ Skip H-7/H-3 (diffDays tidak match)');
    }
  } else {
    console.log('[TEST] ⏭ Skip H-7/H-3 (due date sudah lewat atau belum diset)');
  }

  // ── 2. Reminder bulanan OPEN+OPEN_IMPL ──
  if (_isFirstMonday(fakeToday)) {
    var openFindingsMonthly = dueDatePassed
      ? findings.filter(function(f) { return f.finding_status === CONFIG.FINDING_STATUS.OPEN && f._agenda; })
      : [];
    var openImplFindingsMonthly = findings.filter(function(f) {
      return f.finding_status === CONFIG.FINDING_STATUS.OPEN_IMPL && f._agenda &&
        (!f.impl_correction_submitted_at || !f.impl_submitted_at);
    });
    console.log('[TEST] OPEN monthly=' + openFindingsMonthly.length + ' OPEN_IMPL monthly=' + openImplFindingsMonthly.length);
    if (openFindingsMonthly.length > 0 || openImplFindingsMonthly.length > 0) {
      notifyTppAndImplMonthlyReminder(period, openFindingsMonthly, openImplFindingsMonthly);
      console.log('[TEST] ✅ Monthly OPEN+OPEN_IMPL reminder sent');
    }
  } else {
    console.log('[TEST] ⏭ Skip monthly reminder (bukan Senin wk1)');
  }

  // ── 3. Approval digest ──
  if (_isFirstOrThirdMonday(fakeToday)) {
    var approvalStatuses = [
      CONFIG.FINDING_STATUS.APP_DEPT_HEAD,
      CONFIG.FINDING_STATUS.APP_AUDITOR,
      CONFIG.FINDING_STATUS.APP_KOORDINATOR,
    ];
    var pendingApproval = findings.filter(function(f) {
      return approvalStatuses.indexOf(f.finding_status) !== -1 && f._agenda;
    });
    console.log('[TEST] pendingApproval=' + pendingApproval.length);
    // NOTE: counter check di-skip di test helper supaya tidak mengubah reminder_count asli.
    // Kalau mau test counter/limit 6x juga, panggil notifyPendingApprovalDigest langsung manual.
    if (pendingApproval.length > 0) {
      notifyPendingApprovalDigest(period, pendingApproval, agendas);
      console.log('[TEST] ✅ Approval digest sent (counter TIDAK di-update di test ini)');
    }
  } else {
    console.log('[TEST] ⏭ Skip approval digest (bukan Senin wk1/wk3)');
  }

  console.log('[TEST] Selesai.');
}

// ── Wrapper test tanpa parameter — pilih salah satu di dropdown Run ──
function TEST_run_H7()      { TEST_runDailyRemindersWithFakeDate('2026-06-19'); } // Test 1: H-7
function TEST_run_H3()      { TEST_runDailyRemindersWithFakeDate('2026-06-19'); } // Test 2: H-3 (ganti due date dulu)
function TEST_run_Monthly() { TEST_runDailyRemindersWithFakeDate('2026-07-06'); } // Test 3/4/5: Senin wk1 Juli
