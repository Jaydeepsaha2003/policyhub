import type { Policy, PremiumPayment, ReminderLog, Settings } from './db/schema';

export type { Policy, PremiumPayment, ReminderLog, Settings };

export type PolicyWithNextDue = Policy & {
  nextDueDate: string | null;
  nextDueAmount: number | null;
};

export type DashboardMetrics = {
  totalActivePolicies: number;
  premiumsDueIn30Days: number;
  remindersSentLast7Days: number;
};

export type UpcomingPremium = {
  paymentId: string;
  policyId: string;
  policyNo: string;
  policyHolder: string;
  companyName: string;
  dueDate: string;
  expectedAmount: number;
  daysRemaining: number;
};

export type MarkPaidInput = {
  paymentId: string;
  paidDate: string;
  paidAmount: number;
  paymentMethod?: string;
  penaltyAmount?: number;
  lateFee?: number;
  receiptNo?: string;
  notes?: string;
};

export type PolicyFormInput = {
  policyNo: string;
  policyHolder: string;
  holderEmail?: string;
  holderPhone?: string;
  companyName: string;
  planName: string;
  premiumAmount: number; // rupees from UI; converted to paise before insert
  yearlyTotalPremium: number;
  paymentMode: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  sumAssured: number;
  nomineeName: string;
  nomineeRelation?: string;
  commencementDate: string;
  maturityDate: string;
  policyTermMonths: number;
  premiumPaymentTermMonths: number;
  branchName?: string;
  agentName?: string;
  agentContact?: string;
  status?: 'active' | 'active_ppt_over' | 'matured' | 'lapsed' | 'surrendered';
  maturityType?: 'lumpsum' | 'regular_income';
  maturityFrequency?: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  maturityAccountDetails?: string;
  maturityBankName?: string;
  maturityAccountNo?: string;
  maturityIfsc?: string;
  maturityBranchName?: string;
  maturityAccountHolder?: string;
  notes?: string;
};

export type SmtpTestInput = {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName?: string;
};

export type SettingsFormInput = Omit<
  Settings,
  'id' | 'smtpPasswordEncrypted' | 'reminderOffsetsDays'
> & {
  smtpPassword?: string; // plaintext from form; encrypted before save
  reminderOffsetsDays: number[];
};

// Currency helpers used in renderer and main.
export const rupeesToPaise = (rupees: number): number =>
  Math.round(rupees * 100);

export const paiseToRupees = (paise: number): number => paise / 100;
