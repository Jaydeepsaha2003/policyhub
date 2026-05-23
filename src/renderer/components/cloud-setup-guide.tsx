import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  BookOpen,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Vite serves this file's contents as a string at build time. Lives at
// docs/cloud-reminders/apps-script.gs at the project root.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- ?raw asset
import appsScriptSource from '../../../docs/cloud-reminders/apps-script.gs?raw';

type Step = {
  n: number;
  title: string;
  body: React.ReactNode;
};

const ExtLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
  >
    {children}
    <ExternalLink className="h-3 w-3" />
  </a>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">
    {children}
  </code>
);

export const CloudSetupGuide = () => {
  const [open, setOpen] = useState(false);

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(appsScriptSource as string);
      toast.success('Apps Script code copied to clipboard', {
        description: 'Paste into Extensions → Apps Script in your Sheet.',
      });
    } catch (err) {
      toast.error('Could not access the clipboard', {
        description: (err as Error).message,
      });
    }
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <BookOpen className="h-4 w-4" />
        Show setup guide
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Cloud reminders setup — step by step</DialogTitle>
            <DialogDescription>
              ~10 minutes the first time. Once set up, reminders fire from Google's
              servers and arrive even when this laptop is off.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-2">
            <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Why this exists:</span>{' '}
              PolicyHub's built-in scheduler only fires while this PC/laptop is running.
              Cloud reminders push your data to a Google Sheet you own; an Apps Script
              there sends reminder emails on a daily trigger — independent of your
              laptop's state.
            </div>

            <StepCard
              n={1}
              title="Create a fresh Google Sheet (use the dedicated PolicyHub Google account)"
              body={
                <>
                  Go to <ExtLink href="https://sheets.google.com/">sheets.google.com</ExtLink>{' '}
                  and create a new blank spreadsheet. Name it something memorable like{' '}
                  <Code>PolicyHub Sync</Code>.
                </>
              }
            />

            <StepCard
              n={2}
              title="Open the Apps Script editor"
              body={
                <>
                  In the Sheet, click <Code>Extensions → Apps Script</Code>. A new
                  browser tab opens with a default <Code>Code.gs</Code> file.{' '}
                  <span className="font-medium">Delete everything</span> in that file.
                </>
              }
            />

            <StepCard
              n={3}
              title="Paste the PolicyHub Apps Script"
              body={
                <div className="space-y-3">
                  <p>
                    Click the button below to copy the script source, then paste it into
                    the empty Apps Script editor. Press <Code>Ctrl+S</Code> (or{' '}
                    <Code>⌘+S</Code>) to save. Name the project <Code>PolicyHub</Code>{' '}
                    when prompted.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={copyScript}>
                    <Copy className="h-4 w-4" />
                    Copy Apps Script source ({(appsScriptSource as string).length.toLocaleString()} chars)
                  </Button>
                  <details className="rounded-md border bg-muted/30 text-xs">
                    <summary className="cursor-pointer px-3 py-1.5 font-medium text-muted-foreground">
                      Preview the code (first 30 lines)
                    </summary>
                    <pre className="max-h-48 overflow-auto px-3 pb-3 font-mono text-[11px] leading-snug">
                      {(appsScriptSource as string).split('\n').slice(0, 30).join('\n')}
                      {'\n…'}
                    </pre>
                  </details>
                </div>
              }
            />

            <StepCard
              n={4}
              title="Run setup() once"
              body={
                <>
                  In the Apps Script toolbar, pick <Code>setup</Code> from the function
                  dropdown and click ▶ Run. Google will prompt for permissions —{' '}
                  <span className="font-medium">Review permissions</span> → choose the
                  PolicyHub Google account → on the "Google hasn't verified this app"
                  screen click <Code>Advanced → Go to PolicyHub (unsafe)</Code> → allow{' '}
                  <em>Manage spreadsheets</em> and <em>Send email as you</em>. A dialog
                  confirms setup. Switching back to the Sheet you'll see 6 new tabs:
                  Settings, Policies, Installments, Repayments, SyncLog, ReminderLog.
                </>
              }
            />

            <StepCard
              n={5}
              title="Deploy as a Web App"
              body={
                <>
                  Back in the Apps Script editor → <Code>Deploy → New deployment</Code>.
                  Click the gear ⚙ → <Code>Web app</Code>. Fill in:
                  <ul className="ml-4 mt-2 list-disc space-y-1">
                    <li>
                      <span className="font-medium">Description:</span> PolicyHub sync
                    </li>
                    <li>
                      <span className="font-medium">Execute as:</span> Me (your
                      PolicyHub Google account)
                    </li>
                    <li>
                      <span className="font-medium">Who has access:</span> Anyone with
                      the link
                    </li>
                  </ul>
                  Click <Code>Deploy</Code> → Google shows a URL ending in{' '}
                  <Code>/exec</Code> → click the copy icon. Click <Code>Done</Code>.
                </>
              }
            />

            <StepCard
              n={6}
              title="Paste the URL into PolicyHub"
              body={
                <>
                  Close this dialog and paste the URL into the{' '}
                  <span className="font-medium">Apps Script Web App URL</span> field on
                  the Cloud reminders card. Click <Code>Generate</Code> next to the
                  Shared secret — a long random string gets generated and copied to
                  your clipboard. Click <Code>Save settings</Code> at the bottom of the
                  page.
                </>
              }
            />

            <StepCard
              n={7}
              title="Paste the secret + agent email into the Sheet"
              body={
                <>
                  Back in the Sheet → <Code>Settings</Code> tab → click cell{' '}
                  <Code>B1</Code> (next to <Code>shared_secret</Code>) → paste{' '}
                  <Code>Ctrl+V</Code> → Enter. Then click <Code>B2</Code> (next to{' '}
                  <Code>agent_email</Code>) → type the email that should receive
                  reminders → Enter.
                </>
              }
            />

            <StepCard
              n={8}
              title="Test end-to-end"
              body={
                <>
                  In PolicyHub → Cloud reminders card → click <Code>Test connection</Code>{' '}
                  → green toast "Cloud connection OK". Then click <Code>Sync now</Code>{' '}
                  → another toast with row counts. Open the Sheet → the Policies and
                  Installments tabs should be populated.
                </>
              }
            />

            <StepCard
              n={9}
              title="Verify a reminder will actually fire"
              body={
                <div className="space-y-2">
                  <p>
                    The trigger fires daily at 9 a.m. on the 1st / 10th / 20th. To force
                    a test send right now:
                  </p>
                  <ol className="ml-4 list-decimal space-y-1">
                    <li>
                      In the Apps Script editor, find the line{' '}
                      <Code>const REMINDER_DAYS_OF_MONTH = [1, 10, 20];</Code> near the
                      top.
                    </li>
                    <li>
                      Temporarily add today's date number, e.g. for the 23rd:{' '}
                      <Code>[1, 10, 20, 23]</Code>. Save (<Code>Ctrl+S</Code>).
                    </li>
                    <li>
                      Pick <Code>sendReminders</Code> in the function dropdown → ▶ Run.
                    </li>
                    <li>
                      Check the inbox of the email you set in step 7. A summary email
                      should arrive within a few seconds.
                    </li>
                    <li>Change the constant back to <Code>[1, 10, 20]</Code> and save.</li>
                  </ol>
                  <p className="text-xs text-muted-foreground">
                    If the email arrives, you're done. The trigger Google installed in
                    step 4 will keep running on those days automatically.
                  </p>
                </div>
              }
            />

            <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
              <CardContent className="space-y-2 p-4 text-xs">
                <div className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4" />
                  Troubleshooting
                </div>
                <table className="w-full table-fixed border-collapse text-amber-900 dark:text-amber-100">
                  <thead>
                    <tr className="text-left">
                      <th className="w-1/3 border-b border-amber-200/60 pb-1 pr-2 font-medium dark:border-amber-800">
                        Symptom
                      </th>
                      <th className="border-b border-amber-200/60 pb-1 font-medium dark:border-amber-800">
                        Fix
                      </th>
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    <Tr s="Test fails: 'No shared_secret set'" f="Step 7 — paste the secret into Settings tab cell B1" />
                    <Tr s="Test fails: 'Invalid secret'" f="The secret in PolicyHub and Sheet don't match. Re-copy from PolicyHub and paste again into B1." />
                    <Tr s="'Response wasn't JSON'" f="Deployment isn't Anyone-with-link, or URL doesn't end in /exec. Redeploy with correct access." />
                    <Tr s="Sync OK but no email" f="agent_email cell B2 is empty or wrong. Set it." />
                    <Tr s="Email arrived once then stopped (~3 months later)" f="Google asks unverified scripts to reauth periodically. In Apps Script → Triggers (clock icon) → run sendReminders once manually → reauth." />
                    <Tr s="'Quota exceeded' in ReminderLog" f="Free Gmail caps at 100/day. Upgrade to Workspace (1,500/day) or reduce reminder days." />
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40">
              <CardContent className="space-y-1 p-4 text-xs text-emerald-900 dark:text-emerald-100">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  After setup — daily life
                </div>
                <ul className="ml-4 list-disc space-y-1">
                  <li>
                    Make policy changes in PolicyHub → click{' '}
                    <span className="font-medium">Sync now</span> to push to the Sheet
                  </li>
                  <li>
                    Or turn on <span className="font-medium">Auto-sync on quit</span> —
                    quits via the tray will push the latest before exiting
                  </li>
                  <li>
                    Open the Sheet's <span className="font-medium">SyncLog</span> tab to
                    see when the last push happened
                  </li>
                  <li>
                    Open <span className="font-medium">ReminderLog</span> to see what
                    emails have been sent
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const StepCard = ({ n, title, body }: Step) => (
  <div className="flex gap-3">
    <div
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground',
      )}
    >
      {n}
    </div>
    <div className="flex-1 space-y-1">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs leading-relaxed text-muted-foreground">{body}</div>
    </div>
  </div>
);

const Tr = ({ s, f }: { s: string; f: string }) => (
  <tr>
    <td className="border-b border-amber-200/40 py-1.5 pr-2 align-top dark:border-amber-800/60">
      {s}
    </td>
    <td className="border-b border-amber-200/40 py-1.5 align-top dark:border-amber-800/60">
      {f}
    </td>
  </tr>
);
