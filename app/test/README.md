# test

Test suites for `node --test`, run with `npm test` (in Docker, since the host has no Node). Each suite builds its own in-memory database and services with `createTestContext()`. The data-backed suites need a real artifact export, which is personal data and not in git: point `DUTCH_SEED` at it, or they are skipped.

## Files

| File | What it does |
|---|---|
| `seed.js` | Loads the seed export named by `DUTCH_SEED` (default `data/seed/dutch-export.json`) and gives the skip option when it is missing. |
| `database-test-helpers.js` | `createTestContext`: an in-memory database with all migrations and the domain services built on it. |
| `domain-services.test.js` | Domain service behaviour: practice results, mistake logging, duplicate skipping, filters, errors, statistics and export. |
| `import.test.js` | Import of the seed export through the artifact import service: counts, rule mapping, example splitting, idempotence and export round trip. |
| `http.test.js` | HTTP behaviour: login, cookie and bearer authentication, rate limiting, REST contract, live-update stream and export download. |
| `mcp.test.js` | MCP server over HTTP: instructions, tool list, every tool's behaviour, and the secret-path and bearer authentication. |
| `auth-env.test.js` | The server refuses to start outside test mode when a required secret is missing. |
| `ui-logic.test.js` | Pure browser helpers in `public/logic.js`: escaping, answer checking and rule-body rendering. |

## Conventions

Run the suite with:

```bash
docker run --rm -v /srv/dutch-project/app:/app -v /srv/data/dutch/seed:/seed:ro -e DUTCH_SEED=/seed/dutch-export.json -w /app node:24-bookworm-slim npm test
```
