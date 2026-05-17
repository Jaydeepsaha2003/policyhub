/* eslint-disable no-console */
// The app applies the schema at runtime via src/main/db.ts (CREATE TABLE IF NOT EXISTS),
// so there is no separate migration step required for first install.
// This script is a no-op placeholder so `npm run db:migrate` doesn't fail.
console.log('[migrate] schema is applied at app startup; nothing to do.');
