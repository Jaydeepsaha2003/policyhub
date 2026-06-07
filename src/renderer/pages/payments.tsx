import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DateInputDMY } from '@/components/ui/date-input-dmy';
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

type MfRow = {
  id: string;
  mutualFundId: string;
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
  folioNo: string;
  accountHolder: string;
  provider: string;
  schemeName: string;
  debitBankName: string | null;
  debitAccountNo: string | null;
};

// Discriminated union we display in the unified table.
type UnifiedRow =
  | ({ kind: 'policy' } & Row)
  | ({ kind: 'mutual_fund' } & MfRow);

type PolicyLite = { id: string; policyNo: string; policyHolder: string; companyName: string };

const statusBadge = (s: 'pending' | 'paid' | 'overdue') =>
  s === 'paid' ? (
    <Badge variant="success">Paid</Badge>
  ) : s === 'overdue' ? (
    <Badge variant="danger">Overdue</Badge>
  ) : (
    <Badge variant="warning">Pending</Badge>
  );

export const PaymentsPage = () => {
  const { navigate } = useRouter();
  // Filters are persisted in sessionStorage under this key so that
  // navigating to a row's detail page and coming back doesn't reset the
  // view. Cleared by the "Clear filters" button.
  const FILTERS_KEY = 'payments.filters';
  type StoredFilters = {
    status?: string;
    policyId?: string;
    companyFilter?: string;
    holderFilter?: string;
    typeFilter?: string;
    from?: string;
    to?: string;
  };
  const readStored = (): StoredFilters => {
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY);
      return raw ? (JSON.parse(raw) as StoredFilters) : {};
    } catch {
      return {};
    }
  };
  const stored = readStored();

  const [rows, setRows] = useState<Row[]>([]);
  const [mfRows, setMfRows] = useState<MfRow[]>([]);
  const [policies, setPolicies] = useState<PolicyLite[]>([]);
  const [status, setStatus] = useState<string>(stored.status ?? 'all');
  const [policyId, setPolicyId] = useState<string>(stored.policyId ?? 'all');
  const [companyFilter, setCompanyFilter] = useState<string>(
    stored.companyFilter ?? 'all',
  );
  const [holderFilter, setHolderFilter] = useState<string>(
    stored.holderFilter ?? 'all',
  );
  const [typeFilter, setTypeFilter] = useState<string>(stored.typeFilter ?? 'all');
  const [from, setFrom] = useState(stored.from ?? '');
  const [to, setTo] = useState(stored.to ?? '');

  // Snapshot every filter change back to sessionStorage. Only the
  // filter inputs are persisted — the data itself is always reloaded
  // from disk on mount.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({
          status,
          policyId,
          companyFilter,
          holderFilter,
          typeFilter,
          from,
          to,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [status, policyId, companyFilter, holderFilter, typeFilter, from, to]);
  const [markId, setMarkId] = useState<string | null>(null);
  const [markKind, setMarkKind] = useState<'policy' | 'mutual_fund'>('policy');
  const [markDefault, setMarkDefault] = useState(0);
  const [markDebit, setMarkDebit] = useState<{
    bank: string | null;
    accountNo: string | null;
  }>({ bank: null, accountNo: null });
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
      const [p, mfp, pol]: any = await Promise.all([
        window.policyhub.payments.listAll({
          status: status === 'all' ? undefined : status,
          policyId: policyId === 'all' ? undefined : policyId,
          from: from || undefined,
          to: to || undefined,
        }),
        window.policyhub.mfPayments.listAll({
          status: status === 'all' ? undefined : status,
          from: from || undefined,
          to: to || undefined,
        }),
        window.policyhub.policies.list(),
      ]);
      setRows(p as Row[]);
      setMfRows(mfp as MfRow[]);
      setPolicies(
        (pol as any[]).map((r) => ({
          id: r.id,
          policyNo: r.policyNo,
          policyHolder: r.policyHolder,
          companyName: r.companyName,
        })),
      );
    } catch (err) {
      toast.error('Failed to load payments', { description: (err as Error).message });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, policyId, from, to, typeFilter]);

  // Auto-refresh on window focus so the tab catches schedule changes
  // made elsewhere (policy edit / MF edit / bulk template upload /
  // imported DB / reinstall). Also covers the case where the user
  // alt-tabs back from another app after running an action.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, policyId, from, to, typeFilter]);

  const policyMap = useMemo(() => new Map(policies.map((p) => [p.id, p])), [policies]);

  // Companies / holders for the filter dropdowns. Dynamically scoped
  // by the Type filter so the choices match what's actually visible:
  //   typeFilter='all'         → policy companies + MF providers
  //   typeFilter='policy'      → policy companies only
  //   typeFilter='mutual_fund' → MF providers only
  const companies = useMemo(() => {
    const set = new Set<string>();
    if (typeFilter !== 'mutual_fund') {
      for (const p of policies) set.add(p.companyName);
    }
    if (typeFilter !== 'policy') {
      for (const m of mfRows) set.add(m.provider);
    }
    return Array.from(set).sort();
  }, [policies, mfRows, typeFilter]);

  const holders = useMemo(() => {
    const set = new Set<string>();
    if (typeFilter !== 'mutual_fund') {
      for (const p of policies) {
        if (companyFilter === 'all' || p.companyName === companyFilter) {
          set.add(p.policyHolder);
        }
      }
    }
    if (typeFilter !== 'policy') {
      for (const m of mfRows) {
        if (companyFilter === 'all' || m.provider === companyFilter) {
          set.add(m.accountHolder);
        }
      }
    }
    return Array.from(set).sort();
  }, [policies, mfRows, companyFilter, typeFilter]);

  // If the user flips the Type filter and the current Company/Holder
  // selection isn't in the narrowed option set, snap back to 'all' so
  // they don't end up with an empty table because of a stale filter.
  useEffect(() => {
    if (companyFilter !== 'all' && !companies.includes(companyFilter)) {
      setCompanyFilter('all');
    }
  }, [companies, companyFilter]);
  useEffect(() => {
    if (holderFilter !== 'all' && !holders.includes(holderFilter)) {
      setHolderFilter('all');
    }
  }, [holders, holderFilter]);
  // Specific Policy ID filter is meaningless when MF Only is selected —
  // reset it so the MF rows can show.
  useEffect(() => {
    if (typeFilter === 'mutual_fund' && policyId !== 'all') {
      setPolicyId('all');
    }
  }, [typeFilter, policyId]);

  // Unified list with kind discriminator. Filters apply across both
  // sources. Sort by due date ASC so the oldest installment is at the
  // top — matches the "next thing to deal with" reading order.
  //
  // Defensive display-side overdue flip: a row that's still marked
  // 'pending' but whose due date is already in the past gets shown as
  // 'overdue' in the UI. The backend's markOverdueInstallments runs on
  // every list call (v0.4.7+), but this client-side fallback keeps the
  // status honest even between writes.
  const todayIso = new Date().toISOString().slice(0, 10);
  const filtered = useMemo<UnifiedRow[]>(() => {
    const out: UnifiedRow[] = [];
    if (typeFilter !== 'mutual_fund') {
      for (const r of rows) {
        const p = policyMap.get(r.policyId);
        if (companyFilter !== 'all' && p?.companyName !== companyFilter) continue;
        if (holderFilter !== 'all' && p?.policyHolder !== holderFilter) continue;
        const status =
          r.status === 'pending' && r.dueDate < todayIso ? 'overdue' : r.status;
        out.push({ kind: 'policy', ...r, status });
      }
    }
    if (typeFilter !== 'policy') {
      for (const m of mfRows) {
        if (companyFilter !== 'all' && m.provider !== companyFilter) continue;
        if (holderFilter !== 'all' && m.accountHolder !== holderFilter) continue;
        // A specific policyId filter excludes all MF rows.
        if (policyId !== 'all') continue;
        const status =
          m.status === 'pending' && m.dueDate < todayIso ? 'overdue' : m.status;
        out.push({ kind: 'mutual_fund', ...m, status });
      }
    }
    out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return out;
  }, [rows, mfRows, policyMap, companyFilter, holderFilter, typeFilter, policyId, todayIso]);

  const anyFilterActive =
    status !== 'all' ||
    policyId !== 'all' ||
    companyFilter !== 'all' ||
    holderFilter !== 'all' ||
    typeFilter !== 'all' ||
    Boolean(from) ||
    Boolean(to);

  const clearFilters = () => {
    setStatus('all');
    setPolicyId('all');
    setCompanyFilter('all');
    setHolderFilter('all');
    setTypeFilter('all');
    setFrom('');
    setTo('');
    try {
      sessionStorage.removeItem(FILTERS_KEY);
    } catch {
      /* ignore */
    }
  };

  // Filter-aware summary tiles. Counts and totals across whatever the user
  // is currently seeing (policy premiums + MF SIPs combined).
  //
  // Money definitions:
  //   • paidPremium — sum of `paidAmount` (the premium portion only)
  //   • paidGst     — sum of `penaltyAmount` (GST). Only policy rows have this.
  //   • paidLateFee — sum of `lateFee`. Only policy rows have this.
  //   • paidTotal   — premium + GST + late fee = the full money paid.
  // MF SIP installments don't carry GST/late fee, so those contribute
  // only to paidPremium.
  const summary = useMemo(() => {
    let dueCount = 0;
    let dueAmount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let paidCount = 0;
    let paidPremium = 0;
    let paidGst = 0;
    let paidLateFee = 0;
    let expectedAmount = 0;
    for (const r of filtered) {
      expectedAmount += r.expectedAmount;
      if (r.status === 'pending') {
        dueCount += 1;
        dueAmount += r.expectedAmount;
      } else if (r.status === 'overdue') {
        overdueCount += 1;
        overdueAmount += r.expectedAmount;
      } else if (r.status === 'paid') {
        paidCount += 1;
        paidPremium += r.paidAmount ?? r.expectedAmount;
        if (r.kind === 'policy') {
          paidGst += r.penaltyAmount ?? 0;
          paidLateFee += r.lateFee ?? 0;
        }
      }
    }
    return {
      total: filtered.length,
      expectedAmount,
      dueCount,
      dueAmount,
      overdueCount,
      overdueAmount,
      paidCount,
      paidPremium,
      paidGst,
      paidLateFee,
      paidTotal: paidPremium + paidGst + paidLateFee,
      paidFees: paidGst + paidLateFee,
      outstandingCount: dueCount + overdueCount,
      outstandingAmount: dueAmount + overdueAmount,
    };
  }, [filtered]);

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      // The bulk template is policy-only. If a filter is active, scope to
      // the visible *policy* rows; ignore MF rows (they're not part of the
      // bulk-update flow).
      const opts = anyFilterActive
        ? {
            paymentIds: filtered
              .filter((r) => r.kind === 'policy')
              .map((r) => r.id),
          }
        : undefined;
      const res: any = await window.policyhub.bulk.downloadTemplate(opts);
      if (res?.saved) {
        toast.success('Template saved', {
          description: `${res.rowCount ?? 0} installment(s) — ${res.path}`,
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

  const [exportingXlsx, setExportingXlsx] = useState(false);

  const exportXlsx = async () => {
    setExportingXlsx(true);
    try {
      // Pass the visible rows split by kind so the workbook honors
      // every active filter. When no filter is active, pass nothing
      // and let the main process export every live row.
      const opts = anyFilterActive
        ? {
            paymentIds: filtered
              .filter((r) => r.kind === 'policy')
              .map((r) => r.id),
            mfPaymentIds: filtered
              .filter((r) => r.kind === 'mutual_fund')
              .map((r) => r.id),
          }
        : undefined;
      const res = await window.policyhub.paymentsExportWorkbook(opts);
      if (res?.saved) {
        const policyCount = res.sheets?.['Policy Payments'] ?? 0;
        const mfCount = res.sheets?.['MF Payments'] ?? 0;
        toast.success(
          `Exported ${policyCount} policy + ${mfCount} MF installment(s)`,
          { description: res.path },
        );
      }
    } catch (err) {
      toast.error('Export failed', { description: (err as Error).message });
    } finally {
      setExportingXlsx(false);
    }
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

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Policy + MF</SelectItem>
              <SelectItem value="policy">Policy only</SelectItem>
              <SelectItem value="mutual_fund">MF only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={companyFilter} onValueChange={(v) => { setCompanyFilter(v); setHolderFilter('all'); }}>
            <SelectTrigger className="w-44">
              <SelectValue
                placeholder={
                  typeFilter === 'mutual_fund' ? 'Provider' : 'Company'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {typeFilter === 'mutual_fund'
                  ? 'All providers'
                  : typeFilter === 'policy'
                    ? 'All companies'
                    : 'All companies / providers'}
              </SelectItem>
              {companies.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={holderFilter} onValueChange={setHolderFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Holder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All holders</SelectItem>
              {holders.map((h) => (
                <SelectItem key={h} value={h}>{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Hidden when Type = MF Only since policies don't apply. */}
          {typeFilter !== 'mutual_fund' && (
            <Select value={policyId} onValueChange={setPolicyId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Policy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All policies</SelectItem>
                {policies
                  .filter(
                    (p) =>
                      (companyFilter === 'all' || p.companyName === companyFilter) &&
                      (holderFilter === 'all' || p.policyHolder === holderFilter),
                  )
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.policyNo} — {p.policyHolder}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          <DateInputDMY
            value={from}
            onChange={(iso) => setFrom(iso)}
            className="w-44"
            placeholder="From (DD-MM-YYYY)"
          />
          <DateInputDMY
            value={to}
            onChange={(iso) => setTo(iso)}
            className="w-44"
            placeholder="To (DD-MM-YYYY)"
          />

          {anyFilterActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Download template
            </Button>
            <Button variant="outline" size="sm" onClick={uploadTemplate} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              Upload filled template
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportXlsx}
              disabled={exportingXlsx}
            >
              {exportingXlsx ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export to Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter-aware totals — combined policy premium + MF SIP installments. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryTile
          label="Total installments"
          value={String(summary.total)}
          sub={`Expected ${formatCurrencyPaise(summary.expectedAmount)}`}
        />
        <SummaryTile
          label="Pending"
          value={String(summary.dueCount)}
          sub={formatCurrencyPaise(summary.dueAmount)}
          tone="warning"
        />
        <SummaryTile
          label="Overdue"
          value={String(summary.overdueCount)}
          sub={formatCurrencyPaise(summary.overdueAmount)}
          tone="danger"
        />
        <SummaryTile
          label="Paid (premium + fees)"
          value={formatCurrencyPaise(summary.paidTotal)}
          sub={
            summary.paidFees > 0
              ? `Premium ${formatCurrencyPaise(summary.paidPremium)} · ${summary.paidCount} installment(s)`
              : `${summary.paidCount} installment(s)`
          }
          tone="success"
        />
        <SummaryTile
          label="GST + Late fee"
          value={formatCurrencyPaise(summary.paidFees)}
          sub={
            summary.paidFees > 0
              ? `GST ${formatCurrencyPaise(summary.paidGst)} · Late ${formatCurrencyPaise(summary.paidLateFee)}`
              : 'No fees collected'
          }
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <TableEmpty>No payments match these filters.</TableEmpty>
          ) : (
            // Horizontal scroll for the extra columns; vertical scroll
            // for long result sets so the table doesn't grow the page
            // arbitrarily.
            <div className="max-h-[65vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Policy / Folio</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid on</TableHead>
                  <TableHead className="text-right">Paid amount</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Ref no</TableHead>
                  <TableHead className="text-right">GST + late fee</TableHead>
                  <TableHead className="text-right" />
                  <TableHead>Company / Provider</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  if (r.kind === 'policy') {
                    const p = policyMap.get(r.policyId);
                    return (
                      <TableRow
                        key={`p-${r.id}`}
                        className="cursor-pointer"
                        onClick={() => navigate(`/policies/${r.policyId}`)}
                      >
                        <TableCell>
                          <Badge variant="secondary">Policy</Badge>
                        </TableCell>
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
                                  setMarkKind('policy');
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
                        <TableCell>
                          {p?.companyName ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  // Mutual fund SIP row.
                  return (
                    <TableRow
                      key={`m-${r.id}`}
                      className="cursor-pointer"
                      onClick={() => navigate(`/mutual-funds/${r.mutualFundId}`)}
                    >
                      <TableCell>
                        <Badge>Mutual Fund</Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{r.folioNo}</div>
                        <div className="text-xs text-muted-foreground">{r.schemeName}</div>
                      </TableCell>
                      <TableCell>{r.accountHolder}</TableCell>
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
                      <TableCell className="text-xs">
                        {r.paymentMethod || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.receiptNo || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="text-right">
                        {r.status !== 'paid' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMarkKind('mutual_fund');
                              setMarkDefault(r.expectedAmount / 100);
                              setMarkDebit({
                                bank: r.debitBankName,
                                accountNo: r.debitAccountNo,
                              });
                              setMarkId(r.id);
                            }}
                          >
                            Mark paid
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>{r.provider}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <MarkPaidDialog
        paymentId={markId}
        defaultAmount={markDefault}
        kind={markKind}
        defaultDebitBank={markDebit.bank}
        defaultDebitAccountNo={markDebit.accountNo}
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

const SummaryTile = ({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'warning' | 'danger' | 'success';
}) => {
  const valueColor =
    tone === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'danger'
        ? 'text-destructive'
        : tone === 'success'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-foreground';
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
        {sub}
      </div>
    </div>
  );
};
