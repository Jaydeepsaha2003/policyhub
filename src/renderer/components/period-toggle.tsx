import { cn } from '@/lib/utils';

export type Period = 'monthly' | 'quarterly' | 'yearly';

const labels: Record<Period, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Annually',
};

export const PeriodToggle = ({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) => {
  return (
    <div className="inline-flex items-center rounded-md border bg-card p-0.5 text-sm">
      {(['monthly', 'quarterly', 'yearly'] as const).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            'rounded-sm px-3 py-1 transition-colors',
            value === p
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {labels[p]}
        </button>
      ))}
    </div>
  );
};
