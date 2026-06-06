import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Save,
  Loader2,
  Database,
  Download,
  Trash2,
  Cloud,
  CloudUpload,
  KeyRound,
  Copy,
  CheckCircle2,
  Upload,
  FileSpreadsheet,
} from 'lucide-react';
import { CloudSetupGuide } from '@/components/cloud-setup-guide';
import { RecycleBinDialog } from '@/components/recycle-bin-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  cloudSheetUrl: string | null;
  cloudSheetSecretSet: boolean;
  cloudSyncOnQuit: boolean;
  cloudSyncOnChange: boolean;
  cloudLastSyncedAt: string | null;
};

export const SettingsPage = () => {
  const [s, setS] = useState<SettingsView | null>(null);
  const [smtpPassword, setSmtpPassword] = useState('');
  const [daysOfMonthText, setDaysOfMonthText] = useState('1, 10, 20');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [cloudSecretInput, setCloudSecretInput] = useState('');
  const [cloudTesting, setCloudTesting] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudEmailing, setCloudEmailing] = useState(false);
  const [smtpEmailing, setSmtpEmailing] = useState(false);

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
    // Validate before saving.
    if (s.smtpPort !== null && s.smtpPort !== undefined) {
      if (s.smtpPort < 1 || s.smtpPort > 65535) {
        toast.error('SMTP port must be between 1 and 65535');
        return;
      }
    }
    if (s.agentEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.agentEmail)) {
      toast.error('Agent email is not a valid email');
      return;
    }
    if (s.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.fromEmail)) {
      toast.error('From email is not a valid email');
      return;
    }
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
        cloudSheetUrl: s.cloudSheetUrl,
        cloudSyncOnQuit: s.cloudSyncOnQuit,
        cloudSyncOnChange: s.cloudSyncOnChange,
      };
      if (smtpPassword) payload.smtpPassword = smtpPassword;
      if (cloudSecretInput) payload.cloudSheetSecret = cloudSecretInput;

      await window.policyhub.settings.update(payload);
      toast.success('Settings saved');
      setSmtpPassword('');
      setCloudSecretInput('');
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
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={smtpEmailing}
              onClick={async () => {
                if (!s.agentEmail) {
                  toast.error('Set Agent email below first');
                  return;
                }
                setSmtpEmailing(true);
                try {
                  const res = await window.policyhub.smtp.sendTestEmail();
                  toast.success(`Test email sent to ${res.to}`);
                } catch (err) {
                  toast.error('Could not send', { description: (err as Error).message });
                } finally {
                  setSmtpEmailing(false);
                }
              }}
            >
              {smtpEmailing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Send test email
            </Button>
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
            Merge variables for the monthly summary:{' '}
            <code>{'{{recipient_name}}'}</code> (the holder's name, or the agent
            name when sent to the agent fallback), <code>{'{{holder}}'}</code>{' '}
            (alias of recipient_name), <code>{'{{agent_name}}'}</code>,{' '}
            <code>{'{{month}}'}</code>, <code>{'{{day_of_month}}'}</code>,{' '}
            <code>{'{{due_count}}'}</code>, <code>{'{{due_total}}'}</code>,{' '}
            <code>{'{{due_list}}'}</code>, <code>{'{{overdue_count}}'}</code>,{' '}
            <code>{'{{overdue_total}}'}</code>, <code>{'{{overdue_list}}'}</code>
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Routing:</span> each policy's reminder goes to its{' '}
            <code>holder_email</code> if set, otherwise to the Agent email below as
            a catch-all. Multiple policies sharing the same email are consolidated
            into one email.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Cloud reminders (Google Sheets)
          </CardTitle>
          <CardDescription>
            Push your policy data to a Google Sheet so reminders fire from
            Google's servers — even when this laptop is off. One-time setup is
            ~10 minutes. Click <span className="font-medium">Show setup guide</span>{' '}
            below for the full step-by-step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <CloudSetupGuide />
          </div>

          <Field label="Apps Script Web App URL">
            <Input
              value={s.cloudSheetUrl ?? ''}
              onChange={(e) => update({ cloudSheetUrl: e.target.value })}
              placeholder="https://script.google.com/macros/s/.../exec"
            />
            <p className="text-[11px] text-muted-foreground">
              The deployment URL Google gives you after "Deploy → New deployment → Web App".
            </p>
          </Field>

          <Field label={`Shared secret${s.cloudSheetSecretSet ? ' (already set — leave blank to keep)' : ''}`}>
            <div className="flex gap-2">
              <Input
                type="password"
                value={cloudSecretInput}
                onChange={(e) => setCloudSecretInput(e.target.value)}
                placeholder={s.cloudSheetSecretSet ? '••••••••' : 'Paste or generate'}
              />
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    const secret = await window.policyhub.cloud.generateSecret();
                    setCloudSecretInput(secret);
                    try {
                      await navigator.clipboard.writeText(secret);
                      toast.success('Secret generated and copied to clipboard', {
                        description: 'Paste it into your Sheet → Settings tab → cell B1, then click Save settings here.',
                      });
                    } catch {
                      toast.success('Secret generated', {
                        description: 'Copy it from the field and paste into the Sheet.',
                      });
                    }
                  } catch (err) {
                    toast.error('Could not generate', {
                      description: (err as Error).message,
                    });
                  }
                }}
              >
                <KeyRound className="h-4 w-4" />
                Generate
              </Button>
              {cloudSecretInput && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(cloudSecretInput);
                      toast.success('Copied to clipboard');
                    } catch {
                      toast.error('Clipboard not available');
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Paste this same value into the Sheet's <code>Settings</code> tab,
              cell <code>B1</code>. Both must match for sync to work. Stored
              encrypted via OS keychain.
            </p>
          </Field>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Auto-sync on every change</div>
              <div className="text-xs text-muted-foreground">
                Push to the Sheet ~5 seconds after every create / edit / delete
                you do in PolicyHub. Rapid successive changes are coalesced
                into one sync.
              </div>
            </div>
            <Switch
              checked={s.cloudSyncOnChange}
              onCheckedChange={(c) => update({ cloudSyncOnChange: c })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Auto-sync on quit</div>
              <div className="text-xs text-muted-foreground">
                Push the latest data to the Sheet every time you quit
                PolicyHub from the tray.
              </div>
            </div>
            <Switch
              checked={s.cloudSyncOnQuit}
              onCheckedChange={(c) => update({ cloudSyncOnQuit: c })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={cloudTesting || !s.cloudSheetUrl}
              onClick={async () => {
                setCloudTesting(true);
                try {
                  const res = await window.policyhub.cloud.test();
                  if (res.ok) {
                    toast.success('Cloud connection OK');
                  } else {
                    toast.error('Test failed', { description: res.error });
                  }
                } catch (err) {
                  toast.error('Test failed', { description: (err as Error).message });
                } finally {
                  setCloudTesting(false);
                }
              }}
            >
              {cloudTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Test connection
            </Button>
            <Button
              type="button"
              disabled={cloudSyncing || !s.cloudSheetUrl}
              onClick={async () => {
                setCloudSyncing(true);
                try {
                  const res = await window.policyhub.cloud.sync();
                  if (res.ok) {
                    toast.success(
                      `Synced — ${res.counts?.policies ?? 0} policies, ${res.counts?.installments ?? 0} installments, ${res.counts?.repayments ?? 0} repayments`,
                    );
                    await load();
                  } else {
                    toast.error('Sync failed', { description: res.error });
                  }
                } catch (err) {
                  toast.error('Sync failed', { description: (err as Error).message });
                } finally {
                  setCloudSyncing(false);
                }
              }}
            >
              {cloudSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
              Sync now
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={cloudEmailing || !s.cloudSheetUrl}
              onClick={async () => {
                setCloudEmailing(true);
                try {
                  const res = await window.policyhub.cloud.testEmail();
                  if (res.ok) {
                    toast.success('Test email sent — check the inbox of the address in the Sheet\'s Settings B2 cell.');
                  } else {
                    toast.error('Test email failed', { description: res.error });
                  }
                } catch (err) {
                  toast.error('Test email failed', { description: (err as Error).message });
                } finally {
                  setCloudEmailing(false);
                }
              }}
            >
              {cloudEmailing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send test email (cloud)
            </Button>

            <CalendarAppsScriptButton />
            <MutualFundAppsScriptButton />

            {s.cloudLastSyncedAt && (
              <span className="ml-auto text-xs text-muted-foreground">
                Last synced: {new Date(s.cloudLastSyncedAt).toLocaleString()}
              </span>
            )}
          </div>
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
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const r = await window.policyhub.app.importDb();
                if (r?.imported) {
                  toast.success('Database imported — app will restart', {
                    description: `Previous DB backed up to: ${r.backedUpTo}`,
                  });
                }
              } catch (err) {
                toast.error('Import failed', { description: (err as Error).message });
              }
            }}
          >
            <Upload className="h-4 w-4" />
            Import database
          </Button>
          <Button variant="outline" onClick={exportJson}>
            <Download className="h-4 w-4" />
            Export all data as JSON
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const r = await window.policyhub.exportEverything();
                if (r?.saved) {
                  const total = Object.values(r.sheets ?? {}).reduce(
                    (a, b) => a + (b ?? 0),
                    0,
                  );
                  toast.success(`Exported ${total} rows across ${Object.keys(r.sheets ?? {}).length} sheets`, {
                    description: r.path,
                  });
                }
              } catch (err) {
                toast.error('Export failed', {
                  description: (err as Error).message,
                });
              }
            }}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export everything to Excel
          </Button>
          <RecycleBinDialog />
          <div className="ml-auto">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4" />
                  Reset all data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all data on this device?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Every policy, premium payment, repayment, attachment, reminder log
                    and setting will be permanently deleted. The app will quit and
                    relaunch with an empty database — you'll go through the setup wizard
                    again. There is no undo.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        await window.policyhub.app.resetData();
                      } catch (err) {
                        toast.error('Reset failed', { description: (err as Error).message });
                      }
                    }}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    Yes, delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
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

