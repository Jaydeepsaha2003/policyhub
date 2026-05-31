import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateInputDMY } from '@/components/ui/date-input-dmy';
import { useRouter } from '@/lib/router';
import { toast } from 'sonner';
import { cn, isoToday, paiseToRupees } from '@/lib/utils';
import {
  CalendarCategoriesDialog,
  COLOR_SWATCH,
  type CategoryColor,
} from '@/components/calendar-categories-dialog';
import { Settings2 } from 'lucide-react';

type Props = { mode: 'create' } | { mode: 'edit'; id: string };

const CATEGORY_LABELS = {
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
  other: 'Other (free text)',
} as const;

type Category = keyof typeof CATEGORY_LABELS;
type Frequency = 'one_time' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly';

type Form = {
  title: string;
  category: Category;
  customCategory: string;
  eventDate: string;
  isRecurring: boolean;
  frequency: Frequency;
  occurrenceTotal: string;
  reminderOffsetsDays: string; // comma-separated, e.g. "30,7,1"
  amount: string;
  notes: string;
};

const empty = (): Form => ({
  title: '',
  category: 'credit_card',
  customCategory: '',
  eventDate: isoToday(),
  isRecurring: false,
  frequency: 'monthly',
  occurrenceTotal: '12',
  reminderOffsetsDays: '30,7,1',
  amount: '',
  notes: '',
});

type Preset = { id: string; label: string; colorKey: CategoryColor };

