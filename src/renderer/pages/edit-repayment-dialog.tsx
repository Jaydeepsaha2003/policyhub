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

type Status = 'pending' | 'received' | 'overdue' | 'cancelled';

export type EditableRepayment = {
  id: string;
  policyId: string | null;
  title: string;
  amount: number; // paise
  expectedDate: string;
  status: Status;
  receivedDate: string | null;
  receivedAmount: number | null; // paise
  receivedSource: string | null;
  receivedSourceName: string | null;
  refNo: string | null;
  notes: string | null;
};

export const EditRepaymentDialog = ({
  repayment,
  policies,
  onClose,
  onSaved,
}: {
  repayment: EditableRepayment | null;
  policies: { id: string; policyNo: string; policyHolder: string }[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [status, setStatus] = useState<Status>('pending');
  const [policyId, setPolicyId] = useState<string>('none');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [source, setSource] = useState('Bank');
  const [sourceName, setSourceName] = useState('');
  const [refNo, setRefNo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!repayment) return;
    setStatus(repayment.status);
    setPolicyId(repayment.policyId ?? 'none');
    setTitle(repayment.title);
    setAmount(String(repayment.amount / 100));
    setExpectedDate(repayment.expectedDate);
    setReceivedDate(repayment.receivedDate ?? '');
    setReceivedAmount(
      repayment.receivedAmount !== null
        ? String(repayment.receivedAmount / 100)
        : String(repayment.amount / 100),
    );
    setSource(repayment.receivedSource ?? 'Bank');
    setSourceName(repayment.receivedSourceName ?? '');
    setRefNo(repayment.refNo ?? '');
    setNotes(repayment.notes ?? '');
  }, [repayment]);

  const submit = async () => {
    if (!repayment) return;
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Expected amount must be greater than zero');
      return;
    }
    if (!expectedDate) {
      toast.error('Expected date is required');
      return;
    }
    if (status === 'received') {
      if (!receivedDate) {
        toast.error('Received date is required for received status');
        return;
      }
      if (receivedDate > isoToday()) {
        toast.error("Received date can't be in the future");
        return;
      }
      const ra = Number(receivedAmount);
      if (!Number.isFinite(ra) || ra <= 0) {
        toast.error('Received amount must be greater than zero');
        return;
      }
    }

    setSaving(true);
    try {
      await window.policyhub.repayments.update({
        id: repayment.id,
        status,
        policyId: policyId === 'none' ? null : policyId,
        title,
        amount: amt,
        expectedDate,
        receivedDate: status === 'received' ? receivedDate : null,
        receivedAmount: status === 'received' ? Number(receivedAmount) : null,
        receivedSource: status === 'received' ? source : null,
        receivedSourceName: status === 'received' ? sourceName || null : null,
        refNo: status === 'received' ? refNo || null : null,
        notes: notes || null,
      });
      toast.success('Repayment updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error('Save failed', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(repayment)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit repayment</DialogTitle>
          <DialogDescription>
            Change any field including status. Switching status to "received"
            will require received date and amount.
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
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Linked policy</Label>
            <Select value={policyId} onValueChange={setPolicyId}>
              <SelectTrigger>
                <SelectValue />
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
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Expected amount (₹)</Label>
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

          {status === 'received' && (
            <>
              <div className="space-y-1.5">
                <Label>Received date</Label>
                <Input
                  type="date"
                  value={receivedDate}
                  max={isoToday()}
                  onChange={(e) => {
                    if (e.target.value && e.target.value > isoToday()) {
                      toast.error("Received date can't be in the future");
                      return;
                    }
                    setReceivedDate(e.target.value);
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
                <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ref no</Label>
                <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} />
              </div>
            </>
          )}

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
