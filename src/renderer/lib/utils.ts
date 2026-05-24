import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatCurrencyPaise = (paise: number | null | undefined) => {
  if (paise === null || paise === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);
};

export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // DD-MM-YYYY
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

export const isoToday = () => new Date().toISOString().slice(0, 10);

export const paiseToRupees = (paise: number | null | undefined): number =>
  paise === null || paise === undefined ? 0 : paise / 100;

// Compact INR display: ₹1.2L, ₹2.3Cr, etc. Used in dashboard metric cards
// where the full ₹12,34,56,789 string would overflow.
export const formatCurrencyCompactPaise = (paise: number | null | undefined): string => {
  if (paise === null || paise === undefined) return '—';
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  if (abs < 1_000) return `₹${sign}${Math.round(rupees)}`;
  if (abs < 1_00_000) {
    // < 1 lakh: show in thousands as ₹X,XXX with comma grouping (Indian)
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(rupees);
  }
  if (abs < 1_00_00_000) {
    // 1L to <1Cr
    const lakhs = rupees / 1_00_000;
    return `₹${lakhs.toFixed(lakhs >= 10 ? 1 : 2)}L`;
  }
  // 1Cr and above
  const crores = rupees / 1_00_00_000;
  return `₹${crores.toFixed(crores >= 10 ? 1 : 2)}Cr`;
};
