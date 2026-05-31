import { v4 as uuid } from 'uuid';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { calendarCategories } from '../../shared/db/schema';

// One curated palette across the app so chips on the calendar grid
// match the saved-category swatches in the form. The renderer maps
// these keys to Tailwind classes.
export const ALLOWED_COLOR_KEYS = [
  'slate',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'fuchsia',
  'pink',
  'rose',
] as const;

export type AllowedColorKey = (typeof ALLOWED_COLOR_KEYS)[number];

export const listCalendarCategories = () => {
  const db = getDb();
  return db
    .select()
    .from(calendarCategories)
    .orderBy(asc(calendarCategories.label))
    .all();
};

export const createCalendarCategory = (input: {
  label: string;
  colorKey: string;
}): string => {
  const label = input.label.trim();
  if (!label) throw new Error('Label is required');
  if (label.length > 64) throw new Error('Label is too long (max 64 chars)');
  const colorKey = (ALLOWED_COLOR_KEYS as readonly string[]).includes(
    input.colorKey,
  )
    ? input.colorKey
    : 'slate';
  // Uniqueness check — also enforced by the UNIQUE constraint, but
  // surface a friendlier message before the SQL throws.
  const existing = listCalendarCategories().find(
    (c) => c.label.toLowerCase() === label.toLowerCase(),
  );
  if (existing) throw new Error(`A category named "${label}" already exists`);

  const id = uuid();
  const db = getDb();
  db.insert(calendarCategories)
    .values({ id, label, colorKey })
    .run();
  return id;
};

export const deleteCalendarCategory = (id: string) => {
  const db = getDb();
  db.delete(calendarCategories).where(eq(calendarCategories.id, id)).run();
};

export const updateCalendarCategory = (
  id: string,
  patch: { label?: string; colorKey?: string },
) => {
  const db = getDb();
  const update: { label?: string; colorKey?: string } = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (!label) throw new Error('Label is required');
    if (label.length > 64) throw new Error('Label is too long (max 64 chars)');
    update.label = label;
  }
  if (patch.colorKey !== undefined) {
    update.colorKey = (ALLOWED_COLOR_KEYS as readonly string[]).includes(
      patch.colorKey,
    )
      ? patch.colorKey
      : 'slate';
  }
  if (Object.keys(update).length === 0) return;
  db.update(calendarCategories).set(update).where(eq(calendarCategories.id, id)).run();
};
