/**
 * PolicyHub — Cloud reminders Apps Script.
 *
 * One-time setup (see docs/cloud-reminders/setup.md):
 *   1. Open a NEW Google Sheet in the Google account you want to use.
 *   2. Extensions → Apps Script.
 *   3. Delete the default Code.gs contents, paste THIS FILE.
 *   4. Save (disk icon), give the script a name (e.g. "PolicyHub").
 *   5. In the Apps Script editor, click ▶ next to the function name dropdown,
 *      pick "setup", and run it. Approve the permission prompts (Sheets +
 *      Gmail).
 *   6. Click Deploy → New deployment → Type: Web app.
 *      - Description: PolicyHub sync
 *      - Execute as: Me
 *      - Who has access: Anyone with the link
 *      → Deploy → copy the URL (ends with /exec).
 *   7. Paste the URL into PolicyHub → Settings → Cloud reminders.
 *   8. Click "Generate" in PolicyHub to make a shared secret. Paste it into
 *      the Sheet's "Settings" tab cell B1. (The Sheet's tab is created on
 *      first run of setup().)
 *   9. Click "Test connection" in PolicyHub → should say Connection OK.
 *  10. Click "Sync now" → check the Sheet, you should see your data.
 */

const SETTINGS_TAB = 'Settings';
const POLICIES_TAB = 'Policies';
const INSTALLMENTS_TAB = 'Installments';
const REPAYMENTS_TAB = 'Repayments';
const SYNC_LOG_TAB = 'SyncLog';
const REMINDER_LOG_TAB = 'ReminderLog';

const REMINDER_DAYS_OF_MONTH = [1, 10, 20];
const REMINDER_HOUR_LOCAL = 9; // 9 a.m. in the script's timezone

// --- Setup ---

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  ensureTab(ss, SETTINGS_TAB, [
    ['Key', 'Value'],
    ['shared_secret', ''],
    ['agent_email', ''],
    ['from_name', 'PolicyHub'],
    ['subject_prefix', 'PolicyHub'],
  ]);
  ensureTab(ss, POLICIES_TAB, [[
    'id', 'policyNo', 'policyHolder', 'holderEmail', 'holderPhone',
    'companyName', 'planName', 'status', 'maturityDate',
    'sumAssured', 'premiumAmount', 'yearlyTotalPremium',
    'paymentMode', 'maturityType',
  ]]);
  ensureTab(ss, INSTALLMENTS_TAB, [[
    'id', 'policyNo', 'policyHolder', 'installmentNo',
    'dueDate', 'expectedAmount', 'status', 'paidDate', 'paidAmount',
  ]]);
  ensureTab(ss, REPAYMENTS_TAB, [[
    'id', 'policyNo', 'title', 'expectedDate',
    'amount', 'status', 'receivedDate', 'receivedAmount',
  ]]);
  ensureTab(ss, SYNC_LOG_TAB, [[
    'syncTime', 'source', 'policies', 'installments', 'repayments', 'status',
  ]]);
  ensureTab(ss, REMINDER_LOG_TAB, [[
    'sentTime', 'dayOfMonth', 'to', 'dueCount', 'overdueCount', 'status', 'error',
  ]]);

  // Daily reminder trigger.
  const existing = ScriptApp.getProjectTriggers();
  const hasReminderTrigger = existing.some(
    (t) => t.getHandlerFunction() === 'sendReminders',
  );
  if (!hasReminderTrigger) {
    ScriptApp.newTrigger('sendReminders')
      .timeBased()
      .everyDays(1)
      .atHour(REMINDER_HOUR_LOCAL)
      .create();
  }

  SpreadsheetApp.getUi().alert(
    'PolicyHub setup complete.\n\n' +
      'Next steps:\n' +
      '  1. Deploy this script as a Web App (Deploy → New deployment → Web app).\n' +
      '  2. Paste the URL into PolicyHub → Settings → Cloud reminders.\n' +
      '  3. Generate a secret in PolicyHub and paste it into this Sheet\'s\n' +
      '     "Settings" tab → cell B1 (next to "shared_secret").\n' +
      '  4. Set "agent_email" (cell B2) to the email that should receive reminders.\n' +
      '  5. Click "Test connection" in PolicyHub, then "Sync now".',
  );
}

