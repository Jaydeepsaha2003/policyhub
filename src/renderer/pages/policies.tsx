import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/table';
import { Plus, Search, FileSpreadsheet, Loader2, FileDown, FileUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRouter } from '@/lib/router';
import { formatCurrencyPaise } from '@/lib/utils';
import { toast } from 'sonner';

type Policy = {
  id: string;
  policyNo: string;
  policyHolder: string;
  companyName: string;
  planName: string;
  sumAssured: number;
  premiumAmount: number;
  paymentMode: string;
  status: 'active' | 'active_ppt_over' | 'matured' | 'lapsed' | 'surrendered';
};

const statusLabel = (s: Policy['status']): string => {
  switch (s) {
    case 'active':
      return 'Active';
    case 'active_ppt_over':
      return 'Active — PPT Over';
    case 'matured':
      return 'Matured';
    case 'lapsed':
      return 'Lapsed';
    case 'surrendered':
      return 'Surrendered';
  }
};

const statusVariant = (s: Policy['status']) => {
  switch (s) {
    case 'active':
      return 'success' as const;
    case 'active_ppt_over':
      return 'default' as const;
    case 'matured':
      return 'secondary' as const;
    case 'lapsed':
      return 'danger' as const;
    case 'surrendered':
      return 'warning' as const;
  }
};

export const PoliciesPage = () => {
  const { navigate } = useRouter();
  const [rows, setRows] = useState<Policy[]>([]);
  const [q, setQ] = useState('');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [exporting, setExporting] = useState(false);
  const [downloadingTpl, setDownloadingTpl] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    totalRows: number;
    created: number;
    skipped: number;
    errors: { row: number; reason: string; policyNo?: string }[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r: any = await window.policyhub.policies.list();
        setRows(r as Policy[]);
      } catch (err) {
        toast.error('Failed to load policies', { description: (err as Error).message });
      }
    })();
  }, []);

  const companies = useMemo(
    () => Array.from(new Set(rows.map((r) => r.companyName))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle) {
        const hay = [r.policyNo, r.policyHolder, r.companyName, r.planName]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (companyFilter !== 'all' && r.companyName !== companyFilter) return false;
      if (modeFilter !== 'all' && r.paymentMode !== modeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, q, companyFilter, modeFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search policy no, holder, company, plan…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={modeFilter} onValueChange={setModeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Payment mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="half_yearly">Half-yearly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="active_ppt_over">Active — PPT Over</SelectItem>
              <SelectItem value="matured">Matured</SelectItem>
              <SelectItem value="lapsed">Lapsed</SelectItem>
              <SelectItem value="surrendered">Surrendered</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={downloadingTpl}
            onClick={async () => {
              setDownloadingTpl(true);
              try {
                const r = await window.policyhub.policies.downloadTemplate();
                if (r?.saved) {
                  toast.success('Policy template saved', { description: r.path });
                }
              } catch (err) {
                toast.error('Could not generate template', {
                  description: (err as Error).message,
                });
              } finally {
                setDownloadingTpl(false);
              }
            }}
          >
            {downloadingTpl ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            Download policy template
          </Button>
          <Button
            variant="outline"
            disabled={importing}
            onClick={async () => {
              setImporting(true);
              try {
                const r = await window.policyhub.policies.importTemplate();
                if (!r.picked) return;
                setImportResult({
                  totalRows: r.totalRows,
                  created: r.created,
                  skipped: r.skipped,
                  errors: r.errors,
                });
                // Refresh the list.
                const fresh = (await window.policyhub.policies.list()) as Policy[];
                setRows(fresh);
              } catch (err) {
                toast.error('Upload failed', { description: (err as Error).message });
              } finally {
                setImporting(false);
              }
            }}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            Upload policy template
          </Button>
          <Button
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                // Honor active filters: if any are set, pass the visible
                // policy IDs so the export contains only those rows.
                const anyFilterActive =
                  q.trim() !== '' ||
                  companyFilter !== 'all' ||
                  modeFilter !== 'all' ||
                  statusFilter !== 'all';
                const opts = anyFilterActive
                  ? { policyIds: filtered.map((p) => p.id) }
                  : undefined;
                const r = await window.policyhub.policies.exportExcel(opts);
                if (r?.saved) {
                  toast.success(
                    `Exported ${r.rowCount ?? 0} policies`,
                    { description: r.path },
                  );
                }
              } catch (err) {
                toast.error('Export failed', { description: (err as Error).message });
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Export to Excel
          </Button>
          <Button onClick={() => navigate('/policies/new')}>
            <Plus className="h-4 w-4" />
            New policy
          </Button>
        </CardContent>
      </Card>

      {/* Filtered count — shows N when nothing's narrowed, "N of M" when
          filters narrow the result. Sits just above the table so it's
          easy to spot. */}
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          {filtered.length === rows.length ? (
            <>
              <span className="tabular-nums font-medium text-foreground">
                {rows.length}
              </span>{' '}
              {rows.length === 1 ? 'policy' : 'policies'}
            </>
          ) : (
            <>
              Showing{' '}
              <span className="tabular-nums font-medium text-foreground">
                {filtered.length}
              </span>{' '}
              of{' '}
              <span className="tabular-nums">{rows.length}</span> policies
            </>
          )}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <TableEmpty>
              <div>No policies match your filters.</div>
              <Button size="sm" onClick={() => navigate('/policies/new')}>
                Add policy
              </Button>
            </TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy no</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Premium</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/policies/${p.id}`)}
                  >
                    <TableCell className="font-medium">{p.policyNo}</TableCell>
                    <TableCell>{p.policyHolder}</TableCell>
                    <TableCell>{p.companyName}</TableCell>
                    <TableCell>{p.planName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyPaise(p.premiumAmount)}
                    </TableCell>
                    <TableCell className="capitalize">
                      {p.paymentMode.replace('_', '-')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(p.status)}>{statusLabel(p.status)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(importResult)}
        onOpenChange={(o) => !o && setImportResult(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Policy upload result</DialogTitle>
            <DialogDescription>
              New policies were imported from the template.
            </DialogDescription>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold text-emerald-600">
                    {importResult.created}
                  </div>
                  <div className="text-xs text-muted-foreground">Created</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold text-muted-foreground">
                    {importResult.skipped}
                  </div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold text-destructive">
                    {importResult.errors.length}
                  </div>
                  <div className="text-xs text-muted-foreground">Errors</div>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="max-h-64 overflow-auto rounded-md border p-3 text-xs">
                  {importResult.errors.map((e, i) => (
                    <div key={i} className="border-b py-1 last:border-0">
                      <span className="font-medium">Row {e.row}</span>
                      {e.policyNo && <> · {e.policyNo}</>}
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
