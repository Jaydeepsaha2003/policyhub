import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from '@/components/ui/table';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useRouter } from '@/lib/router';
import { policySchema, type PolicyFormValues } from '../../shared/validation';
import { generateInstallments } from '../../shared/installments';
import { formatDate, paiseToRupeesUI } from '@/lib/form-helpers';
import { AttachmentsPanel } from './attachments-panel';
import { DateInputDMY } from '@/components/ui/date-input-dmy';

type Props = {
  mode: 'create' | 'edit';
  initial?: Partial<PolicyFormValues> & { id?: string };
  onSaved?: (id: string) => void;
};

// Fields that, when changed, regenerate the policy's pending payment
// installments and/or auto-generated maturity repayments. Surfaced in
// the confirmation dialog so the user sees what's about to change.
const describeScheduleDiffs = (
  before: PolicyFormValues,
  after: PolicyFormValues,
): { label: string; before: string; after: string }[] => {
  const fmt = (v: unknown): string =>
    v === null || v === undefined || v === '' ? '—' : String(v);
  const out: { label: string; before: string; after: string }[] = [];
  if (Number(before.premiumAmount) !== Number(after.premiumAmount)) {
    out.push({
      label: 'Premium amount',
      before: `₹${fmt(before.premiumAmount)}`,
      after: `₹${fmt(after.premiumAmount)}`,
    });
  }
  if (before.paymentMode !== after.paymentMode) {
    out.push({
      label: 'Payment mode',
      before: fmt(before.paymentMode),
      after: fmt(after.paymentMode),
    });
  }
  if (
    Number(before.premiumPaymentTermMonths) !==
    Number(after.premiumPaymentTermMonths)
  ) {
    out.push({
      label: 'Premium payment term (months)',
      before: fmt(before.premiumPaymentTermMonths),
      after: fmt(after.premiumPaymentTermMonths),
    });
  }
  if (before.commencementDate !== after.commencementDate) {
    out.push({
      label: 'Commencement date',
      before: fmt(before.commencementDate),
      after: fmt(after.commencementDate),
    });
  }
  if (before.maturityDate !== after.maturityDate) {
    out.push({
      label: 'Maturity date',
      before: fmt(before.maturityDate),
      after: fmt(after.maturityDate),
    });
  }
  if (before.maturityType !== after.maturityType) {
    out.push({
      label: 'Maturity type',
      before: fmt(before.maturityType),
      after: fmt(after.maturityType),
    });
  }
  if ((before.maturityFrequency ?? null) !== (after.maturityFrequency ?? null)) {
    out.push({
      label: 'Maturity frequency',
      before: fmt(before.maturityFrequency),
      after: fmt(after.maturityFrequency),
    });
  }
  if (Number(before.sumAssured) !== Number(after.sumAssured)) {
    out.push({
      label: 'Sum assured',
      before: `₹${fmt(before.sumAssured)}`,
      after: `₹${fmt(after.sumAssured)}`,
    });
  }
  return out;
};

const defaults: PolicyFormValues = {
  policyNo: '',
  policyHolder: '',
  holderEmail: undefined,
  holderPhone: undefined,
  companyName: '',
  planName: '',
  premiumAmount: 0,
  yearlyTotalPremium: 0,
  paymentMode: 'yearly',
  sumAssured: 0,
  nomineeName: '',
  nomineeRelation: undefined,
  commencementDate: new Date().toISOString().slice(0, 10),
  maturityDate: new Date(new Date().setFullYear(new Date().getFullYear() + 20))
    .toISOString()
    .slice(0, 10),
  policyTermMonths: 240,
  premiumPaymentTermMonths: 240,
  branchName: undefined,
  agentName: undefined,
  agentContact: undefined,
  status: 'active',
  maturityType: 'lumpsum',
  maturityFrequency: undefined,
  maturityAccountDetails: undefined,
  maturityBankName: undefined,
  maturityAccountNo: undefined,
  maturityIfsc: undefined,
  maturityBranchName: undefined,
  maturityAccountHolder: undefined,
  notes: undefined,
};

