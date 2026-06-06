import https from 'node:https';
import { URL } from 'node:url';
import crypto from 'node:crypto';
import { format } from 'date-fns';
import { getRawSqlite } from './db';
import {
  readCloudSheetSecret,
  readSettings,
  updateSettings,
} from './repo/settings';

// ---- HTTPS POST with redirect handling ----
// Google Apps Script Web App URLs return a 302 to a googleusercontent.com URL
// where the actual response is served. We follow up to 5 redirects.

type PostResult = {
  status: number;
  body: string;
};

const postJson = (url: string, body: string, maxRedirects = 5): Promise<PostResult> =>
  new Promise((resolve, reject) => {
    const doRequest = (currentUrl: string, depth: number, currentBody: string, method: 'POST' | 'GET') => {
      if (depth > maxRedirects) {
        reject(new Error(`Too many redirects (${maxRedirects})`));
        return;
      }
      let u: URL;
      try {
        u = new URL(currentUrl);
      } catch {
        reject(new Error(`Invalid URL: ${currentUrl}`));
        return;
      }
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (method === 'POST') {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(currentBody).toString();
      }
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method,
          headers,
          timeout: 30_000,
        },
        (res) => {
          // Redirect
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            // Follow with GET (Apps Script's 302 expects GET on the next hop).
            const next = new URL(res.headers.location, currentUrl).toString();
            res.resume();
            doRequest(next, depth + 1, '', 'GET');
            return;
          }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, body: data }),
          );
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('Request timed out after 30s'));
      });
      if (method === 'POST') req.write(currentBody);
      req.end();
    };
    doRequest(url, 0, body, 'POST');
  });

// ---- Payload assembly ----

const buildPayload = () => {
  const sqlite = getRawSqlite();
  const today = format(new Date(), 'yyyy-MM-dd');

  // Flip overdues so the snapshot in the Sheet is accurate.
  sqlite
    .prepare(
      `UPDATE premium_payments SET status='overdue', updated_at=CURRENT_TIMESTAMP
        WHERE status='pending' AND due_date < ?`,
    )
    .run(today);
  sqlite
    .prepare(
      `UPDATE repayments SET status='overdue', updated_at=CURRENT_TIMESTAMP
        WHERE status='pending' AND expected_date < ?`,
    )
    .run(today);

  const policies = sqlite
    .prepare(
      `SELECT id, policy_no AS policyNo, policy_holder AS policyHolder,
              holder_email AS holderEmail, holder_phone AS holderPhone,
              company_name AS companyName, plan_name AS planName,
              status, maturity_date AS maturityDate,
              sum_assured AS sumAssured, premium_amount AS premiumAmount,
              yearly_total_premium AS yearlyTotalPremium,
              payment_mode AS paymentMode,
              maturity_type AS maturityType
         FROM policies
        WHERE status IN ('active', 'active_ppt_over')
        ORDER BY policy_holder ASC`,
    )
    .all();

  const installments = sqlite
    .prepare(
      `SELECT pp.id, p.policy_no AS policyNo, p.policy_holder AS policyHolder,
              pp.installment_no AS installmentNo,
              pp.due_date AS dueDate,
              pp.expected_amount AS expectedAmount,
              pp.status,
              pp.paid_date AS paidDate,
              pp.paid_amount AS paidAmount
         FROM premium_payments pp
         JOIN policies p ON p.id = pp.policy_id
        WHERE pp.status IN ('pending','overdue')
           OR (pp.status = 'paid' AND pp.paid_date >= date('now','-90 days'))
        ORDER BY pp.due_date ASC`,
    )
    .all();

  const repayments = sqlite
    .prepare(
      `SELECT r.id, p.policy_no AS policyNo,
              r.title, r.expected_date AS expectedDate,
              r.amount, r.status,
              r.received_date AS receivedDate,
              r.received_amount AS receivedAmount
         FROM repayments r
         LEFT JOIN policies p ON p.id = r.policy_id
        WHERE r.status IN ('pending','overdue','received')
        ORDER BY r.expected_date ASC`,
    )
    .all();

  // Calendar / compliance events. Pushed in a separate field so an
  // Apps Script that doesn't yet handle them safely ignores it.
  const calendarEvents = sqlite
    .prepare(
      `SELECT id, title, category, custom_category AS customCategory,
              event_date AS eventDate, status, is_recurring AS isRecurring,
              frequency, occurrence_no AS occurrenceNo,
              occurrence_total AS occurrenceTotal,
              reminder_offsets_days AS reminderOffsetsDays,
              amount, notes
         FROM calendar_events
        WHERE deleted_at IS NULL
          AND status = 'pending'
        ORDER BY event_date ASC`,
    )
    .all();

  // Mutual Funds — active funds + their pending/overdue/recently-paid
  // SIP installments. Separate top-level keys so an older Apps Script
  // ignores them; the MF extension snippet (see cloud-sync-mf.ts)
  // teaches the script to consume them.
  const mutualFunds = sqlite
    .prepare(
      `SELECT id, folio_no AS folioNo, account_holder AS accountHolder,
              provider, scheme_name AS schemeName, type, amount,
              start_date AS startDate, installment_count AS installmentCount,
              status, agent_name AS agentName, agent_contact AS agentContact,
              debit_bank_name AS debitBankName, debit_account_no AS debitAccountNo
         FROM mutual_funds
        WHERE status = 'active' AND deleted_at IS NULL
        ORDER BY account_holder ASC`,
    )
    .all();

  const mfInstallments = sqlite
    .prepare(
      `SELECT mp.id, m.folio_no AS folioNo, m.account_holder AS accountHolder,
              m.provider, m.scheme_name AS schemeName, m.type,
              mp.installment_no AS installmentNo,
              mp.due_date AS dueDate,
              mp.expected_amount AS expectedAmount,
              mp.status,
              mp.paid_date AS paidDate,
              mp.paid_amount AS paidAmount
         FROM mutual_fund_payments mp
         JOIN mutual_funds m ON m.id = mp.mutual_fund_id
        WHERE m.deleted_at IS NULL
          AND (mp.status IN ('pending','overdue')
               OR (mp.status = 'paid' AND mp.paid_date >= date('now','-90 days')))
        ORDER BY mp.due_date ASC`,
    )
    .all();

  return {
    policies,
    installments,
    repayments,
    calendarEvents,
    mutualFunds,
    mfInstallments,
  };
};