export const CalendarFormPage = (props: Props) => {
  const { navigate } = useRouter();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [manageOpen, setManageOpen] = useState(false);

  // When a user picks a saved preset from the dropdown, we encode the
  // selection as `custom:<presetId>`. On save we resolve it back to
  // category='other' + customCategory=<label> so existing storage stays.
  const loadPresets = async () => {
    try {
      const list = (await window.policyhub.calendarCategories.list()) as Preset[];
      setPresets(list);
    } catch {
      /* ignore — non-fatal */
    }
  };
  useEffect(() => {
    loadPresets();
  }, []);
  const [form, setForm] = useState<Form>(() => {
    if (props.mode !== 'create') return empty();
    // Pick up a date pre-filled by clicking an empty cell on the calendar.
    try {
      const iso = sessionStorage.getItem('calendar.newEventDate');
      if (iso) {
        sessionStorage.removeItem('calendar.newEventDate');
        return { ...empty(), eventDate: iso };
      }
    } catch {
      /* ignore */
    }
    return empty();
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(props.mode === 'create');

  useEffect(() => {
    if (props.mode === 'edit') {
      (async () => {
        try {
          const r: any = await window.policyhub.calendar.get(props.id);
          if (!r) {
            toast.error('Event not found');
            navigate('/calendar');
            return;
          }
          setForm({
            title: r.title,
            category: r.category,
            customCategory: r.customCategory ?? '',
            eventDate: r.eventDate,
            isRecurring: Boolean(r.isRecurring),
            frequency: r.frequency,
            occurrenceTotal: String(r.occurrenceTotal),
            reminderOffsetsDays: (JSON.parse(r.reminderOffsetsDays) as number[]).join(','),
            amount: r.amount !== null ? String(paiseToRupees(r.amount)) : '',
            notes: r.notes ?? '',
          });
          setLoaded(true);
        } catch (err) {
          toast.error('Load failed', { description: (err as Error).message });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (form.category === 'other' && !form.customCategory.trim()) {
      return toast.error('Please enter a custom category label');
    }
    if (!form.eventDate) return toast.error('Event date is required');

    const offsets = form.reminderOffsetsDays
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s));
    if (offsets.some((n) => !Number.isFinite(n) || n < 0 || n > 365)) {
      return toast.error('Reminder offsets must be numbers 0–365, comma-separated');
    }

    const amt = form.amount.trim() ? Number(form.amount) : undefined;
    if (amt !== undefined && (!Number.isFinite(amt) || amt < 0)) {
      return toast.error('Amount must be a non-negative number');
    }

    const total = form.isRecurring ? Number(form.occurrenceTotal) : 1;
    if (form.isRecurring && (!Number.isFinite(total) || total < 1 || total > 240)) {
      return toast.error('Occurrences must be between 1 and 240');
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        customCategory: form.customCategory.trim() || undefined,
        eventDate: form.eventDate,
        isRecurring: form.isRecurring,
        frequency: form.isRecurring ? form.frequency : 'one_time',
        occurrenceTotal: form.isRecurring ? Math.floor(total) : 1,
        reminderOffsetsDays: offsets,
        amount: amt,
        notes: form.notes.trim() || undefined,
      };
      if (props.mode === 'create') {
        const r = (await window.policyhub.calendar.create(payload)) as any;
        toast.success(
          form.isRecurring
            ? `Created ${total} occurrence(s)`
            : 'Event created',
        );
        navigate(`/calendar/${r.id}`);
      } else {
        await window.policyhub.calendar.update(props.id, payload);
        toast.success('Event updated');
        navigate(`/calendar/${props.id}`);
      }
    } catch (err) {
      toast.error('Save failed', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 space-y-1.5">
            <Label>
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. HDFC credit card bill, Property tax Q1, Annual audit"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Category</Label>
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              >
                <Settings2 className="h-3 w-3" />
                Manage
              </button>
            </div>
            <Select
              value={
                // Surface the saved preset (if any) as the dropdown value
                // so it visibly matches the user's choice across reloads.
                form.category === 'other' &&
                presets.find(
                  (p) =>
                    p.label.toLowerCase() ===
                    form.customCategory.trim().toLowerCase(),
                )
                  ? `custom:${
                      presets.find(
                        (p) =>
                          p.label.toLowerCase() ===
                          form.customCategory.trim().toLowerCase(),
                      )!.id
                    }`
                  : form.category
              }
              onValueChange={(v) => {
                if (v.startsWith('custom:')) {
                  const id = v.slice('custom:'.length);
                  const preset = presets.find((p) => p.id === id);
                  if (preset) {
                    setForm({
                      ...form,
                      category: 'other',
                      customCategory: preset.label,
                    });
                  }
                } else if (v === 'other') {
                  setForm({ ...form, category: 'other', customCategory: '' });
                } else {
                  setForm({
                    ...form,
                    category: v as Category,
                    customCategory: '',
                  });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
                {presets.length > 0 && (
                  <div className="my-1 border-t" aria-hidden />
                )}
                {presets.map((p) => (
                  <SelectItem key={p.id} value={`custom:${p.id}`}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          'h-2.5 w-2.5 rounded-full',
                          COLOR_SWATCH[p.colorKey] ?? COLOR_SWATCH.slate,
                        )}
                      />
                      {p.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.category === 'other' &&
            !presets.find(
              (p) =>
                p.label.toLowerCase() ===
                form.customCategory.trim().toLowerCase(),
            ) && (
              <div className="space-y-1.5">
                <Label>
                  Custom label <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.customCategory}
                  onChange={(e) =>
                    setForm({ ...form, customCategory: e.target.value })
                  }
                  placeholder="e.g. Wifi renewal, Domain renewal"
                />
                <p className="text-[11px] text-muted-foreground">
                  Want this to be reusable with a color? Click{' '}
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => setManageOpen(true)}
                  >
                    Manage
                  </button>{' '}
                  above and add it as a category.
                </p>
              </div>
            )}
          <div className="space-y-1.5">
            <Label>
              {form.isRecurring ? 'First occurrence date' : 'Event date'}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <DateInputDMY
              value={form.eventDate}
              onChange={(iso) => setForm({ ...form, eventDate: iso })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="Optional"
            />
          </div>

          <div className="md:col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Recurring event</Label>
              <div className="text-xs text-muted-foreground">
                Generate multiple occurrences automatically
                (e.g. monthly credit-card bill, quarterly audit).
              </div>
            </div>
            <Switch
              checked={form.isRecurring}
              onCheckedChange={(v) => setForm({ ...form, isRecurring: v })}
            />
          </div>

          {form.isRecurring && (
            <>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) =>
                    setForm({ ...form, frequency: v as Frequency })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="half_yearly">Half-yearly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Number of occurrences</Label>
                <Input
                  type="number"
                  min={1}
                  max={240}
                  value={form.occurrenceTotal}
                  onChange={(e) =>
                    setForm({ ...form, occurrenceTotal: e.target.value })
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  e.g. 12 monthly → one year of bills.
                </p>
              </div>
            </>
          )}

          <div className="md:col-span-2 space-y-1.5">
            <Label>Reminder offsets (days before)</Label>
            <Input
              value={form.reminderOffsetsDays}
              onChange={(e) =>
                setForm({ ...form, reminderOffsetsDays: e.target.value })
              }
              placeholder="30,7,1"
            />
            <p className="text-[11px] text-muted-foreground">
              Comma-separated. The Apps Script reminder script sends an
              email this many days before the event date.
            </p>
          </div>

          <div className="md:col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/calendar')} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : props.mode === 'create' ? 'Create' : 'Save changes'}
          </Button>
        </div>
      </CardContent>

      <CalendarCategoriesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        onChanged={loadPresets}
      />
    </Card>
  );
};
