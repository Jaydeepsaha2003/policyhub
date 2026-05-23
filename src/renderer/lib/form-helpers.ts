import { format } from 'date-fns';

export const formatDate = (iso: string) => {
  try {
    return format(new Date(iso), 'dd-MM-yyyy');
  } catch {
    return iso;
  }
};

export const paiseToRupeesUI = (paise: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(paise / 100);
