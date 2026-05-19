import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { attachments } from '../../shared/db/schema';

const ATTACHMENTS_DIR = () => {
  const dir = path.join(app.getPath('userData'), 'attachments');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const policyDir = (policyId: string) => {
  const dir = path.join(ATTACHMENTS_DIR(), policyId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export const listAttachments = (policyId: string) => {
  const db = getDb();
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.policyId, policyId))
    .orderBy(asc(attachments.uploadedAt))
    .all();
};

export const addAttachment = (input: {
  policyId: string;
  sourcePath: string; // absolute path picked from the OS dialog
  description?: string;
}) => {
  const stat = fs.statSync(input.sourcePath);
  if (!stat.isFile()) throw new Error('Selected item is not a file');

  const MAX_BYTES = 25 * 1024 * 1024;
  if (stat.size > MAX_BYTES) {
    throw new Error('File is too large (limit is 25 MB)');
  }

  const ext = path.extname(input.sourcePath).toLowerCase();
  const ALLOWED = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic'];
  if (!ALLOWED.includes(ext)) {
    throw new Error(`Unsupported file type ${ext}. Allowed: ${ALLOWED.join(', ')}`);
  }

  const id = uuid();
  const storedName = `${id}${ext}`;
  const destPath = path.join(policyDir(input.policyId), storedName);
  fs.copyFileSync(input.sourcePath, destPath);

  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
  };

  const db = getDb();
  db.insert(attachments)
    .values({
      id,
      policyId: input.policyId,
      fileName: path.basename(input.sourcePath),
      storedName,
      mimeType: mimeTypes[ext] ?? null,
      sizeBytes: stat.size,
      description: input.description ?? null,
    })
    .run();

  return getAttachment(id);
};

export const getAttachment = (id: string) => {
  const db = getDb();
  const row = db.select().from(attachments).where(eq(attachments.id, id)).get();
  return row ?? null;
};

export const getAttachmentPath = (id: string): string | null => {
  const row = getAttachment(id);
  if (!row) return null;
  return path.join(ATTACHMENTS_DIR(), row.policyId, row.storedName);
};

// Commit a list of source paths in one go. Returns per-file result so the
// renderer can show which succeeded and which failed.
export const addAttachmentsFromPaths = (
  policyId: string,
  sourcePaths: string[],
): { added: number; errors: { fileName: string; reason: string }[] } => {
  let added = 0;
  const errors: { fileName: string; reason: string }[] = [];
  for (const p of sourcePaths) {
    try {
      addAttachment({ policyId, sourcePath: p });
      added++;
    } catch (err) {
      errors.push({ fileName: path.basename(p), reason: (err as Error).message });
    }
  }
  return { added, errors };
};

export const removeAttachment = (id: string) => {
  const db = getDb();
  const row = getAttachment(id);
  if (!row) return;
  const filePath = path.join(ATTACHMENTS_DIR(), row.policyId, row.storedName);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error('[attachments] failed to delete file', err);
  }
  db.delete(attachments).where(eq(attachments.id, id)).run();
};
