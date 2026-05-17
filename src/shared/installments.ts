import { addMonths, format, parseISO } from 'date-fns';

export type PaymentMode = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

export const paymentsPerYear = (mode: PaymentMode): number => {
  switch (mode) {
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'half_yearly':
      return 2;
    case 'yearly':
      return 1;
  }
};

export const monthsBetweenInstallments = (mode: PaymentMode): number => {
  switch (mode) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'half_yearly':
      return 6;
    case 'yearly':
      return 12;
  }
};

export type GeneratedInstallment = {
  installmentNo: number;
  dueDate: string; // ISO yyyy-MM-dd
};

export const generateInstallments = (
  commencementDate: string,
  paymentMode: PaymentMode,
  premiumPaymentTermYears: number,
): GeneratedInstallment[] => {
  const start = parseISO(commencementDate);
  const total = paymentsPerYear(paymentMode) * premiumPaymentTermYears;
  const step = monthsBetweenInstallments(paymentMode);
  const out: GeneratedInstallment[] = [];
  for (let i = 0; i < total; i++) {
    const due = addMonths(start, i * step);
    out.push({
      installmentNo: i + 1,
      dueDate: format(due, 'yyyy-MM-dd'),
    });
  }
  return out;
};
