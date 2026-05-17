import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2, Database, Download } from 'lucide-react';
import { toast } from 'sonner';

type SettingsView = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPasswordSet: boolean;
  fromEmail: string | null;
  fromName: string | null;
  reminderOffsetsDays: number[];
  reminderDaysOfMonth: number[];
  overdueReminderIntervalDays: number;
  dailyCheckEnabled: boolean;
  reminderRecipient: 'agent' | 'client' | 'both';
  agentEmail: string | null;
  emailTemplateDueSoon: string | null;
  emailTemplateOverdue: string | null;
  emailTemplateMonthly: string | null;
  startAtLogin: boolean;
  theme: 'light' | 'dark' | 'system';
};

export const SettingsPage = () => {
  const [s, setS] = useState<SettingsView | null>(null);
  const [smtpPassword, setSmtpPassword] = useState('');
  const [daysOfMonthText, setDaysOfMonthText] = useState('1, 10, 20');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    try {
      const fresh: any = await window.policyhub.settings.get();
      setS(fresh);
      setDaysOfMonthText((fresh.reminderDaysOfMonth as number[]).join(', '));
    } catch (err) {
      toast.error('Failed to load settings', { description: (err as Error).message });
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (!s) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const update = (patch: Partial<SettingsView>) => setS({ ...s, ...patch });

  const save = async () => {
    setSaving(true);
    try {
      const parsedDays = daysOfMonthText
        .split(',')
        .map((v) => Number.parseInt(v.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 28);

      const payload: any = {
        smtpHost: s.smtpHost,
        smtpPort: s.smtpPort,
        smtpUser: s.smtpUser,
        fromEmail: s.fromEmail,
        fromName: s.fromName,
        reminderDaysOfMonth: parsedDays.length ? parsedDays : [1, 10, 20],
        dailyCheckEnabled: s.dailyCheckEnabled,
        reminderRecipient: s.reminderRecipient,
        agentEmail: s.agentEmail,
        emailTemplateMonthly: s.emailTemplateMonthly ?? '',
        startAtLogin: s.startAtLogin,
      };
      if (smtpPassword) payload.smtpPassword = smtpPassword;

      await window.policyhub.settings.update(payload);
      toast.success('Settings saved');
      setSmtpPassword('');
      await load();
    } catch (err) {
      toast.error('Save failed', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!s.smtpHost || !s.smtpPort || !s.smtpUser || !s.fromEmail) {
      toast.error('Fill in SMTP host, port, user, and from email first');
      return;
    }
    if (!smtpPassword) {
      toast.error('Enter the SMTP password to test', {
        description: 'Re-enter the password in the field above before testing.',
      });
      return;
    }
    setTesting(true);
    try {
      await window.policyhub.settings.testSmtp({
        smtpHost: s.smtpHost,
        smtpPort: s.smtpPort,
        smtpUser: s.smtpUser,
        smtpPassword,
        fromEmail: s.fromEmail,
        fromName: s.fromName ?? '',
      });
      toast.success('Connection OK');
    } catch (err) {
      toast.error('Test failed', { description: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const backup = async () => {
    try {
      const r: any = await window.policyhub.app.backupDb();
      if (r?.saved) toast.success('Backup saved', { description: r.path });
    } catch (err) {
      toast.error('Backup failed', { description: (err as Error).message });
    }
  };
  const exportJson = async () => {
    try {
      const r: any = await window.policyhub.app.exportJson();
      if (r?.saved) toast.success('JSON exported', { description: r.path });
    } catch (err) {
      toast.error('Export failed', { description: (err as Error).message });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>SMTP & email</CardTitle>
          <CardDescription>
            Used to send premium reminders. Password is encrypted at rest.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SMTP host">
              <Input value={s.smtpHost ?? ''} onChange={(e) => update({ smtpHost: e.target.value })} />
            </Field>
            <Field label="SMTP port">
              <Input
                type="number"
                value={s.smtpPort ?? ''}
                onChange={(e) => update({ smtpPort: Number(e.target.value) || null })}
              />
            </Field>
            <Field label="SMTP user">
              <Input value={s.smtpUser ?? ''} onChange={(e) => update({ smtpUser: e.target.value })} />
            </Field>
            <Field label={`SMTP password${s.smtpPasswordSet ? ' (already set)' : ''}`}>
              <Input
                type="password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={s.smtpPasswordSet ? '••••••• (leave blank to keep)' : ''}
              />
            </Field>
            <Field label="From email">
              <Input
                type="email"
                value={s.fromEmail ?? ''}
                onChange={(e) => update({ fromEmail: e.target.value })}
              />
            </Field>
            <Field label="From name">
              <Input value={s.fromName ?? ''} onChange={(e) => update({ fromName: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={test} disabled={testing}>
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Test connection
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Agent email (where reminders go)">
            <Input
              value={s.agentEmail ?? ''}
              onChange={(e) => update({ agentEmail: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Send summary on these days of month">
              <Input
                value={daysOfMonthText}
                onChange={(e) => setDaysOfMonthText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated values 1–28. Default: <code>1, 10, 20</code>.
              </p>
            </Field>
            <Field label="Recipient">
              <Select
                value={s.reminderRecipient}
                onValueChange={(v) => update({ reminderRecipient: v as any })}
                disabled
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent only</SelectItem>
                  <SelectItem value="client">Client only</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Monthly summaries always go to the agent.
              </p>
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Hourly auto-check enabled</div>
              <div className="text-xs text-muted-foreground">
                Scheduler runs every hour while the app is open / in the tray.
              </div>
            </div>
            <Switch
              checked={s.dailyCheckEnabled}
              onCheckedChange={(c) => update({ dailyCheckEnabled: c })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Start at login</div>
              <div className="text-xs text-muted-foreground">Launch PolicyHub automatically.</div>
            </div>
            <Switch
              checked={s.startAtLogin}
              onCheckedChange={(c) => update({ startAtLogin: c })}
            />
          </div>
          <Separator />
          <Field label="Monthly summary email template">
            <Textarea
              rows={10}
              value={s.emailTemplateMonthly ?? ''}
              onChange={(e) => update({ emailTemplateMonthly: e.target.value })}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Merge variables for the monthly summary: <code>{'{{month}}'}</code>,{' '}
            <code>{'{{day_of_month}}'}</code>, <code>{'{{due_count}}'}</code>,{' '}
            <code>{'{{due_total}}'}</code>, <code>{'{{due_list}}'}</code>,{' '}
            <code>{'{{overdue_count}}'}</code>, <code>{'{{overdue_total}}'}</code>,{' '}
            <code>{'{{overdue_list}}'}</code>, <code>{'{{agent_name}}'}</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <CardDescription>Local backups and exports.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={backup}>
            <Database className="h-4 w-4" />
            Backup database
          </Button>
          <Button variant="outline" onClick={exportJson}>
            <Download className="h-4 w-4" />
            Export all data as JSON
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save settings
        </Button>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
  </div>
);