const PAYMENTS_PER_YEAR = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  yearly: 1,
} as const;

// Field groups for the wizard (only used in create mode).
const STEPS = [
  {
    key: 'basic',
    title: 'Basic info',
    description: 'Policy identifier, holder, and insurer details.',
    // Fields to validate before allowing "Next".
    validate: ['policyNo', 'policyHolder', 'companyName', 'planName', 'holderEmail', 'holderPhone'] as const,
  },
  {
    key: 'premium',
    title: 'Premium & dates',
    description: 'Premium, payment mode, sum assured, and policy dates.',
    validate: [
      'premiumAmount',
      'paymentMode',
      'sumAssured',
      'commencementDate',
      'maturityDate',
      'premiumPaymentTermMonths',
      'policyTermMonths',
      'yearlyTotalPremium',
    ] as const,
  },
  {
    key: 'nominee',
    title: 'Nominee & agent',
    description: 'Nominee details and agent contact (optional).',
    validate: ['nomineeName', 'nomineeRelation', 'agentName', 'agentContact'] as const,
  },
  {
    key: 'notes',
    title: 'Notes',
    description: 'Any extra notes about this policy.',
    validate: [] as const,
  },
  {
    key: 'attachments',
    title: 'Attachments',
    description: 'Optionally attach the policy copy as PDF or image files.',
    validate: [] as const,
  },
] as const;

type StagedFile = { path: string; fileName: string; sizeBytes: number };

const formatBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export const PolicyFormPage = ({ mode, initial, onSaved }: Props) => {
  const { navigate } = useRouter();
  const [saving, setSaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [sumAssuredWarning, setSumAssuredWarning] = useState<PolicyFormValues | null>(null);
  // Holds the pending edit when one of the schedule-affecting fields
  // changed (premium amount, payment term, etc.). Saving will regenerate
  // pending installments and maturity repayments, so we confirm first.
  const [scheduleChangeConfirm, setScheduleChangeConfirm] = useState<{
    values: PolicyFormValues;
    diffs: { label: string; before: string; after: string }[];
  } | null>(null);
  // Track whether the user has manually edited Sum Assured. While untouched in
  // create mode we keep SA mirrored to 10× yearly premium (IRDA §80C default).
  const [sumAssuredTouched, setSumAssuredTouched] = useState(
    () => mode === 'edit' || Boolean(initial?.sumAssured),
  );

  const form = useForm<PolicyFormValues>({
    resolver: zodResolver(policySchema),
    defaultValues: { ...defaults, ...(initial ?? {}) },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (initial) form.reset({ ...defaults, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  const watched = form.watch();

  // Auto-calc: yearly total premium = premium amount × payments per year.
  useEffect(() => {
    const p = Number(watched.premiumAmount);
    const mode = watched.paymentMode;
    if (!Number.isFinite(p) || p < 0 || !mode) return;
    const multiplier = PAYMENTS_PER_YEAR[mode] ?? 1;
    const next = Math.round(p * multiplier * 100) / 100;
    if (next !== watched.yearlyTotalPremium) {
      form.setValue('yearlyTotalPremium', next, { shouldValidate: false, shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched.premiumAmount, watched.paymentMode]);

  // Auto-fill Sum Assured = 10× yearly premium while the user hasn't manually
  // edited it. Once they type something, we stop overwriting.
  useEffect(() => {
    if (sumAssuredTouched) return;
    const yp = Number(watched.yearlyTotalPremium);
    if (!Number.isFinite(yp) || yp <= 0) return;
    const next = Math.round(yp * 10 * 100) / 100;
    if (next !== watched.sumAssured) {
      form.setValue('sumAssured', next, { shouldValidate: false, shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched.yearlyTotalPremium, sumAssuredTouched]);

  // Auto-calc: policy term in MONTHS = full calendar months between commencement and maturity.
  useEffect(() => {
    const s = watched.commencementDate ? new Date(watched.commencementDate) : null;
    const e = watched.maturityDate ? new Date(watched.maturityDate) : null;
    if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return;
    if (e <= s) return;
    // Whole-month difference + day correction → rounded to nearest month.
    const yearsDiff = e.getFullYear() - s.getFullYear();
    const monthsDiff = e.getMonth() - s.getMonth();
    const dayDelta = e.getDate() - s.getDate();
    const months = Math.max(
      1,
      Math.round(yearsDiff * 12 + monthsDiff + dayDelta / 30.4375),
    );
    if (months !== watched.policyTermMonths) {
      form.setValue('policyTermMonths', months, { shouldValidate: false, shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watched.commencementDate, watched.maturityDate]);

  const preview = useMemo(() => {
    try {
      const ins = generateInstallments(
        watched.commencementDate,
        watched.paymentMode,
        Math.max(1, Number(watched.premiumPaymentTermMonths) || 1),
      );
      return ins.slice(0, 6);
    } catch {
      return [];
    }
  }, [watched.commencementDate, watched.paymentMode, watched.premiumPaymentTermMonths]);

  const onSubmit = async (values: PolicyFormValues) => {
    // In edit mode: if any schedule-affecting field changed, ask the
    // user to confirm before regenerating the pending payment + maturity
    // schedule. Past paid installments are preserved either way.
    if (mode === 'edit' && initial) {
      const diffs = describeScheduleDiffs(initial as PolicyFormValues, values);
      if (diffs.length > 0) {
        setScheduleChangeConfirm({ values, diffs });
        return;
      }
    }

    // Matured policies bypass the premium-side cross-field checks because
    // they may have been added with placeholder premium data.
    if (values.status !== 'matured') {
      // Hard rule: PPT cannot exceed policy term.
      if (
        Number.isFinite(values.premiumPaymentTermMonths) &&
        Number.isFinite(values.policyTermMonths) &&
        values.premiumPaymentTermMonths > values.policyTermMonths
      ) {
        toast.error(
          `Premium payment term (${values.premiumPaymentTermMonths} months) can't exceed policy term (${values.policyTermMonths} months).`,
        );
        return;
      }
      // Sum-assured rule: SA should be ≥ 10× yearly premium (IRDA Section 80C).
      // Warn but allow override.
      if (
        Number.isFinite(values.sumAssured) &&
        Number.isFinite(values.yearlyTotalPremium) &&
        values.yearlyTotalPremium > 0 &&
        values.sumAssured < 10 * values.yearlyTotalPremium
      ) {
        setSumAssuredWarning(values);
        return;
      }
    }
    await doSave(values);
  };

  const doSave = async (
    values: PolicyFormValues,
    opts?: { regenerateScope?: 'future_only' | 'including_overdue' },
  ) => {
    setSaving(true);
    try {
      if (mode === 'create') {
        const id = (await window.policyhub.policies.create(values)) as string;
        toast.success('Policy created');

        // Commit any staged attachment files now that we have a policy ID.
        if (stagedFiles.length > 0) {
          try {
            const result = await window.policyhub.attachments.commitPaths({
              policyId: id,
              paths: stagedFiles.map((f) => f.path),
            });
            if (result.added > 0) {
              toast.success(
                result.added === 1 ? 'File attached' : `${result.added} files attached`,
              );
            }
            if (result.errors.length > 0) {
              toast.error(`${result.errors.length} attachment(s) failed`, {
                description: result.errors
                  .map((e) => `${e.fileName}: ${e.reason}`)
                  .join('\n'),
              });
            }
          } catch (err) {
            toast.error('Attachment upload failed', {
              description: (err as Error).message,
            });
          }
        }

        if (onSaved) onSaved(id);
        else navigate(`/policies/${id}`);
      } else if (initial?.id) {
        await window.policyhub.policies.update(initial.id, values, opts);
        toast.success('Policy updated');
        if (onSaved) onSaved(initial.id);
      }
    } catch (err) {
      toast.error('Save failed', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const goNext = async () => {
    const step = STEPS[stepIndex];
    const fields = step.validate;
    if (fields.length === 0) {
      setStepIndex((s) => Math.min(STEPS.length - 1, s + 1));
      return;
    }

    // Cross-field check: PPT must be ≤ policy term. Root-level Zod refines
    // don't fire on per-field form.trigger, so check it here too.
    // Matured policies bypass this since premium fields are not required.
    if (step.key === 'premium' && watched.status !== 'matured') {
      const ppt = Number(watched.premiumPaymentTermMonths);
      const pt = Number(watched.policyTermMonths);
      if (Number.isFinite(ppt) && Number.isFinite(pt) && ppt > pt) {
        toast.error(
          `Premium payment term (${ppt} months) can't exceed policy term (${pt} months).`,
        );
        return;
      }
    }

    const ok = await form.trigger(fields as unknown as (keyof PolicyFormValues)[]);
    if (ok) {
      setStepIndex((s) => Math.min(STEPS.length - 1, s + 1));
    } else {
      toast.error('Please fill in the required fields on this step');
    }
  };

  const goBack = () => setStepIndex((s) => Math.max(0, s - 1));

  const errs = form.formState.errors;
  const reg = form.register;

  // Field sections, rendered conditionally based on layout (wizard vs tabs).
  const basicSection = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Policy no" required error={errs.policyNo?.message}>
        <Input {...reg('policyNo')} />
      </Field>
      <Field label="Status">
        <Select
          value={watched.status}
          onValueChange={(v) => form.setValue('status', v as any)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="active_ppt_over">Active — PPT Over</SelectItem>
            <SelectItem value="matured">Matured</SelectItem>
            <SelectItem value="lapsed">Lapsed</SelectItem>
            <SelectItem value="surrendered">Surrendered</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Policy holder" required error={errs.policyHolder?.message}>
        <Input {...reg('policyHolder')} />
      </Field>
      <Field label="Holder email" error={errs.holderEmail?.message}>
        <Input type="email" {...reg('holderEmail')} />
      </Field>
      <Field label="Holder phone" error={errs.holderPhone?.message}>
        <Input {...reg('holderPhone')} placeholder="+91 9876543210" />
      </Field>
      <Field label="Company" required error={errs.companyName?.message}>
        <Input {...reg('companyName')} placeholder="LIC, HDFC Life, ICICI Prudential…" />
      </Field>
      <Field label="Plan" required error={errs.planName?.message}>
        <Input {...reg('planName')} placeholder="Jeevan Anand, iSelect Smart Term…" />
      </Field>
      <Field label="Branch name">
        <Input {...reg('branchName')} />
      </Field>
    </div>
  );

  const isMatured = watched.status === 'matured';

  const premiumSection = (
    <div className="space-y-4">
      {isMatured && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="font-semibold">Matured policy mode.</span> Premium amount,
          payment mode, commencement date, policy term and PPT can be left blank or as
          placeholders — only maturity date, sum assured, and the maturity payout
          account fields below matter. No premium installments will be generated.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`Premium amount (₹)${isMatured ? ' — optional for matured' : ''}`}
          required={!isMatured}
          error={errs.premiumAmount?.message}
        >
          <Input
            type="number"
            step="0.01"
            {...reg('premiumAmount', { valueAsNumber: true })}
          />
        </Field>
        <Field label={`Payment mode${isMatured ? ' — optional' : ''}`} required={!isMatured}>
          <Select
            value={watched.paymentMode}
            onValueChange={(v) => form.setValue('paymentMode', v as any)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="half_yearly">Half-yearly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Yearly total premium (₹)"
          error={errs.yearlyTotalPremium?.message}
          hint="Auto-calculated from premium amount × payment mode"
        >
          <Input
            type="number"
            step="0.01"
            readOnly
            tabIndex={-1}
            className="bg-muted/40 text-muted-foreground"
            value={Number.isFinite(watched.yearlyTotalPremium) ? watched.yearlyTotalPremium : 0}
            onChange={() => {
              /* read-only */
            }}
          />
        </Field>
        <Field
          label={`Sum assured (₹)${isMatured ? ' — optional' : ''}`}
          required={!isMatured}
          error={errs.sumAssured?.message}
          hint={
            sumAssuredTouched || isMatured
              ? undefined
              : 'Auto-filled at 10× yearly premium — edit to override'
          }
        >
          <Input
            type="number"
            step="0.01"
            {...reg('sumAssured', { valueAsNumber: true })}
            onChange={(e) => {
              setSumAssuredTouched(true);
              reg('sumAssured', { valueAsNumber: true }).onChange(e);
            }}
          />
        </Field>
        <Field
          label={`Commencement date${isMatured ? ' — optional' : ''}`}
          required={!isMatured}
          error={errs.commencementDate?.message}
        >
          <DateInputDMY
            value={watched.commencementDate ?? ''}
            onChange={(iso) =>
              form.setValue('commencementDate', iso, { shouldValidate: true, shouldDirty: true })
            }
          />
        </Field>
        <Field label="Maturity date" required error={errs.maturityDate?.message}>
          <DateInputDMY
            value={watched.maturityDate ?? ''}
            onChange={(iso) =>
              form.setValue('maturityDate', iso, { shouldValidate: true, shouldDirty: true })
            }
          />
        </Field>
        <Field
          label="Policy term (months)"
          error={errs.policyTermMonths?.message}
          hint="Auto-calculated from commencement & maturity"
        >
          <Input
            type="number"
            readOnly
            tabIndex={-1}
            className="bg-muted/40 text-muted-foreground"
            value={Number.isFinite(watched.policyTermMonths) ? watched.policyTermMonths : 0}
            onChange={() => {
              /* read-only */
            }}
          />
        </Field>
        <Field
          label={`Premium payment term (months)${isMatured ? ' — optional' : ''}`}
          required={!isMatured}
          error={
            errs.premiumPaymentTermMonths?.message ??
            (Number.isFinite(watched.premiumPaymentTermMonths) &&
            Number.isFinite(watched.policyTermMonths) &&
            watched.premiumPaymentTermMonths > watched.policyTermMonths
              ? `PPT (${watched.premiumPaymentTermMonths} months) can't exceed policy term (${watched.policyTermMonths} months)`
              : undefined)
          }
        >
          <Input
            type="number"
            min={1}
            max={watched.policyTermMonths || undefined}
            {...reg('premiumPaymentTermMonths', { valueAsNumber: true })}
          />
        </Field>
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Maturity details</CardTitle>
            <CardDescription>
              What does the policy pay out at maturity, and where should it go?
            </CardDescription>
          </div>
          {initial?.id && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const r = await window.policyhub.policies.syncMaturity(initial.id!);
                  toast.success(
                    `Maturity tracking synced — ${r.created} row(s) created, ${r.removed} pending removed`,
                  );
                } catch (err) {
                  toast.error('Sync failed', { description: (err as Error).message });
                }
              }}
            >
              Sync maturity → Repayments
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Maturity type" required error={errs.maturityType?.message}>
              <Select
                value={watched.maturityType}
                onValueChange={(v) => form.setValue('maturityType', v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lumpsum">Lumpsum</SelectItem>
                  <SelectItem value="regular_income">Regular income</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {watched.maturityType === 'regular_income' && (
              <Field
                label="Income frequency"
                required
                error={errs.maturityFrequency?.message}
              >
                <Select
                  value={watched.maturityFrequency ?? ''}
                  onValueChange={(v) => form.setValue('maturityFrequency', v as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="half_yearly">Half-yearly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <div className="mt-4 space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Maturity payout account
            </Label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank name">
                <Input {...reg('maturityBankName')} placeholder="HDFC Bank" />
              </Field>
              <Field label="Account holder">
                <Input
                  {...reg('maturityAccountHolder')}
                  placeholder="Name on the bank account"
                />
              </Field>
              <Field label="Account number">
                <Input {...reg('maturityAccountNo')} placeholder="50100123456789" />
              </Field>
              <Field label="IFSC" error={errs.maturityIfsc?.message}>
                <Input
                  {...reg('maturityIfsc')}
                  placeholder="HDFC0000123"
                  style={{ textTransform: 'uppercase' }}
                />
              </Field>
              <Field label="Branch name">
                <Input {...reg('maturityBranchName')} placeholder="Salt Lake branch" />
              </Field>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm">Installment preview (first 6)</CardTitle>
          <CardDescription>
            Based on commencement, payment mode, and payment term.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="text-right">Amount (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((p) => (
                <TableRow key={p.installmentNo}>
                  <TableCell>{p.installmentNo}</TableCell>
                  <TableCell>{formatDate(p.dueDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {paiseToRupeesUI(watched.premiumAmount * 100)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  const nomineeSection = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nominee name" required error={errs.nomineeName?.message}>
        <Input {...reg('nomineeName')} />
      </Field>
      <Field label="Nominee relation">
        <Input {...reg('nomineeRelation')} placeholder="Spouse, Parent, Child…" />
      </Field>
      <Field label="Agent name">
        <Input {...reg('agentName')} />
      </Field>
      <Field label="Agent contact" error={errs.agentContact?.message}>
        <Input {...reg('agentContact')} placeholder="+91 9876543210" />
      </Field>
    </div>
  );

  const notesSection = (
    <Field label="Notes">
      <Textarea
        rows={6}
        {...reg('notes')}
        placeholder="Any additional information…"
      />
    </Field>
  );

  const pickFiles = async () => {
    try {
      const picked = await window.policyhub.attachments.pick();
      if (picked.length === 0) return;
      setStagedFiles((prev) => {
        const seen = new Set(prev.map((f) => f.path));
        return [...prev, ...picked.filter((f) => !seen.has(f.path))];
      });
    } catch (err) {
      toast.error('Could not pick files', { description: (err as Error).message });
    }
  };

  const removeStaged = (p: string) =>
    setStagedFiles((prev) => prev.filter((f) => f.path !== p));

  const stagedAttachmentsSection = (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          You can attach the policy copy as PDF or image files (up to 25 MB each).
          Files are committed after you click <span className="font-medium">Create policy</span>.
          This step is optional — you can also add files later from the policy detail page.
        </p>
        <Button type="button" variant="outline" onClick={pickFiles}>
          <Check className="h-4 w-4" />
          Choose files…
        </Button>
      </div>
      {stagedFiles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No files staged yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {stagedFiles.map((f) => (
            <Card key={f.path}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex-1 truncate">
                  <div className="truncate text-sm font-medium">{f.fileName}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(f.sizeBytes)} · {f.path}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeStaged(f.path)}
                >
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // ---------- Edit mode: keep the existing tabs layout ----------
  if (mode === 'edit') {
    return (
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Edit policy</CardTitle>
            <CardDescription>
              Premium installments are auto-generated for the full premium payment term.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="basic">
              <TabsList>
                <TabsTrigger value="basic">Basic info</TabsTrigger>
                <TabsTrigger value="premium">Premium & dates</TabsTrigger>
                <TabsTrigger value="nominee">Nominee & agent</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="attachments">Attachments</TabsTrigger>
              </TabsList>
              <TabsContent value="basic" className="space-y-4">
                {basicSection}
              </TabsContent>
              <TabsContent value="premium" className="space-y-4">
                {premiumSection}
              </TabsContent>
              <TabsContent value="nominee" className="space-y-4">
                {nomineeSection}
              </TabsContent>
              <TabsContent value="notes" className="space-y-4">
                {notesSection}
              </TabsContent>
              <TabsContent value="attachments" className="space-y-4">
                {initial?.id ? (
                  <AttachmentsPanel policyId={initial.id} />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Save the policy first to enable attachments.
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={() =>
              navigate(initial?.id ? `/policies/${initial.id}` : '/policies')
            }
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
        <SumAssuredWarningDialog
          values={sumAssuredWarning}
          onCancel={() => setSumAssuredWarning(null)}
          onProceed={async () => {
            const v = sumAssuredWarning!;
            setSumAssuredWarning(null);
            await doSave(v);
          }}
        />
        <ScheduleChangeDialog
          payload={scheduleChangeConfirm}
          onCancel={() => setScheduleChangeConfirm(null)}
          onProceed={async (scope) => {
            const v = scheduleChangeConfirm!.values;
            setScheduleChangeConfirm(null);
            // Re-run the rest of validation (sum assured, PPT vs term)
            // by going through onSubmit again, but with this same set of
            // values. To avoid loop, call doSave directly after the
            // checks below.
            if (v.status !== 'matured') {
              if (
                Number.isFinite(v.premiumPaymentTermMonths) &&
                Number.isFinite(v.policyTermMonths) &&
                v.premiumPaymentTermMonths > v.policyTermMonths
              ) {
                toast.error(
                  `Premium payment term (${v.premiumPaymentTermMonths} months) can't exceed policy term (${v.policyTermMonths} months).`,
                );
                return;
              }
              if (
                Number.isFinite(v.sumAssured) &&
                Number.isFinite(v.yearlyTotalPremium) &&
                v.yearlyTotalPremium > 0 &&
                v.sumAssured < 10 * v.yearlyTotalPremium
              ) {
                setSumAssuredWarning(v);
                return;
              }
            }
            await doSave(v, { regenerateScope: scope });
          }}
        />
      </form>
    );
  }

  // ---------- Create mode: wizard ----------
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const currentStep = STEPS[stepIndex];

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>New policy</CardTitle>
          <CardDescription>{currentStep.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step indicator */}
          <Stepper currentIndex={stepIndex} onJump={(i) => i < stepIndex && setStepIndex(i)} />

          {/* Current step body */}
          <div className="space-y-4">
            {currentStep.key === 'basic' && basicSection}
            {currentStep.key === 'premium' && premiumSection}
            {currentStep.key === 'nominee' && nomineeSection}
            {currentStep.key === 'notes' && notesSection}
            {currentStep.key === 'attachments' && stagedAttachmentsSection}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate('/policies')}
        >
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isFirst}
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </Button>
          {!isLast ? (
            <Button type="button" onClick={goNext}>
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create policy'}
              <Check className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <SumAssuredWarningDialog
        values={sumAssuredWarning}
        onCancel={() => setSumAssuredWarning(null)}
        onProceed={async () => {
          const v = sumAssuredWarning!;
          setSumAssuredWarning(null);
          await doSave(v);
        }}
      />
      {/* Create mode never triggers ScheduleChangeDialog because there's
          no "before" — kept mounted for symmetry; payload is always null. */}
      <ScheduleChangeDialog
        payload={scheduleChangeConfirm}
        onCancel={() => setScheduleChangeConfirm(null)}
        onProceed={async (scope) => {
          const v = scheduleChangeConfirm!.values;
          setScheduleChangeConfirm(null);
          await doSave(v, { regenerateScope: scope });
        }}
      />
    </form>
  );
};

const SumAssuredWarningDialog = ({
  values,
  onCancel,
  onProceed,
}: {
  values: PolicyFormValues | null;
  onCancel: () => void;
  onProceed: () => void;
}) => {
  return (
    <AlertDialog open={Boolean(values)} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sum assured looks low</AlertDialogTitle>
          <AlertDialogDescription>
            Under IRDA Section 80C, a policy is generally treated as
            tax-qualifying only if{' '}
            <span className="font-semibold">
              Sum assured ≥ 10 × yearly premium
            </span>
            .{' '}
            {values && (
              <>
                Your inputs give Sum assured ={' '}
                <span className="font-mono">₹{values.sumAssured.toLocaleString('en-IN')}</span>{' '}
                vs 10 × Yearly premium ={' '}
                <span className="font-mono">
                  ₹{(values.yearlyTotalPremium * 10).toLocaleString('en-IN')}
                </span>
                .
              </>
            )}{' '}
            You can save anyway, but the policy may not qualify for tax
            deduction.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Go back & fix</AlertDialogCancel>
          <AlertDialogAction onClick={onProceed}>Save anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Confirmation shown when the user edits a policy and changes one of
// the fields that drive the payment / maturity schedule.
const ScheduleChangeDialog = ({
  payload,
  onCancel,
  onProceed,
}: {
  payload:
    | { values: PolicyFormValues; diffs: { label: string; before: string; after: string }[] }
    | null;
  onCancel: () => void;
  onProceed: (scope: 'future_only' | 'including_overdue') => void;
}) => {
  const [scope, setScope] = useState<'future_only' | 'including_overdue'>(
    'future_only',
  );
  // Reset to default whenever the dialog reopens.
  useEffect(() => {
    if (payload) setScope('future_only');
  }, [payload]);
  return (
    <AlertDialog open={Boolean(payload)} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm schedule change</AlertDialogTitle>
          <AlertDialogDescription>
            You're about to change fields that drive this policy's schedule.
            Saving will regenerate installments on the Payments tab. Past{' '}
            <strong>paid</strong> installments are always preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {payload && payload.diffs.length > 0 && (
          <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs">
            {payload.diffs.map((d) => (
              <div key={d.label} className="grid grid-cols-3 gap-2">
                <span className="font-medium text-muted-foreground">{d.label}</span>
                <span className="line-through text-muted-foreground">{d.before}</span>
                <span className="font-medium">{d.after}</span>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Apply the new schedule to:
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-accent/40">
            <input
              type="radio"
              name="regen-scope"
              checked={scope === 'future_only'}
              onChange={() => setScope('future_only')}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="font-medium">From today forward only</div>
              <div className="text-xs text-muted-foreground">
                Only upcoming <strong>pending</strong> installments are updated.
                Past <strong>overdue</strong> installments keep their original
                amount and date — a clean historical record of what was owed.
              </div>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-accent/40">
            <input
              type="radio"
              name="regen-scope"
              checked={scope === 'including_overdue'}
              onChange={() => setScope('including_overdue')}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="font-medium">
                Also update past overdue installments
              </div>
              <div className="text-xs text-muted-foreground">
                Overdue rows are rewritten to the new schedule too. Use this
                when you're correcting a mistake in the original setup, not
                just changing terms going forward.
              </div>
            </div>
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onProceed(scope)}>
            Save & regenerate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// --- Stepper indicator ---

const STEP_LABELS = ['Basic info', 'Premium & dates', 'Nominee & agent', 'Notes', 'Attachments'];

const Stepper = ({
  currentIndex,
  onJump,
}: {
  currentIndex: number;
  onJump: (i: number) => void;
}) => (
  <div className="flex items-center">
    {STEP_LABELS.map((label, i) => {
      const done = i < currentIndex;
      const active = i === currentIndex;
      return (
        <div key={label} className="flex flex-1 items-center">
          <button
            type="button"
            onClick={() => onJump(i)}
            className={cn(
              'flex items-center gap-2 text-sm transition-colors',
              done && 'cursor-pointer text-primary hover:underline',
              active && 'font-semibold text-foreground',
              !done && !active && 'cursor-default text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border text-xs',
                done && 'border-primary bg-primary text-primary-foreground',
                active && 'border-primary text-primary',
                !done && !active && 'border-border',
              )}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </button>
          {i < STEP_LABELS.length - 1 && (
            <div
              className={cn(
                'mx-2 h-px flex-1',
                i < currentIndex ? 'bg-primary' : 'bg-border',
              )}
            />
          )}
        </div>
      );
    })}
  </div>
);

// --- Reusable field wrapper with required asterisk + optional hint ---

const Field = ({
  label,
  children,
  error,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  required?: boolean;
  hint?: string;
}) => (
  <div className="space-y-1.5">
    <Label>
      {label}
      {required && (
        <span className="ml-0.5 text-destructive" aria-label="required">
          *
        </span>
      )}
    </Label>
    {children}
    {hint && !error ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    {error ? <p className="text-xs text-destructive">{error}</p> : null}
  </div>
);
