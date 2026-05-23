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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { isoToday } from '@/lib/utils';

type Status = 'pending' | 'paid' | 'overdue';

export type EditablePayment = {
  id: string;
  installmentNo: number;
  dueDate: string;
  expectedAmount: number; // paise
  status: Status;
  paidDate: string | null;
  paidAmount: number | null; // paise
  paymentMethod: string | null;
  paymentSource: string | null;
  paymentSourceName: string | null;
  receiptNo: string | null;
  penaltyAmount: number;
  lateFee: number;
  notes: string | null;
};

export const EditPaymentDialog = ({
  payment,
  onClose,
  onSaved,
}: {
  payment: EditablePayment | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [status, setStatus] = useState<Status>('pending');
  const [dueDate, setDueDate] = useState('');
  const [expectedAmount, setExpectedAmount] = useState('');
  const [paidDate, setPaidDate] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentSource, setPaymentSource] = useState('Bank');
  const [paymentSourceName, setPaymentSourceName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [receiptNo, setReceiptNo] = useState('');
  const [penalty, setPenalty] = useState('0');
  const [lateFee, setLateFee] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!payment) return;
    setStatus(payment.status);
    setDueDate(payment.dueDate);
    setExpectedAmount(String(payment.expectedAmount / 100));
    setPaidDate(payment.paidDate ?? '');
    setPaidAmount(
      payment.paidAmount !== null
        ? String(payment.paidAmount / 100)
        : String(payment.expectedAmount / 100),
    );
    setPaymentSource(payment.paymentSource ?? 'Bank');
    setPaymentSourceName(payment.paymentSourceName ?? '');
    setPaymentMethod(payment.paymentMethod ?? 'UPI');
    setReceiptNo(payment.receiptNo ?? '');
    setPenalty(String((payment.penaltyAmount ?? 0) / 100));
    setLateFee(String((payment.lateFee ?? 0) / 100));
    setNotes(payment.notes ?? '');
  }, [payment]);

  const submit = async () => {
    if (!payment) return;
    if (!dueDate) {
      toast.error('Due date is required');
      return;
    }
    const ea = Number(expectedAmount);
    if (!Number.isFinite(ea) || ea <= 0) {
      toast.error('Expected amount must be greater than zero');
      return;
    }
    if (status === 'paid') {
      if (!paidDate) {
        toast.error('Paid date is required for paid status');
        return;
      }
      if (paidDate > isoToday()) {
        toast.error("Paid date can't be in the future");
        return;
      }
      const pa = Number(paidAmount);
      if (!Number.isFinite(pa) || pa <= 0) {
        toast.error('Paid amount must be greater than zero');
        return;
      }
    }
    const pen = Number(penalty);
    if (!Number.isFinite(pen) || pen < 0) {
      toast.error('Penalty cannot be negative');
      return;
    }
    const lf = Number(lateFee);
    if (!Number.isFinite(lf) || lf < 0) {
      toast.error('Late fee cannot be negative');
      return;
    }

    setSaving(true);
    try {
      await window.policyhub.payments.update({
        id: payment.id,
        status,
        dueDate,
        expectedAmount: ea,
        paidDate: status === 'paid' ? paidDate : null,
        paidAmount: status === 'paid' ? Number(paidAmount) : null,
        paymentMethod: status === 'paid' ? paymentMethod : null,
        paymentSource: status === 'paid' ? paymentSource : null,
        paymentSourceName: status === 'paid' ? paymentSourceName || null : null,
        receiptNo: status === 'paid' ? receiptNo || null : null,
        penaltyAmount: pen,
        lateFee: lf,
        notes: notes || null,
      });
      toast.success('Payment updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error('Save failed', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(payment)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit payment</DialogTitle>
          <DialogDescription>
            {payment ? <>Installment #{payment.installmentNo}</> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <DateInputDMY value={dueDate} onChange={(iso) => setDueDate(iso)} />
          </div>
          <div className="space-y-1.5">
            <Label>Expected amount (₹)</Label>
            <Input
              type="number"
              step="0.01"
              value={expectedAmount}
              onChange={(e) => setExpectedAmount(e.target.value)}
            />
          </div>
          {status === 'paid' && (
            <>
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
                <Label>Payment source</Label>
                <Select value={paymentSource} onValueChange={setPaymentSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bank">Bank</SelectItem>
                    <SelectItem value="Credit Card">Credit Card</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Auto-debit">Auto-debit</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source name</Label>
                <Input
                  value={paymentSourceName}
                  onChange={(e) => setPaymentSourceName(e.target.value)}
                  placeholder="HDFC Bank, HDFC Infinia …"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Method</Label>
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
                <Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Penalty (₹)</Label>
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
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
