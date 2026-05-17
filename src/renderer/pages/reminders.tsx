import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/table';
import { Send, Loader2 } from 'lucide-react';
import { formatCurrencyPaise, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

type LogRow = {
  id: string;
  sentAt: string;
  emailTo: string;
  kind: 'due_soon' | 'overdue';
  daysBeforeDue: number;
  subject: string;
  success: boolean;
  errorMessage: string | null;
};

type Upcoming = {
  paymentId: string;
  policyId: string;
  policyNo: string;
  policyHolder: string;
  companyName: string;
  dueDate: string;
  expectedAmount: number;
  daysRemaining: number;
};

export const RemindersPage = () => {
  const [log, setLog] = useState<LogRow[]>([]);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      const [l, u]: any = await Promise.all([
        window.policyhub.reminders.log(200),
        window.policyhub.reminders.upcoming(),
      ]);
      setLog(l);
      setUpcoming(u);
    } catch (err) {
      toast.error('Failed to load reminders', { description: (err as Error).message });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sendNow = async () => {
    setSending(true);
    try {
      const res: any = await window.policyhub.reminders.sendNow();
      toast.success('Reminders processed', {
        description: `${res.succeeded} sent, ${res.failed} failed, ${res.attempted} attempted`,
      });
      await load();
    } catch (err) {
      toast.error('Send failed', { description: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Upcoming reminders (next 30 days)</CardTitle>
            <CardDescription>
              Premiums that will trigger a reminder soon.
            </CardDescription>
          </div>
          <Button onClick={sendNow} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send pending reminders now
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {upcoming.length === 0 ? (
            <TableEmpty>No premiums due in the next 30 days.</TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Holder</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcoming.map((u) => (
                  <TableRow key={u.paymentId}>
                    <TableCell className="font-medium">{u.policyNo}</TableCell>
                    <TableCell>{u.policyHolder}</TableCell>
                    <TableCell>{formatDate(u.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrencyPaise(u.expectedAmount)}
                    </TableCell>
                    <TableCell>{u.daysRemaining}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminder log</CardTitle>
          <CardDescription>Latest 200 deliveries</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {log.length === 0 ? (
            <TableEmpty>No reminders sent yet.</TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent at</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.sentAt)}</TableCell>
                    <TableCell>{r.emailTo}</TableCell>
                    <TableCell className="capitalize">{r.kind.replace('_', ' ')}</TableCell>
                    <TableCell>{r.daysBeforeDue}</TableCell>
                    <TableCell className="max-w-[20rem] truncate">{r.subject}</TableCell>
                    <TableCell>
                      {r.success ? (
                        <Badge variant="success">Sent</Badge>
                      ) : (
                        <Badge variant="danger" title={r.errorMessage ?? undefined}>
                          Failed
                        </Badge>
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
