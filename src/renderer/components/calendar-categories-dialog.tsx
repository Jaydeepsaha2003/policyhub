import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export type CategoryColor =
  | 'slate'
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'fuchsia'
  | 'pink'
  | 'rose';

// Tailwind classes per color key. Used both here in the manager and on
// the calendar grid for custom chips — keep these two maps in sync.
export const COLOR_SWATCH: Record<CategoryColor, string> = {
  slate: 'bg-slate-500',
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  yellow: 'bg-yellow-500',
  lime: 'bg-lime-500',
  green: 'bg-green-500',
  emerald: 'bg-emerald-500',
  teal: 'bg-teal-500',
  cyan: 'bg-cyan-500',
  sky: 'bg-sky-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  fuchsia: 'bg-fuchsia-500',
  pink: 'bg-pink-500',
  rose: 'bg-rose-500',
};

const ALL_COLORS = Object.keys(COLOR_SWATCH) as CategoryColor[];

type CustomCategory = {
  id: string;
  label: string;
  colorKey: CategoryColor;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

export const CalendarCategoriesDialog = ({
  open,
  onOpenChange,
  onChanged,
}: Props) => {
  const [rows, setRows] = useState<CustomCategory[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<CategoryColor>('blue');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const list = (await window.policyhub.calendarCategories.list()) as CustomCategory[];
      setRows(list);
    } catch (err) {
      toast.error('Failed to load categories', {
        description: (err as Error).message,
      });
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const create = async () => {
    if (!newLabel.trim()) return toast.error('Label is required');
    setSaving(true);
    try {
      await window.policyhub.calendarCategories.create({
        label: newLabel.trim(),
        colorKey: newColor,
      });
      setNewLabel('');
      setNewColor('blue');
      await load();
      onChanged();
      toast.success('Category added');
    } catch (err) {
      toast.error('Could not add', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await window.policyhub.calendarCategories.remove(id);
      await load();
      onChanged();
    } catch (err) {
      toast.error('Delete failed', { description: (err as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Custom calendar categories</DialogTitle>
          <DialogDescription>
            Add reusable categories that show up alongside the built-in ones
            (Credit card, Health insurance, etc.) in the New-event form. Each
            one has its own chip color on the calendar grid.
          </DialogDescription>
        </DialogHeader>

        {/* Existing customs */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Your categories ({rows.length})
          </Label>
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              No custom categories yet. Add one below.
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {rows.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <span
                    className={cn(
                      'h-3 w-3 shrink-0 rounded-full',
                      COLOR_SWATCH[c.colorKey] ?? COLOR_SWATCH.slate,
                    )}
                  />
                  <span className="flex-1 truncate">{c.label}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Delete"
                    onClick={() => remove(c.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add new */}
        <div className="space-y-3 rounded-md border p-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Add a new category
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Wifi renewal, Domain renewal"
              maxLength={64}
              className="sm:flex-1"
            />
            <Button
              type="button"
              onClick={create}
              disabled={saving || !newLabel.trim()}
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] text-muted-foreground">
              Pick a color
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_COLORS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setNewColor(k)}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                    COLOR_SWATCH[k],
                    newColor === k
                      ? 'border-foreground'
                      : 'border-transparent',
                  )}
                  title={k}
                  aria-label={k}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Trigger button — drops into the form's category area.
export const ManageCategoriesButton = ({
  onChanged,
}: {
  onChanged: () => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Dialog open={false}>
        {/* tiny noop wrapper to keep the trigger structure simple */}
        <DialogTrigger asChild />
      </Dialog>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        Manage categories
      </Button>
      <CalendarCategoriesDialog
        open={open}
        onOpenChange={setOpen}
        onChanged={() => {
          onChanged();
        }}
      />
    </>
  );
};