// ---- Public API ----

export type CloudSyncResult = {
  ok: boolean;
  counts?: { policies: number; installments: number; repayments: number };
  error?: string;
  status?: number;
};

const send = async (
  kind: 'sync' | 'test',
): Promise<CloudSyncResult> => {
  const settings = readSettings();
  const url = settings.cloudSheetUrl;
  if (!url) return { ok: false, error: 'No Web App URL configured' };
  const secret = readCloudSheetSecret();
  if (!secret) return { ok: false, error: 'No shared secret configured' };

  const payload: Record<string, any> = { kind, secret, source: 'PolicyHub' };
  if (kind === 'sync') {
    const {
      policies,
      installments,
      repayments,
      calendarEvents,
      mutualFunds,
      mfInstallments,
    } = buildPayload();
    payload.policies = policies;
    payload.installments = installments;
    payload.repayments = repayments;
    payload.calendarEvents = calendarEvents;
    payload.mutualFunds = mutualFunds;
    payload.mfInstallments = mfInstallments;
  }

  try {
    const res = await postJson(url, JSON.stringify(payload));

    // Detect Google's "you must be signed in" HTML response. That's what shows
    // up when the deployment isn't "Anyone with the link".
    const looksLikeGoogleLogin =
      /<!doctype html/i.test(res.body) &&
      (/accounts\.google\.com/i.test(res.body) ||
        /Sign in/i.test(res.body) ||
        res.status === 401 ||
        res.status === 403);
    if (looksLikeGoogleLogin) {
      return {
        ok: false,
        status: res.status,
        error:
          "Google is asking us to sign in — the deployment isn't open. Fix: open the Apps Script editor → Deploy → Manage deployments → edit the active one → set 'Who has access' to 'Anyone with the link'. Save and re-deploy, then paste the NEW URL here.",
      };
    }

    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}: ${res.body.slice(0, 300)}`,
      };
    }
    let json: any;
    try {
      json = JSON.parse(res.body);
    } catch {
      // Apps Script might return HTML for an unauthenticated deployment.
      return {
        ok: false,
        error:
          "Response wasn't JSON. Check the deployment is set to 'Anyone with the link' and the URL ends in /exec.",
      };
    }
    if (!json.ok) {
      return { ok: false, error: json.error ?? 'Unknown error' };
    }
    if (kind === 'sync') {
      updateSettings({
        cloudLastSyncedAt: new Date().toISOString(),
      });
    }
    return { ok: true, counts: json.counts };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
};

export const syncToSheet = (): Promise<CloudSyncResult> => send('sync');
export const testCloudConnection = (): Promise<CloudSyncResult> => send('test');

// Trigger Apps Script's sendReminders immediately, bypassing the day-of-month
// check. Returns the summary { attempted, succeeded, failed } from the script.
export type CloudReminderSummary = {
  ok: boolean;
  summary?: { attempted: number; succeeded: number; failed: number; skipped?: boolean; reason?: string };
  error?: string;
};

export const forceCloudReminders = async (): Promise<CloudReminderSummary> => {
  const settings = readSettings();
  if (!settings.cloudSheetUrl) return { ok: false, error: 'No Web App URL configured' };
  const secret = readCloudSheetSecret();
  if (!secret) return { ok: false, error: 'No shared secret configured' };
  const payload = { kind: 'forceReminders', secret, source: 'PolicyHub' };
  try {
    const res = await postJson(settings.cloudSheetUrl, JSON.stringify(payload));
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 300)}` };
    }
    let json: any;
    try { json = JSON.parse(res.body); } catch {
      return {
        ok: false,
        error: "Response wasn't JSON. Re-paste the latest Apps Script (it must include the 'forceReminders' kind) and re-deploy.",
      };
    }
    if (!json.ok) return { ok: false, error: json.error ?? 'Unknown error' };
    return { ok: true, summary: json.summary };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
};

