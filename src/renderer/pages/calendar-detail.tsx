import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ArrowLeft, Pencil, Trash2, CheckCircle2, RotateCcw, X } from 'lucide-react';
import { useRouter } from '@/lib/router';
import { formatCurrencyPaise, formatDate, isoToday } from '@/lib/utils';
import { CalendarFormPage } from './calendar-form';
import { toast } from 'sonner';

type Event = {
  id: string;
  title: string;
  category: string;
  customCategory: string | null;
  eventDate: string;
  status: 'pending' | 'completed' | 'skipped';
  isRecurring: boolean;
  frequency: string;
  occurrenceNo: number;
  occurrenceTotal: number;
  completedDate: string | null;
  reminderOffsetsDays: string;
  amount: number | null;
  notes: string | null;
  seriesId: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  credit_card: 'Credit card',
  health_insurance: 'Health insurance',
  motor_insurance: 'Motor insurance',
  property_insurance: 'Property insurance',
  property_tax: 'Property tax',
  rr_badge: 'RR badge',
  audit: 'Audit',
  vehicle_puc: 'Vehicle PUC',
  vehicle_fitness: 'Vehicle fitness',
  license_renewal: 'License renewal',
  other: 'Other',
};

export const CalendarDetailPage = ({ id }: { id: string }) => {
  const { navigate } = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    try {
      const r = (await window.policyhub.calendar.get(id)) as Event;
      setEvent(r);
    } catch (err) {
      toast.error('Load failed', { description: (err as Error).message });
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!event) return null;

  if (editing) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <CalendarFormPage mode="edit" id={id} />
      </div>
    );
  }

  const categoryLabel =
    event.category === 'other'
      ? event.customCategory || 'Other'
      : CATEGORY_LABELS[event.category] ?? event.category;

  let offsets: number[] = [];
  try {
    offsets = JSON.parse(event.reminderOffsetsDays);
  } catch {
    /* ignore */
  }

  const statusBadge =
    event.status === 'completed' ? (
      <Badge variant="success">Completed</Badge>
    ) : event.status === 'skipped' ? (
      <Badge variant="secondary">Skipped</Badge>
    ) : (
      <Badge variant="warning">Pending</Badge>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/calendar')}>
          <ArrowLeft className="h-4 w-4" />
          Back to calendar
        </Button>
        <div className="flex items-center gap-2">
          {event.status === 'pending' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await window.policyhub.calendar.markCompleted(id, isoToday());
                    toast.success('Marked completed');
                    await load();
                  } catch (err) {
                    toast.error('Save failed', { description: (err as Error).message });
                  }
                }}
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark completed
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await window.policyhub.calendar.markSkipped(id);
                    toast.success('Marked skipped');
                    await load();
                  } catch (err) {
                    toast.error('Save failed', { description: (err as Error).message });
                  }
                }}
              >
                <X className="h-4 w-4" />
                Skip
              </Button>
            </>
          )}
          {event.status !== 'pending' && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await window.policyhub.calendar.markPending(id);
                  toast.success('Reverted to pending');
                  await load();
                } catch (err) {
                  toast.error('Save failed', { description: (err as Error).message });
                }
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Reopen
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="h-4 w-4 text-destructive" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move to Recycle Bin?</AlertDialogTitle>
                <AlertDialogDescription>
                  {event.isRecurring && event.occurrenceTotal > 1
                    ? 'Choose how much to delete: just this one occurrence, or every remaining occurrence in the series.'
                    : 'This event will be moved to the Recycle Bin and auto-purged after 90 days.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-wrap">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                {event.isRecurring && event.occurrenceTotal > 1 && (
                  <AlertDialogAction
                    className="bg-destructive hover:bg-destructive/90"
                    onClick={async () => {
                      try {
                        await window.policyhub.calendar.removeSeries(id);
                        toast.success('Series moved to Recycle Bin');
                        navigate('/calendar');
                      } catch (err) {
                        toast.error('Delete failed', {
                          description: (err as Error).message,
                        });
                      }
                    }}
                  >
                    Delete whole series
                  </AlertDialogAction>
                )}
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90"
                  onClick={async () => {
                    try {
                      await window.policyhub.calendar.remove(id);
                      toast.success('Event moved to Recycle Bin');
                      navigate('/calendar');
                    } catch (err) {
                      toast.error('Delete failed', {
                        description: (err as Error).message,
                      });
                    }
                  }}
                >
                  {event.isRecurring && event.occurrenceTotal > 1
                    ? 'Delete only this occurrence'
                    : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{event.title}</CardTitle>
          <div className="text-sm text-muted-foreground">
            {categoryLabel} · {formatDate(event.eventDate)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <Detail label="Status">{statusBadge}</Detail>
            <Detail label="Date">{formatDate(event.eventDate)}</Detail>
            <Detail label="Recurrence">
              {event.isRecurring
                ? `${event.frequency.replace('_', ' ')} · ${event.occurrenceNo} of ${event.occurrenceTotal}`
                : 'One-time'}
            </Detail>
            {event.amount !== null && (
              <Detail label="Amount">{formatCurrencyPaise(event.amount)}</Detail>
            )}
            {event.completedDate && (
              <Detail label="Completed">{formatDate(event.completedDate)}</Detail>
            )}
            <Detail label="Reminders">
              {offsets.length > 0
                ? offsets.map((n) => `${n}d`).join(' · ') + ' before'
                : '—'}
            </Detail>
            {event.notes && (
              <div className="sm:col-span-2 md:col-span-3">
                <Detail label="Notes">{event.notes}</Detail>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const Detail = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
    <div className="mt-0.5 text-sm">{children}</div>
  </div>
);
