# Database (SQLite)

## Naming

| Element | Rule | Examples |
|---|---|---|
| Tables | plural snake_case noun phrase | `words`, `word_errors`, `mistake_patterns`, `mistake_cases`, `practice_attempts` |
| Join tables | both plural nouns, alphabetical | `phrases_words` |
| Primary key | `id INTEGER PRIMARY KEY` | |
| Foreign keys | `<singular_referenced_table>_id` | `word_id`, `mistake_pattern_id`, `rule_id` |
| Columns | singular snake_case, whole words, no type in the name | `dutch_text`, `ukrainian_text`, `example_dutch`, `learning_status` |
| Text in a language | `<meaning>_<language>` or `<language>_text` | `example_dutch`, `ukrainian_text` |
| Booleans | `is_<adjective>` / `has_<noun>`, `INTEGER NOT NULL CHECK (… IN (0, 1))` | `is_textbook` |
| Moments | `<event>_at`, `INTEGER` milliseconds since epoch (UTC) | `added_at`, `updated_at`, `occurred_at` |
| Calendar dates | `<event>_on`, `TEXT` `YYYY-MM-DD` | `occurred_on` |
| Enumerations | `TEXT` with a `CHECK (column IN (…))`; values are lowercase words | `learning_status IN ('new','learning','learned')` |
| Counts stored (avoid; derive instead) | `<thing>_count` | |
| Order keys | `sort_order` | |
| External / legacy ids | `legacy_id`, `UNIQUE` | |
| Indexes | `index_<table>_on_<column>[_and_<column>]` | `index_words_on_learning_status` |
| Unique indexes | `unique_index_<table>_on_<columns>` | |
| Views | `view_<what it shows>` | `view_words_with_error_counts`, `view_rule_error_counts` |
| Named constraints | `check_<table>_<column>`, `foreign_key_<table>_<column>` | |
| Triggers | `trigger_<table>_<when>_<event>` | `trigger_words_after_update` |

SQL keywords are never used as names (`order`, `group`, `references`, `values`).

## Schema rules

- `PRAGMA foreign_keys = ON` and `journal_mode = WAL` are set by the connection factory, not in migrations.
- Every column is `NOT NULL` unless absence is meaningful. Then the meaning of `NULL` is written in a comment
  (`rule_id … -- NULL = mistake outside the rules ("Інші помилки")`).
- Every foreign key states its `ON DELETE` behaviour explicitly (`CASCADE` or `SET NULL`).
- Derived numbers (error counts, mistake counts, last dates) are **computed in views or queries, never stored**, so
  they cannot drift from the rows they summarize.
- Every query that filters or joins on a column has an index for it.
- Text that users search is matched case-insensitively (`COLLATE NOCASE` index, or a lowercase comparison). Never
  add a `UNIQUE` constraint on user text without checking existing data (duplicates exist, see the import report).

## Migrations

- Files in `app/migrations/`, named `NNN-<verb>-<object>.sql` (`003-rename-word-text-columns.sql`), applied in
  name order and recorded by file name in `schema_migrations`.
- **Never edit, rename or delete an applied migration.** The runner tracks migrations by file name, so a renamed
  file would run again. `001_init.sql` and `002_practice_attempts.sql` keep their legacy names forever.
- One concern per migration. It runs inside a transaction (the runner wraps it).
- Renames use `ALTER TABLE … RENAME COLUMN` (SQLite ≥ 3.25). Views that use the old name are dropped and
  recreated in the same migration.
- A migration that changes a contract (column → JSON field) lands in the same commit as the repository mapping,
  the contract, the tests and the documentation.
- Test every migration on a copy of the real database before deploying: copy `data/dutch.db`, run the app's
  migration against it and run the test suite.

## Queries

- SQL lives only in repositories, as prepared statements created once in the factory.
- Bound parameters only. String interpolation is allowed for fixed SQL fragments from constants (column lists,
  `ORDER BY` choices picked from an allow-list), never for values.
- Select explicit columns, never `SELECT *` (the views are the only exception, because they own their column list).
- No table aliases. Qualify with the full table name (`mistake_cases.mistake_pattern_id`, not `c.pattern_id`); a
  self-join may use a descriptive alias (`parent_rules`).
- Multi-statement writes run inside `runInTransaction`.
