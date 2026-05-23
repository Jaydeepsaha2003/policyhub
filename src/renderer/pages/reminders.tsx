import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableEmpty } from '@/components/ui/table';
import { Send, Loader2, CloudUpload, Mail } from 'lucide-react';
import { formatCurrencyPaise, formatDate } from '@/lib/utils';
import { toast } from 'sonner';

type LogRow = {
  id: string;
  sentAt: string;
  sendDate: string;
  dayOfMonth: number;
  emailTo: string;
  subject: string;
  dueCount: number;
  overdueCount: number;
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
  const [cloudSending, setCloudSending] = useState(false);

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

  const sendViaCloud = async () => {
    setCloudSending(true);
    try {
      // Push the latest policy data first so the Sheet has up-to-date rows
      // before Apps Script reads from it.
      const syncRes = await window.policyhub.cloud.sync();
      if (!syncRes.ok) {
        toast.error('Cloud sync failed', { description: syncRes.error });
        return;
      }
      const res = await window.policyhub.cloud.forceReminders();
      if (!res.ok) {
        toast.error('Cloud reminders failed', { description: res.error });
        return;
      }
      const s = res.summary;
      if (!s || s.skipped) {
        toast.info('Nothing sent', {
          description: s?.reason ?? 'No items to send right now',
        });
      } else {
        const base = `${s.succeeded ?? 0} sent, ${s.failed ?? 0} failed, ${s.attempted ?? 0} attempted`;
        if ((s.failed ?? 0) > 0) {
          toast.error(`Cloud reminders: ${base}`, {
            description: 'Check the Sheet\'s ReminderLog tab for per-row error details.',
          });
        } else {
          toast.success(`Cloud reminders: ${base}`);
        }
      }
    } catch (err) {
      toast.error('Cloud reminders failed', { description: (err as Error).message });
    } finally {
      setCloudSending(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const res: any = await window.policyhub.reminders.sendNow();
      await load();

      const baseMsg = `${res.succeeded} sent, ${res.failed} failed, ${res.attempted} attempted`;

      if (res.failed > 0) {
        // Pull the latest error from the reminder log to show the actual cause.
        let latestErr = '';
        try {
          const fresh: any[] = await window.policyhub.reminders.log(10);
          const failure = fresh.find((r) => !r.success && r.errorMessage);
          if (failure) latestErr = failure.errorMessage;
        } catch {
          // ignore
        }
        toast.error(`Reminders: ${baseMsg}`, {
          description: latestErr
            ? `Latest error: ${latestErr}`
            : res.reason || 'See the Reminder log table below for details.',
        });
      } else if (res.attempted === 0) {
        toast.info('Nothing to send', {
          description:
            res.reason ||
            'No items match (no pending/overdue installments, or no agent email/SMTP configured).',
        });
      } else {
        toast.success(`Reminders: ${baseMsg}`);
      }
    } catch (err) {
      toast.error('Send failed', { description: (err as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Upcoming reminders (next 30 days)</CardTitle>
            <CardDescription>
              Premiums that will trigger a reminder soon. Cloud reminders fire
              automatically on the configured days of the month from Google's
              servers; use the buttons below to force a send now.
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button onClick={sendViaCloud} disabled={cloudSending}>
              {cloudSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              Send via cloud now
            </Button>
            <Button variant="outline" size="sm" onClick={sendNow} disabled={sending}>
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
              Send via local SMTP
            </Button>
          </div>
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
          <CardTitle>Local SMTP reminder log</CardTitle>
          <CardDescription>
            Latest 200 deliveries via the local SMTP path. Cloud reminders are
            logged in your Google Sheet's <code>ReminderLog</code> tab —{' '}
            <span className="italic">not</span> here.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {log.length === 0 ? (
            <TableEmpty>No reminders sent yet.</TableEmpty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent at</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Due / Overdue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.sentAt)}</TableCell>
                    <TableCell>{r.dayOfMonth}</TableCell>
                    <TableCell>{r.emailTo}</TableCell>
                    <TableCell className="max-w-[20rem] truncate">{r.subject}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.dueCount} / {r.overdueCount}
                    </TableCell>
                    <TableCell>
                      {r.success ? (
                        <Badge variant="success">Sent</Badge>
                      ) : (
                        <Badge variant="danger">Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[24rem] text-xs text-destructive">
                      {r.errorMessage ? (
                        <span title={r.errorMessage}>{r.errorMessage}</span>
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
