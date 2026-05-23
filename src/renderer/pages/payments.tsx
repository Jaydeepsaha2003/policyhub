import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/table';
import { Download, FileDown, FileUp, Loader2, Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrencyPaise, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { MarkPaidDialog } from './mark-paid-dialog';
import { EditPaymentDialog, type EditablePayment } from './edit-payment-dialog';
import { useRouter } from '@/lib/router';

type Row = {
  id: string;
  policyId: string;
  installmentNo: number;
  dueDate: string;
  expectedAmount: number;
  status: 'pending' | 'paid' | 'overdue';
  paidDate: string | null;
  paidAmount: number | null;
  paymentMethod: string | null;
  paymentSource: string | null;
  paymentSourceName: string | null;
  receiptNo: string | null;
  penaltyAmount: number;
  lateFee: number;
};

type PolicyLite = { id: string; policyNo: string; policyHolder: string };

const statusBadge = (s: Row['status']) =>
  s === 'paid' ? (
    <Badge variant="success">Paid</Badge>
  ) : s === 'overdue' ? (
    <Badge variant="danger">Overdue</Badge>
  ) : (
    <Badge variant="warning">Pending</Badge>
  );

export const PaymentsPage = () => {
  const { navigate } = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [policies, setPolicies] = useState<PolicyLite[]>([]);
  const [status, setStatus] = useState<string>('all');
  const [policyId, setPolicyId] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [markId, setMarkId] = useState<string | null>(null);
  const [markDefault, setMarkDefault] = useState(0);
  const [editRow, setEditRow] = useState<EditablePayment | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    file?: string;
    totalRows: number;
    updated: number;
    skipped: number;
    errors: { row: number; reason: string; policyNo?: string; installmentNo?: number }[];
  } | null>(null);

  const load = async () => {
    try {
      const [p, pol]: any = await Promise.all([
        window.policyhub.payments.listAll({
          status: status === 'all' ? undefined : status,
          policyId: policyId === 'all' ? undefined : policyId,
          from: from || undefined,
          to: to || undefined,
        }),
        window.policyhub.policies.list(),
      ]);
      setRows(p as Row[]);
      setPolicies(
        (pol as any[]).map((r) => ({
          id: r.id,
          policyNo: r.policyNo,
          policyHolder: r.policyHolder,
        })),
      );
    } catch (err) {
      toast.error('Failed to load payments', { description: (err as Error).message });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, policyId, from, to]);

  const policyMap = useMemo(() => new Map(policies.map((p) => [p.id, p])), [policies]);

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const res: any = await window.policyhub.bulk.downloadTemplate();
      if (res?.saved) {
        toast.success('Template saved', {
          description: `${res.rowCount ?? 0} pending/overdue installment(s) — ${res.path}`,
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
      const res = await window.policyhub.bulk.importTemplate();
      if (!res.picked) return;
      setImportResult({
        file: res.file,
        totalRows: res.totalRows,
        updated: res.updated,
        skipped: res.skipped,
        errors: res.errors,
      });
      await load();
    } catch (err) {
      toast.error('Import failed', { description: (err as Error).message });
    } finally {
      setImporting(false);
    }
  };

  const exportCsv = () => {
    const header = [
      'Policy no',
      'Holder',
      'Installment',
      'Due date',
      'Expected amount',
      'Status',
      'Paid date',
      'Paid amount',
      'Method',
      'Receipt',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      const p = policyMap.get(r.policyId);
      const cells = [
        p?.policyNo ?? '',
        p?.policyHolder ?? '',
        r.installmentNo,
        r.dueDate,
        (r.expectedAmount / 100).toFixed(2),
        r.status,
        r.paidDate ?? '',
        r.paidAmount != null ? (r.paidAmount / 100).toFixed(2) : '',
        r.paymentMethod ?? '',
        r.receiptNo ?? '',
      ];
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
              <SelectItem value="paid">Paid</SelectItem>
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

          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-44"
            placeholder="From"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-44"
            placeholder="To"
          />

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Download template
            </Button>
            <Button variant="outline" size="sm" onClick={uploadTemplate} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              Upload filled template
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <TableEmpty>No payments match these filters.</TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid on</TableHead>
                  <TableHead className="text-right">Paid amount</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Ref no</TableHead>
                  <TableHead className="text-right">Penalty + late fee</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const p = policyMap.get(r.policyId);
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/policies/${r.policyId}`)}
                    >
                      <TableCell className="font-medium">{p?.policyNo ?? '—'}</TableCell>
                      <TableCell>{p?.policyHolder ?? '—'}</TableCell>
                      <TableCell>{r.installmentNo}</TableCell>
                      <TableCell>{formatDate(r.dueDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrencyPaise(r.expectedAmount)}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell>
                        {r.paidDate ? (
                          formatDate(r.paidDate)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.paidAmount !== null ? (
                          formatCurrencyPaise(r.paidAmount)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.paymentSource || r.paymentSourceName ? (
                          <div className="text-xs">
                            <div>{r.paymentSource ?? '—'}</div>
                            {r.paymentSourceName && (
                              <div className="text-muted-foreground">
                                {r.paymentSourceName}
                              </div>
                            )}
                          </div>
                        ) : r.paymentMethod ? (
                          <span className="text-xs">{r.paymentMethod}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.receiptNo || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.penaltyAmount + r.lateFee > 0 ? (
                          formatCurrencyPaise(r.penaltyAmount + r.lateFee)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.status !== 'paid' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMarkDefault(r.expectedAmount / 100);
                                setMarkId(r.id);
                              }}
                            >
                              Mark paid
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Edit payment"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditRow({
                                id: r.id,
                                installmentNo: r.installmentNo,
                                dueDate: r.dueDate,
                                expectedAmount: r.expectedAmount,
                                status: r.status,
                                paidDate: r.paidDate,
                                paidAmount: r.paidAmount,
                                paymentMethod: r.paymentMethod,
                                paymentSource: r.paymentSource,
                                paymentSourceName: r.paymentSourceName,
                                receiptNo: r.receiptNo,
                                penaltyAmount: r.penaltyAmount,
                                lateFee: r.lateFee,
                                notes: null,
                              });
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MarkPaidDialog
        paymentId={markId}
        defaultAmount={markDefault}
        onClose={() => setMarkId(null)}
        onSaved={() => load()}
      />
      <EditPaymentDialog
        payment={editRow}
        onClose={() => setEditRow(null)}
        onSaved={() => load()}
      />

      <Dialog open={Boolean(importResult)} onOpenChange={(o) => !o && setImportResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk update result</DialogTitle>
            <DialogDescription>
              {importResult?.file ? <span className="break-all">{importResult.file}</span> : null}
            </DialogDescription>
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
                      {e.policyNo && <> · {e.policyNo}</>}
                      {e.installmentNo !== undefined && <> · #{e.installmentNo}</>}
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
    </div>
  );
};

const Summary = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="rounded-md border p-3 text-center">
    <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);
