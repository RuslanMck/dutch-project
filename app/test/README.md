# test

Test suites for `node --test`, run with `npm test` (in Docker, since the host has no Node). Each suite builds its own in-memory database and services with `createTestContext()`. The data-backed suites need a real artifact export, which is personal data and not in git: point `DUTCH_SEED` at it, or they are skipped.

## Files

| File | What it does |
|---|---|
| `seed.js` | Loads the seed export named by `DUTCH_SEED` (default `data/seed/dutch-export.json`) and gives the skip option when it is missing. |
| `database-test-helpers.js` | `createTestContext({ clock, isFsrsFuzzEnabled })`: an in-memory database with all migrations and the domain services built on it. The clock defaults to the system clock; fuzz is off in tests. |
| `domain-services.test.js` | Domain service behaviour: practice results, mistake logging, duplicate skipping, filters, errors, statistics and export. |
| `practice.test.js` | FSRS practice at service level with a fake clock: the migration (dry run and real, one `words` change after the commit), the batch quota and redistribution, grading once per session and its due dates, word errors, chapters and manual priorities, the Amsterdam day boundary including the DST day, the statistics, and the frequency import. |
| `practice-logic.test.js` | Pure practice modules without a database: calendar days and DST, FSRS scheduling and migration cards, chapter and priority rules, queue order, the frequency rank of a Dutch text (apostrophes, numbers, articles), and new-word allocation. |
| `import.test.js` | Import of the seed export through the artifact import service: counts, rule mapping, example splitting, idempotence and export round trip; and the refusal once FSRS is set up. |
| `http.test.js` | HTTP behaviour of the full application (`createApplication`): login, cookie and bearer authentication, rate limiting, REST contract, live-update stream, export download, and the REST practice routes (409 before the migration; batch, grades, repeat, stats and preview after it). |
| `mcp.test.js` | MCP server over HTTP in the full application: instructions, tool list (including the practice tools), every tool's behaviour, `set_word_priority`'s compact word, the secret-path and bearer authentication, and a `grade_word` round trip on a separate database. |
| `environment-configuration.test.js` | The server refuses to start outside test mode when a required secret is missing; the configuration's defaults. |
| `ui-logic.test.js` | Pure browser helpers in `public/logic.js`: escaping, answer checking, `gradeTranslationAnswer` (the grade for a typed Dutch answer in FSRS practice) and rule-body rendering. |

## Conventions

Run the suite with:

```bash
docker run --rm -v /srv/dutch-project/app:/app -v /srv/data/dutch/seed:/seed:ro -e DUTCH_SEED=/seed/dutch-export.json -w /app node:24-bookworm-slim npm test
```
