import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { MultiSelectFilter } from '@/components/multi-select-filter';

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
  // navigating to a row's detail page and coming back doesn't reset
  // the view. Cleared by the "Clear filters" button.
  //
  // Each filter is a string[] — empty array means "no filter" (every
  // row passes); a populated array means "only these values pass".
  // This lets the user multi-select via checkboxes per dropdown.
  const FILTERS_KEY = 'payments.filters';
  type StoredFilters = {
    statuses?: string[];
    types?: string[];
    companies?: string[];
    holders?: string[];
    policyIds?: string[];
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
  const [statuses, setStatuses] = useState<string[]>(stored.statuses ?? []);
  const [types, setTypes] = useState<string[]>(stored.types ?? []);
  const [companiesSel, setCompaniesSel] = useState<string[]>(stored.companies ?? []);
  const [holdersSel, setHoldersSel] = useState<string[]>(stored.holders ?? []);
  const [policyIds, setPolicyIds] = useState<string[]>(stored.policyIds ?? []);
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
          statuses,
          types,
          companies: companiesSel,
          holders: holdersSel,
          policyIds,
          from,
          to,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [statuses, types, companiesSel, holdersSel, policyIds, from, to]);
  const [markId, setMarkId] = useState<string | null>(null);
  const [markKind, setMarkKind] = useState<'policy' | 'mutual_fund'>('policy');
  const [markDefault, setMarkDefault] = useState(0);
  const [markDebit, setMarkDebit] = useState<{
    bank: string | null;
    accountNo: string | null;
  }>({ bank: null, accountNo: null });
  const [editRow, setEditRow] = useState<EditablePayment | null>(null);
  // Tracks whether the row currently being edited is a policy or MF
  // installment so the dialog routes to the right IPC + hides
  // GST/late-fee fields when MF.
  const [editKind, setEditKind] = useState<'policy' | 'mutual_fund'>('policy');
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
      // Fetch the full dataset (no server-side filters). All narrowing
      // happens client-side so every dropdown can see every dimension
      // when it computes its available options — Excel-style.
      const [p, mfp, pol]: any = await Promise.all([
        window.policyhub.payments.listAll({}),
        window.policyhub.mfPayments.listAll({}),
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
    // Filters are pure client-side now; load only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh on window focus so the tab catches schedule changes
  // made elsewhere (policy edit / MF edit / bulk template upload /
  // imported DB / reinstall).
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const policyMap = useMemo(() => new Map(policies.map((p) => [p.id, p])), [policies]);

  // Excel-style multi-filtering: each dropdown shows only values that
  // exist in the row set AFTER applying every OTHER active filter.
  // Pick Status=Overdue, the Company dropdown narrows to only the
  // companies that have overdue rows; pick that company and the
  // Holder list narrows again; and so on. The single source of truth
  // is the unified `filterRows` array below.
  type FilterRow = {
    status: 'pending' | 'paid' | 'overdue';
    kind: 'policy' | 'mutual_fund';
    company: string;
    holder: string;
    policyId: string | null;
    dueDate: string;
  };
  const filterRows = useMemo<FilterRow[]>(() => {
    const out: FilterRow[] = [];
    for (const r of rows) {
      const p = policyMap.get(r.policyId);
      out.push({
        status: r.status,
        kind: 'policy',
        company: p?.companyName ?? '',
        holder: p?.policyHolder ?? '',
        policyId: r.policyId,
        dueDate: r.dueDate,
      });
    }
    for (const m of mfRows) {
      out.push({
        status: m.status,
        kind: 'mutual_fund',
        company: m.provider,
        holder: m.accountHolder,
        policyId: null,
        dueDate: m.dueDate,
      });
    }
    return out;
  }, [rows, mfRows, policyMap]);

  // Dimension names used by `matches` to skip the filter being computed.
  type FilterDim =
    | 'status'
    | 'type'
    | 'company'
    | 'holder'
    | 'policyId'
    | 'dates';

  // Each filter is now a string[] (multi-select). Empty array = no
  // filter applied. matches() returns true if the row passes every
  // filter EXCEPT the one named in `except` — used to compute the
  // option list each dropdown should show (Excel-style narrowing).
  const matches = (r: FilterRow, except: FilterDim | null): boolean => {
    if (except !== 'status' && statuses.length > 0 && !statuses.includes(r.status))
      return false;
    if (except !== 'type' && types.length > 0 && !types.includes(r.kind))
      return false;
    if (
      except !== 'company' &&
      companiesSel.length > 0 &&
      !companiesSel.includes(r.company)
    )
      return false;
    if (
      except !== 'holder' &&
      holdersSel.length > 0 &&
      !holdersSel.includes(r.holder)
    )
      return false;
    if (
      except !== 'policyId' &&
      policyIds.length > 0 &&
      (!r.policyId || !policyIds.includes(r.policyId))
    )
      return false;
    if (except !== 'dates') {
      if (from && r.dueDate < from) return false;
      if (to && r.dueDate > to) return false;
    }
    return true;
  };

  const uniq = (xs: string[]): string[] =>
    Array.from(new Set(xs.filter((x) => x !== ''))).sort();

  // Each dropdown's available values: filterRows narrowed by every
  // OTHER active filter, then collected. Used as the option set the
  // checkbox dropdown shows.
  const statusOptions = useMemo(
    () => uniq(filterRows.filter((r) => matches(r, 'status')).map((r) => r.status)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterRows, types, companiesSel, holdersSel, policyIds, from, to],
  );
  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of filterRows) {
      if (matches(r, 'type')) set.add(r.kind);
    }
    return Array.from(set);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterRows, statuses, companiesSel, holdersSel, policyIds, from, to]);
  const companies = useMemo(
    () =>
      uniq(
        filterRows.filter((r) => matches(r, 'company')).map((r) => r.company),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterRows, statuses, types, holdersSel, policyIds, from, to],
  );
  const holders = useMemo(
    () =>
      uniq(
        filterRows.filter((r) => matches(r, 'holder')).map((r) => r.holder),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterRows, statuses, types, companiesSel, policyIds, from, to],
  );
  // Visible policies for the Policy dropdown — narrowed by every other
  // active filter. MF rows have policyId=null so they're naturally
  // excluded from this set.
  const policyOptionIds = useMemo(
    () =>
      new Set(
        filterRows
          .filter((r) => r.policyId && matches(r, 'policyId'))
          .map((r) => r.policyId as string),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterRows, statuses, types, companiesSel, holdersSel, from, to],
  );

  // Defensive auto-reset: drop selected values that are no longer in
  // the dataset (because *other* filters narrowed them out). Prevents
  // the table from going silently empty due to stale selections.
  //
  // IMPORTANT: skip until the first data load is complete. On mount
  // we restore filters from sessionStorage *synchronously* but the
  // dataset itself loads asynchronously — without this guard, the
  // option arrays start empty and the auto-reset wipes the restored
  // filters before the data ever arrives.
  const dataLoaded = filterRows.length > 0;
  const pruneTo = (
    selected: string[],
    valid: string[] | Set<string>,
    setter: (next: string[]) => void,
  ) => {
    if (selected.length === 0) return;
    const validSet = Array.isArray(valid) ? new Set(valid) : valid;
    const kept = selected.filter((v) => validSet.has(v));
    if (kept.length !== selected.length) setter(kept);
  };

  useEffect(() => {
    if (!dataLoaded) return;
    pruneTo(companiesSel, companies, setCompaniesSel);
  }, [companies, companiesSel, dataLoaded]);
  useEffect(() => {
    if (!dataLoaded) return;
    pruneTo(holdersSel, holders, setHoldersSel);
  }, [holders, holdersSel, dataLoaded]);
  useEffect(() => {
    if (!dataLoaded) return;
    pruneTo(statuses, statusOptions, setStatuses);
  }, [statusOptions, statuses, dataLoaded]);
  useEffect(() => {
    if (!dataLoaded) return;
    pruneTo(types, typeOptions, setTypes);
  }, [typeOptions, types, dataLoaded]);
  useEffect(() => {
    if (!dataLoaded) return;
    pruneTo(policyIds, policyOptionIds, setPolicyIds);
  }, [policyOptionIds, policyIds, dataLoaded]);

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
  // All filtering happens here now — server returns the full dataset
  // and we apply status/type/company/holder/policy/date narrowing on
  // top of the defensive overdue-flip. Each filter is a string[];
  // empty array means "no filter — everything passes".
  const filtered = useMemo<UnifiedRow[]>(() => {
    const out: UnifiedRow[] = [];
    const dateMatches = (due: string): boolean =>
      (!from || due >= from) && (!to || due <= to);
    const wantPolicy = types.length === 0 || types.includes('policy');
    const wantMf = types.length === 0 || types.includes('mutual_fund');

    if (wantPolicy) {
      for (const r of rows) {
        const p = policyMap.get(r.policyId);
        if (
          companiesSel.length > 0 &&
          (!p || !companiesSel.includes(p.companyName))
        )
          continue;
        if (
          holdersSel.length > 0 &&
          (!p || !holdersSel.includes(p.policyHolder))
        )
          continue;
        if (policyIds.length > 0 && !policyIds.includes(r.policyId)) continue;
        if (!dateMatches(r.dueDate)) continue;
        const effStatus =
          r.status === 'pending' && r.dueDate < todayIso ? 'overdue' : r.status;
        if (statuses.length > 0 && !statuses.includes(effStatus)) continue;
        out.push({ kind: 'policy', ...r, status: effStatus });
      }
    }
    if (wantMf) {
      // A specific policyId selection excludes all MF rows (they have
      // no policyId).
      const policySelected = policyIds.length > 0;
      if (!policySelected) {
        for (const m of mfRows) {
          if (companiesSel.length > 0 && !companiesSel.includes(m.provider))
            continue;
          if (holdersSel.length > 0 && !holdersSel.includes(m.accountHolder))
            continue;
          if (!dateMatches(m.dueDate)) continue;
          const effStatus =
            m.status === 'pending' && m.dueDate < todayIso ? 'overdue' : m.status;
          if (statuses.length > 0 && !statuses.includes(effStatus)) continue;
          out.push({ kind: 'mutual_fund', ...m, status: effStatus });
        }
      }
    }
    out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return out;
  }, [
    rows,
    mfRows,
    policyMap,
    statuses,
    types,
    companiesSel,
    holdersSel,
    policyIds,
    from,
    to,
    todayIso,
  ]);

  const anyFilterActive =
    statuses.length > 0 ||
    types.length > 0 ||
    companiesSel.length > 0 ||
    holdersSel.length > 0 ||
    policyIds.length > 0 ||
    Boolean(from) ||
    Boolean(to);

  const clearFilters = () => {
    setStatuses([]);
    setTypes([]);
    setCompaniesSel([]);
    setHoldersSel([]);
    setPolicyIds([]);
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
          <MultiSelectFilter
            title="Status"
            emptyLabel="All status"
            triggerClassName="w-36"
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'paid', label: 'Paid' },
            ].filter((o) => statusOptions.includes(o.value))}
            selected={statuses}
            onChange={setStatuses}
          />

          <MultiSelectFilter
            title="Type"
            emptyLabel="Policy + MF"
            triggerClassName="w-36"
            options={[
              { value: 'policy', label: 'Policy' },
              { value: 'mutual_fund', label: 'Mutual fund' },
            ].filter((o) => typeOptions.includes(o.value))}
            selected={types}
            onChange={setTypes}
          />

          <MultiSelectFilter
            title={
              types.length === 1 && types[0] === 'mutual_fund'
                ? 'Provider'
                : 'Company / Provider'
            }
            emptyLabel={
              types.length === 1 && types[0] === 'mutual_fund'
                ? 'All providers'
                : types.length === 1 && types[0] === 'policy'
                  ? 'All companies'
                  : 'All companies'
            }
            triggerClassName="w-48"
            options={companies.map((c) => ({ value: c, label: c }))}
            selected={companiesSel}
            onChange={setCompaniesSel}
          />

          <MultiSelectFilter
            title="Holder"
            emptyLabel="All holders"
            triggerClassName="w-48"
            options={holders.map((h) => ({ value: h, label: h }))}
            selected={holdersSel}
            onChange={setHoldersSel}
          />

          {/* Hidden when MF Only is the sole type since policies don't apply. */}
          {!(types.length === 1 && types[0] === 'mutual_fund') && (
            <MultiSelectFilter
              title="Policy"
              emptyLabel="All policies"
              triggerClassName="w-64"
              options={policies
                .filter((p) => policyOptionIds.has(p.id))
                .map((p) => ({
                  value: p.id,
                  label: `${p.policyNo} — ${p.policyHolder}`,
                }))}
              selected={policyIds}
              onChange={setPolicyIds}
            />
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
            // Single scroll container — pass max-h to the Table's own
            // wrapper so the horizontal scrollbar always sits at the
            // bottom of the visible viewport (not at the bottom of the
            // table's natural height, which would be off-screen for
            // long result sets).
            //
            // [&_td]:whitespace-nowrap → every cell stays on one line so
            //   long values like "HDFC Bank · …1234" don't wrap and
            //   bloat row height.
            // [&_th]:whitespace-nowrap → same for headers.
            // The action column at the right edge is sticky so Mark paid
            // / Edit are always visible regardless of horizontal scroll —
            // see the right-0 + shadow classes on that header + cell.
            <Table
              wrapperClassName="max-h-[65vh]"
              className="[&_td]:whitespace-nowrap [&_th]:whitespace-nowrap"
            >
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
                  <TableHead>Company / Provider</TableHead>
                  <TableHead className="sticky right-0 z-10 bg-background text-right shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] dark:shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.5)]" />
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
                        <TableCell>
                          {p?.companyName ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="sticky right-0 z-10 bg-background text-right shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] dark:shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.5)]">
                          <div className="flex items-center justify-end gap-1">
                            {r.status === 'paid' ? (
                              // Already paid — show the button disabled so
                              // the column width stays steady across rows.
                              <Button
                                size="sm"
                                variant="outline"
                                disabled
                                className="opacity-40"
                                title="Already paid"
                              >
                                Mark paid
                              </Button>
                            ) : (
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
                                setEditKind('policy');
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
                      <TableCell>{r.provider}</TableCell>
                      <TableCell className="sticky right-0 z-10 bg-background text-right shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.08)] dark:shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.5)]">
                        <div className="flex items-center justify-end gap-1">
                          {r.status === 'paid' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled
                              className="opacity-40"
                              title="Already paid"
                            >
                              Mark paid
                            </Button>
                          ) : (
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
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Edit SIP installment"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditKind('mutual_fund');
                              // MF rows don't carry GST/late fee; pass 0
                              // so the EditablePayment shape stays valid.
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
                                penaltyAmount: 0,
                                lateFee: 0,
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
        kind={markKind}
        defaultDebitBank={markDebit.bank}
        defaultDebitAccountNo={markDebit.accountNo}
        onClose={() => setMarkId(null)}
        onSaved={() => load()}
      />
      <EditPaymentDialog
        payment={editRow}
        kind={editKind}
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
