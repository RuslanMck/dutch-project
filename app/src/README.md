# src

Server-side code of the app: the Express server, the REST API, the MCP server, authentication, the domain services and their repositories, and backups. Browser code belongs in `public/`, SQL schema changes in `migrations/`, command-line tools in `scripts/`.

## Files

| File | What it does |
|---|---|
| `server.js` | Entry point: opens and migrates the database, builds the services, mounts the MCP, authentication, API and static routes, listens on `PORT` and starts the daily backups. |
| `api.js` | REST routes under `/api`: each parses its input with a contract and calls a service. Also the live-update stream (`/api/events`) and the JSON error handler. |
| `mcp.js` | Remote MCP server (Streamable HTTP, stateless): instructions, tools that call the same services as REST, and the secret-path and bearer authentication for `/mcp`. |
| `auth.js` | Browser login with a signed session cookie, bearer-token API access, the failed-login rate limit and the `/login` and `/auth/*` routes. |

## Folders

| Folder | Purpose |
|---|---|
| `contracts/` | Zod schemas for every input shape, shared by REST and MCP. |
| `errors/` | Domain errors, mapped to HTTP status codes and MCP results by the adapters. |
| `domains/` | One folder per domain with its repository (SQL) and service (business rules). |
| `database/` | Connection, migrations and transaction helpers. |
| `change-events/` | In-process bus that services publish "collection changed" events on. |
| `backups/` | Daily online backup of the SQLite file. |
| `server/` | Composition: builds every repository and service on one database connection. |
| `time/` | The clock services receive, and calendar-date formatting. |

## Conventions

Follow the project-quality-standards skill (`.claude/skills/project-quality-standards/`). Every module with dependencies exports a `create…` factory that receives them; no module holds a global database connection. `references/current-state.md` in the skill lists what still differs from the target layout.
