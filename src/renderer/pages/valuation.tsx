import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Calculator, Info, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatCurrencyPaise, formatDate, isoToday } from '@/lib/utils';

type Policy = {
  id: string;
  policyNo: string;
  policyHolder: string;
  companyName: string;
  planName: string;
  sumAssured: number;
  commencementDate: string;
  maturityDate: string;
  paymentMode: string;
};

type Payment = {
  id: string;
  policyId: string;
  status: 'pending' | 'paid' | 'overdue';
  paidDate: string | null;
  paidAmount: number | null;
  expectedAmount: number;
  dueDate: string;
};

type Repayment = {
  id: string;
  status: 'pending' | 'received' | 'overdue' | 'cancelled';
  receivedDate: string | null;
};

type CompoundingFrequency = 'annual' | 'half_yearly' | 'quarterly' | 'monthly';

const compoundingsPerYear = (f: CompoundingFrequency): number => {
  switch (f) {
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'half_yearly':
      return 2;
    case 'annual':
      return 1;
  }
};

type Params = {
  roi: string; // string so the user can type freely
  freq: CompoundingFrequency;
  valDate: string;
};

type Calc = {
  totalContributed: number;       // total of all premium amounts contributing to the valuation
  estimatedValuation: number;     // proportionate compounded value at the valuation date
  contributionsCount: number;     // how many installments were included
  paramsUsed: Params;
};

// COMPOUND INTEREST valuation:
//   For each scheduled premium installment with due_date <= valuation_date:
//     n = compoundings per year (12 / 4 / 2 / 1)
//     t = years between due_date and valuation_date
//     value_at_val_date = principal * (1 + ROI/n)^(n * t)
//   estimatedValuation = sum of those values
//
// Notes:
// - "Paid or not" doesn't matter — only the schedule does.
// - Premiums whose due_date is AFTER valuation_date are skipped.
// - Compounding frequency DOES affect the result:
//   Monthly > Quarterly > Half-yearly > Annual (for the same ROI and t > 0).
const monthsBetween = (from: Date, to: Date): number => {
  // calendar-month diff with a fractional day correction so partial months
  // still count.
  const years = to.getFullYear() - from.getFullYear();
  const months = to.getMonth() - from.getMonth();
  const dayDelta = to.getDate() - from.getDate();
  return years * 12 + months + dayDelta / 30.4375;
};

const computeValuation = (
  payments: Payment[],
  params: Params,
): Calc => {
  const r = Number(params.roi) / 100;
  const n = compoundingsPerYear(params.freq);
  const valDate = new Date(params.valDate);
  let total = 0;
  let count = 0;
  let valuationPaise = 0;
  for (const p of payments) {
    const due = new Date(p.dueDate);
    if (Number.isNaN(due.getTime()) || due > valDate) continue;
    const principalPaise = p.expectedAmount;
    total += principalPaise;
    count += 1;
    const yearsElapsed = Math.max(0, monthsBetween(due, valDate) / 12);
    if (!Number.isFinite(r) || r < 0 || yearsElapsed === 0) {
      valuationPaise += principalPaise;
    } else {
      const factor = Math.pow(1 + r / n, n * yearsElapsed);
      valuationPaise += principalPaise * factor;
    }
  }
  return {
    totalContributed: total,
    estimatedValuation: Math.round(valuationPaise),
    contributionsCount: count,
    paramsUsed: params,
  };
};

type ReceivedStatus = 'not_received' | 'partial' | 'received';

const summarizeReceived = (repayments: Repayment[]): ReceivedStatus => {
  if (repayments.length === 0) return 'not_received';
  const total = repayments.length;
  const received = repayments.filter((r) => r.status === 'received').length;
  if (received === 0) return 'not_received';
  if (received === total) return 'received';
  return 'partial';
};

