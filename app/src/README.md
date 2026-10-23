# src

Server-side code of the app: the Express server, the REST API, the MCP server, authentication, data access and backups. Browser code belongs in `public/`, SQL schema changes in `migrations/`, command-line tools in `scripts/`.

## Files

| File | What it does |
|---|---|
| `server.js` | Entry point: opens the database, mounts the MCP, authentication, API and static routes, listens on `PORT` and starts backups. |
| `db.js` | Opens the SQLite database with its pragmas, applies `migrations/*.sql`, and holds the process-wide connection (`getDb()` / `setDb()`). |
| `repo.js` | Data layer for words, rules, mistake patterns, phrases and texts: validation, SQL, business rules, statistics and export. |
| `api.js` | REST routes under `/api`, the live-update stream (`/api/events`) and the JSON error handler. |
| `mcp.js` | Remote MCP server (Streamable HTTP, stateless) with its tools and instructions, and the secret-path and bearer authentication for `/mcp`. |
| `auth.js` | Browser login with a signed session cookie, bearer-token API access, the failed-login rate limit and the `/login` and `/auth/*` routes. |
| `events.js` | In-process change bus: data writes publish the changed collection, and `/api/events` relays it to open pages. |
| `backup.js` | Daily online SQLite backup to `BACKUP_DIR`, keeping the newest `BACKUP_KEEP` files. |

## Conventions

Follow the project-quality-standards skill (`.claude/skills/project-quality-standards/`). Its `references/current-state.md` lists how these files differ from the target layout.
