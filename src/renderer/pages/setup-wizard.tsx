import { useState } from 'react';
import { ShieldCheck, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

type Step = 'welcome' | 'agent' | 'smtp' | 'preferences' | 'finish';

export const SetupWizard = ({ onDone }: { onDone: () => void }) => {
  const [step, setStep] = useState<Step>('welcome');

  const [agentName, setAgentName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [daysOfMonth, setDaysOfMonth] = useState('1, 10, 20');
  const [startAtLogin, setStartAtLogin] = useState(true);
  const [skipEmail, setSkipEmail] = useState(false);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const testConn = async () => {
    setTesting(true);
    try {
      await window.policyhub.settings.testSmtp({
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpUser,
        smtpPassword,
        fromEmail,
        fromName,
      });
      toast.success('SMTP connection OK');
    } catch (err) {
      toast.error('SMTP test failed', { description: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    try {
      const parsedDays = daysOfMonth
        .split(',')
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 28);

      await window.policyhub.settings.update({
        agentEmail: agentEmail || null,
        fromEmail: fromEmail || null,
        fromName: fromName || null,
        smtpHost: skipEmail ? null : smtpHost,
        smtpPort: skipEmail ? null : Number(smtpPort),
        smtpUser: skipEmail ? null : smtpUser,
        smtpPassword: skipEmail ? null : smtpPassword,
        reminderDaysOfMonth: parsedDays.length ? parsedDays : [1, 10, 20],
        startAtLogin,
        setupComplete: true,
      });
      toast.success('Setup complete');
      onDone();
    } catch (err) {
      toast.error('Could not save settings', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background drag-region">
      <Card className="w-full max-w-xl no-drag">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Welcome to PolicyHub</CardTitle>
              <CardDescription>Set up your local policy management app</CardDescription>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="space-y-6 pt-6">
          {step === 'welcome' && (
            <>
              <div className="space-y-2 text-sm leading-relaxed">
                <p>
                  PolicyHub runs entirely on your machine. All policy data is stored in a local
                  SQLite database — no cloud, no servers.
                </p>
                <p>
                  We'll take a minute to set up your details and (optionally) an email account for
                  premium reminders.
                </p>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setStep('agent')}>Get started</Button>
              </div>
            </>
          )}

          {step === 'agent' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Your name (agent)</Label>
                  <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Your email</Label>
                  <Input
                    type="email"
                    value={agentEmail}
                    onChange={(e) => setAgentEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Reminders for upcoming premiums will be sent to this address by default.
              </p>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('welcome')}>
                  Back
                </Button>
                <Button onClick={() => setStep('smtp')} disabled={!agentEmail}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {step === 'smtp' && (
            <>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Skip email setup for now</div>
                  <div className="text-xs text-muted-foreground">
                    You can configure SMTP later from Settings.
                  </div>
                </div>
                <Switch checked={skipEmail} onCheckedChange={setSkipEmail} />
              </div>

              {!skipEmail && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>SMTP host</Label>
                      <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>SMTP port</Label>
                      <Input
                        type="number"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>SMTP username</Label>
                      <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>SMTP password (app password)</Label>
                      <Input
                        type="password"
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>From email</Label>
                      <Input
                        type="email"
                        value={fromEmail}
                        onChange={(e) => setFromEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>From name</Label>
                      <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={testConn} disabled={testing}>
                      {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Test connection
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('agent')}>
                  Back
                </Button>
                <Button onClick={() => setStep('preferences')}>Continue</Button>
              </div>
            </>
          )}

          {step === 'preferences' && (
            <>
              <div className="space-y-2">
                <Label>Send reminder summary on these days of month</Label>
                <Input value={daysOfMonth} onChange={(e) => setDaysOfMonth(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Comma-separated. Example: <code>1, 10, 20</code>. On each of these dates,
                  PolicyHub emails you a summary of all premiums due this month and any overdues.
                  Use values 1–28 (avoids missing months without a 29th/30th/31st).
                </p>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Start at login</div>
                  <div className="text-xs text-muted-foreground">
                    Launch PolicyHub automatically when this Mac/PC starts.
                  </div>
                </div>
                <Switch checked={startAtLogin} onCheckedChange={setStartAtLogin} />
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('smtp')}>
                  Back
                </Button>
                <Button onClick={() => setStep('finish')}>Continue</Button>
              </div>
            </>
          )}

          {step === 'finish' && (
            <>
              <div className="rounded-md border bg-accent/40 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-primary" />
                  <div className="space-y-1">
                    <div className="font-medium">You're all set.</div>
                    <div className="text-muted-foreground">
                      You can change any of these later from the Settings page.
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('preferences')}>
                  Back
                </Button>
                <Button onClick={finish} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Finish setup
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
