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
    syncMaturity: (id: string) =>
      invoke<{ created: number; removed: number }>(IPC.policiesSyncMaturity, id),
    exportExcel: () =>
      invoke<{ saved: boolean; path?: string; rowCount?: number }>(IPC.policiesExportExcel),
  },
  valuation: {
    exportExcel: (rows: unknown[]) =>
      invoke<{ saved: boolean; path?: string; rowCount?: number }>(
        IPC.valuationExportExcel,
        rows,
      ),
  },
  payments: {
    listByPolicy: (policyId: string) => invoke(IPC.paymentsListByPolicy, policyId),
    listAll: (filters?: unknown) => invoke(IPC.paymentsListAll, filters),
    markPaid: (input: unknown) => invoke(IPC.paymentsMarkPaid, input),
    markAllPaidUpTo: (input: { policyId: string; upToDate: string; paymentMethod?: string }) =>
      invoke<number>(IPC.paymentsMarkAllPaidUpTo, input),
    update: (input: unknown) => invoke(IPC.paymentsUpdate, input),
    upcoming: (limit?: number) => invoke(IPC.paymentsUpcoming, limit),
  },
  dashboard: {
    metrics: () => invoke(IPC.dashboardMetrics),
    overview: (
      period?: 'monthly' | 'quarterly' | 'yearly',
      range?: { from?: string; to?: string } | null,
    ) => invoke(IPC.dashboardOverview, period ?? 'monthly', range ?? null),
    series: (period?: 'monthly' | 'quarterly' | 'yearly') =>
      invoke(IPC.dashboardSeries, period ?? 'monthly'),
    maturing: (
      period?: 'monthly' | 'quarterly' | 'yearly',
      range?: { from?: string; to?: string } | null,
    ) => invoke(IPC.dashboardMaturing, period ?? 'monthly', range ?? null),
    currentMonth: () => invoke(IPC.dashboardCurrentMonth),
  },
  reminders: {
    log: (limit?: number) => invoke(IPC.remindersLog, limit),
    upcoming: () => invoke(IPC.remindersUpcoming),
    sendNow: () => invoke(IPC.remindersSendNow),
  },
  bulk: {
    downloadTemplate: () => invoke(IPC.bulkDownloadTemplate),
    importTemplate: () => invoke(IPC.bulkImportTemplate),
  },
  repayments: {
    list: (filters?: unknown) => invoke(IPC.repaymentsList, filters),
    createBatch: (input: unknown) => invoke(IPC.repaymentsCreateBatch, input),
    markReceived: (input: unknown) => invoke(IPC.repaymentsMarkReceived, input),
    update: (input: unknown) => invoke(IPC.repaymentsUpdate, input),
    cancel: (id: string) => invoke(IPC.repaymentsCancel, id),
    remove: (id: string) => invoke(IPC.repaymentsDelete, id),
    downloadTemplate: () => invoke(IPC.repaymentsDownloadTemplate),
    importTemplate: () => invoke(IPC.repaymentsImportTemplate),
  },
  attachments: {
    list: (policyId: string) => invoke(IPC.attachmentsList, policyId),
    add: (policyId: string) => invoke(IPC.attachmentsAdd, policyId),
    pick: () => invoke(IPC.attachmentsPick),
    commitPaths: (input: { policyId: string; paths: string[] }) =>
      invoke(IPC.attachmentsCommitPaths, input),
    remove: (id: string) => invoke(IPC.attachmentsRemove, id),
    open: (id: string) => invoke(IPC.attachmentsOpen, id),
  },
  app: {
    quit: () => invoke(IPC.appQuit),
    setLoginItem: (enabled: boolean) => invoke(IPC.appSetLoginItem, enabled),
    backupDb: () => invoke(IPC.appBackupDb),
    exportJson: () => invoke(IPC.appExportJson),
    resetData: () => invoke<{ reset: boolean }>(IPC.appResetData),
  },
  cloud: {
    sync: () =>
      invoke<{
        ok: boolean;
        counts?: { policies: number; installments: number; repayments: number };
        error?: string;
      }>(IPC.cloudSync),
    test: () =>
      invoke<{ ok: boolean; error?: string }>(IPC.cloudTest),
    testEmail: () =>
      invoke<{ ok: boolean; error?: string }>(IPC.cloudTestEmail),
    forceReminders: () =>
      invoke<{
        ok: boolean;
        summary?: { attempted: number; succeeded: number; failed: number; skipped?: boolean; reason?: string };
        error?: string;
      }>(IPC.cloudForceReminders),
    generateSecret: () => invoke<string>(IPC.cloudGenerateSecret),
  },
  smtp: {
    sendTestEmail: () =>
      invoke<{ sent: boolean; to: string }>(IPC.smtpSendTestEmail),
  },
};

try {
  contextBridge.exposeInMainWorld('policyhub', api);
  console.log('[preload] window.policyhub exposed');
} catch (err) {
  console.error('[preload] failed to expose API', err);
}

export type PolicyHubApi = typeof api;
