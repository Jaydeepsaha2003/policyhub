import { useEffect, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isoToday } from '@/lib/utils';
import { toast } from 'sonner';

type Props = {
  paymentId: string | null;
  defaultAmount: number;
  onClose: () => void;
  onSaved: () => void;
};

export const MarkPaidDialog = ({ paymentId, defaultAmount, onClose, onSaved }: Props) => {
  const [paidDate, setPaidDate] = useState(isoToday());
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('UPI');
  const [penalty, setPenalty] = useState<string>('0');
  const [lateFee, setLateFee] = useState<string>('0');
  const [receipt, setReceipt] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (paymentId) {
      setPaidDate(isoToday());
      setPaidAmount(String(defaultAmount || ''));
      setPaymentMethod('UPI');
      setPenalty('0');
      setLateFee('0');
      setReceipt('');
      setNotes('');
    }
  }, [paymentId, defaultAmount]);

  const submit = async () => {
    if (!paymentId) return;
    if (!paidDate) {
      toast.error('Paid date is required');
      return;
    }
    if (paidDate > isoToday()) {
      toast.error("Paid date can't be in the future");
      return;
    }
    const amt = Number(paidAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Paid amount must be greater than zero');
      return;
    }
    const pen = Number(penalty);
    const late = Number(lateFee);
    if (Number.isFinite(pen) && pen < 0) {
      toast.error('GST cannot be negative');
      return;
    }
    if (Number.isFinite(late) && late < 0) {
      toast.error('Late fee cannot be negative');
      return;
    }
    setSaving(true);
    try {
      await window.policyhub.payments.markPaid({
        paymentId,
        paidDate,
        paidAmount: amt,
        paymentMethod,
        penaltyAmount: Math.max(0, pen || 0),
        lateFee: Math.max(0, late || 0),
        receiptNo: receipt || undefined,
        notes: notes || undefined,
      });
      toast.success('Payment recorded');
      onSaved();
      onClose();
    } catch (err) {
      toast.error('Could not save', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(paymentId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark payment as paid</DialogTitle>
          <DialogDescription>Record receipt details for this installment.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Paid date</Label>
            <DateInputDMY
              value={paidDate}
              onChange={(iso) => {
                if (iso && iso > isoToday()) {
                  toast.error("Paid date can't be in the future");
                  return;
                }
                setPaidDate(iso);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Paid amount (₹)</Label>
            <Input
              type="number"
              step="0.01"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Receipt no</Label>
            <Input value={receipt} onChange={(e) => setReceipt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>GST (₹)</Label>
            <Input
              type="number"
              step="0.01"
              value={penalty}
              onChange={(e) => setPenalty(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Late fee (₹)</Label>
            <Input
              type="number"
              step="0.01"
              value={lateFee}
              onChange={(e) => setLateFee(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !paidDate || !paidAmount}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
