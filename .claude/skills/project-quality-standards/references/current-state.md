# Current state and migration map (analysis of 2026-10-23, updated after steps 1–4)

This records where the existing code differs from the standards, so a refactor can be planned in steps. Fix
deviations in the code you touch, and fix whole areas as separate, behaviour-preserving changes with the tests green
before and after. Remove entries from this file as they are fixed.

## Repository overview

| Path | What it is | Notes |
|---|---|---|
| `README.md`, `project-instructions.md` | The claude.ai kit for other learners | English docs; keep |
| `artifact/dutch-materials.html` | Single-file artifact page (kit) | Minified CSS, short names (`.tw`, `.s`, `.x`, `#rf`, `--acc`) |
| `starter/words.json`, `starter/rules.json` | Kit seed data | Legacy keys `nl`, `uk`, `art`, `ex`, `added`; read by the artifact |
| `skills/dutch-exercise-check/` | Kit skill (artifact-based) | Template with `<ARTIFACT_URL>` |
| `app/` | Self-hosted app with REST + MCP | Node 24, Express 5, better-sqlite3, Zod 3, MCP SDK 1.32 |

## app/src and app/test

`app/src` follows the target structure in `architecture.md` (domains with repository, service, routes and tools;
`contracts/`, `errors/`, `configuration/`, `database/`, `authentication/`, `model-context-protocol/`,
`change-events/`, `backups/`, and the composition root in `server/`). What is left:

| Where | Problem | Target |
|---|---|---|
| `contracts/*.js` | Input schemas are not `.strict()`, so unknown keys are still dropped instead of rejected (kept to avoid changing what clients may send) | `.strict()` on every input schema, in the coordinated wire change below |
| `contracts/*.js` | No schemas for returned objects (`wordSchema`, `ruleSchema`, …); repositories return rows in the wire shape (snake_case, `nl`/`uk`) with no `map…Row` | `<entity>Schema` per domain object; repositories map rows to camelCase objects; tests assert `wordSchema.parse(result)` |
| Services | Take inputs in the wire shape (`nl`, `example_nl`, `rule_code`) | camelCase inputs, together with the wire change |
| `scripts/import.js` | Name; the export file is checked ad hoc (`collections` must be an object), not with a contract | `scripts/import-artifact-export.js` + `artifactExportSchema` (and `starter-data-contracts.js`) |
| `authentication/authentication-routes.js` | The fallback login page (used only when `public/login.html` is missing) is inline HTML with inline styles | Drop it, or serve a proper page from `public/` |
| `test/` | Suites test behaviour across layers (`domain-services`, `http`, `mcp`, `import`) instead of mirroring `src/` one file per module | `test/<mirror of src>/<module>.test.js`; update the `npm test` glob |
| `domains/practice/practice-repository.js`, `domains/statistics/statistics-repository.js`, `domains/words/word-repository.js` | The FSRS columns of `words` (`fsrs_card`, `due_at`, `introduced_on`, `priority`, `priority_override`, `frequency_rank`) are read and written with SQL outside the words repository's own tables: the practice repository writes the schedule and the priorities, the word repository reads them into word rows and clears the card when a status is set to new, and the statistics repository counts them. The FSRS plan keeps them on `words` (`docs/FSRS_PRACTICE_ARCHITECTURE.md` §2), so the queue, the batch and the list filters run on one table without a join. | Move the schedule to a `word_schedules` table keyed by `word_id`: one migration copies the columns and drops them from `words`; the practice repository owns that table, the word repository joins it for the word list, and statistics asks the practice service for its counts. REST and MCP fields stay as they are. |
| `domains/practice/phrase-practice-repository.js` writes the FSRS columns of `phrases` (`fsrs_card`, `due_at`, `introduced_on`, `status`, migration 004), and `domains/phrases/phrase-repository.js` reads `status` and `due_at` into the phrase list | The same split as the words row: the schedule is kept on the phrase row, and the phrase domain's repository reads it | A `phrase_schedules` table keyed by `phrase_id`, written by the phrase practice repository and joined by the phrase repository for the list. One migration copies the columns and drops them from `phrases`. REST and MCP fields stay as they are. |

