import { useEffect, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MultiOption = {
  value: string;
  label: string;
  // Optional small leading element (color swatch, icon) shown left of the label.
  leading?: React.ReactNode;
};

type Props = {
  // Label shown when nothing is selected, e.g. "All status".
  emptyLabel: string;
  // Used in the heading of the popover, e.g. "Status".
  title?: string;
  options: MultiOption[];
  // selected = [] means "no filter — everything passes". A non-empty
  // array means only those values pass.
  selected: string[];
  onChange: (next: string[]) => void;
  triggerClassName?: string;
  // Show a search box once we have more than this many options.
  searchThreshold?: number;
  // Width of the popover content panel.
  contentWidth?: number;
};

export const MultiSelectFilter = ({
  emptyLabel,
  title,
  options,
  selected,
  onChange,
  triggerClassName,
  searchThreshold = 8,
  contentWidth = 256,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  // Reset the search when reopening — most users want a fresh start.
  useEffect(() => {
    if (open) setQ('');
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, q]);

  // Summary text shown on the trigger button:
  //   • no selection   → emptyLabel
  //   • one selection  → that option's label
  //   • multiple       → "N selected"
  const summary = useMemo(() => {
    if (selected.length === 0) return emptyLabel;
    if (selected.length === 1) {
      const o = options.find((x) => x.value === selected[0]);
      return o?.label ?? selected[0];
    }
    return `${selected.length} selected`;
  }, [selected, options, emptyLabel]);

  const toggle = (v: string) => {
    if (selected.includes(v)) {
      onChange(selected.filter((s) => s !== v));
    } else {
      onChange([...selected, v]);
    }
  };

  const selectAll = () => onChange(options.map((o) => o.value));
  const clearAll = () => onChange([]);

  const isActive = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 justify-between gap-2 font-normal',
            isActive && 'border-primary/40 bg-primary/5 text-foreground',
            triggerClassName,
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: contentWidth }}
        align="start"
      >
        {title && (
          <div className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </div>
        )}
        {options.length >= searchThreshold && (
          <div className="border-b p-2">
            <Input
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-7 text-xs"
              autoFocus
            />
          </div>
        )}
        <div className="flex items-center justify-between border-b px-3 py-1.5 text-[11px]">
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={selectAll}
          >
            Select all
          </button>
          <span className="text-muted-foreground">
            {selected.length} / {options.length}
          </span>
          <button
            type="button"
            className="font-medium text-muted-foreground hover:text-foreground hover:underline"
            onClick={clearAll}
          >
            Clear
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No matches
            </div>
          ) : (
            filtered.map((o) => {
              const checked = selected.includes(o.value);
              return (
                <label
                  key={o.value}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent',
                    checked && 'bg-accent/40',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      checked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40 bg-background',
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  {o.leading}
                  <span className="truncate">{o.label}</span>
                  {/* Visually consume any extra space without affecting hit target. */}
                  <span className="ml-auto" />
                  {/* Hidden actual checkbox so labels remain accessible — Radix is overkill here. */}
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(o.value)}
                    className="sr-only"
                  />
                </label>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
