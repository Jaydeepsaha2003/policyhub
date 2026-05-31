import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from '@/components/ui/table';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from '@/lib/router';
import { formatCurrencyPaise, formatDate } from '@/lib/utils';
import { MutualFundFormPage } from './mutual-fund-form';
import { toast } from 'sonner';

type Fund = {
  id: string;
  folioNo: string;
  accountHolder: string;
  agentName: string | null;
  agentContact: string | null;
  provider: string;
  schemeName: string;
  type: 'lumpsum' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  amount: number;
  startDate: string;
  installmentCount: number;
  status: 'active' | 'redeemed' | 'closed';
  debitBankName: string | null;
  debitAccountNo: string | null;
  debitIfsc: string | null;
  debitAccountHolder: string | null;
  debitBranchName: string | null;
  notes: string | null;
};

type Installment = {
  id: string;
  installmentNo: number;
  dueDate: string;
  expectedAmount: number;
  status: 'pending' | 'paid' | 'overdue';
  paidDate: string | null;
  paidAmount: number | null;
};

export const MutualFundDetailPage = ({ id }: { id: string }) => {
  const { navigate } = useRouter();
  const [fund, setFund] = useState<Fund | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    try {
      const [f, list] = await Promise.all([
        window.policyhub.mutualFunds.get(id),
        window.policyhub.mfPayments.listByFund(id),
      ]);
      setFund(f as Fund);
      setInstallments(list as Installment[]);
    } catch (err) {
      toast.error('Load failed', { description: (err as Error).message });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!fund) return null;

  if (editing) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <MutualFundFormPage mode="edit" id={id} />
      </div>
    );
  }

  const statusBadge = (s: Installment['status']) =>
    s === 'paid' ? (
      <Badge variant="success">Paid</Badge>
    ) : s === 'overdue' ? (
      <Badge variant="danger">Overdue</Badge>
    ) : (
      <Badge variant="warning">Pending</Badge>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/mutual-funds')}>
          <ArrowLeft className="h-4 w-4" />
          Back to mutual funds
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4 text-destructive" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move to Recycle Bin?</AlertDialogTitle>
                <AlertDialogDescription>
                  {fund.folioNo} · {fund.accountHolder} will be moved to the
                  Recycle Bin and auto-purged after 90 days. Restore any time
                  before then.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90"
                  onClick={async () => {
                    try {
                      await window.policyhub.mutualFunds.remove(id);
                      toast.success('Mutual fund moved to Recycle Bin');
                      navigate('/mutual-funds');
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{fund.schemeName}</CardTitle>
          <div className="text-sm text-muted-foreground">
            Folio {fund.folioNo} · {fund.provider} · {fund.accountHolder}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <Detail label="Type">
              {fund.type === 'lumpsum'
                ? 'Lumpsum'
                : fund.type === 'monthly'
                  ? 'Monthly SIP'
                  : fund.type === 'quarterly'
                    ? 'Quarterly SIP'
                    : fund.type === 'half_yearly'
                      ? 'Half-yearly SIP'
                      : 'Yearly SIP'}
            </Detail>
            <Detail
              label={fund.type === 'monthly' ? 'SIP amount / month' : 'Investment amount'}
            >
              {formatCurrencyPaise(fund.amount)}
            </Detail>
            <Detail label="Start date">{formatDate(fund.startDate)}</Detail>
            <Detail label="Status">
              <Badge
                variant={
                  fund.status === 'active'
                    ? 'success'
                    : fund.status === 'redeemed'
                      ? 'secondary'
                      : 'warning'
                }
              >
                {fund.status}
              </Badge>
            </Detail>
            <Detail label="Agent">
              {fund.agentName ?? '—'}
              {fund.agentContact ? ` · ${fund.agentContact}` : ''}
            </Detail>
            {fund.notes && (
              <div className="sm:col-span-2 md:col-span-3">
                <Detail label="Notes">{fund.notes}</Detail>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {(fund.debitBankName ||
        fund.debitAccountNo ||
        fund.debitIfsc ||
        fund.debitAccountHolder ||
        fund.debitBranchName) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Debit account</CardTitle>
            <div className="text-xs text-muted-foreground">
              Default source used when marking installments paid. Can be
              overridden per installment if a different account was used that
              month.
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {fund.debitBankName && (
                <Detail label="Bank">{fund.debitBankName}</Detail>
              )}
              {fund.debitAccountNo && (
                <Detail label="Account no">{fund.debitAccountNo}</Detail>
              )}
              {fund.debitIfsc && <Detail label="IFSC">{fund.debitIfsc}</Detail>}
              {fund.debitAccountHolder && (
                <Detail label="Account holder">{fund.debitAccountHolder}</Detail>
              )}
              {fund.debitBranchName && (
                <Detail label="Branch">{fund.debitBranchName}</Detail>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Installments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {installments.length === 0 ? (
            <TableEmpty>No installments yet.</TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid on</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installments.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.installmentNo}</TableCell>
                    <TableCell>{formatDate(i.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyPaise(i.expectedAmount)}
                    </TableCell>
                    <TableCell>{statusBadge(i.status)}</TableCell>
                    <TableCell>
                      {i.paidDate ? (
                        formatDate(i.paidDate)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.paidAmount !== null ? (
                        formatCurrencyPaise(i.paidAmount)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Detail = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
    <div className="mt-0.5 text-sm">{children}</div>
  </div>
);
