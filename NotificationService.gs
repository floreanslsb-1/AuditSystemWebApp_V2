// ============================================================
// NotificationService.gs — Email Notification Service
// ============================================================
// Centralized notification dispatcher for all workflow events

const NotificationService = {
  /**
   * Send draft creation confirmation
   */
  sendDraftCreated: function(proposerList, draftLink, judul, email, departemen) {
    const docInfo = { noreg: 'DRAFT', judul, pengusul: email, dept: departemen };
    sendEmailNotification(proposerList, 'MOC Draft Successfully Created', `
      <div class="greeting">Your draft has been created.</div>
      <p class="sub-text">Complete the change details and submit to the Coordinator when ready.</p>
      ${docInfoBox(docInfo)}
    `, false, draftLink);
  },

  /**
   * Send submitted to coordinator notification
   */
  sendSubmittedToCoordinator: function(noReg, data, row) {
    const adminList = getConfigValue('ADMIN_EMAILS').split(',').map(e => e.trim());
    const docInfo = { noreg: noReg, judul: data.judul, pengusul: data.email, dept: data.departemen };
    const docLink = CONFIG.APP_URL + '?open=' + encodeURIComponent(noReg);
    const delegateEmail = data.delegate ? data.delegate.trim().toLowerCase() : '';
    const proposerList  = [data.email, ...(delegateEmail ? [delegateEmail] : [])];

    sendEmailNotification(proposerList, 'MOC Request Submitted to Coordinator', `
      <div class="greeting">A change request has been submitted.</div>
      <p class="sub-text">The request is now awaiting review and approval from the Coordinator.</p>
      ${docInfoBox(docInfo)}
    `, false, docLink);

    sendEmailNotification(adminList, 'Action Required: MOC Request Submitted to Coordinator', `
      <div class="greeting">A change request is awaiting your review.</div>
      <p class="sub-text">Please open the MOC Portal and review this request.</p>
      ${docInfoBox(docInfo)}
    `, false, docLink);
  },

  /**
   * Send delegate access email (untuk Step 1 & Step 2 & re-send)
   */
  sendDelegateAccess: function(delegateEmail, data) {
    const docInfo = { noreg: 'DRAFT', judul: data.judul, pengusul: data.email, dept: data.departemen };
    const draftLink = CONFIG.APP_URL + '?open=' + encodeURIComponent(data.identifier);
    
    sendEmailNotification([delegateEmail], 'You Have Been Assigned as Delegate', `
      <div class="greeting">You have been granted access to a change request.</div>
      <p class="sub-text">The proposer has shared this document with you. Please open the portal and assist.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box info">
        <div><div class="note-box-title">Current Phase</div>Drafting</div>
      </div>
    `, false, draftLink);
  },

  /**
   * Send delegate access notification (generic untuk all statuses)
   */
  sendDelegateNotification: function(delegateEmail, docInfo, status, docLink) {
    const statusText = status || 'In Progress';
    sendEmailNotification([delegateEmail], 'You Have Been Assigned as Delegate', `
      <div class="greeting">You have been granted access to a change request.</div>
      <p class="sub-text">The proposer has shared this document with you. Please open the portal and assist.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box info">
        <div><div class="note-box-title">Current Phase</div>${statusText}</div>
      </div>
    `, false, docLink);
  },

  /**
   * Send delegate removed notification
   */
  sendDelegateRemoved: function(delegateEmail, docInfo, docLink) {
    sendEmailNotification([delegateEmail], 'You Have Been Removed as Delegate', `
      <div class="greeting">You have been removed as Delegate.</div>
      <p class="sub-text">You no longer have access to this document.</p>
      ${docInfoBox(docInfo)}
    `, false, docLink);
  },

  /**
   * Send coordinator revision request
   */
  sendCoordinatorRevision: function(proposerList, docInfo, docLink, note) {
    sendEmailNotification(proposerList, 'MOC Request Returned for Revision', `
      <div class="greeting">Your change request needs revision.</div>
      <p class="sub-text">The Coordinator has reviewed your request and returned it for changes.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box revisi">
        <div><div class="note-box-title">Coordinator's Note</div>${escapeHtml_(note)}</div>
      </div>
    `, false, docLink);
  },

  /**
   * Send forwarded to reviewers notification
   */
  sendForwardedToReviewers: function(reviewerEmails, proposerList, docInfo, docLink) {
    sendEmailNotification(proposerList, 'MOC Request Forwarded to Reviewers', `
      <div class="greeting">Your request is now under review.</div>
      <p class="sub-text">The Coordinator approved and forwarded your change request to the assigned reviewers.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box approve">
        <div><div class="note-box-title">Coordinator Approved</div>Forwarded to assigned reviewers.</div>
      </div>
    `, false, docLink);

    reviewerEmails.forEach(revEmail => {
      sendEmailNotification(revEmail, 'You Have Been Assigned as Reviewer', `
        <div class="greeting">Action Required: Review Request</div>
        <p class="sub-text">You have been assigned as a Reviewer. Please open the portal and submit your decision.</p>
        ${docInfoBox(docInfo)}
        <div class="note-box info">
          <div><div class="note-box-title">Quick Access</div>
          Use the button below to go directly to this document.</div>
        </div>
      `, false, docLink);
    });
  },

  /**
   * Send reviewer revision request
   */
  sendReviewerRevision: function(proposerList, adminList, allRevEmails, docInfo, docLink, note, reviewerEmail, reviewerRole) {
    sendEmailNotification([...proposerList, ...adminList, ...allRevEmails],
      'MOC Request Returned for Revision by Reviewer', `
      <div class="greeting">Revision requested by a reviewer.</div>
      <p class="sub-text"><strong>${escapeHtml_(reviewerEmail)}</strong> (${escapeHtml_(reviewerRole)}) returned the request for revision.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box revisi">
        <div><div class="note-box-title">Reviewer's Note</div>${escapeHtml_(note)}</div>
      </div>
    `, false, docLink);
  },

  /**
   * Send partial reviewer approval notification
   */
  sendReviewerApprovalPartial: function(proposerList, adminList, pendingEmails, approver, docInfo, docLink) {
    sendEmailNotification([...proposerList, ...adminList],
      'Reviewer Approved — Waiting for Others', `
      <div class="greeting">A reviewer has approved.</div>
      <p class="sub-text"><strong>${approver}</strong> approved. Still waiting for remaining reviewers.</p>
      ${docInfoBox(docInfo)}
    `, false, docLink);

    sendEmailNotification(pendingEmails, 'Action Required: Your Review is Still Pending', `
      <div class="greeting">A reviewer has approved — your decision is still needed.</div>
      <p class="sub-text">Please open the portal and submit your review decision.</p>
      ${docInfoBox(docInfo)}
    `, false, docLink);
  },

  /**
   * Send all reviewers approved notification
   */
  sendAllReviewersApproved: function(proposerList, adminList, reviewerLines, imsEmail, docInfo, docLink) {
    const allRevEmails = reviewerLines.map(r => r.split(' - ')[0].trim());
    
    sendEmailNotification([...proposerList, ...adminList, ...allRevEmails],
      'All Reviewers Approved — Awaiting IMS Dept Head', `
      <div class="greeting">All reviewers have approved.</div>
      <p class="sub-text">The change request is now awaiting final approval from the IMS Department Head.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box approve">
        <div><div class="note-box-title">Next Step</div>IMS Dept Head review required.</div>
      </div>
    `, false, docLink);

    sendEmailNotification([imsEmail],
      'Action Required: IMS Dept Head Approval Needed', `
      <div class="greeting">Action Required: Final Approval</div>
      <p class="sub-text">All reviewers have approved this change request. Your final approval is required as IMS Department Head.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box info">
        <div><div class="note-box-title">Your Action</div>Please open the MOC Portal and submit your decision.</div>
      </div>
    `, false, docLink);
  },

  /**
   * Send IMS revision request
   */
  sendIMSRevision: function(proposerList, adminList, allRevEmails, docInfo, docLink, note) {
    sendEmailNotification([...adminList, ...allRevEmails],
      'MOC Request Returned by IMS Dept Head', `
      <div class="greeting">IMS Dept Head has returned the request for revision.</div>
      <p class="sub-text">The document has been sent back to the proposer for revision.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box revisi">
        <div><div class="note-box-title">IMS Dept Head Note</div>${escapeHtml_(note)}</div>
      </div>
    `, false, docLink);

    sendEmailNotification(proposerList, 'Action Required: MOC Request Returned by IMS Dept Head', `
      <div class="greeting">Revision requested by IMS Dept Head.</div>
      <p class="sub-text">Please open the portal, make the required changes, and resubmit.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box revisi">
        <div><div class="note-box-title">IMS Dept Head Note</div>${escapeHtml_(note)}</div>
      </div>
    `, false, docLink);
  },

  /**
   * Send IMS approval notification
   */
  sendIMSApproved: function(proposerList, adminList, docInfo, approvedDate, docLink) {
    sendEmailNotification(adminList, 'MOC Request Fully Approved — Now in Monitoring', `
      <div class="greeting">Change request approved and moved to Monitoring.</div>
      <p class="sub-text">The proposer will now upload implementation evidence.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box approve">
        <div><div class="note-box-title">Approval Date</div>${Utilities.formatDate(approvedDate, 'GMT+7', 'dd/MM/yyyy')}</div>
      </div>
    `, false, docLink);

    sendEmailNotification(proposerList, 'Action Required: Upload Implementation Evidence', `
      <div class="greeting">Congratulations! Your request is approved.</div>
      <p class="sub-text">Your document is now in <strong>Monitoring</strong> phase. Please log in and upload your implementation evidence.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box approve">
        <div><div class="note-box-title">Approval Date</div>${Utilities.formatDate(approvedDate, 'GMT+7', 'dd/MM/yyyy')}</div>
      </div>
    `, false, docLink);
  },

  /**
   * Send evidence submitted notification
   */
  sendEvidenceSubmitted: function(adminList, docInfo, docLink, evidenceNotes) {
    sendEmailNotification(adminList, 'Implementation Evidence Submitted — Awaiting Coordinator Review', `
      <div class="greeting">Action Required: Review Evidence</div>
      <p class="sub-text">The proposer has submitted implementation evidence. Please review and submit your decision.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box info">
        <div><div class="note-box-title">Implementation Notes</div>${evidenceNotes || '-'}</div>
      </div>
    `, false, docLink);
  },

  /**
   * Send evidence approved notification
   */
  sendEvidenceApproved: function(proposerList, adminList, docInfo, docLink) {
    sendEmailNotification(proposerList, 'MOC Request Closed — Implementation Verified', `
      <div class="greeting">Change request successfully closed.</div>
      <p class="sub-text">The Coordinator approved your implementation evidence. The request is now <strong>Closed</strong>.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box approve">
        <div><div class="note-box-title">Management of Change process complete.</div></div>
      </div>
    `, false, docLink);

    sendEmailNotification(adminList, 'MOC Request Closed — Implementation Verified', `
      <div class="greeting">Change request has been closed.</div>
      <p class="sub-text">Implementation evidence has been approved and the document is now <strong>Closed</strong>.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box approve">
        <div><div class="note-box-title">Management of Change process complete.</div></div>
      </div>
    `, false, docLink);
  },

  /**
   * Send evidence revision request
   */
  sendEvidenceRevision: function(proposerList, docInfo, docLink, note) {
    sendEmailNotification(proposerList, 'Implementation Evidence Returned — Revision Required', `
      <div class="greeting">Your evidence needs revision.</div>
      <p class="sub-text">The Coordinator has requested changes to your implementation evidence.</p>
      ${docInfoBox(docInfo)}
      <div class="note-box revisi">
        <div><div class="note-box-title">Coordinator's Note</div>${escapeHtml_(note)}</div>
      </div>
    `, false, docLink);
  }
};

