# Current state and migration map (analysis of 2026-10-23)

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

No folder except `app/` has a README; `app/` has no README in any subfolder.

## app/src: responsibilities

| Current file | Problem | Target |
|---|---|---|
| `repo.js` (814 lines) | Five domains in one module; SQL, business rules and validation mixed; throws `httpError(400/404)` (HTTP in the data layer); uses the global `getDb()`; `notify()` called from data functions | `domains/<domain>/<domain>-repository.js` + `<domain>-service.js`; errors from `errors/domain-errors.js`; events published by services |
| `mcp.js` (411 lines) | All tools in one file; Zod shapes copied from `repo.js` ("mirror the validation"); `import * as repo`; reads `process.env` per request | `model-context-protocol/create-mcp-server.js` + `domains/<domain>/<domain>-tools.js` using `contracts/` |
| `api.js` | All routes in one router; `import * as repo` | `domains/<domain>/<domain>-routes.js`; one error middleware |
| `auth.js` | Reads `process.env` at import and throws; cookie signing, rate limiting and routes in one file | `authentication/` split (see architecture.md); configuration injected |
| `db.js` | Module singleton with `getDb()`/`setDb()` | `database/create-database-connection.js` + `run-database-migrations.js`; connection passed to factories |
| `events.js` | Module-level `bus` singleton | `change-events/change-event-bus.js` factory |
| `backup.js` | Reads env at import; uses `getDb()` | `backups/database-backup-scheduler.js` with injected database and configuration |
| `server.js` | Mixes composition and start-up | `server/create-application.js` + `server/start-server.js` |
| `scripts/import.js` | Validates with ad-hoc checks, not a contract | `scripts/import-artifact-export.js` + `artifactExportSchema` + an import service |

## app/public

| Current | Problem | Target |
|---|---|---|
| `app.js` (546 lines) | All six tabs, state and event binding in one module; `$`, `esc`, `errs`, `ui.cards.idx`, `score.ok/tot` | `scripts/application.js` + `state-store.js` + `tabs/*-tab.js` |
| `logic.js` | Several pure capabilities in one file; `esc` | `scripts/logic/` one module per capability |
| `api.js` (browser) | Name clashes with `src/api.js` | `scripts/api-client.js` |
| `app.css` | Short custom properties (`--bg`, `--soft`, `--ok`) and classes (`.del`, `.mh`, `.pat`, `.art`, `.th-btn`, `.sr-only`) | `--color-…` properties, BEM blocks |
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
| Single-letter aliases in views and queries (`p`, `c`, `w`, `v`, `t`) | full table names |

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

1. Add folder READMEs for the current layout (no code change).
2. Add `contracts/` and `errors/`; switch `repo.js` and `mcp.js` to the shared contracts. Behaviour stays the same.
3. Replace `getDb()` with injected connections, and split `repo.js` into domain repositories and services, one domain
   at a time.
4. Split `api.js` / `mcp.js` into per-domain routes and tools; add the composition root.
5. Split `public/app.js` into tabs; rename ids, classes and custom properties.
6. One coordinated rename: database migration 003, camelCase wire format, env names, skills and docs.
7. Bring `artifact/dutch-materials.html` and `starter/` naming in line, together.
