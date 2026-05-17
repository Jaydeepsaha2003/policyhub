import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { Loader2, Trash2, ArrowLeft, CheckCheck } from 'lucide-react';
import { useRouter } from '@/lib/router';
import { toast } from 'sonner';
import { formatCurrencyPaise, formatDate, paiseToRupees } from '@/lib/utils';
import { PolicyFormPage } from './policy-form';
import { MarkPaidDialog } from './mark-paid-dialog';
import { BulkPayDialog } from './bulk-pay-dialog';

type Policy = any;
type Payment = {
  id: string;
  installmentNo: number;
  dueDate: string;
  expectedAmount: number;
  status: 'pending' | 'paid' | 'overdue';
  paidDate: string | null;
  paidAmount: number | null;
  paymentMethod: string | null;
  receiptNo: string | null;
  penaltyAmount: number;
  lateFee: number;
  notes: string | null;
};

const statusBadge = (s: Payment['status']) => {
  switch (s) {
    case 'paid':
      return <Badge variant="success">Paid</Badge>;
    case 'overdue':
      return <Badge variant="danger">Overdue</Badge>;
    case 'pending':
      return <Badge variant="warning">Pending</Badge>;
  }
};

export const PolicyDetailPage = ({ id }: { id: string }) => {
  const { navigate } = useRouter();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [markPaymentId, setMarkPaymentId] = useState<string | null>(null);
  const [markDefault, setMarkDefault] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, pays] = await Promise.all([
        window.policyhub.policies.get(id),
        window.policyhub.payments.listByPolicy(id),
      ]);
      setPolicy(p);
      setPayments(pays as Payment[]);
    } catch (err) {
      toast.error('Failed to load', { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onDelete = async () => {
    try {
      await window.policyhub.policies.remove(id);
      toast.success('Policy deleted');
      navigate('/policies');
    } catch (err) {
      toast.error('Delete failed', { description: (err as Error).message });
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!policy) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-muted-foreground">Policy not found.</p>
          <Button className="mt-4" onClick={() => navigate('/policies')}>
            Back to policies
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Build the form initial values from DB record (paise → rupees).
  const initial = {
    id,
    policyNo: policy.policyNo,
    policyHolder: policy.policyHolder,
    holderEmail: policy.holderEmail ?? undefined,
    holderPhone: policy.holderPhone ?? undefined,
    companyName: policy.companyName,
    planName: policy.planName,
    premiumAmount: paiseToRupees(policy.premiumAmount),
    yearlyTotalPremium: paiseToRupees(policy.yearlyTotalPremium),
    paymentMode: policy.paymentMode,
    sumAssured: paiseToRupees(policy.sumAssured),
    nomineeName: policy.nomineeName,
    nomineeRelation: policy.nomineeRelation ?? undefined,
    commencementDate: policy.commencementDate,
    maturityDate: policy.maturityDate,
    policyTermYears: policy.policyTermYears,
    premiumPaymentTermYears: policy.premiumPaymentTermYears,
    branchName: policy.branchName ?? undefined,
    agentName: policy.agentName ?? undefined,
    agentContact: policy.agentContact ?? undefined,
    status: policy.status,
    notes: policy.notes ?? undefined,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/policies')}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4" />
                Delete policy
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this policy?</AlertDialogTitle>
                <AlertDialogDescription>
                  All installment records, payment history, and reminder logs for this policy will
                  be removed. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PolicyFormPage mode="edit" initial={initial} onSaved={() => load()} />
        </div>

        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Payment timeline</CardTitle>
              <CardDescription>{payments.length} installments</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkOpen(true)}
              disabled={payments.every((p) => p.status === 'paid')}
            >
              <CheckCheck className="h-4 w-4" />
              Mark paid up to…
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[640px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.installmentNo}</TableCell>
                      <TableCell>{formatDate(p.dueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyPaise(p.expectedAmount)}
                      </TableCell>
                      <TableCell>{statusBadge(p.status)}</TableCell>
                      <TableCell className="text-right">
                        {p.status !== 'paid' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setMarkDefault(p.expectedAmount / 100);
                              setMarkPaymentId(p.id);
                            }}
                          >
                            Mark paid
                          </Button>
                        )}
                        {p.status === 'paid' && (
                          <span className="text-xs text-muted-foreground">
                            {formatDate(p.paidDate)} · {p.paymentMethod ?? '—'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <MarkPaidDialog
        paymentId={markPaymentId}
        defaultAmount={markDefault}
        onClose={() => setMarkPaymentId(null)}
        onSaved={() => load()}
      />

      <BulkPayDialog
        open={bulkOpen}
        policyId={id}
        pending={payments as any}
        onClose={() => setBulkOpen(false)}
        onSaved={() => load()}
      />
    </div>
  );
};
