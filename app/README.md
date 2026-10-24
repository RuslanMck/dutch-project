# Dutch матеріали: self-hosted app

The same page as the kit's artifact (dictionary, flashcards, typed practice, grammar rules with mistake log,
phrases, texts) as a small web app on your own server, plus an **MCP server** so Claude (claude.ai on phone, web
and desktop, or Claude Code) can read and write your data directly. Node 24 + Express + SQLite, run with Docker.

- Design decisions and the REST/MCP contract: `PLAN.md`. Behaviour spec ported from the artifact: `docs/HANDOFF.md`.
- Access: password login on the page (stays signed in 180 days), `Authorization: Bearer $API_TOKEN` for scripts,
  and a secret URL for the Claude connector.

## Run it

Needs Docker with the compose plugin and a domain pointing at the server. Without a domain,
`<ip-with-dashes>.sslip.io` works (e.g. `203-0-113-7.sslip.io`).

```
cp .env.example .env      # set APP_PASSWORD; fill each secret with: openssl rand -hex 32
```

**Behind a shared Caddy** (how it runs on the author's server): the app joins the external Docker network `web`, and
the proxy routes the domain to `dutch-app:3000`:
```
your.domain {
	reverse_proxy dutch-app:3000
}
```
```
docker compose up -d --build
```

**Standalone** (no proxy yet): create the network once, then run Caddy alongside the app:
```
docker network create web
DOMAIN=your.domain docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

Import your data from an artifact export (`dutch-export.json`, the handoff's JSON shape). The import is idempotent by
document id:
```
cp dutch-export.json "${DATA_DIR:-./data}/seed.json"
docker compose run --rm -w /app/data app node /app/scripts/import.js /app/data/seed.json   # writes import-report.txt
```

## Connect Claude (MCP)

**claude.ai (also in the mobile app):** Settings → Connectors → Add custom connector. Use the URL
`https://<your-domain>/mcp`, leave OAuth empty, and under **Request headers** add `x-api-key` with your
`MCP_SECRET` as the value. (claude.ai reserves `Authorization` for OAuth.) Older setups put the secret in the URL instead,
`https://<your-domain>/mcp/<MCP_SECRET>`, which still works.

**Claude Code:**
```
claude mcp add --transport http dutch https://<your-domain>/mcp --header "Authorization: Bearer <API_TOKEN>"
```

Tools: `stats, search_words, list_words, add_words, update_word, delete_word, set_word_status, log_word_error,
list_rules, get_rule, add_rule, update_rule, list_mistake_patterns, log_mistake, add_phrases, list_phrases,
delete_phrase, add_text, list_texts, get_text, get_practice_batch, grade_word, set_current_chapter,
set_word_priority, import_frequency_list, preview_priorities, migrate_to_fsrs, practice_stats, get_phrase_batch,
grade_phrase`. The server's instructions describe the lesson workflows (exercise
check, translation). Writes show up live in open browser tabs.

## Operate

```
docker compose logs -f app
docker run --rm -v "$PWD":/app -w /app node:24-bookworm-slim sh -c "npm ci && npm test"    # tests
```

- **Data:** `${DATA_DIR}/dutch.db` (SQLite, WAL). Daily backups go to `${DATA_DIR}/backups/dutch-YYYY-MM-DD.db`, keeping 30. `GET /api/export` gives a JSON dump.
- **Restore:** `docker compose stop app && cp "$DATA_DIR"/backups/dutch-<date>.db "$DATA_DIR"/dutch.db && rm -f "$DATA_DIR"/dutch.db-wal "$DATA_DIR"/dutch.db-shm && docker compose start app`
- **Rotate a secret:** edit `.env`, then run `docker compose up -d app`. A new `SESSION_SECRET` logs out every browser. A new `MCP_SECRET` means updating the connector URL.

## Files

| File | What it does |
|---|---|
| `README.md` | How to run, connect and operate the app, and this map of the folder. |
| `PLAN.md` | Design decisions and the REST/MCP contracts the app was built against. |
| `package.json` | Package manifest: dependencies and the `start`, `import` and `test` scripts. |
| `package-lock.json` | Locked dependency versions for reproducible `npm ci`. |
| `Dockerfile` | Builds the production image (Node 24, production dependencies only, non-root user). |
| `docker-compose.yml` | Runs the app on the external `web` network behind a shared Caddy, with `DATA_DIR` mounted as `/app/data`. |
| `docker-compose.caddy.yml` | Optional overlay that adds a Caddy of its own for standalone use. |
| `Caddyfile` | Caddy site configuration for the standalone overlay (HTTPS, security headers, no access log). |
| `.env.example` | Template for `.env`, listing every environment variable with a comment. |
| `.env` | The real secrets and data path for this server. Git-ignored; never committed. |
| `.gitignore` | Keeps dependencies, personal data, databases, secrets and import reports out of git. |
| `.dockerignore` | Keeps dependencies, data, secrets, tests and docs out of the Docker build context. |

## Folders

| Folder | Purpose |
|---|---|
| `src/` | Server code: HTTP server, REST API, MCP server, authentication, data access, backups. |
| `public/` | Browser code and static files served to signed-in users (no build step). |
| `migrations/` | Numbered SQL migrations that build the SQLite schema. |
| `scripts/` | Command-line tools, such as the artifact-export import. |
| `test/` | `node --test` suites for the server, the import and the browser logic. |
| `docs/` | Background documents, such as the migration handoff spec. |
