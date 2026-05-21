import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Activity,
  AlertTriangle,
  CalendarClock,
  IndianRupee,
  ReceiptText,
  TrendingUp,
} from 'lucide-react';
import { useRouter } from '@/lib/router';
import { formatCurrencyPaise, formatDate, isoToday } from '@/lib/utils';
import { MarkPaidDialog } from './mark-paid-dialog';
import { toast } from 'sonner';
import { PeriodToggle, type Period } from '@/components/period-toggle';
import { BarChart } from '@/components/bar-chart';
import { Input } from '@/components/ui/input';

type Overview = {
  period: Period;
  from: string;
  to: string;
  totalActivePolicies: number;
  premiumsDueInWindow: number;
  premiumsPaidInWindow: number;
  policiesMaturingInWindow: number;
  outstandingOverdueAmount: number;
  overdueCount: number;
  duePendingAmount: number;
  collectedInWindow: number;
  latePenaltyInWindow: number;
  remindersSentLast7Days: number;
};

type SeriesPoint = {
  label: string;
  bucketStart: string;
  bucketEnd: string;
  dueAmount: number;
  paidAmount: number;
};

type Maturing = {
  id: string;
  policyNo: string;
  policyHolder: string;
  companyName: string;
  planName: string;
  maturityDate: string;
  sumAssured: number;
};

type MonthRow = {
  id: string;
  installmentNo: number;
  dueDate: string;
  expectedAmount: number;
  status: 'pending' | 'paid' | 'overdue';
  paidDate: string | null;
  paidAmount: number | null;
  policyId: string;
  policyNo: string;
  policyHolder: string;
  companyName: string;
};