/**
 * Core email sending function — TERPUSAT di sini
 * Used by all notification methods
 * @param {Array|string} toList - Recipients
 * @param {string} subject - Email subject
 * @param {string} bodyHtml - HTML email body
 * @param {boolean} useTasksUrl - Use tasks URL instead of APP_URL
 * @param {string} customUrl - Override URL
 */
function sendEmailNotification(toList, subject, bodyHtml, useTasksUrl, customUrl) {
  const recipients = Array.isArray(toList) ? toList : [toList];
  const uniqueList = [...new Set(recipients.map(e => e.trim().toLowerCase()).filter(Boolean))];
  const appUrl = customUrl ? customUrl : (useTasksUrl ? CONFIG.APP_URL + '#tasks' : CONFIG.APP_URL);
  
  uniqueList.forEach(email => {
    try {
      GmailApp.sendEmail(email, '[MOC Portal] ' + subject, '', {
        htmlBody: buildEmailWrapper(bodyHtml, appUrl),
        from: 'info.ims@wingscorp.com',
        name: 'MOC Portal — PT Sayap Mas Utama'
      });
    } catch (e) {
      console.error('Failed to send email to ' + email + ': ' + e.message);
    }
  });
}

/**
 * Email template wrapper dengan styling profesional
 * Dipakai oleh semua notification methods
 */
