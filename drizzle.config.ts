import type { Config } from 'drizzle-kit';

export default {
  schema: './src/shared/db/schema.ts',
  out: './src/shared/db/migrations',
  dialect: 'sqlite',
} satisfies Config;