// Surfaces the Apps Script extension snippet for the Calendar feature.
// User copies it into the same Apps Script project they set up for
// policy reminders, then sets up a daily time-driven trigger on the
// `calendarReminderTick_` function the snippet defines.
// Generic Apps Script snippet viewer. Both the Calendar and the MF
// extension use the same dialog shape — only the label / title /
// trigger function name and the IPC that fetches the code differ.
const AppsScriptButton = ({
  label,
  title,
  triggerFn,
  loader,
}: {
  label: string;
  title: string;
  triggerFn: string;
  loader: () => Promise<string>;
}) => {
  const [code, setCode] = useState('');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const c = await loader();
      setCode(c);
    } catch (err) {
      toast.error('Could not load script', { description: (err as Error).message });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !code) load();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Copy className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Copy this code and paste it at the bottom of the same Apps Script
            project that already powers your policy reminders. Then redeploy
            (Deploy → Manage deployments → edit → Save) and add a daily
            time-driven trigger on{' '}
            <span className="font-mono text-xs">{triggerFn}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <pre className="max-h-[55vh] overflow-auto rounded-md border bg-muted/30 p-3 text-[11px] leading-relaxed">
            <code>{code || 'Loading…'}</code>
          </pre>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="absolute right-2 top-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                toast.error('Could not copy');
              }
            }}
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CalendarAppsScriptButton = () => (
  <AppsScriptButton
    label="Calendar Apps Script extension"
    title="Calendar reminders — Apps Script extension"
    triggerFn="calendarReminderTick_"
    loader={() => window.policyhub.calendar.appsScript()}
  />
);

const MutualFundAppsScriptButton = () => (
  <AppsScriptButton
    label="Mutual Fund Apps Script extension"
    title="Mutual fund SIP reminders — Apps Script extension"
    triggerFn="mfSipReminderTick_"
    loader={() => window.policyhub.mutualFunds.appsScript()}
  />
);
