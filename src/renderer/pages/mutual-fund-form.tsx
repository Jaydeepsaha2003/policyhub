import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import { DateInputDMY } from '@/components/ui/date-input-dmy';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRouter } from '@/lib/router';
import { toast } from 'sonner';
import { isoToday, paiseToRupees } from '@/lib/utils';

type Props = { mode: 'create' } | { mode: 'edit'; id: string };

type MfType = 'lumpsum' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

type Form = {
  folioNo: string;
  accountHolder: string;
  agentName: string;
  agentContact: string;
  provider: string;
  schemeName: string;
  type: MfType;
  amount: string;
  startDate: string;
  status: 'active' | 'redeemed' | 'closed';
  debitBankName: string;
  debitAccountNo: string;
  debitIfsc: string;
  debitAccountHolder: string;
  debitBranchName: string;
  notes: string;
};

const empty = (): Form => ({
  folioNo: '',
  accountHolder: '',
  agentName: '',
  agentContact: '',
  provider: '',
  schemeName: '',
  type: 'lumpsum',
  amount: '',
  startDate: isoToday(),
  status: 'active',
  debitBankName: '',
  debitAccountNo: '',
  debitIfsc: '',
  debitAccountHolder: '',
  debitBranchName: '',
  notes: '',
});

export const MutualFundFormPage = (props: Props) => {
  const { navigate } = useRouter();
  const [form, setForm] = useState<Form>(empty());
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(props.mode === 'create');
  // Snapshot of the loaded values in edit mode — used to diff against
  // the form state at submit time so we can confirm a schedule change.
  const [initialSnapshot, setInitialSnapshot] = useState<{
    type: MfType;
    amount: number; // rupees
    startDate: string;
  } | null>(null);
  const [scheduleConfirm, setScheduleConfirm] = useState<
    | {
        diffs: { label: string; before: string; after: string }[];
      }
    | null
  >(null);

  useEffect(() => {
    if (props.mode === 'edit') {
      (async () => {
        try {
          const r: any = await window.policyhub.mutualFunds.get(props.id);
          if (!r) {
            toast.error('Mutual fund not found');
            navigate('/mutual-funds');
            return;
          }
          setForm({
            folioNo: r.folioNo,
            accountHolder: r.accountHolder,
            agentName: r.agentName ?? '',
            agentContact: r.agentContact ?? '',
            provider: r.provider,
            schemeName: r.schemeName,
            type: r.type,
            amount: String(paiseToRupees(r.amount)),
            startDate: r.startDate,
            status: r.status,
            debitBankName: r.debitBankName ?? '',
            debitAccountNo: r.debitAccountNo ?? '',
            debitIfsc: r.debitIfsc ?? '',
            debitAccountHolder: r.debitAccountHolder ?? '',
            debitBranchName: r.debitBranchName ?? '',
            notes: r.notes ?? '',
          });
          setInitialSnapshot({
            type: r.type,
            amount: paiseToRupees(r.amount),
            startDate: r.startDate,
          });
          setLoaded(true);
        } catch (err) {
          toast.error('Load failed', { description: (err as Error).message });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildPayload = () => {
    const amt = Number(form.amount);
    return {
      folioNo: form.folioNo.trim(),
      accountHolder: form.accountHolder.trim(),
      agentName: form.agentName.trim() || undefined,
      agentContact: form.agentContact.trim() || undefined,
      provider: form.provider.trim(),
      schemeName: form.schemeName.trim(),
      type: form.type,
      amount: amt,
      startDate: form.startDate,
      // No installmentCount — the repo defaults it from `type`.
      status: form.status,
      debitBankName: form.debitBankName.trim() || undefined,
      debitAccountNo: form.debitAccountNo.trim() || undefined,
      debitIfsc: form.debitIfsc.trim() || undefined,
      debitAccountHolder: form.debitAccountHolder.trim() || undefined,
      debitBranchName: form.debitBranchName.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
  };

  const submit = async () => {
    if (!form.folioNo.trim()) return toast.error('Folio number is required');
    if (!form.accountHolder.trim()) return toast.error('Account holder is required');
    if (!form.provider.trim()) return toast.error('Provider / AMC is required');
    if (!form.schemeName.trim()) return toast.error('Scheme name is required');
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0)
      return toast.error('Amount must be greater than zero');

    // Edit mode + a schedule-affecting field changed → confirm first.
    // updateMutualFund will regenerate pending SIP installments on the
    // Payments tab.
    if (props.mode === 'edit' && initialSnapshot) {
      const diffs: { label: string; before: string; after: string }[] = [];
      if (initialSnapshot.type !== form.type) {
        diffs.push({
          label: 'Type / Frequency',
          before: initialSnapshot.type,
          after: form.type,
        });
      }
      if (initialSnapshot.amount !== amt) {
        diffs.push({
          label: 'Amount',
          before: `₹${initialSnapshot.amount}`,
          after: `₹${amt}`,
        });
      }
      if (initialSnapshot.startDate !== form.startDate) {
        diffs.push({
          label: 'Start date',
          before: initialSnapshot.startDate,
          after: form.startDate,
        });
      }
      if (diffs.length > 0) {
        setScheduleConfirm({ diffs });
        return;
      }
    }

    await doSave();
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      if (props.mode === 'create') {
        const r = (await window.policyhub.mutualFunds.create(payload)) as any;
        toast.success('Mutual fund added');
        navigate(`/mutual-funds/${r.id}`);
      } else {
        await window.policyhub.mutualFunds.update(props.id, payload);
        toast.success('Mutual fund updated');
        navigate(`/mutual-funds/${props.id}`);
      }
    } catch (err) {
      toast.error('Save failed', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Folio number" required>
            <Input
              value={form.folioNo}
              onChange={(e) => setForm({ ...form, folioNo: e.target.value })}
              placeholder="e.g. 1234567/89"
            />
          </Field>
          <Field label="Account holder" required>
            <Input
              value={form.accountHolder}
              onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
            />
          </Field>
          <Field label="Provider / AMC" required>
            <Input
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              placeholder="e.g. SBI, HDFC, ICICI Prudential"
            />
          </Field>
          <Field label="Scheme name" required>
            <Input
              value={form.schemeName}
              onChange={(e) => setForm({ ...form, schemeName: e.target.value })}
              placeholder="e.g. SBI Bluechip Direct Growth"
            />
          </Field>
          <Field label="Type / Frequency">
            <Select
              value={form.type}
              onValueChange={(v) => setForm({ ...form, type: v as MfType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lumpsum">Lumpsum (one-time)</SelectItem>
                <SelectItem value="monthly">Monthly SIP</SelectItem>
                <SelectItem value="quarterly">Quarterly SIP</SelectItem>
                <SelectItem value="half_yearly">Half-yearly SIP</SelectItem>
                <SelectItem value="yearly">Yearly SIP</SelectItem>
              </SelectContent>
            </Select>
            {form.type !== 'lumpsum' && (
              <p className="text-[11px] text-muted-foreground">
                Installments are generated automatically for a 10-year horizon
                from the start date. Mark the fund as Redeemed / Closed when
                you stop investing.
              </p>
            )}
          </Field>
          <Field
            label={
              form.type === 'lumpsum'
                ? 'Investment amount (₹)'
                : 'Per-installment amount (₹)'
            }
            required
          >
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label="Start date" required>
            <DateInputDMY
              value={form.startDate}
              onChange={(iso) => setForm({ ...form, startDate: iso })}
            />
          </Field>
          <Field label="Agent name">
            <Input
              value={form.agentName}
              onChange={(e) => setForm({ ...form, agentName: e.target.value })}
            />
          </Field>
          <Field label="Agent contact">
            <Input
              value={form.agentContact}
              onChange={(e) => setForm({ ...form, agentContact: e.target.value })}
              placeholder="Phone or email"
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm({ ...form, status: v as Form['status'] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="redeemed">Redeemed</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Notes">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Debit account</h3>
          <p className="text-xs text-muted-foreground">
            The bank account this {form.type === 'monthly' ? 'SIP' : 'investment'}{' '}
            is debited from. Used as the default source when you mark
            an installment paid — you can override it per installment.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Bank name">
            <Input
              value={form.debitBankName}
              onChange={(e) => setForm({ ...form, debitBankName: e.target.value })}
              placeholder="e.g. HDFC Bank"
            />
          </Field>
          <Field label="Account number">
            <Input
              value={form.debitAccountNo}
              onChange={(e) => setForm({ ...form, debitAccountNo: e.target.value })}
            />
          </Field>
          <Field label="IFSC">
            <Input
              value={form.debitIfsc}
              onChange={(e) =>
                setForm({ ...form, debitIfsc: e.target.value.toUpperCase() })
              }
              placeholder="e.g. HDFC0001234"
            />
          </Field>
          <Field label="Account holder">
            <Input
              value={form.debitAccountHolder}
              onChange={(e) =>
                setForm({ ...form, debitAccountHolder: e.target.value })
              }
            />
          </Field>
          <Field label="Branch">
            <Input
              value={form.debitBranchName}
              onChange={(e) =>
                setForm({ ...form, debitBranchName: e.target.value })
              }
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/mutual-funds')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : props.mode === 'create' ? 'Create' : 'Save changes'}
          </Button>
        </div>
      </CardContent>

      {/* Confirmation when a schedule-affecting field changed. */}
      <AlertDialog
        open={Boolean(scheduleConfirm)}
        onOpenChange={(o) => !o && setScheduleConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm schedule change</AlertDialogTitle>
            <AlertDialogDescription>
              Saving will regenerate this fund's <strong>pending</strong>{' '}
              installments on the Payments tab. Past paid installments
              are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {scheduleConfirm && scheduleConfirm.diffs.length > 0 && (
            <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs">
              {scheduleConfirm.diffs.map((d) => (
                <div key={d.label} className="grid grid-cols-3 gap-2">
                  <span className="font-medium text-muted-foreground">
                    {d.label}
                  </span>
                  <span className="line-through text-muted-foreground">
                    {d.before}
                  </span>
                  <span className="font-medium">{d.after}</span>
                </div>
              ))}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setScheduleConfirm(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setScheduleConfirm(null);
                await doSave();
              }}
            >
              Save & regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

const Field = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label>
      {label} {required && <span className="text-destructive">*</span>}
    </Label>
    {children}
  </div>
);
