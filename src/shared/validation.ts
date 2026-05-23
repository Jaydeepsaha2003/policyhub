import { z } from 'zod';

const phoneRegex = /^(\+91[\s-]?)?[6-9]\d{9}$/;
const optionalEmail = z
  .string()
  .trim()
  .email('Invalid email')
  .optional()
  .or(z.literal('').transform(() => undefined));
const optionalPhone = z
  .string()
  .trim()
  .regex(phoneRegex, 'Use a 10-digit Indian number (+91 optional)')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const policySchema = z
  .object({
    policyNo: z.string().trim().min(1, 'Policy number is required'),
    policyHolder: z.string().trim().min(1, 'Policy holder is required'),
    holderEmail: optionalEmail,
    holderPhone: optionalPhone,
    companyName: z.string().trim().min(1, 'Company name is required'),
    planName: z.string().trim().min(1, 'Plan name is required'),
    premiumAmount: z.coerce.number().positive('Must be greater than zero'),
    yearlyTotalPremium: z.coerce.number().nonnegative('Cannot be negative'),
    paymentMode: z.enum(['monthly', 'quarterly', 'half_yearly', 'yearly']),
    sumAssured: z.coerce.number().positive('Must be greater than zero'),
    nomineeName: z.string().trim().min(1, 'Nominee is required'),
    nomineeRelation: z.string().trim().optional(),
    commencementDate: z.string().min(1, 'Required'),
    maturityDate: z.string().min(1, 'Required'),
    policyTermMonths: z.coerce.number().int().positive(),
    premiumPaymentTermMonths: z.coerce.number().int().positive(),
    branchName: z.string().trim().optional(),
    agentName: z.string().trim().optional(),
    agentContact: optionalPhone,
    status: z
      .enum(['active', 'active_ppt_over', 'matured', 'lapsed', 'surrendered'])
      .optional(),
    maturityType: z.enum(['lumpsum', 'regular_income']).default('lumpsum'),
    maturityFrequency: z
      .enum(['monthly', 'quarterly', 'half_yearly', 'yearly'])
      .optional()
      .or(z.literal('').transform(() => undefined)),
    maturityAccountDetails: z.string().trim().optional(),
    maturityBankName: z.string().trim().optional(),
    maturityAccountNo: z.string().trim().optional(),
    maturityIfsc: z
      .string()
      .trim()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i, 'Invalid IFSC')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    maturityBranchName: z.string().trim().optional(),
    maturityAccountHolder: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .refine(
    (v) => v.maturityType !== 'regular_income' || Boolean(v.maturityFrequency),
    {
      message: 'Frequency is required for regular-income maturity',
      path: ['maturityFrequency'],
    },
  )
  .refine((v) => new Date(v.maturityDate) > new Date(v.commencementDate), {
    message: 'Maturity date must be after commencement',
    path: ['maturityDate'],
  })
  .refine((v) => v.premiumPaymentTermMonths <= v.policyTermMonths, {
    message: 'Payment term cannot exceed policy term',
    path: ['premiumPaymentTermMonths'],
  });

export type PolicyFormValues = z.infer<typeof policySchema>;

export const markPaidSchema = z.object({
  paymentId: z.string().min(1),
  paidDate: z.string().min(1, 'Paid date required'),
  paidAmount: z.coerce.number().nonnegative(),
  paymentMethod: z.string().optional(),
  penaltyAmount: z.coerce.number().nonnegative().default(0),
  lateFee: z.coerce.number().nonnegative().default(0),
  receiptNo: z.string().optional(),
  notes: z.string().optional(),
});

export type MarkPaidFormValues = z.infer<typeof markPaidSchema>;

export const setupWizardSchema = z.object({
  agentEmail: z.string().trim().email('Valid email required'),
  fromEmail: z.string().trim().email('Valid email required'),
  fromName: z.string().trim().optional(),
  smtpHost: z.string().trim().min(1, 'Required'),
  smtpPort: z.coerce.number().int().positive(),
  smtpUser: z.string().trim().min(1, 'Required'),
  smtpPassword: z.string().min(1, 'Required'),
  reminderOffsetsDays: z
    .string()
    .transform((v) =>
      v
        .split(',')
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 0),
    )
    .refine((arr) => arr.length > 0, 'Provide at least one offset'),
  startAtLogin: z.boolean().default(false),
});

export type SetupWizardValues = z.infer<typeof setupWizardSchema>;