export const DashboardPage = () => {
  const { navigate } = useRouter();
  const [period, setPeriod] = useState<Period>('monthly');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const customRange = customFrom && customTo ? { from: customFrom, to: customTo } : null;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [maturing, setMaturing] = useState<Maturing[]>([]);
  const [monthRows, setMonthRows] = useState<MonthRow[]>([]);
  const [markPaymentId, setMarkPaymentId] = useState<string | null>(null);
  const [markDefault, setMarkDefault] = useState(0);

  const load = async () => {
    try {
      const [ov, s, m, mr] = await Promise.all([
        window.policyhub.dashboard.overview(period, customRange),
        window.policyhub.dashboard.series(period),
        window.policyhub.dashboard.maturing(period, customRange),
        window.policyhub.dashboard.currentMonth(),
      ]);
      setOverview(ov as Overview);
      setSeries(s as SeriesPoint[]);
      setMaturing(m as Maturing[]);
      setMonthRows(mr as MonthRow[]);
    } catch (err) {
      toast.error('Failed to load dashboard', { description: (err as Error).message });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo]);

  const today = isoToday();
  const monthStatusBadge = (r: MonthRow) => {
    if (r.status === 'paid') return <Badge variant="success">Paid</Badge>;
    if (r.status === 'overdue' || r.dueDate < today) return <Badge variant="danger">Overdue</Badge>;
    return <Badge variant="warning">Pending</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Overview</div>
          <div className="text-xs text-muted-foreground">
            {overview ? (
              <>
                {formatDate(overview.from)} – {formatDate(overview.to)}
                {customRange ? ' · custom range' : ''}
              </>
            ) : (
              'Loading…'
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodToggle value={period} onChange={setPeriod} />
          <div className="flex items-center gap-1 rounded-md border bg-card p-1">
            <span className="px-1.5 text-xs text-muted-foreground">From</span>
            <Input
              type="date"
              className="h-7 w-36 border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span className="px-1.5 text-xs text-muted-foreground">To</span>
            <Input
              type="date"
              className="h-7 w-36 border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
            {(customFrom || customTo) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setCustomFrom('');
                  setCustomTo('');
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          icon={<Activity className="h-4 w-4 text-primary" />}
          label="Active policies"
          value={overview?.totalActivePolicies ?? '—'}
          description="Currently in force"
        />
        <MetricCard
          icon={<CalendarClock className="h-4 w-4 text-violet-500" />}
          label="Maturing"
          value={overview?.policiesMaturingInWindow ?? '—'}
          description="In this window"
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          label="Premiums due"
          value={overview?.premiumsDueInWindow ?? '—'}
          description="Pending + overdue"
        />
        <MetricCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          label="Collected"
          value={overview ? formatCurrencyPaise(overview.collectedInWindow) : '—'}
          description={`${overview?.premiumsPaidInWindow ?? 0} payments`}
        />
        <MetricCard
          icon={<IndianRupee className="h-4 w-4 text-red-500" />}
          label="Outstanding overdue"
          value={overview ? formatCurrencyPaise(overview.outstandingOverdueAmount) : '—'}
          description={`${overview?.overdueCount ?? 0} item(s)`}
        />
        <MetricCard
          icon={<ReceiptText className="h-4 w-4 text-amber-500" />}
          label="Late fees + penalty"
          value={overview ? formatCurrencyPaise(overview.latePenaltyInWindow) : '—'}
          description="Collected in window"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trend</CardTitle>
          <CardDescription>
            {period === 'monthly'
              ? 'Last 12 months'
              : period === 'quarterly'
                ? 'Last 8 quarters'
                : 'Last 5 years'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {series.length > 0 ? (
            <BarChart data={series} />
          ) : (
            <div className="text-sm text-muted-foreground">No data yet.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current — outstanding & paid</CardTitle>
          <CardDescription>
            {(() => {
              const monthStart = new Date();
              monthStart.setDate(1);
              const monthStartIso = monthStart.toISOString().slice(0, 10);
              const previousOutstanding = monthRows.filter(
                (r) => r.status !== 'paid' && r.dueDate < monthStartIso,
              ).length;
              const currentMonth = monthRows.filter(
                (r) => r.dueDate >= monthStartIso || (r.status === 'paid' && (r.paidDate ?? '') >= monthStartIso),
              ).length;
              return (
                <>
                  Includes carry-forward outstandings from previous months plus
                  this month's installments.{' '}
                  {previousOutstanding > 0 && (
                    <span className="font-medium text-destructive">
                      {previousOutstanding} previous outstanding
                      {previousOutstanding === 1 ? '' : 's'}
                    </span>
                  )}
                  {previousOutstanding > 0 && currentMonth > 0 ? ' · ' : ''}
                  {currentMonth > 0 && (
                    <span>
                      {currentMonth} this month
                    </span>
                  )}
                </>
              );
            })()}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {monthRows.length === 0 ? (
            <TableEmpty>No installments fall in the current month.</TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthRows.map((r) => {
                  const isOverdue = r.status === 'overdue' || (r.status !== 'paid' && r.dueDate < today);
                  return (
                    <TableRow
                      key={r.id}
                      className={
                        isOverdue
                          ? 'cursor-pointer bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60'
                          : 'cursor-pointer'
                      }
                      onClick={() => navigate(`/policies/${r.policyId}`)}
                    >
                      <TableCell className="font-medium">{r.policyNo}</TableCell>
                      <TableCell>{r.policyHolder}</TableCell>
                      <TableCell>{r.companyName}</TableCell>
                      <TableCell>{formatDate(r.dueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyPaise(r.expectedAmount)}
                      </TableCell>
                      <TableCell>{monthStatusBadge(r)}</TableCell>
                      <TableCell className="text-right">
                        {r.status !== 'paid' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMarkDefault(r.expectedAmount / 100);
                              setMarkPaymentId(r.id);
                            }}
                          >
                            Mark paid
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Policies maturing in this window</CardTitle>
          <CardDescription>
            {maturing.length === 0 ? 'None' : `${maturing.length} policy(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {maturing.length === 0 ? (
            <TableEmpty>Nothing matures in this window.</TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>Company / plan</TableHead>
                  <TableHead>Maturity date</TableHead>
                  <TableHead className="text-right">Sum assured</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maturing.map((m) => (
                  <TableRow
                    key={m.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/policies/${m.id}`)}
                  >
                    <TableCell className="font-medium">{m.policyNo}</TableCell>
                    <TableCell>{m.policyHolder}</TableCell>
                    <TableCell>
                      {m.companyName} <span className="text-muted-foreground">· {m.planName}</span>
                    </TableCell>
                    <TableCell>{formatDate(m.maturityDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyPaise(m.sumAssured)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MarkPaidDialog
        paymentId={markPaymentId}
        defaultAmount={markDefault}
        onClose={() => setMarkPaymentId(null)}
        onSaved={() => load()}
      />
    </div>
  );
};

const MetricCard = ({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  description: string;
}) => (
  <Card>
    <CardContent className="p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </CardContent>
  </Card>
);
