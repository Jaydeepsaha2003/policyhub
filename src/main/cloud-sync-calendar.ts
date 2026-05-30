// Returns the Apps Script extension snippet for the Calendar Events
// feature. The user copy-pastes this into the same Apps Script project
// that powers the policy reminders. It adds:
//   1. A `writeCalendarEventsSheet_` function that writes the new
//      "Calendar Events" tab on every sync.
//   2. Hook points in the existing `doPost` and daily-reminder triggers
//      so reminders fire for upcoming calendar events too.
//
// We hand this back as a plain string from an IPC call so Settings can
// show it in a copy-friendly textbox.

export const calendarAppsScriptSnippet = (): string => /* javascript */ `
// =====================================================================
// PolicyHub — Calendar Events extension
// Paste this into the SAME Apps Script project that handles your
// policy reminders. Then redeploy: Deploy → Manage deployments →
// edit → Save (no need to change the URL).
//
// What it adds:
//   • A "Calendar Events" tab written on every sync.
//   • Daily reminder emails for upcoming events, mirroring the
//     reminderOffsetsDays array stored against each event.
//
// It does NOT change any policy / payments / repayments behaviour.
// =====================================================================

/** Called from the existing doPost when payload.calendarEvents is present. */
function syncCalendarEvents_(events) {
  if (!events || !events.length) {
    // Still wipe stale rows if the user deleted everything in PolicyHub.
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName('Calendar Events');
    if (sh) sh.clearContents();
    if (sh) writeCalendarHeader_(sh);
    return { calendarEvents: 0 };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Calendar Events');
  if (!sh) sh = ss.insertSheet('Calendar Events');
  sh.clearContents();
  writeCalendarHeader_(sh);

  const rows = events.map(function (e) {
    return [
      e.id,
      e.title || '',
      e.category || '',
      e.customCategory || '',
      e.eventDate || '',
      e.isRecurring ? 'Yes' : 'No',
      e.frequency || '',
      e.occurrenceNo || 1,
      e.occurrenceTotal || 1,
      e.status || 'pending',
      e.reminderOffsetsDays || '[]',
      e.amount != null ? Number(e.amount) / 100 : '',
      e.notes || ''
    ];
  });
  if (rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

  // Auto-freeze + bold header.
  sh.setFrozenRows(1);
  return { calendarEvents: rows.length };
}

function writeCalendarHeader_(sh) {
  const headers = [
    'ID',
    'Title',
    'Category',
    'Custom category',
    'Event date',
    'Recurring',
    'Frequency',
    'Occurrence',
    'Of',
    'Status',
    'Reminder offsets (days)',
    'Amount',
    'Notes'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
}

/**
 * Daily trigger entry-point for calendar reminders. Set up a Time-driven
 * trigger (Apps Script → Triggers → Add → "calendarReminderTick_",
 * Day-timer, e.g. 8am).
 *
 * For each pending event whose (event_date - today) matches one of its
 * reminderOffsetsDays values, send an email to the recipient configured
 * in the "Settings" sheet (cell B2 = recipient email, reused from the
 * existing policy reminders).
 */
function calendarReminderTick_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Calendar Events');
  if (!sh) return;
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return;

  // Header lookup.
  const head = values[0];
  const col = function (name) { return head.indexOf(name); };
  const cId = col('ID');
  const cTitle = col('Title');
  const cCat = col('Category');
  const cCustom = col('Custom category');
  const cDate = col('Event date');
  const cStatus = col('Status');
  const cOffsets = col('Reminder offsets (days)');
  const cAmount = col('Amount');

  const recipient = getReminderRecipient_();
  if (!recipient) return;

  // Idempotent log: track which (id, daysBefore) pairs we've already
  // emailed today. Stored in a hidden "Calendar Reminder Log" sheet.
  let log = ss.getSheetByName('Calendar Reminder Log');
  if (!log) {
    log = ss.insertSheet('Calendar Reminder Log');
    log.getRange(1, 1, 1, 3).setValues([['Date sent', 'Event ID', 'Days before']]);
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
    if (row[cStatus] !== 'pending') continue;
    const dateStr = row[cDate];
    if (!dateStr) continue;
    const eventDate = parseSheetDate_(dateStr);
    if (!eventDate) continue;
    eventDate.setHours(0, 0, 0, 0);
    const daysAway = Math.round((eventDate - today) / (24 * 60 * 60 * 1000));
    if (daysAway < 0) continue;

    let offsets = [];
    try { offsets = JSON.parse(row[cOffsets] || '[]'); } catch (e) { offsets = []; }
    if (offsets.indexOf(daysAway) === -1) continue;

    const key = todayKey + '|' + row[cId] + '|' + daysAway;
    if (logged[key]) continue;

    const subject = '[PolicyHub] ' + row[cTitle] + ' — due in ' + daysAway + ' day' + (daysAway === 1 ? '' : 's');
    const lines = [
      row[cTitle] + ' is due on ' + dateStr + ' (' + daysAway + ' day' + (daysAway === 1 ? '' : 's') + ' away).',
      '',
      'Category: ' + (row[cCustom] || row[cCat] || ''),
      row[cAmount] ? 'Amount: ₹' + row[cAmount] : '',
      '',
      '— PolicyHub'
    ].filter(function (s) { return s !== ''; });
    MailApp.sendEmail({ to: recipient, subject: subject, body: lines.join('\\n') });
    log.appendRow([todayKey, row[cId], daysAway]);
    sent++;
  }
  return sent;
}

function parseSheetDate_(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    const m = v.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function getReminderRecipient_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ss.getSheetByName('Settings');
  if (settings) {
    const v = settings.getRange('B2').getValue();
    if (v) return String(v).trim();
  }
  // Fallback: the account that owns the script.
  return Session.getActiveUser().getEmail();
}

// =====================================================================
// IMPORTANT — wiring into your existing doPost:
//
//   Inside your existing doPost(e) function, AFTER you've written the
//   policy / payments / repayments sheets, add:
//
//     var payload = JSON.parse(e.postData.contents);
//     if (payload.calendarEvents) {
//       var out = syncCalendarEvents_(payload.calendarEvents);
//       counts.calendarEvents = out.calendarEvents;
//     }
//
// Then set up a daily trigger on \`calendarReminderTick_\` (Apps Script →
// Triggers → Add → choose function, type "Time-driven", "Day timer", any
// hour you prefer).
// =====================================================================
`.trim();
