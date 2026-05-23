import { app, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC } from '../shared/ipc';
import {
  countActivePolicies,
  countPremiumsDueInRange,
  createPolicy,
  deletePolicy,
  getPolicy,
  listPolicies,
  updatePolicy,
} from './repo/policies';
import {
  listAllPayments,
  listPaymentsByPolicy,
  markAllPaidUpTo,
  markOverdueInstallments,
  markPaid,
  updatePayment,
  upcomingPremiums,
} from './repo/payments';
import { countRemindersLast7Days, listReminderLog } from './repo/reminders';
import { readSettings, updateSettings } from './repo/settings';
import { sendNow as sendRemindersNow, testSmtp } from './email';
import {
  addAttachment,
  addAttachmentsFromPaths,
  getAttachmentPath,
  listAttachments,
  removeAttachment,
} from './repo/attachments';
import { generateTemplate, importTemplate } from './bulk';
import { exportAllPolicies } from './bulk-policies-export';
import {
  generateCloudSecret,
  scheduleAutoSync,
  sendCloudTestEmail,
  syncToSheet,
  testCloudConnection,
} from './cloud-sync';
import {
  cancelRepayment,
  createRepaymentBatch,
  deleteRepayment,
  generateMaturityRepayments,
  listRepaymentsWithPolicy,
  markRepaymentReceived,
  updateRepayment,
} from './repo/repayments';
import {
  generateRepaymentTemplate,
  importRepaymentTemplate,
} from './bulk-repayments';
import {
  buildOverview,
  buildSeries,
  currentMonthPayments,
  maturingPolicies,
  type Period,
} from './repo/dashboard';
import { format, addDays } from 'date-fns';
import { closeDb, getDb, getDbPath } from './db';
import { policies, premiumPayments, reminderLog, settings as settingsTable } from '../shared/db/schema';

const handle = <T>(channel: string, fn: (...args: any[]) => Promise<T> | T) => {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      console.error(`[ipc] ${channel} failed`, err);
      return { ok: false, error: (err as Error).message };
    }
  });
};

// Same as handle() but fires the debounced cloud auto-sync after a successful
// mutation. Use for any IPC that creates/updates/deletes DB data.
const handleMutate = <T>(channel: string, fn: (...args: any[]) => Promise<T> | T) => {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await fn(...args);
      scheduleAutoSync();
      return { ok: true, data };
    } catch (err) {
      console.error(`[ipc] ${channel} failed`, err);
      return { ok: false, error: (err as Error).message };
    }
  });
};

