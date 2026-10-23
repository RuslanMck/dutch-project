// Applies migrations/*.sql in name order, each in its own transaction, and records them in schema_migrations.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

export function runDatabaseMigrations({ database, clock, migrationsDirectory = MIGRATIONS_DIRECTORY }) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);
  const appliedMigrationNames = new Set(database.prepare('SELECT name FROM schema_migrations').pluck().all());
  const insertMigrationStatement = database.prepare(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (@name, @appliedAt)',
  );
  const migrationFileNames = fs.readdirSync(migrationsDirectory)
    .filter(fileName => fileName.endsWith('.sql'))
    .sort();
  for (const migrationFileName of migrationFileNames) {
    if (appliedMigrationNames.has(migrationFileName)) continue;
    const migrationSql = fs.readFileSync(path.join(migrationsDirectory, migrationFileName), 'utf8');
    database.transaction(() => {
      database.exec(migrationSql);
      insertMigrationStatement.run({ name: migrationFileName, appliedAt: clock.now() });
    })();
  }
}
