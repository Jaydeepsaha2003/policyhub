import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, FileDown, FileUp, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrencyPaise, formatDate, isoToday } from '@/lib/utils';

type Repayment = {
  id: string;
  policyId: string | null;
  policyNo: string | null;
  policyHolder: string | null;
  title: string;
  installmentNo: number;
  frequency: 'one_time' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  expectedDate: string;
  amount: number; // paise
  status: 'pending' | 'received' | 'overdue' | 'cancelled';
  receivedDate: string | null;
  receivedAmount: number | null;
  receivedSource: string | null;
  receivedSourceName: string | null;
  refNo: string | null;
  notes: string | null;
};

type PolicyLite = { id: string; policyNo: string; policyHolder: string };

const statusBadge = (s: Repayment['status']) => {
  switch (s) {
    case 'received':
      return <Badge variant="success">Received</Badge>;
    case 'overdue':
      return <Badge variant="danger">Overdue</Badge>;
    case 'pending':
      return <Badge variant="warning">Pending</Badge>;
    case 'cancelled':
      return <Badge variant="secondary">Cancelled</Badge>;
  }
};

const freqLabel = (f: Repayment['frequency']) =>
  f === 'one_time'
    ? 'One-time'
    : f === 'monthly'
      ? 'Monthly'
      : f === 'quarterly'
        ? 'Quarterly'
        : f === 'half_yearly'
          ? 'Half-yearly'
          : 'Yearly';

