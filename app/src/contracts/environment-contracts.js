// The environment variables the app reads. Blank values count as not set.
import { z } from 'zod';

export const environmentSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_PASSWORD: z.string().default(''),
  SESSION_SECRET: z.string().default(''),
  API_TOKEN: z.string().default(''),
  MCP_SECRET: z.string().default(''),
  DB_PATH: z.string().default('./data/dutch.db'),
  BACKUP_DIR: z.string().default('./data/backups'),
  BACKUP_KEEP: z.coerce.number().int().positive().default(30),
});