export const registerIpc = () => {
  // Settings
  handle(IPC.settingsGet, () => readSettings());
  handle(IPC.settingsUpdate, (patch: Parameters<typeof updateSettings>[0]) => {
    updateSettings(patch);
    if (patch && 'startAtLogin' in patch && patch.startAtLogin !== undefined) {
      app.setLoginItemSettings({ openAtLogin: !!patch.startAtLogin });
    }
    return readSettings();
  });
  handle(IPC.smtpTest, (input: Parameters<typeof testSmtp>[0]) => testSmtp(input));

  // Policies
  handle(IPC.policiesList, () => listPolicies());
  handle(IPC.policiesGet, (id: string) => getPolicy(id));
  handleMutate(IPC.policiesCreate, (input: any) => createPolicy(input));
  handleMutate(IPC.policiesUpdate, (id: string, input: any) => {
    updatePolicy(id, input);
    return getPolicy(id);
  });
  handleMutate(IPC.policiesDelete, (id: string) => deletePolicy(id));
  handleMutate(IPC.policiesSyncMaturity, (id: string) => generateMaturityRepayments(id));
  handle(IPC.policiesExportExcel, () => exportAllPolicies());

  // Cloud sync (Google Sheets + Apps Script)
  handle(IPC.cloudSync, () => syncToSheet());
  handle(IPC.cloudTest, () => testCloudConnection());
  handle(IPC.cloudTestEmail, () => sendCloudTestEmail());
  handle(IPC.cloudGenerateSecret, () => generateCloudSecret());

  // Local SMTP test email — sends a sample via Nodemailer to the agent email.
  handle(IPC.smtpSendTestEmail, async () => {
    const s = readSettings();
    if (!s.agentEmail) throw new Error('Set Agent email in Settings first');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const emailMod = require('./email') as typeof import('./email');
    // sendMail isn't exported; use a tiny wrapper through testSmtp's transport.
    // Simplest: piggyback on the runReminders path by directly calling nodemailer here.
    const nm = require('nodemailer') as typeof import('nodemailer');
    if (!s.smtpHost || !s.smtpPort || !s.smtpUser || !s.fromEmail) {
      throw new Error('SMTP host / port / user / from email must be set');
    }
    const { readSmtpPassword } = require('./repo/settings') as typeof import('./repo/settings');
    const pw = readSmtpPassword();
    if (!pw) throw new Error('SMTP password is not set');
    const tx = nm.createTransport({
      host: s.smtpHost,
      port: s.smtpPort,
      secure: s.smtpPort === 465,
      auth: { user: s.smtpUser, pass: pw },
    });
    await tx.sendMail({
      from: s.fromName ? `"${s.fromName}" <${s.fromEmail}>` : s.fromEmail,
      to: s.agentEmail,
      subject: 'PolicyHub: SMTP test email',
      text:
        'This is a test email from PolicyHub (local SMTP).\n\n' +
        'If you received this, your SMTP credentials are working — premium reminders will be delivered the same way.\n\n' +
        'Sent at: ' +
        new Date().toISOString(),
    });
    return { sent: true, to: s.agentEmail };
    // (emailMod kept as a reference to silence unused-var)
    void emailMod;
  });

  // Payments
  handle(IPC.paymentsListByPolicy, (policyId: string) => listPaymentsByPolicy(policyId));
  handle(IPC.paymentsListAll, (filters: any) => listAllPayments(filters));
  handleMutate(IPC.paymentsMarkPaid, (input: any) => markPaid(input));
  handleMutate(
    IPC.paymentsMarkAllPaidUpTo,
    (input: { policyId: string; upToDate: string; paymentMethod?: string }) =>
      markAllPaidUpTo(input.policyId, input.upToDate, input.paymentMethod),
  );
  handleMutate(IPC.paymentsUpdate, (input: any) => updatePayment(input));
  handle(IPC.paymentsUpcoming, (limit?: number) => upcomingPremiums(limit ?? 10));

  // Dashboard
  handle(IPC.dashboardMetrics, () => {
    markOverdueInstallments();
    const today = format(new Date(), 'yyyy-MM-dd');
    const in30 = format(addDays(new Date(), 30), 'yyyy-MM-dd');
    return {
      totalActivePolicies: countActivePolicies(),
      premiumsDueIn30Days: countPremiumsDueInRange(today, in30),
      remindersSentLast7Days: countRemindersLast7Days(),
    };
  });
  handle(
    IPC.dashboardOverview,
    (period: Period = 'monthly', range?: { from?: string; to?: string } | null) =>
      buildOverview(period, range ?? null),
  );
  handle(IPC.dashboardSeries, (period: Period = 'monthly') => buildSeries(period));
  handle(
    IPC.dashboardMaturing,
    (period: Period = 'monthly', range?: { from?: string; to?: string } | null) =>
      maturingPolicies(period, range ?? null),
  );
  handle(IPC.dashboardCurrentMonth, () => currentMonthPayments());

  // Reminders
  handle(IPC.remindersLog, (limit?: number) => listReminderLog(limit ?? 200));
  handle(IPC.remindersUpcoming, () => {
    const ups = upcomingPremiums(50);
    return ups.filter((u) => u.daysRemaining <= 30);
  });
  handle(IPC.remindersSendNow, () => sendRemindersNow());

  // Bulk payment template
  handle(IPC.bulkDownloadTemplate, () => generateTemplate());
  handleMutate(IPC.bulkImportTemplate, () => importTemplate());

  // Repayments
  handle(IPC.repaymentsList, (filters: any) => listRepaymentsWithPolicy(filters));
  handleMutate(IPC.repaymentsCreateBatch, (input: any) => createRepaymentBatch(input));
  handleMutate(IPC.repaymentsMarkReceived, (input: any) => markRepaymentReceived(input));
  handleMutate(IPC.repaymentsUpdate, (input: any) => updateRepayment(input));
  handleMutate(IPC.repaymentsCancel, (id: string) => cancelRepayment(id));
  handleMutate(IPC.repaymentsDelete, (id: string) => deleteRepayment(id));
  handle(IPC.repaymentsDownloadTemplate, () => generateRepaymentTemplate());
  handleMutate(IPC.repaymentsImportTemplate, () => importRepaymentTemplate());

  // Attachments
  handle(IPC.attachmentsList, (policyId: string) => listAttachments(policyId));
  handleMutate(IPC.attachmentsAdd, async (policyId: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Attach policy document(s)',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Policy documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (canceled || filePaths.length === 0) return null;
    return addAttachmentsFromPaths(policyId, filePaths);
  });
  // Pick-only: returns metadata for the picked files but does NOT touch the DB.
  // Used by the create wizard to stage files before a policy ID exists.
  handle(IPC.attachmentsPick, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Attach policy document(s)',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Policy documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (canceled || filePaths.length === 0) return [];
    return filePaths.map((p) => {
      let size = 0;
      try {
        size = require('node:fs').statSync(p).size;
      } catch {
        // ignore stat errors; renderer will display 0 bytes
      }
      return {
        path: p,
        fileName: require('node:path').basename(p),
        sizeBytes: size,
      };
    });
  });
  handleMutate(
    IPC.attachmentsCommitPaths,
    (input: { policyId: string; paths: string[] }) =>
      addAttachmentsFromPaths(input.policyId, input.paths),
  );
  handleMutate(IPC.attachmentsRemove, (id: string) => removeAttachment(id));
  handle(IPC.attachmentsOpen, async (id: string) => {
    const p = getAttachmentPath(id);
    if (!p) throw new Error('Attachment not found');
    const result = await shell.openPath(p);
    if (result) throw new Error(result); // non-empty string = error message
    return { opened: true };
  });

  // App
  handle(IPC.appQuit, () => {
    app.quit();
  });
  handle(IPC.appSetLoginItem, (enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
    updateSettings({ startAtLogin: enabled });
  });
  handle(IPC.appBackupDb, async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Backup database',
      defaultPath: `policies-backup-${format(new Date(), 'yyyyMMdd-HHmmss')}.db`,
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    });
    if (canceled || !filePath) return { saved: false };
    fs.copyFileSync(getDbPath(), filePath);
    return { saved: true, path: filePath };
  });
  handle(IPC.appResetData, async () => {
    const confirm = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancel', 'Reset everything'],
      defaultId: 0,
      cancelId: 0,
      title: 'Reset all data',
      message:
        'Are you absolutely sure? This deletes every policy, payment, repayment, attachment and setting on this device.',
      detail:
        'PolicyHub will quit and relaunch with an empty database. You will go through the setup wizard again. This cannot be undone.',
    });
    if (confirm.response !== 1) return { reset: false };

    // Close the DB so the file lock is released.
    closeDb();

    const userDataDir = app.getPath('userData');
    // Best-effort delete of everything PolicyHub owns under userData: the DB
    // files and the attachments folder. Cache / sessions are managed by
    // Chromium and we leave them alone.
    const itemsToDelete = [
      path.join(userDataDir, 'policies.db'),
      path.join(userDataDir, 'policies.db-wal'),
      path.join(userDataDir, 'policies.db-shm'),
      path.join(userDataDir, 'policies.db-journal'),
      path.join(userDataDir, 'attachments'),
    ];
    for (const p of itemsToDelete) {
      try {
        if (fs.existsSync(p)) {
          const stat = fs.statSync(p);
          if (stat.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
          else fs.unlinkSync(p);
        }
      } catch (err) {
        console.error('[reset] failed to delete', p, err);
      }
    }

    // Relaunch the app fresh.
    app.relaunch();
    app.exit(0);
    return { reset: true };
  });

  handle(IPC.appExportJson, async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export data as JSON',
      defaultPath: `policies-${format(new Date(), 'yyyyMMdd-HHmmss')}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { saved: false };
    const db = getDb();
    const data = {
      exportedAt: new Date().toISOString(),
      policies: db.select().from(policies).all(),
      premiumPayments: db.select().from(premiumPayments).all(),
      reminderLog: db.select().from(reminderLog).all(),
      settings: db.select().from(settingsTable).all(),
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return { saved: true, path: filePath };
  });
};
