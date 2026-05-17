import { cn } from '@/lib/utils';

export type ChartBar = {
  label: string;
  dueAmount: number; // paise
  paidAmount: number; // paise
};

const formatShort = (paise: number): string => {
  const rupees = paise / 100;
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(1)}Cr`;
  if (rupees >= 1e5) return `₹${(rupees / 1e5).toFixed(1)}L`;
  if (rupees >= 1e3) return `₹${(rupees / 1e3).toFixed(1)}K`;
  return `₹${Math.round(rupees)}`;
};

export const BarChart = ({
  data,
  height = 220,
  title,
  description,
}: {
  data: ChartBar[];
  height?: number;
  title?: string;
  description?: string;
}) => {
  const max = Math.max(1, ...data.map((d) => Math.max(d.dueAmount, d.paidAmount)));

  return (
    <div>
      {(title || description) && (
        <div className="mb-3">
          {title && <div className="text-sm font-semibold">{title}</div>}
          {description && <div className="text-xs text-muted-foreground">{description}</div>}
        </div>
      )}
      <div
        className="flex items-end gap-3 overflow-x-auto pr-2"
        style={{ height }}
      >
        {data.map((d, i) => {
          const dueH = (d.dueAmount / max) * (height - 36);
          const paidH = (d.paidAmount / max) * (height - 36);
          return (
            <div
              key={`${d.label}-${i}`}
              className="flex min-w-[44px] flex-1 flex-col items-center justify-end gap-1"
            >
              <div
                className="flex w-full items-end gap-1"
                style={{ height: height - 36 }}
                title={`Due ${formatShort(d.dueAmount)} · Paid ${formatShort(d.paidAmount)}`}
              >
                <div
                  className={cn('flex-1 rounded-t-sm bg-primary/30')}
                  style={{ height: dueH }}
                />
                <div
                  className={cn('flex-1 rounded-t-sm bg-primary')}
                  style={{ height: paidH }}
                />
              </div>
              <div className="w-full truncate text-center text-[10px] text-muted-foreground">
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <Legend swatch="bg-primary/30" label="Due" />
        <Legend swatch="bg-primary" label="Paid" />
      </div>
    </div>
  );
};

const Legend = ({ swatch, label }: { swatch: string; label: string }) => (
  <div className="flex items-center gap-1.5">
    <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', swatch)} />
    <span>{label}</span>
  </div>
);
