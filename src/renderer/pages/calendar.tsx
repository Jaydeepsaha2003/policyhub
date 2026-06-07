import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Check, ExternalLink, RotateCcw, X as XIcon } from 'lucide-react';
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
  CheckSquare,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Trash2,
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

// Effective status for display — pending events whose date is in the
// past show as Overdue. Stored DB status is unchanged.
const effectiveEventStatus = (
  e: Pick<Event, 'status' | 'eventDate'>,
  todayIso: string,
): 'pending' | 'overdue' | 'completed' | 'skipped' =>
  e.status === 'pending' && e.eventDate < todayIso ? 'overdue' : e.status;

const statusBadge = (s: 'pending' | 'overdue' | 'completed' | 'skipped') =>
  s === 'completed' ? (
    <Badge variant="success">Completed</Badge>
  ) : s === 'skipped' ? (
    <Badge variant="secondary">Skipped</Badge>
  ) : s === 'overdue' ? (
    <Badge variant="danger">Overdue</Badge>
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

// Local-time YYYY-MM-DD. We cannot use `Date.toISOString().slice(0,10)`
// because it converts to UTC first — in IST (UTC+5:30) the date shifts
// to the previous day for any local-midnight Date object, so an event
// saved as "01" would render under the cell labelled "31".
const toLocalIso = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const isoToday = () => toLocalIso(new Date());

// Color keys map to Tailwind bg-*-500 classes. Mirrors COLOR_SWATCH in
// the categories dialog. When an event has category='other', we look
// up its customCategory label in this list to pick the chip color.
const COLOR_KEY_TO_CLASS: Record<string, string> = {
  slate: 'bg-slate-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  yellow: 'bg-yellow-500',
  lime: 'bg-lime-500',
  green: 'bg-green-500',
  emerald: 'bg-emerald-500',
  teal: 'bg-teal-500',
  cyan: 'bg-cyan-500',
  sky: 'bg-sky-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  fuchsia: 'bg-fuchsia-500',
  pink: 'bg-pink-500',
  rose: 'bg-rose-500',
};

type CustomCategoryRow = { id: string; label: string; colorKey: string };

export const CalendarPage = () => {
  const { navigate } = useRouter();
  const [view, setView] = useState<'calendar' | 'list' | 'events'>('calendar');

  // Domain rows.
  const [events, setEvents] = useState<Event[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [mfPayments, setMfPayments] = useState<any[]>([]);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategoryRow[]>([]);

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
  const [exporting, setExporting] = useState(false);
  // Clicked chip → popup card. null when closed.
  const [popupChip, setPopupChip] = useState<Chip | null>(null);

  const anyEventFilterActive =
    q.trim() !== '' || categoryFilter !== 'all' || statusFilter !== 'all';

  const load = async () => {
    try {
      const [ev, pol, pay, mfp, rep, cats] = await Promise.all([
        window.policyhub.calendar.list(),
        window.policyhub.policies.list(),
        window.policyhub.payments.listAll({}),
        window.policyhub.mfPayments.listAll({}),
        window.policyhub.repayments.list({}),
        window.policyhub.calendarCategories.list(),
      ]);
      setEvents(ev as Event[]);
      setPolicies(pol as any[]);
      setPayments(pay as any[]);
      setMfPayments(mfp as any[]);
      setRepayments(rep as any[]);
      setCustomCategories(cats as CustomCategoryRow[]);
    } catch (err) {
      toast.error('Failed to load calendar', { description: (err as Error).message });
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Calendar events after the page's filter inputs. The Status filter
  // treats "overdue" as a synthetic value (pending + past date) since
  // the schema only stores pending/completed/skipped — the visual
  // "overdue" elsewhere in the app is derived. Picking Pending shows
  // only upcoming pending events; picking Overdue shows past-due
  // pending ones. They're disjoint.
  const todayIsoForFilter = new Date().toISOString().slice(0, 10);
  const filteredEvents = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((r) => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'overdue') {
          if (!(r.status === 'pending' && r.eventDate < todayIsoForFilter))
            return false;
        } else if (statusFilter === 'pending') {
          if (!(r.status === 'pending' && r.eventDate >= todayIsoForFilter))
            return false;
        } else if (r.status !== statusFilter) {
          return false;
        }
      }
      if (needle) {
        const hay = [r.title, displayCategory(r), r.notes ?? ''].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [events, q, categoryFilter, statusFilter, todayIsoForFilter]);

  // Build a unified chip list from every enabled source.
  const chips = useMemo<Chip[]>(() => {
    const out: Chip[] = [];

    // Look up the chip color for the given event. Built-ins use the
    // hardcoded CATEGORY_DOT. For category='other', try to match the
    // event's customCategory label against the user's saved custom
    // categories so the chip shows the color the user picked.
    const colorFor = (e: Event): string => {
      if (e.category !== 'other') {
        return CATEGORY_DOT[e.category] ?? 'bg-slate-500';
      }
      const label = (e.customCategory ?? '').trim().toLowerCase();
      if (label) {
        const match = customCategories.find(
          (c) => c.label.toLowerCase() === label,
        );
        if (match) {
          return COLOR_KEY_TO_CLASS[match.colorKey] ?? 'bg-slate-500';
        }
      }
      return CATEGORY_DOT.other;
    };

    if (sourcesOn.event) {
      for (const e of filteredEvents) {
        out.push({
          kind: 'event',
          id: e.id,
          date: e.eventDate,
          title: e.title,
          subtitle: displayCategory(e),
          amount: e.amount,
          dotClass: colorFor(e),
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
  }, [
    filteredEvents,
    policies,
    payments,
    mfPayments,
    repayments,
    sourcesOn,
    customCategories,
  ]);

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
            <Button
              size="sm"
              variant={view === 'events' ? 'default' : 'ghost'}
              className="h-7"
              onClick={() => setView('events')}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Events
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
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const opts = anyEventFilterActive
                  ? { eventIds: filteredEvents.map((e) => e.id) }
                  : undefined;
                const res = await window.policyhub.calendar.exportExcel(opts);
                if (res?.saved) {
                  toast.success(`Exported ${res.rowCount ?? 0} event(s)`, {
                    description: res.path,
                  });
                }
              } catch (err) {
                toast.error('Export failed', {
                  description: (err as Error).message,
                });
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Export to Excel
          </Button>
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

      {/* Quick stats — events in the visible month + next 7-day outlook. */}
      <CalendarStats
        year={year}
        month={month}
        events={events}
        chips={chips}
      />

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
          onChipClick={(c) => setPopupChip(c)}
          onEmptyDayClick={(iso) => {
            // The hash router doesn't carry query params, so stash the
            // pre-fill date in sessionStorage and the form picks it up
            // on mount.
            try {
              sessionStorage.setItem('calendar.newEventDate', iso);
            } catch {
              /* ignore */
            }
            navigate('/calendar/new');
          }}
        />
      ) : view === 'events' ? (
        <EventsView
          events={filteredEvents}
          customCategories={customCategories}
          onMarkDone={async (id) => {
            try {
              await window.policyhub.calendar.markCompleted(id, isoToday());
              toast.success('Marked completed');
              await load();
            } catch (err) {
              toast.error('Save failed', { description: (err as Error).message });
            }
          }}
          onSkip={async (id) => {
            try {
              await window.policyhub.calendar.markSkipped(id);
              toast.success('Marked skipped');
              await load();
            } catch (err) {
              toast.error('Save failed', { description: (err as Error).message });
            }
          }}
          onReopen={async (id) => {
            try {
              await window.policyhub.calendar.markPending(id);
              toast.success('Reopened');
              await load();
            } catch (err) {
              toast.error('Save failed', { description: (err as Error).message });
            }
          }}
          onEdit={(id) => navigate(`/calendar/${id}`)}
          onDelete={async (id) => {
            try {
              await window.policyhub.calendar.remove(id);
              toast.success('Event moved to Recycle Bin');
              await load();
            } catch (err) {
              toast.error('Delete failed', { description: (err as Error).message });
            }
          }}
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
                      <TableCell>
                        {statusBadge(effectiveEventStatus(e, isoToday()))}
                      </TableCell>
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

      <ChipPopup
        chip={popupChip}
        // For "Also on this day": every chip sharing the popup chip's
        // date (excluding itself). Lets the user step through a busy
        // day from one popup.
        siblings={
          popupChip
            ? chips.filter(
                (c) => c.date === popupChip.date && c.id !== popupChip.id,
              )
            : []
        }
        onClose={() => setPopupChip(null)}
        onPickSibling={(c) => setPopupChip(c)}
        onOpen={(c) => {
          setPopupChip(null);
          navigate(c.navigateTo);
        }}
        onMarkDone={async (c) => {
          try {
            await window.policyhub.calendar.markCompleted(c.id, isoToday());
            toast.success('Marked completed');
            setPopupChip(null);
            await load();
          } catch (err) {
            toast.error('Save failed', { description: (err as Error).message });
          }
        }}
        onSkip={async (c) => {
          try {
            await window.policyhub.calendar.markSkipped(c.id);
            toast.success('Marked skipped');
            setPopupChip(null);
            await load();
          } catch (err) {
            toast.error('Save failed', { description: (err as Error).message });
          }
        }}
        onReopen={async (c) => {
          try {
            await window.policyhub.calendar.markPending(c.id);
            toast.success('Reopened');
            setPopupChip(null);
            await load();
          } catch (err) {
            toast.error('Save failed', { description: (err as Error).message });
          }
        }}
      />
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
  onEmptyDayClick,
}: {
  year: number;
  month: number;
  chips: Chip[];
  monthLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onChipClick: (c: Chip) => void;
  onEmptyDayClick: (iso: string) => void;
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

        <div className="grid grid-cols-7 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
            <div
              key={d}
              className={cn(
                'px-2 py-2 text-center',
                (i === 0 || i === 6) && 'text-rose-500/80',
              )}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
          {days.map((d, i) => {
            const iso = toLocalIso(d);
            const inMonth = d.getMonth() === month;
            const isToday = iso === todayIso;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const cellChips = byDate.get(iso) ?? [];
            const isEmpty = cellChips.length === 0;
            return (
              <div
                key={i}
                onClick={() => {
                  if (isEmpty && inMonth) onEmptyDayClick(iso);
                }}
                className={cn(
                  'group relative min-h-28 bg-background p-2 text-xs transition-colors',
                  !inMonth && 'text-muted-foreground/60',
                  isEmpty && inMonth && 'cursor-pointer hover:bg-accent/40',
                  isToday && 'ring-2 ring-primary ring-inset',
                )}
                title={
                  isEmpty && inMonth ? 'Click to add an event on this day' : undefined
                }
              >
                <div
                  className={cn(
                    'mb-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full text-[11px]',
                    isToday
                      ? 'bg-primary px-1.5 font-bold text-primary-foreground shadow-sm'
                      : isWeekend && inMonth
                        ? 'font-semibold text-rose-500/90'
                        : 'font-semibold',
                  )}
                >
                  {d.getDate()}
                </div>
                {/* Subtle "+" hint on empty in-month cells when hovered. */}
                {isEmpty && inMonth && (
                  <Plus className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-muted-foreground/0 transition-opacity group-hover:text-muted-foreground/60" />
                )}
                {/* 1–2 chips → full card-style display. */}
                {/* 3+ chips → condensed dots + count to keep the cell tidy. */}
                {cellChips.length <= 2 ? (
                  <div className="space-y-1">
                    {cellChips.map((c) => {
                      const hasAmount = c.amount !== null && c.amount > 0;
                      const amountStr = hasAmount
                        ? formatCurrencyCompactPaise(c.amount as number)
                        : null;
                      const primary = hasAmount
                        ? amountStr!
                        : c.title.length > 16
                          ? c.title.slice(0, 14) + '…'
                          : c.title;
                      const tooltip = [
                        c.title,
                        c.subtitle,
                        hasAmount
                          ? formatCurrencyPaise(c.amount as number)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' — ');
                      return (
                        <button
                          key={c.id}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onChipClick(c);
                          }}
                          className={cn(
                            'flex w-full items-center gap-1.5 rounded-md border bg-card px-1.5 py-1 text-left text-xs font-medium shadow-sm transition-all hover:-translate-y-px hover:shadow',
                            c.isDone && 'line-through opacity-60',
                          )}
                          title={tooltip}
                        >
                          <span
                            className={cn(
                              'h-2.5 w-2.5 shrink-0 rounded-full',
                              c.dotClass,
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate tabular-nums">
                            {primary}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // Condensed view: bigger dots in a row + count badge.
                  // Click anywhere on the strip to open the first chip's
                  // popup (the popup lists all chips on this day).
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onChipClick(cellChips[0]);
                    }}
                    className={cn(
                      'flex w-full flex-wrap items-center gap-1 rounded-md border bg-card px-1.5 py-1.5 text-xs shadow-sm transition-all hover:-translate-y-px hover:shadow',
                    )}
                    title={`${cellChips.length} events — click to view`}
                  >
                    {cellChips.slice(0, 6).map((c) => (
                      <span
                        key={c.id}
                        className={cn(
                          'h-3 w-3 shrink-0 rounded-full',
                          c.dotClass,
                          c.isDone && 'opacity-50',
                        )}
                      />
                    ))}
                    {cellChips.length > 6 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{cellChips.length - 6}
                      </span>
                    )}
                    <span className="ml-auto rounded bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                      {cellChips.length}
                    </span>
                  </button>
                )}
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

// ---------------- Events view ----------------
//
// Cards grouped into sections — Overdue → This week → Upcoming →
// Completed → Skipped. Each card has the title, category chip,
// date, amount, status, and big inline action buttons so marking
// done / skipping / editing / deleting are one click away.

const EventsView = ({
  events,
  customCategories,
  onMarkDone,
  onSkip,
  onReopen,
  onEdit,
  onDelete,
}: {
  events: Event[];
  customCategories: CustomCategoryRow[];
  onMarkDone: (id: string) => void;
  onSkip: (id: string) => void;
  onReopen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  const todayIso = isoToday();
  const today = new Date(todayIso);
  const in7 = new Date(today);
  in7.setDate(today.getDate() + 7);
  const in7Iso = in7.toISOString().slice(0, 10);

  // Pre-sort once by date ascending, then bucket.
  const sorted = [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const overdue = sorted.filter(
    (e) => e.status === 'pending' && e.eventDate < todayIso,
  );
  const thisWeek = sorted.filter(
    (e) =>
      e.status === 'pending' && e.eventDate >= todayIso && e.eventDate <= in7Iso,
  );
  const upcoming = sorted.filter(
    (e) => e.status === 'pending' && e.eventDate > in7Iso,
  );
  // Completed / skipped — newest first so recent action shows up.
  const completed = [...sorted].reverse().filter((e) => e.status === 'completed');
  const skipped = [...sorted].reverse().filter((e) => e.status === 'skipped');

  const colorFor = (e: Event): string => {
    if (e.category !== 'other') return CATEGORY_DOT[e.category] ?? 'bg-slate-500';
    const label = (e.customCategory ?? '').trim().toLowerCase();
    if (label) {
      const match = customCategories.find(
        (c) => c.label.toLowerCase() === label,
      );
      if (match) return COLOR_KEY_TO_CLASS[match.colorKey] ?? 'bg-slate-500';
    }
    return CATEGORY_DOT.other;
  };

  const displayCat = (e: Event): string =>
    e.category === 'other'
      ? e.customCategory || 'Other'
      : CATEGORY_LABELS[e.category] ?? e.category;

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          No events match your filters. Use{' '}
          <span className="font-medium text-foreground">New event</span> on the
          top right to add one.
        </CardContent>
      </Card>
    );
  }

  const renderCard = (e: Event) => {
    const hasAmount = e.amount !== null && e.amount > 0;
    const isDone = e.status === 'completed' || e.status === 'skipped';
    return (
      <div
        key={e.id}
        className={cn(
          'flex flex-wrap items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-shadow hover:shadow-sm',
          isDone && 'opacity-60',
        )}
      >
        {/* Color dot */}
        <span
          className={cn('h-3 w-3 shrink-0 rounded-full', colorFor(e))}
          aria-hidden
        />

        {/* Title + category — flex-1 so it absorbs leftover space */}
        <div className="min-w-0 flex-1 basis-48">
          <h3
            className={cn(
              'truncate text-sm font-semibold',
              isDone && 'line-through',
            )}
          >
            {e.title}
          </h3>
          <div className="mt-0.5 truncate text-[11px] uppercase tracking-wide text-muted-foreground">
            {displayCat(e)}
          </div>
        </div>

        {/* Due date — fixed-ish width column so dates line up */}
        <div className="hidden min-w-[110px] text-xs sm:block">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Due
          </div>
          <div className="font-medium tabular-nums">
            {formatDate(e.eventDate)}
          </div>
        </div>

        {/* Amount — fixed-ish width column, right-aligned */}
        <div className="hidden min-w-[100px] text-right text-xs md:block">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Amount
          </div>
          <div className="font-semibold tabular-nums">
            {hasAmount ? formatCurrencyPaise(e.amount as number) : '—'}
          </div>
        </div>

        {/* Recurring info */}
        {e.isRecurring && (
          <div className="hidden min-w-[110px] text-xs lg:block">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Recurrence
            </div>
            <div className="font-medium">
              {e.frequency.replace('_', ' ')} · {e.occurrenceNo}/{e.occurrenceTotal}
            </div>
          </div>
        )}

        {/* Status badge */}
        <div className="hidden lg:block">
          {statusBadge(effectiveEventStatus(e, todayIso))}
        </div>

        {/* Action buttons — pinned to the right */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {e.status === 'pending' ? (
            <>
              <Button size="sm" variant="outline" onClick={() => onSkip(e.id)}>
                Skip
              </Button>
              <Button size="sm" onClick={() => onMarkDone(e.id)}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark done
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onReopen(e.id)}>
              Reopen
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            title="Edit event"
            onClick={() => onEdit(e.id)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Delete (move to Recycle Bin)"
            onClick={() => onDelete(e.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    );
  };

  const Section = ({
    label,
    tone,
    items,
  }: {
    label: string;
    tone?: 'danger' | 'warning' | 'success' | 'muted';
    items: Event[];
  }) => {
    if (items.length === 0) return null;
    const labelColor =
      tone === 'danger'
        ? 'text-destructive'
        : tone === 'warning'
          ? 'text-amber-600 dark:text-amber-400'
          : tone === 'success'
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-muted-foreground';
    return (
      <section className="space-y-2">
        <h2
          className={cn(
            'flex items-center gap-2 text-xs font-semibold uppercase tracking-wide',
            labelColor,
          )}
        >
          {label}
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {items.length}
          </span>
        </h2>
        <div className="space-y-2">{items.map(renderCard)}</div>
      </section>
    );
  };

  return (
    <div className="space-y-5">
      <Section label="Overdue" tone="danger" items={overdue} />
      <Section label="This week" tone="warning" items={thisWeek} />
      <Section label="Upcoming" items={upcoming} />
      <Section label="Completed" tone="success" items={completed} />
      <Section label="Skipped" tone="muted" items={skipped} />
    </div>
  );
};

// ---------------- Calendar stats row ----------------

const CalendarStats = ({
  year,
  month,
  events,
  chips,
}: {
  year: number;
  month: number;
  events: Event[];
  chips: Chip[];
}) => {
  // First/last day of the displayed month.
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const monthStartIso = toLocalIso(monthStart);
  const monthEndIso = toLocalIso(monthEnd);

  // Counts pulled from the *calendar events* domain only.
  const monthEvents = events.filter(
    (e) => e.eventDate >= monthStartIso && e.eventDate <= monthEndIso,
  );
  const pendingThisMonth = monthEvents.filter((e) => e.status === 'pending').length;
  const completedThisMonth = monthEvents.filter(
    (e) => e.status === 'completed',
  ).length;

  // "Upcoming in next 7 days" counts every visible chip (events,
  // premiums, MF SIPs, repayments, maturity) so the user sees the
  // total upcoming workload regardless of source.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(today.getDate() + 7);
  const todayIso = toLocalIso(today);
  const in7Iso = toLocalIso(in7);
  const upcoming7 = chips.filter(
    (c) => !c.isDone && c.date >= todayIso && c.date <= in7Iso,
  );
  const overdueChips = chips.filter((c) => !c.isDone && c.date < todayIso);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Events this month"
        value={String(monthEvents.length)}
        sub={`${pendingThisMonth} pending · ${completedThisMonth} done`}
      />
      <StatTile
        label="Upcoming next 7 days"
        value={String(upcoming7.length)}
        sub="Across all sources"
        tone="info"
      />
      <StatTile
        label="Overdue"
        value={String(overdueChips.length)}
        sub={overdueChips.length === 0 ? 'Nothing past due' : 'Past due, not done'}
        tone={overdueChips.length > 0 ? 'danger' : undefined}
      />
      <StatTile
        label="Total on screen"
        value={String(chips.length)}
        sub={`${monthStart.toLocaleString('default', { month: 'short' })} ${year}`}
      />
    </div>
  );
};

const StatTile = ({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'info' | 'danger' | 'success';
}) => {
  const color =
    tone === 'info'
      ? 'text-sky-600 dark:text-sky-400'
      : tone === 'danger'
        ? 'text-destructive'
        : tone === 'success'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-foreground';
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', color)}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
};

// ---------------- Chip popup card ----------------

const KIND_LABEL: Record<ChipKind, string> = {
  event: 'Calendar event',
  premium: 'Policy premium',
  maturity: 'Policy maturity',
  mf_sip: 'Mutual fund SIP',
  repayment: 'Repayment',
};

const KIND_OPEN_VERB: Record<ChipKind, string> = {
  event: 'Open event',
  premium: 'Open policy',
  maturity: 'Open policy',
  mf_sip: 'Open mutual fund',
  repayment: 'Open repayments',
};

const ChipPopup = ({
  chip,
  siblings,
  onClose,
  onOpen,
  onPickSibling,
  onMarkDone,
  onSkip,
  onReopen,
}: {
  chip: Chip | null;
  siblings: Chip[];
  onClose: () => void;
  onOpen: (c: Chip) => void;
  onPickSibling: (c: Chip) => void;
  // Only relevant for calendar event chips — policies/MFs/repayments
  // are marked complete via their own flows in their respective pages.
  onMarkDone: (c: Chip) => void;
  onSkip: (c: Chip) => void;
  onReopen: (c: Chip) => void;
}) => {
  if (!chip) return null;
  const hasAmount = chip.amount !== null && chip.amount > 0;
  const isEvent = chip.kind === 'event';
  return (
    <Dialog open={Boolean(chip)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span
              className={cn('h-3 w-3 rounded-full', chip.dotClass)}
              aria-hidden
            />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {KIND_LABEL[chip.kind]}
            </span>
            {chip.isDone && (
              <Badge variant="secondary" className="ml-auto">
                Done
              </Badge>
            )}
          </div>
          <DialogTitle className="mt-1 text-2xl leading-tight">
            {chip.title}
          </DialogTitle>
          {chip.subtitle && (
            <DialogDescription>{chip.subtitle}</DialogDescription>
          )}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Date
            </div>
            <div className="mt-0.5 text-sm font-medium">
              {formatDate(chip.date)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Amount
            </div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums">
              {hasAmount ? formatCurrencyPaise(chip.amount as number) : '—'}
            </div>
          </div>
        </div>

        {/* "Also on this day" — every other chip sharing the same date. */}
        {siblings.length > 0 && (
          <div className="border-t pt-3">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Also on this day ({siblings.length})
            </div>
            <ul className="max-h-44 space-y-1 overflow-y-auto">
              {siblings.map((s) => {
                const sAmt =
                  s.amount !== null && s.amount > 0
                    ? formatCurrencyPaise(s.amount)
                    : null;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => onPickSibling(s)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left text-sm hover:bg-accent/50',
                        s.isDone && 'line-through opacity-60',
                      )}
                    >
                      <span
                        className={cn(
                          'h-2.5 w-2.5 shrink-0 rounded-full',
                          s.dotClass,
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      {sAmt && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {sAmt}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter className="flex flex-wrap justify-end gap-2 sm:justify-end">
          {/* Event-specific quick actions. For policy / MF / repayment
              chips the popup is purely informational + "Open" → users
              mark those rows complete in their own pages. */}
          {isEvent && !chip.isDone && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSkip(chip)}
              >
                <XIcon className="h-3.5 w-3.5" />
                Skip
              </Button>
              <Button
                size="sm"
                onClick={() => onMarkDone(chip)}
              >
                <Check className="h-3.5 w-3.5" />
                Mark done
              </Button>
            </>
          )}
          {isEvent && chip.isDone && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onReopen(chip)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reopen
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpen(chip)}>
            <ExternalLink className="h-3.5 w-3.5" />
            {KIND_OPEN_VERB[chip.kind]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
