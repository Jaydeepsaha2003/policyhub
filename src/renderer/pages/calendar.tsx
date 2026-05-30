import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from '@/components/ui/table';
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  List as ListIcon,
  CalendarDays,
  CheckCircle2,
} from 'lucide-react';
import { useRouter } from '@/lib/router';
import {
  formatCurrencyCompactPaise,
  formatCurrencyPaise,
  formatDate,
} from '@/lib/utils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// =============== Calendar Event types ===============

type Event = {
  id: string;
  title: string;
  category: string;
  customCategory: string | null;
  eventDate: string;
  status: 'pending' | 'completed' | 'skipped';
  isRecurring: boolean;
  frequency: string;
  occurrenceNo: number;
  occurrenceTotal: number;
  amount: number | null;
  notes: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  credit_card: 'Credit card',
  health_insurance: 'Health insurance',
  motor_insurance: 'Motor insurance',
  property_insurance: 'Property insurance',
  property_tax: 'Property tax',
  rr_badge: 'RR badge',
  audit: 'Audit',
  vehicle_puc: 'Vehicle PUC',
  vehicle_fitness: 'Vehicle fitness',
  license_renewal: 'License renewal',
  other: 'Other',
};

const CATEGORY_DOT: Record<string, string> = {
  credit_card: 'bg-violet-500',
  health_insurance: 'bg-emerald-500',
  motor_insurance: 'bg-sky-500',
  property_insurance: 'bg-amber-500',
  property_tax: 'bg-rose-500',
  rr_badge: 'bg-indigo-500',
  audit: 'bg-orange-500',
  vehicle_puc: 'bg-teal-500',
  vehicle_fitness: 'bg-cyan-500',
  license_renewal: 'bg-fuchsia-500',
  other: 'bg-slate-500',
};

const displayCategory = (e: Event): string =>
  e.category === 'other'
    ? e.customCategory || 'Other'
    : CATEGORY_LABELS[e.category] ?? e.category;

const statusBadge = (s: Event['status']) =>
  s === 'completed' ? (
    <Badge variant="success">Completed</Badge>
  ) : s === 'skipped' ? (
    <Badge variant="secondary">Skipped</Badge>
  ) : (
    <Badge variant="warning">Pending</Badge>
  );

// =============== Sources from other domains ===============
//
// Premium installments, policy maturity dates, MF SIPs, repayments —
// each overlayed onto the same calendar via a discriminated union.

type ChipKind =
  | 'event'
  | 'premium'
  | 'maturity'
  | 'mf_sip'
  | 'repayment';

type Chip = {
  kind: ChipKind;
  id: string;
  date: string;            // ISO yyyy-MM-dd
  title: string;
  subtitle?: string;
  // Paise. Displayed next to the title on the grid in compact form.
  amount: number | null;
  dotClass: string;
  navigateTo: string;
  // 'paid' / 'completed' style are dimmed and strikethrough on the grid.
  isDone?: boolean;
};

const CHIP_DOT: Record<ChipKind, string> = {
  event: '',                       // event chips use their category color
  premium: 'bg-emerald-600',
  maturity: 'bg-amber-600',
  mf_sip: 'bg-indigo-600',
  repayment: 'bg-rose-600',
};

const SOURCE_LABEL: Record<ChipKind, string> = {
  event: 'Calendar events',
  premium: 'Policy premiums',
  maturity: 'Policy maturity',
  mf_sip: 'MF SIPs',
  repayment: 'Repayments',
};

const isoToday = () => new Date().toISOString().slice(0, 10);

