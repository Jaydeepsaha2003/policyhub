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
    update: (
      id: string,
      input: unknown,
      opts?: { regenerateScope?: 'future_only' | 'including_overdue' },
    ) => invoke(IPC.policiesUpdate, id, input, opts),
    remove: (id: string) => invoke(IPC.policiesDelete, id),
    syncMaturity: (id: string) =>
      invoke<{ created: number; removed: number }>(IPC.policiesSyncMaturity, id),
    exportExcel: (opts?: { policyIds?: string[] }) =>
      invoke<{ saved: boolean; path?: string; rowCount?: number }>(
        IPC.policiesExportExcel,
        opts,
      ),
    downloadTemplate: () =>
      invoke<{ saved: boolean; path?: string }>(IPC.policiesDownloadTemplate),
    importTemplate: () =>
      invoke<{
        picked: boolean;
        file?: string;
        totalRows: number;
        created: number;
        skipped: number;
        errors: { row: number; reason: string; policyNo?: string }[];
      }>(IPC.policiesImportTemplate),
    listDeleted: () => invoke<any[]>(IPC.policiesListDeleted),
    restore: (id: string) => invoke(IPC.policiesRestore, id),
    purge: (id: string) => invoke(IPC.policiesPurge, id),
  },
  valuation: {
    exportExcel: (rows: unknown[], mfRows?: unknown[]) =>
      invoke<{ saved: boolean; path?: string; rowCount?: number }>(
        IPC.valuationExportExcel,
        rows,
        mfRows,
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
    downloadTemplate: (opts?: { paymentIds?: string[] }) =>
      invoke(IPC.bulkDownloadTemplate, opts),
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
  mutualFunds: {
    list: () => invoke<any[]>(IPC.mutualFundsList),
    get: (id: string) => invoke(IPC.mutualFundsGet, id),
    create: (input: unknown) => invoke(IPC.mutualFundsCreate, input),
    update: (
      id: string,
      input: unknown,
      opts?: { regenerateScope?: 'future_only' | 'including_overdue' },
    ) => invoke(IPC.mutualFundsUpdate, id, input, opts),
    remove: (id: string) => invoke(IPC.mutualFundsDelete, id),
    listDeleted: () => invoke<any[]>(IPC.mutualFundsListDeleted),
    restore: (id: string) => invoke(IPC.mutualFundsRestore, id),
    purge: (id: string) => invoke(IPC.mutualFundsPurge, id),
    exportExcel: (opts?: { mutualFundIds?: string[] }) =>
      invoke<{ saved: boolean; path?: string; rowCount?: number }>(
        IPC.mutualFundsExportExcel,
        opts,
      ),
  },
  mfPayments: {
    listByFund: (mutualFundId: string) =>
      invoke<any[]>(IPC.mfPaymentsListByFund, mutualFundId),
    listAll: (filters?: unknown) => invoke<any[]>(IPC.mfPaymentsListAll, filters),
    markPaid: (input: unknown) => invoke(IPC.mfPaymentsMarkPaid, input),
    update: (input: unknown) => invoke(IPC.mfPaymentsUpdate, input),
  },
  calendar: {
    list: (filters?: unknown) => invoke<any[]>(IPC.calendarList, filters),
    get: (id: string) => invoke(IPC.calendarGet, id),
    create: (input: unknown) => invoke(IPC.calendarCreate, input),
    update: (id: string, input: unknown) => invoke(IPC.calendarUpdate, id, input),
    markCompleted: (id: string, completedDate?: string) =>
      invoke(IPC.calendarMarkCompleted, id, completedDate),
    markPending: (id: string) => invoke(IPC.calendarMarkPending, id),
    markSkipped: (id: string) => invoke(IPC.calendarMarkSkipped, id),
    remove: (id: string) => invoke(IPC.calendarDelete, id),
    removeSeries: (id: string) => invoke(IPC.calendarDeleteSeries, id),
    listDeleted: () => invoke<any[]>(IPC.calendarListDeleted),
    restore: (id: string) => invoke(IPC.calendarRestore, id),
    purge: (id: string) => invoke(IPC.calendarPurge, id),
    appsScript: () => invoke<string>(IPC.calendarAppsScript),
    exportExcel: (opts?: { eventIds?: string[] }) =>
      invoke<{ saved: boolean; path?: string; rowCount?: number }>(
        IPC.calendarExportExcel,
        opts,
      ),
  },
  calendarCategories: {
    list: () => invoke<any[]>(IPC.calendarCategoriesList),
    create: (input: { label: string; colorKey: string }) =>
      invoke(IPC.calendarCategoriesCreate, input),
    update: (id: string, patch: { label?: string; colorKey?: string }) =>
      invoke(IPC.calendarCategoriesUpdate, id, patch),
    remove: (id: string) => invoke(IPC.calendarCategoriesDelete, id),
  },
  exportEverything: () =>
    invoke<{ saved: boolean; path?: string; sheets?: Record<string, number> }>(
      IPC.exportEverything,
    ),
  paymentsExportWorkbook: (opts?: { paymentIds?: string[]; mfPaymentIds?: string[] }) =>
    invoke<{ saved: boolean; path?: string; sheets?: Record<string, number> }>(
      IPC.paymentsExportWorkbook,
      opts,
    ),
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
    importDb: () =>
      invoke<{ imported: boolean; backedUpTo?: string }>(IPC.appImportDb),
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
