// Apps Script extension snippet for the Mutual Fund feature. Mirrors
// cloud-sync-calendar.ts. The user pastes it into the same Apps Script
// project they already use for policy reminders. It adds:
//   1. syncMutualFunds_(funds) — writes/refreshes a "Mutual Funds" tab.
//   2. syncMfInstallments_(installments) — writes/refreshes a "MF SIP
//      Payments" tab with every active fund's installments.
//   3. mfSipReminderTick_() — daily-trigger entry point that reads the
//      MF SIP Payments tab and emails reminders for installments due
//      within the configured offsets. Uses the SAME reminder_offsets_days
//      array stored in the Settings sheet (B3 — the existing policy
//      reminder cell), so MF SIPs share the global cadence.

export const mfAppsScriptSnippet = (): string => /* javascript */ `
// =====================================================================
// PolicyHub — Mutual Funds extension
// Paste this into the SAME Apps Script project that handles your
// policy + calendar reminders. Then redeploy: Deploy → Manage
// deployments → edit → Save (URL stays the same).
//
// What it adds:
//   • A "Mutual Funds" tab written on every sync.
//   • A "MF SIP Payments" tab written on every sync.
//   • A daily mfSipReminderTick_ trigger that emails reminders for
//     upcoming SIP installments. Reuses the offsets from the existing
//     "Settings" sheet so policies and SIPs share one cadence.
//
// It does NOT change policy / payments / repayments / calendar
// behaviour.
// =====================================================================

/** Called from the existing doPost when payload.mutualFunds is present. */
function syncMutualFunds_(funds) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Mutual Funds');
  if (!sh) sh = ss.insertSheet('Mutual Funds');
  sh.clearContents();
  writeMfHeader_(sh);
  if (funds && funds.length) {
    const rows = funds.map(function (f) {
      return [
        f.id,
        f.folioNo || '',
        f.accountHolder || '',
        f.provider || '',
        f.schemeName || '',
        f.type || '',
        (f.amount != null ? Number(f.amount) / 100 : ''),
        f.startDate || '',
        f.installmentCount || '',
        f.status || '',
        f.agentName || '',
        f.agentContact || '',
        f.debitBankName || '',
        f.debitAccountNo || ''
      ];
    });
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  sh.setFrozenRows(1);
  return { mutualFunds: (funds || []).length };
}

function writeMfHeader_(sh) {
  const headers = [
    'ID', 'Folio No', 'Account Holder', 'Provider', 'Scheme',
    'Type', 'Amount (₹)', 'Start Date', 'Installments', 'Status',
    'Agent', 'Agent contact', 'Debit bank', 'Debit A/c no'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
}

/** Called from doPost when payload.mfInstallments is present. */
function syncMfInstallments_(installments) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('MF SIP Payments');
  if (!sh) sh = ss.insertSheet('MF SIP Payments');
  sh.clearContents();
  writeMfInstallmentsHeader_(sh);
  if (installments && installments.length) {
    const rows = installments.map(function (i) {
      return [
        i.id,
        i.folioNo || '',
        i.accountHolder || '',
        i.provider || '',
        i.schemeName || '',
        i.type || '',
        i.installmentNo || 1,
        i.dueDate || '',
        i.expectedAmount != null ? Number(i.expectedAmount) / 100 : '',
        i.status || 'pending',
        i.paidDate || '',
        i.paidAmount != null ? Number(i.paidAmount) / 100 : ''
      ];
    });
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  sh.setFrozenRows(1);
  return { mfInstallments: (installments || []).length };
}

function writeMfInstallmentsHeader_(sh) {
  const headers = [
    'ID', 'Folio No', 'Account Holder', 'Provider', 'Scheme',
    'Type', 'Installment #', 'Due Date', 'Expected (₹)',
    'Status', 'Paid Date', 'Paid (₹)'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
}

/**
 * Daily trigger for MF SIP reminders. Set up a Time-driven trigger
 * (Apps Script → Triggers → Add → "mfSipReminderTick_", Day-timer).
 *
 * For every pending or overdue SIP whose due_date is within an offset
 * window listed in Settings (cell B3, the existing policy offsets),
 * send a reminder email to the configured recipient (Settings B2).
 *
 * Idempotent — same row + same days-before pair doesn't email twice
 * in one day. Tracking lives in a hidden "MF SIP Reminder Log" sheet.
 */
function mfSipReminderTick_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('MF SIP Payments');
  if (!sh) return;
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return;

  const head = values[0];
  const col = function (name) { return head.indexOf(name); };
  const cId = col('ID');
  const cFolio = col('Folio No');
  const cHolder = col('Account Holder');
  const cScheme = col('Scheme');
  const cDueDate = col('Due Date');
  const cAmount = col('Expected (₹)');
  const cStatus = col('Status');

  const recipient = getMfReminderRecipient_();
  if (!recipient) return;
  const offsets = getMfReminderOffsets_();
  if (offsets.length === 0) return;

  // Idempotent log.
  let log = ss.getSheetByName('MF SIP Reminder Log');
  if (!log) {
    log = ss.insertSheet('MF SIP Reminder Log');
    log.getRange(1, 1, 1, 3).setValues([['Date sent', 'SIP ID', 'Days before']]);
    log.hideSheet();
  }
  const logged = {};
  const logVals = log.getDataRange().getValues();
  for (let i = 1; i < logVals.length; i++) {
    logged[logVals[i][0] + '|' + logVals[i][1] + '|' + logVals[i][2]] = true;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  let sent = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const status = String(row[cStatus] || '').toLowerCase();
    if (status !== 'pending' && status !== 'overdue') continue;
    const dueDate = parseMfSheetDate_(row[cDueDate]);
    if (!dueDate) continue;
    dueDate.setHours(0, 0, 0, 0);
    const daysAway = Math.round((dueDate - today) / (24 * 60 * 60 * 1000));
    // Only fire on positive offset matches (future). Overdue handling
    // is separate — let the policy-style overdue cadence cover that
    // if you want it; mfSipReminderTick_ is forward-looking.
    if (daysAway < 0) continue;
    if (offsets.indexOf(daysAway) === -1) continue;

    const key = todayKey + '|' + row[cId] + '|' + daysAway;
    if (logged[key]) continue;

    const folio = row[cFolio];
    const scheme = row[cScheme];
    const holder = row[cHolder];
    const amount = row[cAmount];
    const subject = '[PolicyHub] SIP ' + folio + ' — due in ' + daysAway + ' day' + (daysAway === 1 ? '' : 's');
    const body = [
      'Your SIP installment is due on ' + row[cDueDate] + ' (' + daysAway + ' day' + (daysAway === 1 ? '' : 's') + ' away).',
      '',
      'Folio: ' + folio,
      'Holder: ' + holder,
      'Scheme: ' + scheme,
      amount ? 'Amount: ₹' + amount : '',
      '',
      '— PolicyHub'
    ].filter(function (s) { return s !== ''; });
    MailApp.sendEmail({ to: recipient, subject: subject, body: body.join('\\n') });
    log.appendRow([todayKey, row[cId], daysAway]);
    sent++;
  }
  return sent;
}

function parseMfSheetDate_(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const m = v.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function getMfReminderRecipient_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ss.getSheetByName('Settings');
  if (settings) {
    const v = settings.getRange('B2').getValue();
    if (v) return String(v).trim();
  }
  return Session.getActiveUser().getEmail();
}

function getMfReminderOffsets_() {
  // Reuse the existing policy offsets from Settings!B3 so the user
  // configures one cadence for everything. Falls back to a sensible
  // default if the cell is empty or malformed.
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ss.getSheetByName('Settings');
  let raw = '';
  if (settings) raw = String(settings.getRange('B3').getValue() || '').trim();
  if (!raw) return [30, 14, 7, 1];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map(Number).filter(function (n) { return Number.isFinite(n) && n >= 0; });
  } catch (e) {
    // Try comma-separated as a friendly fallback.
    const parts = raw.split(/[\\s,]+/).map(Number).filter(function (n) { return Number.isFinite(n) && n >= 0; });
    if (parts.length) return parts;
  }
  return [30, 14, 7, 1];
}

// =====================================================================
// IMPORTANT — wiring into your existing doPost:
//
//   Inside your existing doPost(e) function, AFTER you've written the
//   policy / payments / repayments / calendar sheets, add:
//
//     var payload = JSON.parse(e.postData.contents);
//     if (payload.mutualFunds) {
//       var out1 = syncMutualFunds_(payload.mutualFunds);
//       counts.mutualFunds = out1.mutualFunds;
//     }
//     if (payload.mfInstallments) {
//       var out2 = syncMfInstallments_(payload.mfInstallments);
//       counts.mfInstallments = out2.mfInstallments;
//     }
//
// Then set up a daily trigger on \`mfSipReminderTick_\` (Apps Script →
// Triggers → Add → choose function, type "Time-driven", "Day timer",
// any hour you prefer). Reminders will fire for any SIP whose due
// date matches one of the offset windows configured in Settings!B3.
// =====================================================================
`.trim();