export const RepaymentsPage = () => {
  const [rows, setRows] = useState<Repayment[]>([]);
  const [policies, setPolicies] = useState<PolicyLite[]>([]);
  const [status, setStatus] = useState<string>('all');
  const [policyId, setPolicyId] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [markReceivedFor, setMarkReceivedFor] = useState<Repayment | null>(null);
  const [importResult, setImportResult] = useState<{
    totalRows: number;
    updated: number;
    skipped: number;
    errors: { row: number; reason: string }[];
  } | null>(null);

  const load = async () => {
    try {
      const [r, pol]: any = await Promise.all([
        window.policyhub.repayments.list({
          status: status === 'all' ? undefined : status,
          policyId: policyId === 'all' ? undefined : policyId,
          from: from || undefined,
          to: to || undefined,
        }),
        window.policyhub.policies.list(),
      ]);
      setRows(r as Repayment[]);
      setPolicies(
        (pol as any[]).map((p) => ({
          id: p.id,
          policyNo: p.policyNo,
          policyHolder: p.policyHolder,
        })),
      );
    } catch (err) {
      toast.error('Failed to load repayments', { description: (err as Error).message });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, policyId, from, to]);

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const res: any = await window.policyhub.repayments.downloadTemplate();
      if (res?.saved) {
        toast.success('Template saved', {
          description: `${res.rowCount ?? 0} pending/overdue · ${res.path}`,
        });
      }
    } catch (err) {
      toast.error('Could not generate template', { description: (err as Error).message });
    } finally {
      setDownloading(false);
    }
  };

  const uploadTemplate = async () => {
    setImporting(true);
    try {
      const res = await window.policyhub.repayments.importTemplate();
      if (!res.picked) return;
      setImportResult(res);
      await load();
    } catch (err) {
      toast.error('Import failed', { description: (err as Error).message });
    } finally {
      setImporting(false);
    }
  };

  const policyMap = useMemo(() => new Map(policies.map((p) => [p.id, p])), [policies]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={policyId} onValueChange={setPolicyId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Policy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All policies</SelectItem>
              {policies.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.policyNo} — {p.policyHolder}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add repayment
            </Button>
            <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Download template
            </Button>
            <Button variant="outline" size="sm" onClick={uploadTemplate} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              Upload filled template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <TableEmpty>
              <div>No repayments match these filters.</div>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                Add your first repayment
              </Button>
            </TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead className="text-right">Expected ₹</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Received on</TableHead>
                  <TableHead className="text-right">Received ₹</TableHead>
                  <TableHead>Source / Ref</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.policyNo ? (
                        <>
                          <div className="font-medium">{r.policyNo}</div>
                          <div className="text-xs text-muted-foreground">{r.policyHolder}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell>{freqLabel(r.frequency)}</TableCell>
                    <TableCell>{r.installmentNo}</TableCell>
                    <TableCell>{formatDate(r.expectedDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyPaise(r.amount)}
                    </TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell>
                      {r.receivedDate ? (
                        formatDate(r.receivedDate)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.receivedAmount !== null ? (
                        formatCurrencyPaise(r.receivedAmount)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status === 'received' ? (
                        <div className="text-xs">
                          <div>
                            {r.receivedSource ?? '—'}
                            {r.receivedSourceName ? ` · ${r.receivedSourceName}` : ''}
                          </div>
                          {r.refNo && (
                            <div className="text-muted-foreground">Ref: {r.refNo}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.status !== 'received' && r.status !== 'cancelled' && (
                          <Button size="sm" variant="outline" onClick={() => setMarkReceivedFor(r)}>
                            Mark received
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" title="Delete">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this repayment?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{r.title}" (installment {r.installmentNo}) will be removed.
                                This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive hover:bg-destructive/90"
                                onClick={async () => {
                                  try {
                                    await window.policyhub.repayments.remove(r.id);
                                    toast.success('Repayment deleted');
                                    await load();
                                  } catch (err) {
                                    toast.error('Delete failed', {
                                      description: (err as Error).message,
                                    });
                                  }
                                }}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddRepaymentDialog
        open={addOpen}
        policies={policies}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          load();
        }}
      />

      <MarkReceivedDialog
        repayment={markReceivedFor}
        onClose={() => setMarkReceivedFor(null)}
        onSaved={() => {
          setMarkReceivedFor(null);
          load();
        }}
      />

      <Dialog
        open={Boolean(importResult)}
        onOpenChange={(o) => !o && setImportResult(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk update result</DialogTitle>
            <DialogDescription>Repayments file import summary.</DialogDescription>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <Summary label="Updated" value={importResult.updated} color="text-emerald-600" />
                <Summary label="Skipped" value={importResult.skipped} color="text-muted-foreground" />
                <Summary label="Errors" value={importResult.errors.length} color="text-destructive" />
              </div>
              {importResult.errors.length > 0 && (
                <div className="max-h-64 overflow-auto rounded-md border p-3 text-xs">
                  {importResult.errors.map((e, i) => (
                    <div key={i} className="border-b py-1 last:border-0">
                      <span className="font-medium">Row {e.row}</span>
                      <span className="text-destructive"> — {e.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* keep policyMap referenced */}
      <span className="hidden">{policyMap.size}</span>
    </div>
  );
};

// ============ Add Repayment dialog ============

const AddRepaymentDialog = ({
  open,
  policies,
  onClose,
  onSaved,
}: {
  open: boolean;
  policies: PolicyLite[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [policyId, setPolicyId] = useState<string>('none');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [expectedDate, setExpectedDate] = useState(isoToday());
  const [frequency, setFrequency] = useState<Repayment['frequency']>('one_time');
  const [count, setCount] = useState('1');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPolicyId('none');
      setTitle('');
      setAmount('');
      setExpectedDate(isoToday());
      setFrequency('one_time');
      setCount('1');
      setNotes('');
    }
  }, [open]);

  const submit = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Amount must be greater than zero');
      return;
    }
    if (!expectedDate) {
      toast.error('Expected date is required');
      return;
    }
    const requestedCount = frequency === 'one_time' ? 1 : Number(count) || 1;
    if (frequency !== 'one_time' && (requestedCount < 1 || requestedCount > 1000)) {
      toast.error('Installment count must be between 1 and 1000');
      return;
    }
    const c = Math.max(1, Math.min(1000, requestedCount));
    setSaving(true);
    try {
      const ids = await window.policyhub.repayments.createBatch({
        policyId: policyId === 'none' ? null : policyId,
        title,
        amount: amt,
        expectedDate,
        frequency,
        count: c,
        notes: notes || undefined,
      });
      toast.success(
        ids.length === 1 ? 'Repayment added' : `${ids.length} repayments added`,
      );
      onSaved();
    } catch (err) {
      toast.error('Could not save', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add repayment</DialogTitle>
          <DialogDescription>
            Record an expected incoming receipt — survival benefit, money-back, regular
            income maturity, commission, etc. Pick a recurring frequency and PolicyHub
            generates that many rows.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Linked policy (optional)</Label>
            <Select value={policyId} onValueChange={setPolicyId}>
              <SelectTrigger>
                <SelectValue placeholder="No specific policy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No specific policy —</SelectItem>
                {policies.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.policyNo} — {p.policyHolder}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Survival benefit, money-back installment, commission Q1 …"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Amount (₹) <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Expected date</Label>
            <Input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">One-time</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="half_yearly">Half-yearly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Number of installments</Label>
            <Input
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              disabled={frequency === 'one_time'}
            />
            <p className="text-[11px] text-muted-foreground">
              {frequency === 'one_time'
                ? 'One-time: a single row is created.'
                : `Generates ${Math.max(1, Number(count) || 1)} rows spaced by the chosen frequency.`}
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ============ Mark Received dialog ============

const MarkReceivedDialog = ({
  repayment,
  onClose,
  onSaved,
}: {
  repayment: Repayment | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [receivedDate, setReceivedDate] = useState(isoToday());
  const [receivedAmount, setReceivedAmount] = useState('');
  const [source, setSource] = useState('Bank');
  const [sourceName, setSourceName] = useState('');
  const [refNo, setRefNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingPremiumCount, setPendingPremiumCount] = useState<number | null>(null);

  useEffect(() => {
    if (repayment) {
      setReceivedDate(isoToday());
      setReceivedAmount(String(repayment.amount / 100));
      setSource('Bank');
      setSourceName('');
      setRefNo('');
      setNotes('');
      setPendingPremiumCount(null);

      // For repayments tied to a policy, check if any premiums are still unpaid
      // and surface a warning before the user records receipt of money from
      // that policy.
      if (repayment.policyId) {
        (async () => {
          try {
            const list = (await window.policyhub.payments.listByPolicy(
              repayment.policyId!,
            )) as { status: string }[];
            const unpaid = list.filter(
              (p) => p.status === 'pending' || p.status === 'overdue',
            ).length;
            setPendingPremiumCount(unpaid);
          } catch {
            // ignore — non-blocking
          }
        })();
      }
    }
  }, [repayment]);

  const submit = async () => {
    if (!repayment) return;
    if (!receivedDate) {
      toast.error('Received date is required');
      return;
    }
    if (receivedDate > isoToday()) {
      toast.error("Received date can't be in the future");
      return;
    }
    const amt = Number(receivedAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Received amount must be greater than zero');
      return;
    }
    setSaving(true);
    try {
      await window.policyhub.repayments.markReceived({
        id: repayment.id,
        receivedDate,
        receivedAmount: amt,
        receivedSource: source,
        receivedSourceName: sourceName || undefined,
        refNo: refNo || undefined,
        notes: notes || undefined,
      });
      toast.success('Marked received');
      onSaved();
    } catch (err) {
      toast.error('Save failed', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(repayment)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark repayment received</DialogTitle>
          <DialogDescription>
            {repayment ? (
              <>
                {repayment.title} · installment {repayment.installmentNo} ·{' '}
                {formatCurrencyPaise(repayment.amount)} expected{' '}
                {formatDate(repayment.expectedDate)}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {pendingPremiumCount !== null && pendingPremiumCount > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">
                Heads up — this policy still has {pendingPremiumCount} unpaid
                premium installment{pendingPremiumCount === 1 ? '' : 's'}.
              </div>
              <div>
                You can still record this receipt, but verify the policy's
                premium status first (Policies → open the policy → Payment
                timeline).
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Received date</Label>
            <Input
              type="date"
              value={receivedDate}
              max={isoToday()}
              onChange={(e) => {
                const v = e.target.value;
                if (v && v > isoToday()) {
                  toast.error("Received date can't be in the future");
                  return;
                }
                setReceivedDate(v);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Received amount (₹)</Label>
            <Input
              type="number"
              step="0.01"
              value={receivedAmount}
              onChange={(e) => setReceivedAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Bank">Bank</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Credit Card">Credit Card</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source name</Label>
            <Input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="HDFC Bank, ICICI Visa …"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ref no</Label>
            <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !receivedDate || !receivedAmount}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Summary = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="rounded-md border p-3 text-center">
    <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);
