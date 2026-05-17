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
    update: (id: string, input: any) => Promise<any>;
    remove: (id: string) => Promise<void>;
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
    upcoming: (limit?: number) => Promise<any[]>;
  };
  dashboard: {
    metrics: () => Promise<any>;
    overview: (period?: 'monthly' | 'quarterly' | 'yearly') => Promise<any>;
    series: (period?: 'monthly' | 'quarterly' | 'yearly') => Promise<any[]>;
    maturing: (period?: 'monthly' | 'quarterly' | 'yearly') => Promise<any[]>;
    currentMonth: () => Promise<any[]>;
  };
  reminders: {
    log: (limit?: number) => Promise<any[]>;
    upcoming: () => Promise<any[]>;
    sendNow: () => Promise<{ attempted: number; succeeded: number; failed: number }>;
  };
  app: {
    quit: () => Promise<void>;
    setLoginItem: (enabled: boolean) => Promise<void>;
    backupDb: () => Promise<{ saved: boolean; path?: string }>;
    exportJson: () => Promise<{ saved: boolean; path?: string }>;
  };
};

declare global {
  interface Window {
    policyhub: PolicyHubApi;
  }
}

export {};
