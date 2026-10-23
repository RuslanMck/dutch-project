// The data-backed tests run against a real artifact export, which is personal data and not in git.
// Point DUTCH_SEED at one (default: data/seed/dutch-export.json); without it those tests are skipped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SEED = process.env.DUTCH_SEED || path.join(here, '..', 'data', 'seed', 'dutch-export.json');
export const seed = fs.existsSync(SEED) ? JSON.parse(fs.readFileSync(SEED, 'utf8')) : null;
export const SKIP = { skip: seed ? false : `no seed export at ${SEED} (set DUTCH_SEED)` };
