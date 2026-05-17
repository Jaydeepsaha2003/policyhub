import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

const invoke = async <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>;
  if (!res.ok) throw new Error(res.error);
  return res.data;
};

const api = {
  settings: {
    get: () => invoke(IPC.settingsGet),
    update: (patch: unknown) => invoke(IPC.settingsUpdate, patch),
    testSmtp: (input: unknown) => invoke(IPC.smtpTest, input),
  },
  policies: {
    list: () => invoke(IPC.policiesList),
    get: (id: string) => invoke(IPC.policiesGet, id),
    create: (input: unknown) => invoke<string>(IPC.policiesCreate, input),
    update: (id: string, input: unknown) => invoke(IPC.policiesUpdate, id, input),
    remove: (id: string) => invoke(IPC.policiesDelete, id),
  },
  payments: {
    listByPolicy: (policyId: string) => invoke(IPC.paymentsListByPolicy, policyId),
    listAll: (filters?: unknown) => invoke(IPC.paymentsListAll, filters),
    markPaid: (input: unknown) => invoke(IPC.paymentsMarkPaid, input),
    markAllPaidUpTo: (input: { policyId: string; upToDate: string; paymentMethod?: string }) =>
      invoke<number>(IPC.paymentsMarkAllPaidUpTo, input),
    upcoming: (limit?: number) => invoke(IPC.paymentsUpcoming, limit),
  },
  dashboard: {
    metrics: () => invoke(IPC.dashboardMetrics),
    overview: (period?: 'monthly' | 'quarterly' | 'yearly') =>
      invoke(IPC.dashboardOverview, period ?? 'monthly'),
    series: (period?: 'monthly' | 'quarterly' | 'yearly') =>
      invoke(IPC.dashboardSeries, period ?? 'monthly'),
    maturing: (period?: 'monthly' | 'quarterly' | 'yearly') =>
      invoke(IPC.dashboardMaturing, period ?? 'monthly'),
    currentMonth: () => invoke(IPC.dashboardCurrentMonth),
  },
  reminders: {
    log: (limit?: number) => invoke(IPC.remindersLog, limit),
    upcoming: () => invoke(IPC.remindersUpcoming),
    sendNow: () => invoke(IPC.remindersSendNow),
  },
  app: {
    quit: () => invoke(IPC.appQuit),
    setLoginItem: (enabled: boolean) => invoke(IPC.appSetLoginItem, enabled),
    backupDb: () => invoke(IPC.appBackupDb),
    exportJson: () => invoke(IPC.appExportJson),
  },
};

try {
  contextBridge.exposeInMainWorld('policyhub', api);
  console.log('[preload] window.policyhub exposed');
} catch (err) {
  console.error('[preload] failed to expose API', err);
}

export type PolicyHubApi = typeof api;
