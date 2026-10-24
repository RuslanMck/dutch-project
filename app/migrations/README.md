# migrations

Numbered SQL files that build the SQLite schema. The runner applies them in name order and records each file name in `schema_migrations`. Pragmas are set by the connection code, not here.

## Files

| File | What it does |
|---|---|
| `001_init.sql` | Core schema from the handoff spec: sections, topics, rules, texts, words, word errors, phrases, mistake patterns and cases, plus the views with error counts. |
| `002_practice_attempts.sql` | Adds `practice_attempts`, one row per practice answer, right or wrong. |
| `003-add-fsrs-practice.sql` | Adds the FSRS card, due date, introduction date, frequency rank and priority columns to `words`, plus `review_logs`, `practice_settings` (seeded defaults) and `word_frequencies`. |

## Conventions

- Never edit, rename or delete a migration that has been applied: the runner tracks them by file name. The two legacy names above stay as they are.
- New files are named `NNN-<verb>-<object>.sql` (for example `003-rename-word-text-columns.sql`), one concern each. See `references/database.md` in the project-quality-standards skill.

## How to add a migration

1. Create the next number: `NNN-<verb>-<object>.sql`.
2. Write the change; recreate any view that uses a renamed column in the same file.
3. Run the test suite, then test it on a copy of the real database before deploying.
4. Add a row to this README.
