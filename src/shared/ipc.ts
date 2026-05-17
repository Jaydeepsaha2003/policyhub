// Channel names for IPC. Centralized so renderer and main agree.

export const IPC = {
  // Settings / setup
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  smtpTest: 'smtp:test',

  // Policies
  policiesList: 'policies:list',
  policiesGet: 'policies:get',
  policiesCreate: 'policies:create',
  policiesUpdate: 'policies:update',
  policiesDelete: 'policies:delete',

  // Payments
  paymentsListByPolicy: 'payments:listByPolicy',
  paymentsListAll: 'payments:listAll',
  paymentsMarkPaid: 'payments:markPaid',
  paymentsMarkAllPaidUpTo: 'payments:markAllPaidUpTo',
  paymentsUpcoming: 'payments:upcoming',

  // Dashboard
  dashboardMetrics: 'dashboard:metrics',
  dashboardOverview: 'dashboard:overview',
  dashboardSeries: 'dashboard:series',
  dashboardMaturing: 'dashboard:maturing',
  dashboardCurrentMonth: 'dashboard:currentMonth',

  // Reminders
  remindersLog: 'reminders:log',
  remindersUpcoming: 'reminders:upcoming',
  remindersSendNow: 'reminders:sendNow',

  // App
  appQuit: 'app:quit',
  appSetLoginItem: 'app:setLoginItem',
  appBackupDb: 'app:backupDb',
  appExportJson: 'app:exportJson',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
