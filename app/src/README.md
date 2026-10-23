# src

Server-side code of the app, grouped by domain first and layer second. Browser code belongs in `public/`, SQL schema changes in `migrations/`, command-line tools in `scripts/`. The entry point is `server/start-server.js` (`npm start`).

## Folders

| Folder | Purpose |
|---|---|
| `server/` | Composition root: reads the configuration, opens the database, wires repositories, services and adapters into the Express application, and listens. |
| `domains/` | One folder per domain: repository (SQL), service (business rules), REST routes and MCP tools. |
| `contracts/` | Zod schemas for every input shape and the environment, shared by REST and MCP. |
| `errors/` | Domain errors, mapped to HTTP status codes and MCP results by the adapters. |
| `configuration/` | Parses the environment once into a frozen configuration object. |
| `database/` | Connection, migrations and transaction helpers. |
| `authentication/` | Session cookie, login rate limit, sign-in routes and the authentication middleware. |
| `model-context-protocol/` | The MCP server: instructions, tool registration helper and the `/mcp` endpoint. |
| `http/` | Shared REST adapter helpers: reading request input and the one error handler. |
| `change-events/` | In-process "collection changed" bus and the server-sent events stream that relays it. |
| `backups/` | Daily online backup of the SQLite file. |
| `time/` | The clock services receive, and calendar-date formatting. |

## Conventions

Follow the project-quality-standards skill (`.claude/skills/project-quality-standards/`). Every module with dependencies exports a `create…` factory that receives them; only `server/` reads the configuration, opens the database, starts timers and listens. `references/current-state.md` in the skill lists what still differs from the target.
