import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInputDMY } from '@/components/ui/date-input-dmy';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isoToday, formatCurrencyPaise, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

type Pending = {
  id: string;
  installmentNo: number;
  dueDate: string;
  expectedAmount: number;
  status: 'pending' | 'paid' | 'overdue';
};

type Props = {
  open: boolean;
  policyId: string;
  pending: Pending[];
  onClose: () => void;
  onSaved: () => void;
};

export const BulkPayDialog = ({ open, policyId, pending, onClose, onSaved }: Props) => {
  const [upToDate, setUpToDate] = useState(isoToday());
  const [method, setMethod] = useState('UPI');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setUpToDate(isoToday());
      setMethod('UPI');
    }
  }, [open]);

  const affected = useMemo(
    () =>
      pending.filter(
        (p) => p.status !== 'paid' && p.dueDate <= upToDate,
      ),
    [pending, upToDate],
  );
  const totalPaise = affected.reduce((s, r) => s + r.expectedAmount, 0);

  const submit = async () => {
    setSaving(true);
    try {
      const updated = await window.policyhub.payments.markAllPaidUpTo({
        policyId,
        upToDate,
        paymentMethod: method,
      });
      toast.success(`Marked ${updated} installment(s) as paid`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error('Bulk pay failed', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark all installments paid up to a date</DialogTitle>
          <DialogDescription>
            Use this when you're entering an older policy and need to back-fill several paid
            premiums at once. Each affected installment will be marked paid with{' '}
            <span className="font-medium">paid date = its due date</span> and{' '}
            <span className="font-medium">paid amount = expected amount</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Mark paid up to and including</Label>
            <DateInputDMY
              value={upToDate}
              onChange={(iso) => setUpToDate(iso)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
                <SelectItem value="Auto-debit">Auto-debit</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Card">Card</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only applied where method is currently blank.
            </p>
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          {affected.length === 0 ? (
            <span className="text-muted-foreground">
              No pending installments on or before this date.
            </span>
          ) : (
            <>
              <div className="font-medium">
                {affected.length} installment(s) will be marked paid · total{' '}
                {formatCurrencyPaise(totalPaise)}
              </div>
              <div className="mt-2 max-h-32 space-y-0.5 overflow-auto text-xs text-muted-foreground">
                {affected.slice(0, 8).map((a) => (
                  <div key={a.id}>
                    #{a.installmentNo} · {formatDate(a.dueDate)} ·{' '}
                    {formatCurrencyPaise(a.expectedAmount)}
                  </div>
                ))}
                {affected.length > 8 && (
                  <div className="italic">…and {affected.length - 8} more</div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || affected.length === 0}>
            Mark {affected.length} paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