## app/public

| Current | Problem | Target |
|---|---|---|
| `app.js` (1269 lines, `wc -l` when this was last checked) | All six tabs, state and event binding in one module; `$`, `esc`, `errs`, `ui.cards.idx`, `score.ok/tot` | `scripts/application.js` + `state-store.js` + `tabs/*-tab.js` |
| `logic.js` | Several pure capabilities in one file; `esc` | `scripts/logic/` one module per capability |
| `api.js` (browser) | Name clashes with `src/api.js` | `scripts/api-client.js` |
| `app.css` | Short custom properties (`--bg`, `--soft`, `--ok`) and classes (`.del`, `.mh`, `.pat`, `.art`, `.sr-only`) | `--color-…` properties, BEM blocks |
| `index.html` | ids with abbreviations (`table-q`, `rules-q`, `practice-q`, `practice-btn`, `practice-msg`); JavaScript hooks mixed with styling classes; `<s>` for wrong answers | scoped ids, `data-` hooks, `<del>`/`<ins>` |
| Renderer | Emits `<b>`, per the handoff | `<strong>` (visual change: none) |

## Database (migrations 001–002)

| Current name | Target name |
|---|---|
| `words.nl`, `words.uk` | `dutch_text`, `ukrainian_text` |
| `words.example_nl`, `words.example_uk` | `example_dutch`, `example_ukrainian` |
| `words.status` | `learning_status` |
| `phrases.nl`, `phrases.uk` | `dutch_text`, `ukrainian_text` |
| `mistake_cases.pattern_id` | `mistake_pattern_id` |
| `idx_words_status`, `idx_words_nl`, `idx_word_errors_word`, `idx_patterns_rule`, `idx_cases_pattern`, `idx_rules_code`, `idx_attempts_word` | `index_<table>_on_<column>` |
| `v_words`, `v_mistake_patterns`, `v_rule_errors` | `view_words_with_error_counts`, `view_mistake_patterns_with_counts`, `view_rule_error_counts` |
| Single-letter aliases in the views (`p`, `c`, `w`, `v`, `t`); queries in JavaScript already use full names | full table names |

Migration files `001_init.sql` and `002_practice_attempts.sql` keep their names; renames happen in a new
`003-…sql`. Renaming columns changes REST fields, MCP tool arguments, the browser code, the server instructions, and
the claude.ai skills `dutch-exercise-check` and `dutch-sentence-translation`, which use `nl`/`uk`/`article`. Plan it
as one coordinated change.

## Environment variables

| Current | Target |
|---|---|
| `APP_PASSWORD` | `APPLICATION_PASSWORD` |
| `DB_PATH` | `DATABASE_PATH` |
| `BACKUP_DIR` | `BACKUP_DIRECTORY` |
| `BACKUP_KEEP` | `BACKUP_RETENTION_COUNT` |
| `DATA_DIR` (compose) | `DATA_DIRECTORY` |

Renaming them means updating the server's `.env` in the same deployment.

## Contracts on the wire

The REST API and MCP use snake_case fields today (`error_count`, `example_nl`, `rule_code`). The target is camelCase
(`contracts.md`). Change it together with the column renames above, so clients change once.

## Suggested order of work

Steps 1–4 (folder READMEs, contracts and errors, domain repositories and services with injected connections,
per-domain routes and tools with the composition root) are done. Remaining:

5. Split `public/app.js` into tabs; rename ids, classes and custom properties.
6. One coordinated rename: database migration 003, camelCase wire format, env names, skills and docs.
7. Bring `artifact/dutch-materials.html` and `starter/` naming in line, together.
