# database

SQLite plumbing shared by all repositories: opening a connection, applying migrations and running transactions. No domain SQL lives here; that belongs in `domains/<domain>/<domain>-repository.js`.

## Files

| File | What it does |
|---|---|
| `create-database-connection.js` | Opens the database file (or `:memory:`) and sets the WAL, foreign-key and busy-timeout pragmas. |
| `run-database-migrations.js` | Applies `migrations/*.sql` in name order, each in a transaction, and records them in `schema_migrations`. |
| `run-in-transaction.js` | `createTransactionRunner`: runs an operation in one transaction and turns constraint failures into `ConflictError`. |
| `create-statement-cache.js` | Prepares each SQL text once, for statements whose column list is chosen at run time from constants. |
| `create-partial-row-updater.js` | Updates the given columns of one row, checking the column names against an allow-list. |

## Conventions

Only the composition root (`server.js`, the import script, the test helpers) opens a connection; everything else receives it through its factory.
