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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

// All three soft-delete-aware domains share the same recycle-bin shape:
// a list call, a restore call, a purge call, and an "expires after 90
// days" rule (auto-purge in db.ts startup). The dialog renders each in
// its own tab.

type DeletedPolicy = {
  id: string;
  policyNo: string;
  policyHolder: string;
  companyName: string;
  planName: string;
  deletedAt: string;
};
type DeletedFund = {
  id: string;
  folioNo: string;
  accountHolder: string;
  provider: string;
  schemeName: string;
  deletedAt: string;
};
type DeletedEvent = {
  id: string;
  title: string;
  category: string;
  customCategory: string | null;
  eventDate: string;
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
  const [policies, setPolicies] = useState<DeletedPolicy[]>([]);
  const [funds, setFunds] = useState<DeletedFund[]>([]);
  const [events, setEvents] = useState<DeletedEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, f, e] = await Promise.all([
        window.policyhub.policies.listDeleted(),
        window.policyhub.mutualFunds.listDeleted(),
        window.policyhub.calendar.listDeleted(),
      ]);
      setPolicies(p as DeletedPolicy[]);
      setFunds(f as DeletedFund[]);
      setEvents(e as DeletedEvent[]);
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

  const totalDeleted = policies.length + funds.length + events.length;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trash className="h-4 w-4" />
        Recycle bin
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Recycle bin</DialogTitle>
            <DialogDescription>
              Deleted items live here for 90 days before being permanently
              removed. Restore brings everything back as-it-was (premium
              installments, SIP schedule, recurring event occurrences).
              Permanent delete is irreversible.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : totalDeleted === 0 ? (
            <TableEmpty>Recycle bin is empty.</TableEmpty>
          ) : (
            <Tabs defaultValue="policies">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="policies">
                  Policies ({policies.length})
                </TabsTrigger>
                <TabsTrigger value="funds">
                  Mutual funds ({funds.length})
                </TabsTrigger>
                <TabsTrigger value="events">
                  Calendar events ({events.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="policies" className="max-h-[55vh] overflow-y-auto">
                {policies.length === 0 ? (
                  <TableEmpty>No deleted policies.</TableEmpty>
                ) : (
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
                      {policies.map((r) => {
                        const days = daysUntilPurge(r.deletedAt);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.policyNo}</TableCell>
                            <TableCell>{r.policyHolder}</TableCell>
                            <TableCell>
                              {r.companyName}{' '}
                              <span className="text-muted-foreground">
                                · {r.planName}
                              </span>
                            </TableCell>
                            <TableCell>{formatDate(r.deletedAt)}</TableCell>
                            <TableCell className={days <= 7 ? 'text-destructive' : ''}>
                              {days} day{days === 1 ? '' : 's'}
                            </TableCell>
                            <TableCell className="text-right">
                              <RestorePurgeRow
                                label={`${r.policyNo} · ${r.policyHolder}`}
                                onRestore={async () => {
                                  await window.policyhub.policies.restore(r.id);
                                  toast.success('Policy restored');
                                  await load();
                                }}
                                onPurge={async () => {
                                  await window.policyhub.policies.purge(r.id);
                                  toast.success('Policy permanently deleted');
                                  await load();
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="funds" className="max-h-[55vh] overflow-y-auto">
                {funds.length === 0 ? (
                  <TableEmpty>No deleted mutual funds.</TableEmpty>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folio</TableHead>
                        <TableHead>Holder</TableHead>
                        <TableHead>Provider / scheme</TableHead>
                        <TableHead>Deleted</TableHead>
                        <TableHead>Purge in</TableHead>
                        <TableHead className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {funds.map((r) => {
                        const days = daysUntilPurge(r.deletedAt);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.folioNo}</TableCell>
                            <TableCell>{r.accountHolder}</TableCell>
                            <TableCell>
                              {r.provider}{' '}
                              <span className="text-muted-foreground">
                                · {r.schemeName}
                              </span>
                            </TableCell>
                            <TableCell>{formatDate(r.deletedAt)}</TableCell>
                            <TableCell className={days <= 7 ? 'text-destructive' : ''}>
                              {days} day{days === 1 ? '' : 's'}
                            </TableCell>
                            <TableCell className="text-right">
                              <RestorePurgeRow
                                label={`${r.folioNo} · ${r.accountHolder}`}
                                onRestore={async () => {
                                  await window.policyhub.mutualFunds.restore(r.id);
                                  toast.success('Mutual fund restored');
                                  await load();
                                }}
                                onPurge={async () => {
                                  await window.policyhub.mutualFunds.purge(r.id);
                                  toast.success('Mutual fund permanently deleted');
                                  await load();
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="events" className="max-h-[55vh] overflow-y-auto">
                {events.length === 0 ? (
                  <TableEmpty>No deleted calendar events.</TableEmpty>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Event date</TableHead>
                        <TableHead>Deleted</TableHead>
                        <TableHead>Purge in</TableHead>
                        <TableHead className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((r) => {
                        const days = daysUntilPurge(r.deletedAt);
                        const cat =
                          r.category === 'other'
                            ? r.customCategory || 'Other'
                            : r.category.replace(/_/g, ' ');
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.title}</TableCell>
                            <TableCell className="capitalize">{cat}</TableCell>
                            <TableCell>{formatDate(r.eventDate)}</TableCell>
                            <TableCell>{formatDate(r.deletedAt)}</TableCell>
                            <TableCell className={days <= 7 ? 'text-destructive' : ''}>
                              {days} day{days === 1 ? '' : 's'}
                            </TableCell>
                            <TableCell className="text-right">
                              <RestorePurgeRow
                                label={r.title}
                                onRestore={async () => {
                                  await window.policyhub.calendar.restore(r.id);
                                  toast.success('Event restored');
                                  await load();
                                }}
                                onPurge={async () => {
                                  await window.policyhub.calendar.purge(r.id);
                                  toast.success('Event permanently deleted');
                                  await load();
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Shared row-level Restore + Permanent-delete buttons. Wraps the
// AlertDialog confirmation flow and a try/catch around the destructive
// action. Each table row provides its own onRestore / onPurge.
const RestorePurgeRow = ({
  label,
  onRestore,
  onPurge,
}: {
  label: string;
  onRestore: () => Promise<void>;
  onPurge: () => Promise<void>;
}) => (
  <div className="flex items-center justify-end gap-1">
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await onRestore();
        } catch (err) {
          toast.error('Restore failed', { description: (err as Error).message });
        }
      }}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      Restore
    </Button>
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Delete permanently">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            {label} will be removed immediately. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={async () => {
              try {
                await onPurge();
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
);
