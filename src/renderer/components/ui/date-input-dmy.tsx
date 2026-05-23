import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input, type InputProps } from './input';

const isoToDmy = (iso: string | undefined | null): string => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const dmyToIso = (dmy: string): string | null => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy.trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2999) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (
    d.getFullYear() !== yyyy ||
    d.getMonth() !== mm - 1 ||
    d.getDate() !== dd
  ) {
    return null;
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const isoToDate = (iso: string | undefined | null): Date | null => {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const dateToIso = (d: Date): string => format(d, 'yyyy-MM-dd');

const autoFormat = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
};

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const CalendarPanel: React.FC<{
  selectedIso: string;
  onPick: (iso: string) => void;
}> = ({ selectedIso, onPick }) => {
  const today = React.useMemo(() => new Date(), []);
  const selected = isoToDate(selectedIso);
  const [viewMonth, setViewMonth] = React.useState<Date>(
    () => startOfMonth(selected ?? today),
  );

  const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i));

  const years = React.useMemo(() => {
    const y = viewMonth.getFullYear();
    const arr: number[] = [];
    for (let i = y - 50; i <= y + 50; i++) arr.push(i);
    return arr;
  }, [viewMonth]);

  return (
    <div className="w-[260px] rounded-md border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-1">
        <button
          type="button"
          className="rounded p-1 hover:bg-accent"
          onClick={() => setViewMonth((m) => addMonths(m, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1">
          <select
            className="rounded border bg-transparent px-1 py-0.5 text-sm focus:outline-none"
            value={viewMonth.getMonth()}
            onChange={(e) =>
              setViewMonth(new Date(viewMonth.getFullYear(), Number(e.target.value), 1))
            }
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <select
            className="rounded border bg-transparent px-1 py-0.5 text-sm focus:outline-none"
            value={viewMonth.getFullYear()}
            onChange={(e) =>
              setViewMonth(new Date(Number(e.target.value), viewMonth.getMonth(), 1))
            }
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="rounded p-1 hover:bg-accent"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const inMonth = isSameMonth(d, viewMonth);
          const isToday = isSameDay(d, today);
          const isSelected = selected && isSameDay(d, selected);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPick(dateToIso(d))}
              className={cn(
                'flex h-8 items-center justify-center rounded text-sm transition-colors',
                inMonth ? 'text-foreground' : 'text-muted-foreground/40',
                isSelected
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'hover:bg-accent',
                !isSelected && isToday && 'ring-1 ring-primary/40',
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between border-t pt-2 text-xs">
        <button
          type="button"
          className="rounded px-2 py-1 hover:bg-accent"
          onClick={() => {
            setViewMonth(startOfMonth(today));
            onPick(dateToIso(today));
          }}
        >
          Today
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-muted-foreground hover:bg-accent"
          onClick={() => onPick('')}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export type DateInputDMYProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  /** ISO yyyy-MM-dd date string (matches what the rest of the app stores) */
  value: string;
  /** Called with ISO yyyy-MM-dd when a complete valid date is entered, or '' when cleared */
  onChange: (iso: string) => void;
};

const PANEL_HEIGHT = 320;
const PANEL_WIDTH = 260;

export const DateInputDMY = React.forwardRef<HTMLInputElement, DateInputDMYProps>(
  ({ value, onChange, onBlur, placeholder, className, disabled, ...rest }, ref) => {
    const [text, setText] = React.useState(() => isoToDmy(value));
    const [open, setOpen] = React.useState(false);
    const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    const panelRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
      const incoming = isoToDmy(value);
      if (incoming !== text && dmyToIso(text) !== value) {
        setText(incoming);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const positionPanel = React.useCallback(() => {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = rect.left;
      let top = rect.bottom + 4;
      if (left + PANEL_WIDTH > vw - 8) left = Math.max(8, vw - PANEL_WIDTH - 8);
      if (top + PANEL_HEIGHT > vh - 8) {
        // flip upward if not enough room below
        top = Math.max(8, rect.top - PANEL_HEIGHT - 4);
      }
      setCoords({ top, left });
    }, []);

    React.useEffect(() => {
      if (!open) return;
      positionPanel();
      const onResize = () => positionPanel();
      const onScroll = () => positionPanel();
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', onScroll, true);
      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onScroll, true);
      };
    }, [open, positionPanel]);

    React.useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        const t = e.target as Node;
        if (
          wrapperRef.current && !wrapperRef.current.contains(t) &&
          panelRef.current && !panelRef.current.contains(t)
        ) {
          setOpen(false);
        }
      };
      const esc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setOpen(false);
      };
      document.addEventListener('mousedown', handler);
      document.addEventListener('keydown', esc);
      return () => {
        document.removeEventListener('mousedown', handler);
        document.removeEventListener('keydown', esc);
      };
    }, [open]);

    return (
      <div ref={wrapperRef} className="relative">
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder ?? 'DD-MM-YYYY'}
          maxLength={10}
          value={text}
          disabled={disabled}
          className={cn('pr-8', className)}
          onChange={(e) => {
            const formatted = autoFormat(e.target.value);
            setText(formatted);
            const iso = dmyToIso(formatted);
            if (iso) onChange(iso);
            else if (formatted === '') onChange('');
          }}
          onBlur={(e) => {
            if (text && !dmyToIso(text)) setText(isoToDmy(value));
            onBlur?.(e);
          }}
          {...rest}
        />
        <button
          type="button"
          aria-label="Open calendar"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            disabled && 'pointer-events-none opacity-50',
          )}
          tabIndex={-1}
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        {open && coords &&
          createPortal(
            <div
              ref={panelRef}
              style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 1000 }}
            >
              <CalendarPanel
                selectedIso={value}
                onPick={(iso) => {
                  onChange(iso);
                  setText(isoToDmy(iso));
                  setOpen(false);
                }}
              />
            </div>,
            document.body,
          )}
      </div>
    );
  },
);
DateInputDMY.displayName = 'DateInputDMY';
