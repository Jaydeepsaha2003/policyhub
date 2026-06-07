import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  TableEmpty,
} from '@/components/ui/table';
import { Plus, Search, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useRouter } from '@/lib/router';
import { formatCurrencyPaise, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

type MutualFund = {
  id: string;
  folioNo: string;
  accountHolder: string;
  provider: string;
  schemeName: string;
  type: 'lumpsum' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';
  amount: number;
  startDate: string;
  installmentCount: number;
  status: 'active' | 'redeemed' | 'closed';
  agentName: string | null;
};

const typeLabel = (t: MutualFund['type']): string => {
  switch (t) {
    case 'lumpsum':
      return 'Lumpsum';
    case 'monthly':
      return 'Monthly SIP';
    case 'quarterly':
      return 'Quarterly SIP';
    case 'half_yearly':
      return 'Half-yearly SIP';
    case 'yearly':
      return 'Yearly SIP';
  }
};

const statusLabel = (s: MutualFund['status']) =>
  s === 'active' ? 'Active' : s === 'redeemed' ? 'Redeemed' : 'Closed';

const statusVariant = (s: MutualFund['status']) =>
  s === 'active'
    ? ('success' as const)
    : s === 'redeemed'
      ? ('secondary' as const)
      : ('warning' as const);

export const MutualFundsPage = () => {
  const { navigate } = useRouter();
  const [rows, setRows] = useState<MutualFund[]>([]);
  const [q, setQ] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [holderFilter, setHolderFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = (await window.policyhub.mutualFunds.list()) as MutualFund[];
        setRows(r);
      } catch (err) {
        toast.error('Failed to load mutual funds', {
          description: (err as Error).message,
        });
      }
    })();
  }, []);

  const providers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.provider))).sort(),
    [rows],
  );
  const holders = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((r) => providerFilter === 'all' || r.provider === providerFilter)
            .map((r) => r.accountHolder),
        ),
      ).sort(),
    [rows, providerFilter],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (needle) {
        const hay = [r.folioNo, r.accountHolder, r.provider, r.schemeName]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (providerFilter !== 'all' && r.provider !== providerFilter) return false;
      if (holderFilter !== 'all' && r.accountHolder !== holderFilter) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, q, providerFilter, holderFilter, typeFilter, statusFilter]);

  const anyFilterActive =
    q.trim() !== '' ||
    providerFilter !== 'all' ||
    holderFilter !== 'all' ||
    typeFilter !== 'all' ||
    statusFilter !== 'all';

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search folio, holder, provider, scheme…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select
            value={providerFilter}
            onValueChange={(v) => {
              setProviderFilter(v);
              setHolderFilter('all');
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
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
                <SelectItem key={h} value={h}>
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="lumpsum">Lumpsum</SelectItem>
              <SelectItem value="monthly">Monthly SIP</SelectItem>
              <SelectItem value="quarterly">Quarterly SIP</SelectItem>
              <SelectItem value="half_yearly">Half-yearly SIP</SelectItem>
              <SelectItem value="yearly">Yearly SIP</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="redeemed">Redeemed</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const opts = anyFilterActive
                  ? { mutualFundIds: filtered.map((p) => p.id) }
                  : undefined;
                const r = await window.policyhub.mutualFunds.exportExcel(opts);
                if (r?.saved) {
                  toast.success(`Exported ${r.rowCount ?? 0} funds`, {
                    description: r.path,
                  });
                }
              } catch (err) {
                toast.error('Export failed', {
                  description: (err as Error).message,
                });
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
          <Button onClick={() => navigate('/mutual-funds/new')}>
            <Plus className="h-4 w-4" />
            New mutual fund
          </Button>
        </CardContent>
      </Card>

      {/* Filtered count — at-a-glance signal of how many funds are
          visible vs total. */}
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          {filtered.length === rows.length ? (
            <>
              <span className="tabular-nums font-medium text-foreground">
                {rows.length}
              </span>{' '}
              {rows.length === 1 ? 'fund' : 'funds'}
            </>
          ) : (
            <>
              Showing{' '}
              <span className="tabular-nums font-medium text-foreground">
                {filtered.length}
              </span>{' '}
              of{' '}
              <span className="tabular-nums">{rows.length}</span> funds
            </>
          )}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <TableEmpty>
              <div>No mutual funds match your filters.</div>
              <Button size="sm" onClick={() => navigate('/mutual-funds/new')}>
                Add mutual fund
              </Button>
            </TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio No</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Scheme</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((mf) => (
                  <TableRow
                    key={mf.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/mutual-funds/${mf.id}`)}
                  >
                    <TableCell className="font-medium">{mf.folioNo}</TableCell>
                    <TableCell>{mf.accountHolder}</TableCell>
                    <TableCell>{mf.provider}</TableCell>
                    <TableCell>{mf.schemeName}</TableCell>
                    <TableCell>{typeLabel(mf.type)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyPaise(mf.amount)}
                    </TableCell>
                    <TableCell>{formatDate(mf.startDate)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(mf.status)}>
                        {statusLabel(mf.status)}
                      </Badge>
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
