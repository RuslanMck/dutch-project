# practice

Translation practice on an FSRS schedule: each word's card and due date, the daily allowance of new words and their priorities, the frequency list that ranks words, the review log of graded answers, and the practice settings. Pure scheduling and allocation rules have no I/O. Repositories hold the SQL only, services own the rules, and adapters expose the practice to REST and MCP. Dictionary CRUD and the old drill stay in `domains/words/`, and the frequency list file is read by the import script, not here.

## Files

| File | What it does |
|---|---|
| `practice-repository.js` | SQL for `practice_settings` (JSON values), the card, due, introduction and priority columns of `words` (read through `v_words`), and `review_logs`. No business rules. |
| `frequency-repository.js` | SQL for `word_frequencies`: replaces or upserts the rank of each word form and looks up a rank by form, case-insensitively. No transactions; the service wraps them. |
| `practice-calendar.js` | Pure: calendar dates in the practice time zone (`Europe/Amsterdam`), start of a day and day arithmetic, DST-safe. Builds one `Intl` formatter per time zone and reuses it. |
| `fsrs-scheduling.js` | Pure wrapper around ts-fsrs: grades a card, serializes and parses cards, derives the learning status and the state name (from `CARD_STATE_VALUES`), builds the migration cards. |
| `priority-calculation.js` | Pure: parses the chapter from a section code, calculates a word's priority 1–3, compares queue order and computes a frequency rank for a Dutch text (apostrophes kept, numbers ignored, names in expressions unranked). |
| `new-word-allocation.js` | Pure: chooses which new words enter rotation today, by priority quota, with unused slots going to P1, P2, P3. |
| `practice-settings.js` | Service: reads the practice settings in camelCase (`readSettings`), saves the current chapter, tells whether FSRS is active and records the migration time. |
| `priority-service.js` | Service: recalculates priorities (`recalculatePriorities` publishes; `recalculatePrioritiesInTransaction` is for a caller that already holds a transaction and publishes nothing), ranks words from the frequency list (`assignNewWordRanking` also runs inside the caller's transaction), sets manual priorities and the current chapter, previews priorities for a chapter, and imports the frequency list in one transaction. Publishes `words` changes. |
| `practice-service.js` | Service: builds the practice batch, grades a word once per session (a wrong grade is recorded through `wordService.recordPracticeError`), runs the migration to FSRS (dry run or real; one transaction, one `words` change after the commit) and calculates the practice statistics. Publishes `words` changes. |
| `practice-tools.js` | MCP adapter: registers the eight practice tools (`get_practice_batch`, `grade_word`, `set_current_chapter`, `set_word_priority`, `import_frequency_list`, `preview_priorities`, `migrate_to_fsrs`, `practice_stats`). `set_word_priority` returns the compact word of the word tools, with `priority_override`. |
| `practice-routes.js` | REST adapter: `GET /api/practice/batch`, `POST /api/practice/grades`, `GET /api/practice/stats` and `GET /api/practice/priorities/preview`. |

## Conventions

- Repositories and the frequency repository are created with `create…Repository({ database })` and prepare their statements once in the factory.
- Values are bound parameters. JSON columns (`fsrs_card`, `review_logs.card_before`, `card_after`, settings) are stored as text; the settings repository parses and stringifies them.
- Pure modules take `now` and the other values as parameters and never read the clock or the database.
- The rules are in `project-quality-standards` and in `docs/FSRS_PRACTICE_ARCHITECTURE.md`.
