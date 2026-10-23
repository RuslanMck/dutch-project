import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './db.js';

const DIR = process.env.BACKUP_DIR || './data/backups';
const KEEP = Number(process.env.BACKUP_KEEP || 30);

// Online SQLite backup to <DIR>/dutch-YYYY-MM-DD.db, keeps the newest KEEP files.
export async function backupNow() {
  fs.mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, `dutch-${new Date().toISOString().slice(0, 10)}.db`);
  await getDb().backup(file);
  const old = fs.readdirSync(DIR).filter(f => /^dutch-\d{4}-\d\d-\d\d\.db$/.test(f)).sort().slice(0, -KEEP);
  for (const f of old) fs.unlinkSync(path.join(DIR, f));
  return file;
}

// First backup a minute after start, then every 24 h.
export function startBackups() {
  const run = () => backupNow().then(f => console.log('backup written', f)).catch(e => console.error('backup failed', e));
  setTimeout(run, 60_000).unref();
  setInterval(run, 24 * 3600_000).unref();
}
