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
  policiesSyncMaturity: 'policies:syncMaturity',
  policiesExportExcel: 'policies:exportExcel',

  // Payments
  paymentsListByPolicy: 'payments:listByPolicy',
  paymentsListAll: 'payments:listAll',
  paymentsMarkPaid: 'payments:markPaid',
  paymentsMarkAllPaidUpTo: 'payments:markAllPaidUpTo',
  paymentsUpdate: 'payments:update',
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

  // Bulk payment import/export
  bulkDownloadTemplate: 'bulk:downloadTemplate',
  bulkImportTemplate: 'bulk:importTemplate',

  // Repayments
  repaymentsList: 'repayments:list',
  repaymentsCreateBatch: 'repayments:createBatch',
  repaymentsMarkReceived: 'repayments:markReceived',
  repaymentsUpdate: 'repayments:update',
  repaymentsCancel: 'repayments:cancel',
  repaymentsDelete: 'repayments:delete',
  repaymentsDownloadTemplate: 'repayments:downloadTemplate',
  repaymentsImportTemplate: 'repayments:importTemplate',

  // Attachments
  attachmentsList: 'attachments:list',
  attachmentsAdd: 'attachments:add',                // multi-file picker + write to DB
  attachmentsPick: 'attachments:pick',              // multi-file picker only (no DB)
  attachmentsCommitPaths: 'attachments:commitPaths',// write previously-picked paths to DB
  attachmentsRemove: 'attachments:remove',
  attachmentsOpen: 'attachments:open',

  // App
  appQuit: 'app:quit',
  appSetLoginItem: 'app:setLoginItem',
  appBackupDb: 'app:backupDb',
  appExportJson: 'app:exportJson',
  appResetData: 'app:resetData',
  cloudSync: 'cloud:sync',
  cloudTest: 'cloud:test',
  cloudTestEmail: 'cloud:testEmail',
  cloudGenerateSecret: 'cloud:generateSecret',
  smtpSendTestEmail: 'smtp:sendTestEmail',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
