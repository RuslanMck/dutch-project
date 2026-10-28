// The environment variables the app reads. Blank values count as not set.
import { z } from 'zod';

const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-4.5';

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
  // Surrounding spaces are dropped; a blank key means no key, a blank model means the default model.
  OPENROUTER_API_KEY: z.string().trim().default(''),
  OPENROUTER_MODEL: z.string().trim().default('').transform(model => model || DEFAULT_OPENROUTER_MODEL),
});
