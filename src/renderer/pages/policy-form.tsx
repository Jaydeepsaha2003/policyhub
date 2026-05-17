import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useRouter } from '@/lib/router';
import { policySchema, type PolicyFormValues } from '../../shared/validation';
import { generateInstallments } from '../../shared/installments';
import { formatDate, paiseToRupeesUI } from '@/lib/form-helpers';

type Props = {
  mode: 'create' | 'edit';
  initial?: Partial<PolicyFormValues> & { id?: string };
  onSaved?: (id: string) => void;
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
  policyTermYears: 20,
  premiumPaymentTermYears: 20,
  branchName: undefined,
  agentName: undefined,
  agentContact: undefined,
  status: 'active',
  notes: undefined,
};

export const PolicyFormPage = ({ mode, initial, onSaved }: Props) => {
  const { navigate } = useRouter();
  const [saving, setSaving] = useState(false);

  const form = useForm<PolicyFormValues>({
    resolver: zodResolver(policySchema),
    defaultValues: { ...defaults, ...(initial ?? {}) },
  });

  useEffect(() => {
    if (initial) form.reset({ ...defaults, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  const watched = form.watch();
  const preview = useMemo(() => {
    try {
      const ins = generateInstallments(
        watched.commencementDate,
        watched.paymentMode,
        Math.max(1, Number(watched.premiumPaymentTermYears) || 1),
      );
      return ins.slice(0, 6);
    } catch {
      return [];
    }
  }, [watched.commencementDate, watched.paymentMode, watched.premiumPaymentTermYears]);

  const onSubmit = async (values: PolicyFormValues) => {
    setSaving(true);
    try {
      if (mode === 'create') {
        const id = (await window.policyhub.policies.create(values)) as string;
        toast.success('Policy created');
        if (onSaved) onSaved(id);
        else navigate(`/policies/${id}`);
      } else if (initial?.id) {
        await window.policyhub.policies.update(initial.id, values);
        toast.success('Policy updated');
        if (onSaved) onSaved(initial.id);
      }
    } catch (err) {
      toast.error('Save failed', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const reg = form.register;
  const errs = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{mode === 'create' ? 'New policy' : 'Edit policy'}</CardTitle>
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
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Policy no" error={errs.policyNo?.message}>
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
                      <SelectItem value="matured">Matured</SelectItem>
                      <SelectItem value="lapsed">Lapsed</SelectItem>
                      <SelectItem value="surrendered">Surrendered</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Policy holder" error={errs.policyHolder?.message}>
                  <Input {...reg('policyHolder')} />
                </Field>
                <Field label="Holder email" error={errs.holderEmail?.message}>
                  <Input type="email" {...reg('holderEmail')} />
                </Field>
                <Field label="Holder phone" error={errs.holderPhone?.message}>
                  <Input {...reg('holderPhone')} placeholder="+91 9876543210" />
                </Field>
                <Field label="Company" error={errs.companyName?.message}>
                  <Input {...reg('companyName')} placeholder="LIC, HDFC Life, ICICI Prudential…" />
                </Field>
                <Field label="Plan" error={errs.planName?.message}>
                  <Input {...reg('planName')} placeholder="Jeevan Anand, iSelect Smart Term…" />
                </Field>
                <Field label="Branch name">
                  <Input {...reg('branchName')} />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="premium" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Premium amount (₹)" error={errs.premiumAmount?.message}>
                  <Input type="number" step="0.01" {...reg('premiumAmount', { valueAsNumber: true })} />
                </Field>
                <Field label="Yearly total premium (₹)" error={errs.yearlyTotalPremium?.message}>
                  <Input
                    type="number"
                    step="0.01"
                    {...reg('yearlyTotalPremium', { valueAsNumber: true })}
                  />
                </Field>
                <Field label="Payment mode">
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
                <Field label="Sum assured (₹)" error={errs.sumAssured?.message}>
                  <Input type="number" step="0.01" {...reg('sumAssured', { valueAsNumber: true })} />
                </Field>
                <Field label="Commencement date" error={errs.commencementDate?.message}>
                  <Input type="date" {...reg('commencementDate')} />
                </Field>
                <Field label="Maturity date" error={errs.maturityDate?.message}>
                  <Input type="date" {...reg('maturityDate')} />
                </Field>
                <Field label="Policy term (years)" error={errs.policyTermYears?.message}>
                  <Input
                    type="number"
                    {...reg('policyTermYears', { valueAsNumber: true })}
                  />
                </Field>
                <Field
                  label="Premium payment term (years)"
                  error={errs.premiumPaymentTermYears?.message}
                >
                  <Input
                    type="number"
                    {...reg('premiumPaymentTermYears', { valueAsNumber: true })}
                  />
                </Field>
              </div>

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
            </TabsContent>

            <TabsContent value="nominee" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nominee name" error={errs.nomineeName?.message}>
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
            </TabsContent>

            <TabsContent value="notes" className="space-y-4">
              <Field label="Notes">
                <Textarea rows={5} {...reg('notes')} placeholder="Any additional information…" />
              </Field>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={() => navigate(initial?.id ? `/policies/${initial.id}` : '/policies')}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : mode === 'create' ? 'Create policy' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
};

const Field = ({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
    {error ? <p className="text-xs text-destructive">{error}</p> : null}
  </div>
);
