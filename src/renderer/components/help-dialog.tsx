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
import { HelpCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type Topic = {
  id: string;
  title: string;
  content: React.ReactNode;
};

const RecycleBinHelp = () => (
  <div className="space-y-5 text-sm leading-relaxed">
    <section>
      <h3 className="mb-1 font-semibold">What is the Recycle Bin?</h3>
      <p className="text-muted-foreground">
        When you delete a policy, it isn't removed right away — it's moved to
        the Recycle Bin. You have <strong>90 days</strong> to restore it.
        After 90 days, the policy is permanently deleted automatically the
        next time you open the app.
      </p>
    </section>

    <section>
      <h3 className="mb-1 font-semibold">How do I delete a policy?</h3>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Open <strong>Policies</strong> from the sidebar.</li>
        <li>Click the policy you want to delete.</li>
        <li>
          On the policy detail page, click <strong>Delete</strong> and confirm.
        </li>
      </ol>
      <p className="mt-2 text-muted-foreground">
        The policy disappears from the Policies list. Its premium payments
        and any maturity repayments tied to it are hidden from the Payments
        and Repayments tabs as well, and from the dashboard.
      </p>
    </section>

    <section>
      <h3 className="mb-1 font-semibold">Where do I find the Recycle Bin?</h3>
      <p className="text-muted-foreground">
        Open <strong>Settings</strong> in the sidebar and click the{' '}
        <strong>Recycle bin</strong> button near the top. You'll see every
        deleted policy with the date it was deleted and the days remaining
        until it's purged forever.
      </p>
    </section>

    <section>
      <h3 className="mb-1 font-semibold">How do I restore a deleted policy?</h3>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Open <strong>Settings → Recycle bin</strong>.</li>
        <li>
          Find the policy in the list and click <strong>Restore</strong>.
        </li>
      </ol>
      <p className="mt-2 text-muted-foreground">
        The policy reappears in the Policies list <em>exactly as it was</em>.
        All its premium installments and repayments come back too — they
        were only hidden, never deleted. Past paid payments and received
        repayments keep their records.
      </p>
    </section>

    <section>
      <h3 className="mb-1 font-semibold">
        What does “Delete permanently” do?
      </h3>
      <p className="text-muted-foreground">
        In the Recycle Bin, the trash icon next to each row deletes the
        policy <strong>immediately and forever</strong>. This is the same
        thing that happens automatically after 90 days. Once purged:
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>The policy record is gone.</li>
        <li>
          All <strong>premium payments</strong> for that policy (paid and
          unpaid) are removed.
        </li>
        <li>All <strong>attachments</strong> uploaded to the policy are removed.</li>
        <li>
          <strong>Maturity repayments</strong> are kept, but unlinked from
          the policy — they will show up in the Repayments tab as
          standalone entries without a policy number. You can delete them
          manually if you don't need them.
        </li>
      </ul>
      <p className="mt-2 text-muted-foreground">
        There is no way to undo a permanent delete.
      </p>
    </section>

    <section>
      <h3 className="mb-1 font-semibold">
        How long do I have before a policy is gone forever?
      </h3>
      <p className="text-muted-foreground">
        <strong>90 days</strong> from the day you deleted it. The Recycle
        Bin shows a “Purge in X days” column. When that count drops to 7
        days or fewer, it turns red as a warning.
      </p>
    </section>

    <section>
      <h3 className="mb-1 font-semibold">
        Will deleted policies show up in reports or exports?
      </h3>
      <p className="text-muted-foreground">
        No. While a policy is in the Recycle Bin, it's filtered out of the
        Policies list, Payments tab, Repayments tab, dashboard counts, the
        valuation page, and reminders. Restore the policy if you need its
        data in those places again.
      </p>
    </section>

    <section>
      <h3 className="mb-1 font-semibold">
        I deleted the wrong policy — is anything actually lost?
      </h3>
      <p className="text-muted-foreground">
        No. As long as you restore within 90 days, nothing is lost.
        Premium history, repayment history, attachments and all policy
        fields come back exactly as they were.
      </p>
    </section>

    <section>
      <h3 className="mb-1 font-semibold">Quick summary</h3>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Delete → goes to Recycle Bin for 90 days.</li>
        <li>Restore (Settings → Recycle bin) → fully reversible.</li>
        <li>Delete permanently (trash icon) → irreversible.</li>
        <li>After 90 days → auto-purged on next app start.</li>
      </ul>
    </section>
  </div>
);

const PoliciesHelp = () => (
  <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
    <p>
      The Policies page lists every active policy. Click a policy to view
      its details, premium installments, repayments, and attachments. Use
      the <strong>New policy</strong> button (top right) to add one.
    </p>
    <p>
      For matured policies, set the status to <em>matured</em> — sum
      assured becomes optional and no new premium installments will be
      generated.
    </p>
  </div>
);

const PaymentsHelp = () => (
  <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
    <p>
      The Payments tab shows every premium installment across all your
      policies. Mark them as paid one at a time, or use “Mark all paid up
      to…” on a policy's detail page.
    </p>
    <p>
      Payments belonging to a policy in the Recycle Bin are hidden until
      you restore the policy.
    </p>
  </div>
);

const RepaymentsHelp = () => (
  <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
    <p>
      Repayments are payouts you expect to receive — most often, the
      maturity amount from a policy. PolicyHub creates these automatically
      when you save a non-matured policy with a maturity date.
    </p>
    <p>
      You can also add standalone repayments that aren't linked to any
      policy. Those stay visible even if you delete every policy.
    </p>
  </div>
);

const MutualFundsHelp = () => (
  <div className="space-y-4 text-sm leading-relaxed">
    <section>
      <h3 className="mb-1 font-semibold">What's the Mutual Funds tab for?</h3>
      <p className="text-muted-foreground">
        Track every mutual fund you hold — Lumpsum investments or recurring
        Monthly SIPs. Capture folio number, account holder, AMC, scheme name
        and your agent's contact, just like a policy.
      </p>
    </section>
    <section>
      <h3 className="mb-1 font-semibold">Lumpsum vs Monthly</h3>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          <strong>Lumpsum</strong> — a one-time investment. PolicyHub creates
          a single record on your start date.
        </li>
        <li>
          <strong>Monthly</strong> — a SIP. PolicyHub creates monthly
          installments starting from your start date. They appear in the
          Payments tab alongside policy premiums and can be marked paid the
          same way.
        </li>
      </ul>
    </section>
    <section>
      <h3 className="mb-1 font-semibold">Where do SIP installments show up?</h3>
      <p className="text-muted-foreground">
        In the <strong>Payments</strong> tab, mixed with policy installments.
        A "Type" column tells you which is which, and a Type filter lets you
        show only one kind at a time.
      </p>
    </section>
    <section>
      <h3 className="mb-1 font-semibold">Recycle Bin works for MFs too</h3>
      <p className="text-muted-foreground">
        Deleting a mutual fund moves it to the same 90-day Recycle Bin as
        policies. All its SIP installments get hidden until you restore.
      </p>
    </section>
    <section>
      <h3 className="mb-1 font-semibold">Excel exports</h3>
      <p className="text-muted-foreground">
        The <strong>Mutual Funds → Export to Excel</strong> button honors any
        filters you've set on the page. For a complete snapshot of every
        policy + MF + payment + repayment, use{' '}
        <strong>Settings → Export everything to Excel</strong> — it produces a
        single workbook with one sheet per section.
      </p>
    </section>
  </div>
);

const CalendarHelp = () => (
  <div className="space-y-4 text-sm leading-relaxed">
    <section>
      <h3 className="mb-1 font-semibold">What's the Calendar tab for?</h3>
      <p className="text-muted-foreground">
        A general reminder tracker for everything that isn't a policy or
        mutual fund — credit-card bills, health/motor/property insurance
        renewals, property tax, RR badge compliance, audits, vehicle PUC
        and fitness, license renewals, or anything else you label "Other".
      </p>
    </section>
    <section>
      <h3 className="mb-1 font-semibold">Two views</h3>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          <strong>Calendar</strong> — month grid, events as colored chips on
          their due date. Click a chip to open the event.
        </li>
        <li>
          <strong>List</strong> — sortable/filterable table by category, status
          or date.
        </li>
      </ul>
    </section>
    <section>
      <h3 className="mb-1 font-semibold">Recurring vs single events</h3>
      <p className="text-muted-foreground">
        Toggle "Recurring" on the form to generate multiple occurrences
        automatically (e.g. monthly credit-card bill × 12). Each occurrence
        can be marked complete or skipped independently. Editing the rule
        rebuilds future pending rows but keeps completed history intact.
      </p>
    </section>
    <section>
      <h3 className="mb-1 font-semibold">Email reminders via Google Sheets</h3>
      <p className="text-muted-foreground">
        Calendar events are pushed to a new <strong>Calendar Events</strong>{' '}
        sheet in your existing cloud sync workbook. The Apps Script reads
        the <em>Reminder offsets (days)</em> array on each event and sends
        you an email that many days before the due date.
      </p>
      <p className="mt-2 text-muted-foreground">
        First-time setup: open Settings → Google Sheets sync → click{' '}
        <strong>Calendar Apps Script extension</strong>, copy the snippet,
        paste it at the bottom of your existing Apps Script project, save,
        and add a daily time-driven trigger on{' '}
        <span className="font-mono text-xs">calendarReminderTick_</span>.
        Policies / payments / repayments sync continues unchanged.
      </p>
    </section>
    <section>
      <h3 className="mb-1 font-semibold">Recycle Bin</h3>
      <p className="text-muted-foreground">
        Same 90-day Recycle Bin as policies and mutual funds. Deleting a
        recurring event prompts you to either drop just this one occurrence
        or the whole remaining series.
      </p>
    </section>
  </div>
);

const topics: Topic[] = [
  { id: 'recycle-bin', title: 'Recycle Bin', content: <RecycleBinHelp /> },
  { id: 'policies', title: 'Policies', content: <PoliciesHelp /> },
  { id: 'mutual-funds', title: 'Mutual Funds', content: <MutualFundsHelp /> },
  { id: 'calendar', title: 'Calendar', content: <CalendarHelp /> },
  { id: 'payments', title: 'Payments', content: <PaymentsHelp /> },
  { id: 'repayments', title: 'Repayments', content: <RepaymentsHelp /> },
];

export const HelpDialog = ({ collapsed = false }: { collapsed?: boolean }) => {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(topics[0].id);
  const active = topics.find((t) => t.id === activeId) ?? topics[0];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={collapsed ? 'Help' : undefined}
        aria-label="Help"
        className={cn(
          'flex items-center rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          collapsed ? 'justify-center px-2 py-2' : 'gap-2 px-3 py-2',
        )}
      >
        <HelpCircle className="h-4 w-4 shrink-0" />
        {!collapsed && <span>Help</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Help</DialogTitle>
            <DialogDescription>
              How the main parts of PolicyHub work. Pick a topic on the left.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[65vh] gap-4">
            <nav className="w-48 shrink-0 space-y-1 overflow-y-auto border-r pr-2">
              {topics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
                    t.id === activeId
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <span>{t.title}</span>
                  <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                </button>
              ))}
            </nav>
            <div className="flex-1 overflow-y-auto pr-2">{active.content}</div>
          </div>

          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