function buildEmailWrapper(bodyHtml, appUrl, btnLabel) {
  appUrl = appUrl || CONFIG.APP_URL;
  btnLabel = btnLabel || 'OPEN PORTAL';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;padding:0;background:#e2e8f0;font-family:'Segoe UI',Arial,sans-serif;}
.wrapper{max-width:520px;margin:28px auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 2px 12px rgba(0,0,0,0.07);}
.header{background:#1e1b4b;padding:16px 22px;border-bottom:3px solid #818cf8;}
.header-title{color:#ffffff;font-size:17px;font-weight:700;margin:0;}
.header-sub{color:#a5b4fc;font-size:11px;margin-top:4px;letter-spacing:.6px;text-transform:uppercase;}
.body{padding:20px 22px;}
.greeting{font-size:16px;font-weight:700;color:#0f172a;margin-bottom:5px;}
.sub-text{font-size:12px;color:#64748b;line-height:1.6;margin-bottom:16px;}
.info-box{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;}
.info-head{background:#1e1b4b;color:#a5b4fc;font-size:10px;font-weight:700;padding:8px 14px;text-transform:uppercase;letter-spacing:.6px;}
.info-table{width:100%;border-collapse:collapse;}
.info-table td{padding:9px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;}
.info-table tr:last-child td{border-bottom:none;}
.label{color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.3px;width:40%;font-size:10px;}
.value{color:#0f172a;font-weight:600;}
.info-table tr:nth-child(odd){background:#f8fafc;}
.note-box{border-radius:10px;padding:10px 14px;font-size:12px;line-height:1.6;margin-bottom:16px;}
.note-box.info{background:#eef2ff;border:1px solid #c7d2fe;color:#1e1b4b;}
.note-box.revisi{background:#fff1f2;border:1px solid #fecdd3;color:#1e1b4b;}
.note-box.approve{background:#f0fdf4;border:1px solid #bbf7d0;color:#1e1b4b;}
.note-box-title{font-weight:700;margin-bottom:3px;font-size:10px;text-transform:uppercase;color:#6366f1;}
.note-box.revisi .note-box-title{color:#f43f5e;}
.note-box.approve .note-box-title{color:#22c55e;}
.cta{text-align:center;margin-top:16px;}
.btn{display:inline-block;background:#6366f1;color:#ffffff !important;text-decoration:none;padding:11px 32px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;}
.footer{background:#1e1b4b;padding:12px 22px;display:table;width:100%;box-sizing:border-box;}
.footer-brand{color:#a5b4fc;font-size:10px;font-weight:600;display:table-cell;text-align:left;}
.footer-note{color:#ffffff !important;font-size:10px;opacity:0.5;display:table-cell;text-align:right;}
</style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="header-title">Management of Change Portal</div>
      <div class="header-sub">PT Sayap Mas Utama — Integrated Management System</div>
    </div>
    <div class="body">
      ${bodyHtml}
      <div class="cta"><a href="${appUrl}" class="btn">${btnLabel}</a></div>
    </div>
    <div class="footer">
      <div class="footer-brand">Integrated Management System</div>
      <div class="footer-note">Do not reply to this email.</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Helper: Build document info box dengan styling profesional
 */
function docInfoBox(data) {
  return `
    <div class="info-box">
      <div class="info-head">CHANGE REQUEST DETAILS</div>
      <table class="info-table">
        <tr><td class="label">Registration No.</td><td class="value">${data.noreg || 'DRAFT'}</td></tr>
        <tr><td class="label">Change Title</td><td class="value">${data.judul || '-'}</td></tr>
        <tr><td class="label">Proposed By</td><td class="value">${data.pengusul || '-'}</td></tr>
        <tr><td class="label">Department</td><td class="value">${data.dept || '-'}</td></tr>
      </table>
    </div>`;
}

/**
 * Helper: Escape HTML
 */
function escapeHtml_(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
