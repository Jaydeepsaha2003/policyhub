// Renderer-side declaration of the API exposed by preload.
// Kept in sync with src/preload/preload.ts by hand to avoid pulling
// electron / Node types into the renderer typecheck.

type PolicyHubApi = {
  settings: {
    get: () => Promise<any>;
    update: (patch: any) => Promise<any>;
    testSmtp: (input: any) => Promise<void>;
  };
  policies: {
    list: () => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (input: any) => Promise<string>;
    update: (
      id: string,
      input: any,
      opts?: { regenerateScope?: 'future_only' | 'including_overdue' },
    ) => Promise<any>;
    remove: (id: string) => Promise<void>;
    syncMaturity: (id: string) => Promise<{ created: number; removed: number }>;
    exportExcel: (opts?: {
      policyIds?: string[];
    }) => Promise<{ saved: boolean; path?: string; rowCount?: number }>;
    downloadTemplate: () => Promise<{ saved: boolean; path?: string }>;
    importTemplate: () => Promise<{
      picked: boolean;
      file?: string;
      totalRows: number;
      created: number;
      skipped: number;
      errors: { row: number; reason: string; policyNo?: string }[];
    }>;
    listDeleted: () => Promise<any[]>;
    restore: (id: string) => Promise<void>;
    purge: (id: string) => Promise<void>;
  };
  valuation: {
    exportExcel: (
      rows: unknown[],
      mfRows?: unknown[],
    ) => Promise<{ saved: boolean; path?: string; rowCount?: number }>;
  };
  payments: {
    listByPolicy: (policyId: string) => Promise<any[]>;
    listAll: (filters?: any) => Promise<any[]>;
    markPaid: (input: any) => Promise<void>;
    markAllPaidUpTo: (input: {
      policyId: string;
      upToDate: string;
      paymentMethod?: string;
    }) => Promise<number>;
    update: (input: any) => Promise<void>;
    upcoming: (limit?: number) => Promise<any[]>;
  };
  dashboard: {
    metrics: () => Promise<any>;
    overview: (
      period?: 'monthly' | 'quarterly' | 'yearly',
      range?: { from?: string; to?: string } | null,
    ) => Promise<any>;
    series: (period?: 'monthly' | 'quarterly' | 'yearly') => Promise<any[]>;
    maturing: (
      period?: 'monthly' | 'quarterly' | 'yearly',
      range?: { from?: string; to?: string } | null,
    ) => Promise<any[]>;
    currentMonth: () => Promise<any[]>;
  };
  reminders: {
    log: (limit?: number) => Promise<any[]>;
    upcoming: () => Promise<any[]>;
    sendNow: () => Promise<{ attempted: number; succeeded: number; failed: number }>;
  };
  bulk: {
    downloadTemplate: (opts?: {
      paymentIds?: string[];
    }) => Promise<{ saved: boolean; path?: string; rowCount?: number }>;
    importTemplate: () => Promise<{
      picked: boolean;
      file?: string;
      totalRows: number;
      updated: number;
      skipped: number;
      errors: { row: number; reason: string; policyNo?: string; installmentNo?: number }[];
    }>;
  };
  repayments: {
    list: (filters?: any) => Promise<any[]>;
    createBatch: (input: any) => Promise<string[]>;
    markReceived: (input: any) => Promise<void>;
    update: (input: any) => Promise<void>;
    cancel: (id: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
    downloadTemplate: () => Promise<{ saved: boolean; path?: string; rowCount?: number }>;
    importTemplate: () => Promise<{
      picked: boolean;
      file?: string;
      totalRows: number;
      updated: number;
      skipped: number;
      errors: { row: number; reason: string }[];
    }>;
  };
  mutualFunds: {
    list: () => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (input: any) => Promise<any>;
    update: (
      id: string,
      input: any,
      opts?: { regenerateScope?: 'future_only' | 'including_overdue' },
    ) => Promise<any>;
    remove: (id: string) => Promise<void>;
    listDeleted: () => Promise<any[]>;
    restore: (id: string) => Promise<void>;
    purge: (id: string) => Promise<void>;
    exportExcel: (opts?: {
      mutualFundIds?: string[];
    }) => Promise<{ saved: boolean; path?: string; rowCount?: number }>;
    appsScript: () => Promise<string>;
  };
  mfPayments: {
    listByFund: (mutualFundId: string) => Promise<any[]>;
    listAll: (filters?: any) => Promise<any[]>;
    markPaid: (input: any) => Promise<void>;
    update: (input: any) => Promise<void>;
  };
  calendar: {
    list: (filters?: any) => Promise<any[]>;
    get: (id: string) => Promise<any>;
    create: (input: any) => Promise<any>;
    update: (id: string, input: any) => Promise<any>;
    markCompleted: (id: string, completedDate?: string) => Promise<void>;
    markPending: (id: string) => Promise<void>;
    markSkipped: (id: string) => Promise<void>;
    remove: (id: string) => Promise<void>;
    removeSeries: (id: string) => Promise<void>;
    listDeleted: () => Promise<any[]>;
    restore: (id: string) => Promise<void>;
    purge: (id: string) => Promise<void>;
    appsScript: () => Promise<string>;
    exportExcel: (opts?: {
      eventIds?: string[];
    }) => Promise<{ saved: boolean; path?: string; rowCount?: number }>;
  };
  calendarCategories: {
    list: () => Promise<any[]>;
    create: (input: { label: string; colorKey: string }) => Promise<any>;
    update: (
      id: string,
      patch: { label?: string; colorKey?: string },
    ) => Promise<any>;
    remove: (id: string) => Promise<void>;
  };
  exportEverything: () => Promise<{
    saved: boolean;
    path?: string;
    sheets?: Record<string, number>;
  }>;
  paymentsExportWorkbook: (opts?: {
    paymentIds?: string[];
    mfPaymentIds?: string[];
  }) => Promise<{
    saved: boolean;
    path?: string;
    sheets?: Record<string, number>;
  }>;
  attachments: {
    list: (policyId: string) => Promise<any[]>;
    add: (policyId: string) => Promise<{ added: number; errors: { fileName: string; reason: string }[] } | null>;
    pick: () => Promise<{ path: string; fileName: string; sizeBytes: number }[]>;
    commitPaths: (input: { policyId: string; paths: string[] }) =>
      Promise<{ added: number; errors: { fileName: string; reason: string }[] }>;
    remove: (id: string) => Promise<void>;
    open: (id: string) => Promise<{ opened: boolean }>;
  };
  app: {
    quit: () => Promise<void>;
    setLoginItem: (enabled: boolean) => Promise<void>;
    backupDb: () => Promise<{ saved: boolean; path?: string }>;
    exportJson: () => Promise<{ saved: boolean; path?: string }>;
    resetData: () => Promise<{ reset: boolean }>;
    importDb: () => Promise<{ imported: boolean; backedUpTo?: string }>;
  };
  cloud: {
    sync: () => Promise<{
      ok: boolean;
      counts?: { policies: number; installments: number; repayments: number };
      error?: string;
    }>;
    test: () => Promise<{ ok: boolean; error?: string }>;
    testEmail: () => Promise<{ ok: boolean; error?: string }>;
    forceReminders: () => Promise<{
      ok: boolean;
      summary?: {
        attempted: number;
        succeeded: number;
        failed: number;
        skipped?: boolean;
        reason?: string;
      };
      error?: string;
    }>;
    generateSecret: () => Promise<string>;
  };
  smtp: {
    sendTestEmail: () => Promise<{ sent: boolean; to: string }>;
  };
};

declare global {
  interface Window {
    policyhub: PolicyHubApi;
  }
}

// Vite ?raw imports — content loaded as a string at build time.
declare module '*?raw' {
  const content: string;
  export default content;
}

export {};
