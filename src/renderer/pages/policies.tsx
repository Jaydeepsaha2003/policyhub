import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/table';
import { Plus, Search, FileSpreadsheet, Loader2 } from 'lucide-react';
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
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const r = await window.policyhub.policies.exportExcel();
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
            Export all as Excel
          </Button>
          <Button onClick={() => navigate('/policies/new')}>
            <Plus className="h-4 w-4" />
            New policy
          </Button>
        </CardContent>
      </Card>

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
                  <TableHead className="text-right">Sum assured</TableHead>
                  <TableHead>Mode</TableHead>
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
                      {formatCurrencyPaise(p.sumAssured)}
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
    </div>
  );
};
