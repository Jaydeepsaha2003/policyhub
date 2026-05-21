import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { settings } from '../../shared/db/schema';
import { decryptSecret, encryptSecret } from '../crypto';
import type { Settings } from '../../shared/types';

export type SettingsView = Omit<
  Settings,
  | 'smtpPasswordEncrypted'
  | 'reminderOffsetsDays'
  | 'reminderDaysOfMonth'
  | 'cloudSheetSecretEncrypted'
> & {
  smtpPasswordSet: boolean;
  reminderOffsetsDays: number[];
  reminderDaysOfMonth: number[];
  cloudSheetSecretSet: boolean;
};

export const readSettings = (): SettingsView => {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) {
    throw new Error('Settings row missing');
  }
  let offsets: number[] = [30, 14, 7, 1];
  try {
    offsets = JSON.parse(row.reminderOffsetsDays);
  } catch {
    // keep default
  }
  let daysOfMonth: number[] = [1, 10, 20];
  try {
    daysOfMonth = JSON.parse(row.reminderDaysOfMonth ?? '[1,10,20]');
  } catch {
    // keep default
  }
  const {
    smtpPasswordEncrypted,
    cloudSheetSecretEncrypted,
    reminderOffsetsDays: _o,
    reminderDaysOfMonth: _d,
    ...rest
  } = row;
  return {
    ...rest,
    smtpPasswordSet: Boolean(smtpPasswordEncrypted),
    cloudSheetSecretSet: Boolean(cloudSheetSecretEncrypted),
    reminderOffsetsDays: offsets,
    reminderDaysOfMonth: daysOfMonth,
  };
};

export const readCloudSheetSecret = (): string => {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  return decryptSecret(row?.cloudSheetSecretEncrypted);
};

export const readSmtpPassword = (): string => {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  return decryptSecret(row?.smtpPasswordEncrypted);
};

export type SettingsUpdateInput = Partial<{
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassword: string | null; // plaintext from form
  fromEmail: string | null;
  fromName: string | null;
  reminderOffsetsDays: number[];
  reminderDaysOfMonth: number[];
  emailTemplateMonthly: string;
  overdueReminderIntervalDays: number;
  dailyCheckEnabled: boolean;
  reminderRecipient: 'agent' | 'client' | 'both';
  agentEmail: string | null;
  emailTemplateDueSoon: string;
  emailTemplateOverdue: string;
  startAtLogin: boolean;
  setupComplete: boolean;
  theme: 'light' | 'dark' | 'system';
  cloudSheetUrl: string | null;
  cloudSheetSecret: string | null; // plaintext from form; encrypted before save
  cloudSyncOnQuit: boolean;
  cloudLastSyncedAt: string | null;
}>;

export const updateSettings = (patch: SettingsUpdateInput) => {
  const db = getDb();
  const update: Record<string, unknown> = {};
  if ('smtpHost' in patch) update.smtpHost = patch.smtpHost;
  if ('smtpPort' in patch) update.smtpPort = patch.smtpPort;
  if ('smtpUser' in patch) update.smtpUser = patch.smtpUser;
  if ('smtpPassword' in patch && patch.smtpPassword !== undefined && patch.smtpPassword !== null) {
    update.smtpPasswordEncrypted = encryptSecret(patch.smtpPassword);
  }
  if ('fromEmail' in patch) update.fromEmail = patch.fromEmail;
  if ('fromName' in patch) update.fromName = patch.fromName;
  if (patch.reminderOffsetsDays)
    update.reminderOffsetsDays = JSON.stringify(patch.reminderOffsetsDays);
  if (patch.reminderDaysOfMonth)
    update.reminderDaysOfMonth = JSON.stringify(patch.reminderDaysOfMonth);
  if (patch.emailTemplateMonthly !== undefined)
    update.emailTemplateMonthly = patch.emailTemplateMonthly;
  if (patch.overdueReminderIntervalDays !== undefined)
    update.overdueReminderIntervalDays = patch.overdueReminderIntervalDays;
  if (patch.dailyCheckEnabled !== undefined)
    update.dailyCheckEnabled = patch.dailyCheckEnabled;
  if (patch.reminderRecipient) update.reminderRecipient = patch.reminderRecipient;
  if ('agentEmail' in patch) update.agentEmail = patch.agentEmail;
  if (patch.emailTemplateDueSoon !== undefined)
    update.emailTemplateDueSoon = patch.emailTemplateDueSoon;
  if (patch.emailTemplateOverdue !== undefined)
    update.emailTemplateOverdue = patch.emailTemplateOverdue;
  if (patch.startAtLogin !== undefined) update.startAtLogin = patch.startAtLogin;
  if (patch.setupComplete !== undefined) update.setupComplete = patch.setupComplete;
  if (patch.theme) update.theme = patch.theme;
  if ('cloudSheetUrl' in patch) update.cloudSheetUrl = patch.cloudSheetUrl;
  if ('cloudSheetSecret' in patch && patch.cloudSheetSecret !== undefined) {
    update.cloudSheetSecretEncrypted = patch.cloudSheetSecret
      ? encryptSecret(patch.cloudSheetSecret)
      : null;
  }
  if ('cloudSyncOnQuit' in patch && patch.cloudSyncOnQuit !== undefined) {
    update.cloudSyncOnQuit = patch.cloudSyncOnQuit;
  }
  if ('cloudLastSyncedAt' in patch) update.cloudLastSyncedAt = patch.cloudLastSyncedAt;

  if (Object.keys(update).length === 0) return;
  db.update(settings).set(update as any).where(eq(settings.id, 1)).run();
};
