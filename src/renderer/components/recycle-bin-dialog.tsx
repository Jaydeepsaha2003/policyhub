import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableEmpty,
} from '@/components/ui/table';
import { Loader2, RotateCcw, Trash2, Trash } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

type DeletedPolicy = {
  id: string;
  policyNo: string;
  policyHolder: string;
  companyName: string;
  planName: string;
  deletedAt: string;
};

const daysUntilPurge = (deletedAt: string): number => {
  const deleted = new Date(deletedAt).getTime();
  if (Number.isNaN(deleted)) return 0;
  const purge = deleted + 90 * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purge - Date.now()) / (24 * 60 * 60 * 1000)));
};

export const RecycleBinDialog = () => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DeletedPolicy[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = (await window.policyhub.policies.listDeleted()) as DeletedPolicy[];
      setRows(list);
    } catch (err) {
      toast.error('Failed to load recycle bin', {
        description: (err as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trash className="h-4 w-4" />
        Recycle bin
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Recycle bin — deleted policies</DialogTitle>
            <DialogDescription>
              Policies you delete go here for 90 days before being permanently
              removed. Restore brings them back as-is (premium installments
              and repayments included). Permanent delete is irreversible.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <TableEmpty>Recycle bin is empty.</TableEmpty>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy</TableHead>
                    <TableHead>Holder</TableHead>
                    <TableHead>Company / plan</TableHead>
                    <TableHead>Deleted</TableHead>
                    <TableHead>Purge in</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const days = daysUntilPurge(r.deletedAt);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.policyNo}</TableCell>
                        <TableCell>{r.policyHolder}</TableCell>
                        <TableCell>
                          {r.companyName}{' '}
                          <span className="text-muted-foreground">· {r.planName}</span>
                        </TableCell>
                        <TableCell>{formatDate(r.deletedAt)}</TableCell>
                        <TableCell className={days <= 7 ? 'text-destructive' : ''}>
                          {days} day{days === 1 ? '' : 's'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await window.policyhub.policies.restore(r.id);
                                  toast.success('Policy restored');
                                  await load();
                                } catch (err) {
                                  toast.error('Restore failed', {
                                    description: (err as Error).message,
                                  });
                                }
                              }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Restore
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  title="Delete permanently"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Delete this policy permanently?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {r.policyNo} · {r.policyHolder} will be removed
                                    immediately. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive hover:bg-destructive/90"
                                    onClick={async () => {
                                      try {
                                        await window.policyhub.policies.purge(r.id);
                                        toast.success('Policy permanently deleted');
                                        await load();
                                      } catch (err) {
                                        toast.error('Purge failed', {
                                          description: (err as Error).message,
                                        });
                                      }
                                    }}
                                  >
                                    Delete permanently
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