export const ValuationPage = () => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paymentsByPolicy, setPaymentsByPolicy] = useState<Record<string, Payment[]>>({});
  const [repaymentsByPolicy, setRepaymentsByPolicy] = useState<Record<string, Repayment[]>>({});
  const [globalRoi, setGlobalRoi] = useState('8');
  const [globalFreq, setGlobalFreq] = useState<CompoundingFrequency>('annual');
  const [globalValDate, setGlobalValDate] = useState(isoToday());
  // Per-policy overrides. Each entry has roi/freq/valDate. If a policy id is
  // missing here, the global values apply when it's selected.
  const [perRow, setPerRow] = useState<Record<string, Params>>({});
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [results, setResults] = useState<Record<string, Calc>>({});

  useEffect(() => {
    (async () => {
      try {
        const list = (await window.policyhub.policies.list()) as Policy[];
        setPolicies(list);
      } catch (err) {
        toast.error('Failed to load policies', { description: (err as Error).message });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Make sure every selected policy has a perRow entry, initialised from globals.
  useEffect(() => {
    setPerRow((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of selected) {
        if (!next[id]) {
          next[id] = { roi: globalRoi, freq: globalFreq, valDate: globalValDate };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(policies.map((p) => p.id)));
  const selectNone = () => setSelected(new Set());

  const paramsFor = (id: string): Params =>
    perRow[id] ?? { roi: globalRoi, freq: globalFreq, valDate: globalValDate };

  const updateRow = (id: string, patch: Partial<Params>) =>
    setPerRow((prev) => ({
      ...prev,
      [id]: { ...paramsFor(id), ...patch },
    }));

  const applyGlobalsToAll = () => {
    setPerRow((prev) => {
      const next: Record<string, Params> = {};
      for (const id of Object.keys(prev)) {
        next[id] = { roi: globalRoi, freq: globalFreq, valDate: globalValDate };
      }
      // also pre-fill for currently selected rows that aren't in `prev`
      for (const id of selected) {
        if (!next[id]) {
          next[id] = { roi: globalRoi, freq: globalFreq, valDate: globalValDate };
        }
      }
      return next;
    });
    toast.success('Applied global parameters to all rows');
  };

  const runCalc = async () => {
    if (selected.size === 0) {
      toast.error('Pick at least one policy');
      return;
    }
    // Validate every selected row's ROI and valuation date.
    for (const id of selected) {
      const p = paramsFor(id);
      const r = Number(p.roi);
      if (!Number.isFinite(r) || r < 0 || r > 100) {
        toast.error(`ROI must be between 0 and 100 for the selected policy`);
        return;
      }
      if (!p.valDate) {
        toast.error(`Valuation date is missing for the selected policy`);
        return;
      }
      const policy = policies.find((x) => x.id === id);
      if (
        policy &&
        policy.commencementDate &&
        p.valDate < policy.commencementDate
      ) {
        toast.error(
          `Valuation date can't be before commencement for ${policy.policyNo}`,
        );
        return;
      }
    }
    setCalculating(true);
    try {
      const next: Record<string, Calc> = {};
      const pCache = { ...paymentsByPolicy };
      const rCache = { ...repaymentsByPolicy };
      for (const policyId of selected) {
        if (!pCache[policyId]) {
          pCache[policyId] = (await window.policyhub.payments.listByPolicy(policyId)) as Payment[];
        }
        if (!rCache[policyId]) {
          rCache[policyId] = (await window.policyhub.repayments.list({ policyId })) as Repayment[];
        }
        next[policyId] = computeValuation(pCache[policyId], paramsFor(policyId));
      }
      setPaymentsByPolicy(pCache);
      setRepaymentsByPolicy(rCache);
      setResults(next);
    } catch (err) {
      toast.error('Calculation failed', { description: (err as Error).message });
    } finally {
      setCalculating(false);
    }
  };

  const totals = useMemo(() => {
    let totalContributed = 0;
    let totalValuation = 0;
    for (const id of Object.keys(results)) {
      totalContributed += results[id].totalContributed;
      totalValuation += results[id].estimatedValuation;
    }
    return { totalContributed, totalValuation };
  }, [results]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Global defaults</CardTitle>
          <CardDescription>
            These values pre-fill each row when you select a policy. Edit the per-row
            inputs in the table below to override for specific policies.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-5">
          <div className="space-y-1.5">
            <Label>ROI (% per annum)</Label>
            <Input
              type="number"
              step="0.01"
              value={globalRoi}
              onChange={(e) => setGlobalRoi(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Compounding frequency</Label>
            <Select value={globalFreq} onValueChange={(v) => setGlobalFreq(v as CompoundingFrequency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="half_yearly">Half-yearly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valuation date</Label>
            <Input
              type="date"
              value={globalValDate}
              onChange={(e) => setGlobalValDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={applyGlobalsToAll} className="w-full">
              <RotateCcw className="h-4 w-4" />
              Apply to all rows
            </Button>
          </div>
          <div className="flex items-end">
            <Button onClick={runCalc} disabled={calculating} className="w-full">
              <Calculator className="h-4 w-4" />
              {calculating ? 'Calculating…' : 'Calculate'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <div>
          <span className="font-medium text-foreground">Formula (compound interest):</span>{' '}
          for each scheduled premium installment with due date ≤ valuation date,{' '}
          <code>value = principal × (1 + ROI/n)<sup>n × t</sup></code> where{' '}
          <code>n</code> is the compounding frequency (12 / 4 / 2 / 1) and{' '}
          <code>t</code> is the years between due date and valuation date. Total
          valuation is the sum across all such installments. Paid/unpaid status is
          ignored. "Received?" is informational only. Higher frequency → higher value
          for the same ROI.
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Policies</CardTitle>
            <CardDescription>
              {selected.size} of {policies.length} selected — each row has its own
              ROI / frequency / valuation date.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select all
            </Button>
            <Button variant="outline" size="sm" onClick={selectNone}>
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Loading policies…
            </div>
          ) : policies.length === 0 ? (
            <TableEmpty>No policies in the database yet.</TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Policy / holder</TableHead>
                  <TableHead className="w-[110px]">ROI (%)</TableHead>
                  <TableHead className="w-[140px]">Frequency</TableHead>
                  <TableHead className="w-[150px]">Valuation date</TableHead>
                  <TableHead className="text-right">Sum assured</TableHead>
                  <TableHead className="text-right">Total contributed</TableHead>
                  <TableHead>Received?</TableHead>
                  <TableHead className="text-right">Estimated valuation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => {
                  const isSelected = selected.has(p.id);
                  const r = results[p.id];
                  const params = paramsFor(p.id);
                  return (
                    <TableRow key={p.id} className={isSelected ? 'bg-accent/30' : ''}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(p.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{p.policyNo}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.policyHolder} · {p.companyName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          disabled={!isSelected}
                          value={params.roi}
                          onChange={(e) => updateRow(p.id, { roi: e.target.value })}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={params.freq}
                          disabled={!isSelected}
                          onValueChange={(v) =>
                            updateRow(p.id, { freq: v as CompoundingFrequency })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="annual">Annual</SelectItem>
                            <SelectItem value="half_yearly">Half-yearly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          disabled={!isSelected}
                          value={params.valDate}
                          onChange={(e) => updateRow(p.id, { valDate: e.target.value })}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyPaise(p.sumAssured)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r ? formatCurrencyPaise(r.totalContributed) : '—'}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const reps = repaymentsByPolicy[p.id];
                          if (!reps) return <span className="text-muted-foreground">—</span>;
                          if (reps.length === 0)
                            return <Badge variant="secondary">No tracking</Badge>;
                          const status = summarizeReceived(reps);
                          if (status === 'received')
                            return <Badge variant="success">Fully received</Badge>;
                          if (status === 'partial')
                            return (
                              <Badge variant="warning">
                                {reps.filter((x) => x.status === 'received').length}/
                                {reps.length} received
                              </Badge>
                            );
                          return <Badge variant="secondary">Not received</Badge>;
                        })()}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {r ? formatCurrencyPaise(r.estimatedValuation) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {Object.keys(results).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Totals across selection</CardTitle>
            <CardDescription>
              Sum of per-policy valuations using each row's own parameters.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Stat label="Total contributed" value={formatCurrencyPaise(totals.totalContributed)} />
            <Stat
              label="Estimated valuation"
              value={formatCurrencyPaise(totals.totalValuation)}
              accent
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Stat = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) => (
  <div className="rounded-md border p-4">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? 'text-primary' : ''}`}>
      {value}
    </div>
  </div>
);

// Mark unused imports as references to keep TS happy.
void formatDate;