export const CalendarPage = () => {
  const { navigate } = useRouter();
  const [view, setView] = useState<'list' | 'calendar'>('calendar');

  // Domain rows.
  const [events, setEvents] = useState<Event[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [mfPayments, setMfPayments] = useState<any[]>([]);
  const [repayments, setRepayments] = useState<any[]>([]);

  // Calendar-event-only filters.
  const [q, setQ] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Which sources are overlaid on the calendar/list.
  const [sourcesOn, setSourcesOn] = useState<Record<ChipKind, boolean>>({
    event: true,
    premium: true,
    maturity: true,
    mf_sip: true,
    repayment: true,
  });

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const load = async () => {
    try {
      const [ev, pol, pay, mfp, rep] = await Promise.all([
        window.policyhub.calendar.list(),
        window.policyhub.policies.list(),
        window.policyhub.payments.listAll({}),
        window.policyhub.mfPayments.listAll({}),
        window.policyhub.repayments.list({}),
      ]);
      setEvents(ev as Event[]);
      setPolicies(pol as any[]);
      setPayments(pay as any[]);
      setMfPayments(mfp as any[]);
      setRepayments(rep as any[]);
    } catch (err) {
      toast.error('Failed to load calendar', { description: (err as Error).message });
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Calendar events after the page's filter inputs.
  const filteredEvents = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((r) => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (needle) {
        const hay = [r.title, displayCategory(r), r.notes ?? ''].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [events, q, categoryFilter, statusFilter]);

  // Build a unified chip list from every enabled source.
  const chips = useMemo<Chip[]>(() => {
    const out: Chip[] = [];

    if (sourcesOn.event) {
      for (const e of filteredEvents) {
        out.push({
          kind: 'event',
          id: e.id,
          date: e.eventDate,
          title: e.title,
          subtitle: displayCategory(e),
          amount: e.amount,
          dotClass: CATEGORY_DOT[e.category] ?? 'bg-slate-500',
          navigateTo: `/calendar/${e.id}`,
          isDone: e.status !== 'pending',
        });
      }
    }

    const policyById = new Map(policies.map((p) => [p.id, p]));

    if (sourcesOn.premium) {
      for (const p of payments) {
        const policy = policyById.get(p.policyId);
        if (!policy) continue;
        out.push({
          kind: 'premium',
          id: p.id,
          date: p.dueDate,
          title: `${policy.policyNo} premium`,
          subtitle: policy.policyHolder,
          amount: p.expectedAmount,
          dotClass: CHIP_DOT.premium,
          navigateTo: `/policies/${policy.id}`,
          isDone: p.status === 'paid',
        });
      }
    }

    if (sourcesOn.maturity) {
      for (const p of policies) {
        if (!p.maturityDate) continue;
        out.push({
          kind: 'maturity',
          id: `mat-${p.id}`,
          date: p.maturityDate,
          title: `${p.policyNo} maturity`,
          subtitle: p.policyHolder,
          amount: p.sumAssured ?? null,
          dotClass: CHIP_DOT.maturity,
          navigateTo: `/policies/${p.id}`,
          isDone: p.status === 'matured',
        });
      }
    }

    if (sourcesOn.mf_sip) {
      for (const m of mfPayments) {
        out.push({
          kind: 'mf_sip',
          id: m.id,
          date: m.dueDate,
          title: `${m.folioNo} SIP`,
          subtitle: `${m.accountHolder} · ${m.schemeName}`,
          amount: m.expectedAmount,
          dotClass: CHIP_DOT.mf_sip,
          navigateTo: `/mutual-funds/${m.mutualFundId}`,
          isDone: m.status === 'paid',
        });
      }
    }

    if (sourcesOn.repayment) {
      for (const r of repayments) {
        out.push({
          kind: 'repayment',
          id: r.id,
          date: r.expectedDate,
          title: r.title,
          subtitle: r.policyNo ?? '—',
          amount: r.amount,
          dotClass: CHIP_DOT.repayment,
          // No detail page for repayments — land on the listing.
          navigateTo: '/repayments',
          isDone: r.status === 'received',
        });
      }
    }

    return out;
  }, [filteredEvents, policies, payments, mfPayments, repayments, sourcesOn]);

  const monthLabel = new Date(year, month, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const stepMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const markComplete = async (id: string) => {
    try {
      await window.policyhub.calendar.markCompleted(id, isoToday());
      toast.success('Marked completed');
      await load();
    } catch (err) {
      toast.error('Save failed', { description: (err as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-1 rounded-md border bg-card p-0.5">
            <Button
              size="sm"
              variant={view === 'calendar' ? 'default' : 'ghost'}
              className="h-7"
              onClick={() => setView('calendar')}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Calendar
            </Button>
            <Button
              size="sm"
              variant={view === 'list' ? 'default' : 'ghost'}
              className="h-7"
              onClick={() => setView('list')}
            >
              <ListIcon className="h-3.5 w-3.5" />
              List
            </Button>
          </div>

          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search calendar event title…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={() => navigate('/calendar/new')}>
            <Plus className="h-4 w-4" />
            New event
          </Button>
        </CardContent>
        <CardContent className="flex flex-wrap items-center gap-2 border-t px-4 pb-3 pt-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Show:</span>
          {(['event', 'premium', 'maturity', 'mf_sip', 'repayment'] as ChipKind[]).map(
            (k) => {
              const on = sourcesOn[k];
              return (
                <button
                  key={k}
                  onClick={() => setSourcesOn({ ...sourcesOn, [k]: !on })}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                    on
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent',
                  )}
                >
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      k === 'event' ? 'bg-slate-400' : CHIP_DOT[k],
                    )}
                  />
                  {SOURCE_LABEL[k]}
                </button>
              );
            },
          )}
          <button
            onClick={() => navigate('/settings')}
            className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            title="Configure Google Sheets sync to send email reminders for calendar events"
          >
            Email reminders? Settings → Google Sheets sync
          </button>
        </CardContent>
      </Card>

      {view === 'calendar' ? (
        <CalendarGrid
          year={year}
          month={month}
          chips={chips}
          monthLabel={monthLabel}
          onPrev={() => stepMonth(-1)}
          onNext={() => stepMonth(+1)}
          onToday={() => {
            setYear(today.getFullYear());
            setMonth(today.getMonth());
          }}
          onChipClick={(c) => navigate(c.navigateTo)}
        />
      ) : (
        // List view — calendar events only, with their own actions.
        <Card>
          <CardContent className="p-0">
            {filteredEvents.length === 0 ? (
              <TableEmpty>
                <div>No events match your filters.</div>
                <Button size="sm" onClick={() => navigate('/calendar/new')}>
                  Add your first event
                </Button>
              </TableEmpty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Recurrence</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((e) => (
                    <TableRow
                      key={e.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/calendar/${e.id}`)}
                    >
                      <TableCell>{formatDate(e.eventDate)}</TableCell>
                      <TableCell className="font-medium">{e.title}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              'h-2 w-2 rounded-full',
                              CATEGORY_DOT[e.category] ?? 'bg-slate-500',
                            )}
                          />
                          {displayCategory(e)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {e.isRecurring
                          ? `${e.frequency.replace('_', ' ')} · ${e.occurrenceNo}/${e.occurrenceTotal}`
                          : 'One-time'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.amount !== null ? (
                          formatCurrencyPaise(e.amount)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(e.status)}</TableCell>
                      <TableCell className="text-right">
                        {e.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              markComplete(e.id);
                            }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Mark done
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ---------------- Calendar grid ----------------

const CalendarGrid = ({
  year,
  month,
  chips,
  monthLabel,
  onPrev,
  onNext,
  onToday,
  onChipClick,
}: {
  year: number;
  month: number;
  chips: Chip[];
  monthLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onChipClick: (c: Chip) => void;
}) => {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const gridStart = new Date(year, month, 1 - startWeekday);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  const todayIso = isoToday();

  const byDate = new Map<string, Chip[]>();
  for (const c of chips) {
    const list = byDate.get(c.date) ?? [];
    list.push(c);
    byDate.set(c.date, list);
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={onPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-44 text-center text-base font-semibold">
              {monthLabel}
            </div>
            <Button size="icon" variant="ghost" onClick={onNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={onToday}>
            Today
          </Button>
        </div>

        <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-2 py-1 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px rounded-md border bg-border">
          {days.map((d, i) => {
            const iso = d.toISOString().slice(0, 10);
            const inMonth = d.getMonth() === month;
            const isToday = iso === todayIso;
            const cellChips = byDate.get(iso) ?? [];
            return (
              <div
                key={i}
                className={cn(
                  'min-h-24 bg-background p-1.5 text-xs',
                  !inMonth && 'opacity-40',
                )}
              >
                <div
                  className={cn(
                    'mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11px]',
                    isToday
                      ? 'bg-primary px-1.5 font-semibold text-primary-foreground'
                      : 'font-medium',
                  )}
                >
                  {d.getDate()}
                </div>
                <div className="space-y-1">
                  {cellChips.slice(0, 4).map((c) => {
                    const amountStr =
                      c.amount !== null && c.amount > 0
                        ? formatCurrencyCompactPaise(c.amount)
                        : null;
                    const tooltip = [
                      c.title,
                      c.subtitle,
                      c.amount !== null && c.amount > 0
                        ? formatCurrencyPaise(c.amount)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' — ');
                    return (
                      <button
                        key={c.id}
                        onClick={() => onChipClick(c)}
                        className={cn(
                          'flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:opacity-80',
                          c.isDone && 'line-through opacity-60',
                        )}
                        title={tooltip}
                      >
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            c.dotClass,
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">{c.title}</span>
                        {amountStr && (
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {amountStr}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {cellChips.length > 4 && (
                    <div className="text-[10px] text-muted-foreground">
                      +{cellChips.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Source legend — colors for the four overlaid sources. */}
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Policy premium
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-600" />
            Policy maturity
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-indigo-600" />
            MF SIP
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-600" />
            Repayment
          </span>
          <span className="mx-1 text-muted-foreground/50">•</span>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={cn('h-2 w-2 rounded-full', CATEGORY_DOT[k])} />
              {v}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