function ensureTab(ss, name, header) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0 && header && header.length) {
    sheet.getRange(1, 1, header.length, header[0].length).setValues(header);
    sheet.getRange(1, 1, 1, header[0].length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// --- Web App endpoint (called by PolicyHub) ---

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const settings = readSettings(ss);

    if (!settings.shared_secret) {
      return jsonResponse({
        ok: false,
        error:
          'No shared_secret set in the Sheet\'s Settings tab. Paste the value from PolicyHub into cell B1.',
      });
    }
    if (body.secret !== settings.shared_secret) {
      return jsonResponse({ ok: false, error: 'Invalid secret' });
    }

    if (body.kind === 'test') {
      return jsonResponse({ ok: true, version: '1.0' });
    }

    if (body.kind === 'sync') {
      writeTable(ss, POLICIES_TAB, body.policies || []);
      writeTable(ss, INSTALLMENTS_TAB, body.installments || []);
      writeTable(ss, REPAYMENTS_TAB, body.repayments || []);

      const counts = {
        policies: (body.policies || []).length,
        installments: (body.installments || []).length,
        repayments: (body.repayments || []).length,
      };
      logSync(ss, body.source || 'PolicyHub', counts, 'OK');
      return jsonResponse({ ok: true, counts });
    }

    return jsonResponse({ ok: false, error: 'Unknown kind: ' + body.kind });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function readSettings(ss) {
  const sheet = ss.getSheetByName(SETTINGS_TAB);
  if (!sheet) return {};
  const values = sheet.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < values.length; i++) {
    if (values[i][0]) out[String(values[i][0])] = values[i][1];
  }
  return out;
}

function writeTable(ss, name, rows) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return;
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length === 0) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = rows.map((r) =>
    headers.map((h) => {
      const key = String(h);
      const v = r[key];
      // Convert paise → rupees for amount columns so the Sheet shows rupees.
      if (
        v !== null &&
        v !== undefined &&
        (key === 'sumAssured' ||
          key === 'premiumAmount' ||
          key === 'yearlyTotalPremium' ||
          key === 'expectedAmount' ||
          key === 'paidAmount' ||
          key === 'amount' ||
          key === 'receivedAmount')
      ) {
        return Number(v) / 100;
      }
      return v === undefined || v === null ? '' : v;
    }),
  );
  sheet.getRange(2, 1, data.length, headers.length).setValues(data);
}

function logSync(ss, source, counts, status) {
  const sheet = ss.getSheetByName(SYNC_LOG_TAB);
  if (!sheet) return;
  sheet.appendRow([
    new Date(),
    source,
    counts.policies || 0,
    counts.installments || 0,
    counts.repayments || 0,
    status,
  ]);
}

// --- Daily reminder trigger ---

function sendReminders() {
  const today = new Date();
  const dayOfMonth = today.getDate();
  if (REMINDER_DAYS_OF_MONTH.indexOf(dayOfMonth) === -1) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = readSettings(ss);
  const to = settings.agent_email;
  const fromName = settings.from_name || 'PolicyHub';
  const subjectPrefix = settings.subject_prefix || 'PolicyHub';
  if (!to) {
    logReminder(ss, dayOfMonth, '(missing agent_email)', 0, 0, 'SKIP', 'No agent_email set');
    return;
  }

  const installments = readTable(ss, INSTALLMENTS_TAB);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const due = [];
  const overdue = [];
  for (const r of installments) {
    if (r.status === 'paid') continue;
    if (!r.dueDate) continue;
    const dueDate = new Date(r.dueDate);
    if (isNaN(dueDate.getTime())) continue;
    if (dueDate >= monthStart && dueDate <= monthEnd) due.push(r);
    else if (dueDate < monthStart) overdue.push(r);
  }

  if (due.length === 0 && overdue.length === 0) {
    logReminder(ss, dayOfMonth, to, 0, 0, 'OK', 'Nothing to report');
    return;
  }

  const monthLabel = Utilities.formatDate(
    today,
    Session.getScriptTimeZone(),
    'MMMM yyyy',
  );
  const subject = subjectPrefix + ': Premium summary for ' + monthLabel + ' (day ' + dayOfMonth + ')';

  let body = 'Premium summary for ' + monthLabel + '\n\n';
  body += 'DUE THIS MONTH (' + due.length + '):\n';
  body += formatRows(due) + '\n\n';
  body += 'OVERDUE (' + overdue.length + '):\n';
  body += formatRows(overdue) + '\n\n';
  body += '— sent automatically by ' + fromName + ' on day ' + dayOfMonth + ' of the month.';

  try {
    MailApp.sendEmail({ to: to, subject: subject, body: body, name: fromName });
    logReminder(ss, dayOfMonth, to, due.length, overdue.length, 'OK', '');
  } catch (err) {
    logReminder(ss, dayOfMonth, to, due.length, overdue.length, 'FAIL', String(err));
  }
}

function formatRows(rows) {
  if (rows.length === 0) return '  (none)';
  return rows
    .map(function (r) {
      const amount =
        typeof r.expectedAmount === 'number'
          ? '₹' + r.expectedAmount.toLocaleString('en-IN')
          : r.expectedAmount;
      const dateStr = r.dueDate
        ? Utilities.formatDate(new Date(r.dueDate), Session.getScriptTimeZone(), 'dd MMM yyyy')
        : '';
      return '  - ' + r.policyNo + ' | ' + r.policyHolder + ' | ' + dateStr + ' | ' + amount;
    })
    .join('\n');
}

function readTable(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) {
      obj[h] = row[i];
    });
    return obj;
  });
}

function logReminder(ss, dayOfMonth, to, dueCount, overdueCount, status, error) {
  const sheet = ss.getSheetByName(REMINDER_LOG_TAB);
  if (!sheet) return;
  sheet.appendRow([new Date(), dayOfMonth, to, dueCount, overdueCount, status, error || '']);
}

// --- Manual helpers (run from the Apps Script editor for debugging) ---

function testSendNow() {
  // Pretend today is a reminder day for testing.
  sendReminders.apply(this, arguments);
}
