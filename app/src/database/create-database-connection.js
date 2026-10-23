// Opens the SQLite database file (or ':memory:') with the pragmas every connection needs.
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

const IN_MEMORY_DATABASE_PATH = ':memory:';
const BUSY_TIMEOUT_MILLISECONDS = 5000;

export function createDatabaseConnection({ databasePath }) {
  if (databasePath !== IN_MEMORY_DATABASE_PATH) fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma(`busy_timeout = ${BUSY_TIMEOUT_MILLISECONDS}`);
  return database;
}