// Apps Script sends a sample email to agent_email cell in the Sheet's Settings tab.
export const sendCloudTestEmail = async (): Promise<CloudSyncResult> => {
  const settings = readSettings();
  if (!settings.cloudSheetUrl) return { ok: false, error: 'No Web App URL configured' };
  const secret = readCloudSheetSecret();
  if (!secret) return { ok: false, error: 'No shared secret configured' };

  const payload = { kind: 'testEmail', secret, source: 'PolicyHub' };
  try {
    const res = await postJson(settings.cloudSheetUrl, JSON.stringify(payload));
    if (res.status < 200 || res.status >= 300) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}: ${res.body.slice(0, 300)}` };
    }
    let json: any;
    try { json = JSON.parse(res.body); } catch {
      return {
        ok: false,
        error: "Response wasn't JSON. Re-deploy the script (Anyone with the link) and use the new URL.",
      };
    }
    if (!json.ok) return { ok: false, error: json.error ?? 'Unknown error' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
};

// Helper to generate a random 32-byte hex secret.
export const generateCloudSecret = (): string =>
  crypto.randomBytes(24).toString('base64url');

// ---- Debounced auto-sync (fires after a write IF cloud_sync_on_change is on) ----

let autoSyncTimer: NodeJS.Timeout | null = null;
let autoSyncInFlight = false;
const AUTO_SYNC_DEBOUNCE_MS = 5_000;

export const scheduleAutoSync = () => {
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(async () => {
    autoSyncTimer = null;
    if (autoSyncInFlight) {
      // Another sync was running; schedule another tick after it ends.
      scheduleAutoSync();
      return;
    }
    try {
      const s = readSettings();
      if (!s.cloudSyncOnChange) return;
      if (!s.cloudSheetUrl || !s.cloudSheetSecretSet) return;
      autoSyncInFlight = true;
      const res = await syncToSheet();
      if (!res.ok) console.error('[cloud] auto-sync failed:', res.error);
    } catch (err) {
      console.error('[cloud] auto-sync threw:', err);
    } finally {
      autoSyncInFlight = false;
    }
  }, AUTO_SYNC_DEBOUNCE_MS);
};
