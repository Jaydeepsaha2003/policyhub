import { app, dialog, ipcMain } from 'electron';
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
  upcomingPremiums,
} from './repo/payments';
import { countRemindersLast7Days, listReminderLog } from './repo/reminders';
import { readSettings, updateSettings } from './repo/settings';
import { sendNow as sendRemindersNow, testSmtp } from './email';
import {
  buildOverview,
  buildSeries,
  currentMonthPayments,
  maturingPolicies,
  type Period,
} from './repo/dashboard';
import { format, addDays } from 'date-fns';
import { getDb, getDbPath } from './db';
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
  handle(IPC.policiesCreate, (input: any) => createPolicy(input));
  handle(IPC.policiesUpdate, (id: string, input: any) => {
    updatePolicy(id, input);
    return getPolicy(id);
  });
  handle(IPC.policiesDelete, (id: string) => deletePolicy(id));

  // Payments
  handle(IPC.paymentsListByPolicy, (policyId: string) => listPaymentsByPolicy(policyId));
  handle(IPC.paymentsListAll, (filters: any) => listAllPayments(filters));
  handle(IPC.paymentsMarkPaid, (input: any) => markPaid(input));
  handle(
    IPC.paymentsMarkAllPaidUpTo,
    (input: { policyId: string; upToDate: string; paymentMethod?: string }) =>
      markAllPaidUpTo(input.policyId, input.upToDate, input.paymentMethod),
  );
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
  handle(IPC.dashboardOverview, (period: Period = 'monthly') => buildOverview(period));
  handle(IPC.dashboardSeries, (period: Period = 'monthly') => buildSeries(period));
  handle(IPC.dashboardMaturing, (period: Period = 'monthly') => maturingPolicies(period));
  handle(IPC.dashboardCurrentMonth, () => currentMonthPayments());

  // Reminders
  handle(IPC.remindersLog, (limit?: number) => listReminderLog(limit ?? 200));
  handle(IPC.remindersUpcoming, () => {
    const ups = upcomingPremiums(50);
    return ups.filter((u) => u.daysRemaining <= 30);
  });
  handle(IPC.remindersSendNow, () => sendRemindersNow());

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
