# Dutch матеріали on the VPS — decisions and contracts

Source spec: `docs/HANDOFF.md` (behaviour, schema, import rules). This file records the decisions taken
on top of it and the exact module/API contracts every part is built against.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Database | **SQLite** (better-sqlite3, WAL) at `data/dutch.db`, schema = handoff §3 verbatim (`migrations/001_init.sql`) + `practice_attempts` (`002`) | Single user, <10k rows, zero ops, file-level backups, synchronous API keeps transactions trivial |
| Runtime | **Node 24, plain ESM JavaScript**, Express 5, Zod. No TypeScript/build step | Nothing to compile in the container; the MCP SDK's Express examples apply directly |
| Hosting | **Docker Compose**, app on the external network `web` (port 3000, never published) behind a shared Caddy (80/443, automatic Let's Encrypt). `docker-compose.caddy.yml` adds a Caddy of its own for standalone use | One proxy can serve several apps on the same server; only Caddy is exposed |
| Domain | Any domain pointing at the server; `<ip-with-dashes>.sslip.io` works without one | Let's Encrypt accepts sslip.io |
| Browser access | **Password login page → signed HttpOnly cookie, 180 days**. Login rate-limited (10 failures / 15 min / IP) | Stays logged in on the phone home screen; basic-auth prompts reappear on mobile Safari |
| API access (scripts) | `Authorization: Bearer $API_TOKEN` accepted wherever the cookie is | CLI / curl / Claude Code on the VPS |
| MCP | **Remote MCP, Streamable HTTP, stateless**, in the same process: `POST /mcp/<MCP_SECRET>` (for claude.ai connector — works in the mobile app) and `POST /mcp` with `Authorization: Bearer $API_TOKEN` (for Claude Code `.mcp.json`) | Same process ⇒ MCP writes hit the SSE bus, open pages update live. claude.ai custom connectors take a URL only, so the secret lives in the path (256-bit, HTTPS, path not logged) |
| Live updates | SSE `GET /api/events`; page refetches the affected collection | Replaces `onSnapshot` |
| Backups | In-app online backup daily to `data/backups/dutch-YYYY-MM-DD.db`, keep 30; plus `GET /api/export` (handoff JSON shape) | No host cron/sqlite3 needed |
| Secrets | `.env` (git-ignored): `APP_PASSWORD`, `SESSION_SECRET`, `API_TOKEN`, `MCP_SECRET`, plus `DATA_DIR` | |
| Personal data | `DATA_DIR` (default `./data`, git-ignored) holds the DB, backups and any seed export | |
| Tests | `node --test` (built in); each suite builds an in-memory database and its own services (`test/database-test-helpers.js`) | No extra dev deps |

Run anything with Node through Docker (there is no Node on the host):
`docker run --rm -v "$PWD":/app -w /app node:24-bookworm-slim <cmd>`

## Layout

This was the layout the app was first built with. The code has since been split by domain (see `src/README.md` and the project-quality-standards skill); the shapes and contracts below still describe what REST and MCP return.

```
src/db.js        openDb(file), getDb(), setDb(db)          — done
src/events.js    bus, notify(collection)                    — done
src/backup.js    backupNow(), startBackups()                — done
src/server.js    wiring                                     — done
src/repo.js      data layer (contract below)                — agent A
src/auth.js      authRoutes, requireAuth                    — agent A
src/api.js       apiRouter (REST contract below)            — agent A
scripts/import.js  node scripts/import.js <export.json>     — agent A
public/          index.html app.css app.js api.js login.html — agent B
src/mcp.js       mcpRouter                                  — agent C
```

## repo.js contract (synchronous; every function takes data, returns plain objects; every write calls `notify(collection)` with one of `words|rules|mistakes|phrases|texts`)

Shapes returned:
```
Word    { id, legacy_id, nl, uk, article, kind, example_nl, example_uk, topic /*name|null*/, section /*code|null*/,
          status, error_count, added_at, updated_at }
Rule    { id, legacy_id, code, category, title, body, sort_order, section, error_count, created_at, updated_at }
Pattern { id, legacy_id, rule_id /*null = "other"*/, rule_code /*null*/, title, fix, count, last_on, created_at,
          cases: [{ id, wrong_text, right_text, occurred_on, source, created_at }]  /* newest first */ }
Phrase  { id, legacy_id, nl, uk, context, section, added_at }
Text    { id, legacy_id, title, section, body, added_at }
```
Functions (throw `Error` with `.status = 400|404` for bad input / missing rows):
```
listWords({status, topic, q, sort /*'added'(default, asc)|'errors'(desc, then added asc)*/, limit})
getWord(id) · findWords(q, {limit=20})        // case-insensitive on nl and uk; exact nl matches first
addWord({nl, uk, article='', example_nl, example_uk, section, topic, status='new', kind /*auto: expression if 3+ tokens or ends ?/.*/,
         err=0 /*n error rows, source 'lesson'*/})   // creates sections/topics rows on demand
addWords(list, {skipExisting=true})            // → {added: Word[], skipped: [{nl, existing_id}]}; existing = same nl (case-insens) AND same article
updateWord(id, patch) · deleteWord(id)
setWordStatus(id, status)
recordPracticeResult(id, {correct, mode /*'translate'|'article'*/, answer})
      // inserts practice_attempts; correct: learning→learned, new stays new; wrong: status='learning' + word_errors(source 'practice', mode, wrong_answer=answer)
logWordError(id, {source /*'exercise'|'lesson'|'practice'*/, wrong_answer, mode})   // + status 'learning'
listTopics() → [{id, name, word_count}]
listRules() (sorted by sort_order) · getRule(idOrCode) · addRule({code, category, title, body, sort_order /*default max+10*/, legacy_id})
updateRule(id, patch) · deleteRule(id)
listPatterns({rule_id /*number | 'null' for other*/, rule_code}) · getPattern(id)
addPattern({rule_id | rule_code | null, title, fix}) · deletePattern(id)
addCase(patternId, {wrong, right, date /*YYYY-MM-DD, default today*/, source}) → Pattern · deleteCase(caseId)
logMistake({rule_code /*null|'other' ⇒ no rule*/, pattern_id, title, fix, wrong, right, date, source})
      // pattern_id given → add case; else same rule + same title (case-insens) → add case; else create pattern + case. → Pattern
listPhrases() (newest first) · addPhrase({nl, uk, context, section}) · deletePhrase(id)
listTexts() (newest first) · getText(id) · addText({title, body, section}) · updateText(id, patch) · deleteText(id)
stats() → {words:{total,new,learning,learned,expressions}, rules, patterns, cases, phrases, texts, sections:[codes]}
exportAll() → same JSON shape as data/seed/dutch-export.json (count/last/err recomputed)
```

## REST contract (all JSON, under `/api`, cookie or bearer; errors `{error}` with 4xx; lists return arrays)

```
GET    /api/health                           (no auth) {ok:true}
GET    /api/words?status=&topic=&q=&sort=errors     Word[]
POST   /api/words                            Word (201)        body = addWord input
PATCH  /api/words/:id                        Word
DELETE /api/words/:id                        {ok:true}
POST   /api/words/:id/result {correct, mode, answer}   Word
POST   /api/words/:id/errors {source, wrong_answer}    Word
GET    /api/topics                           Topic[]
GET    /api/rules                            Rule[]   · GET /api/rules/:id · POST · PATCH /:id · DELETE /:id
GET    /api/mistake-patterns?rule_id=        Pattern[] (with cases)
POST   /api/mistake-patterns                 Pattern  · DELETE /:id
POST   /api/mistake-patterns/:id/cases {wrong, right, date, source}   Pattern
POST   /api/mistakes/log                     Pattern   (logMistake)
GET    /api/phrases · POST /api/phrases · DELETE /api/phrases/:id
GET    /api/texts   · POST /api/texts   · DELETE /api/texts/:id
GET    /api/stats · GET /api/export
GET    /api/events                           SSE: `event: change` `data: {"collection":"words","at":...}`; `: ping` every 25 s
```
Auth routes: `GET /login` → `public/login.html`; `POST /auth/login` (form field `password`) → cookie `dutch_session`, 303 to `/`;
`POST /auth/logout`. Unauthenticated: `/api/*` → 401 JSON, anything else → 303 `/login`.
Cookie value `<expiresMs>.<hex HMAC-SHA256(expiresMs, SESSION_SECRET)>`, `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000`.

## MCP tools (agent C)

Server name `dutch`, with `instructions` describing the lesson workflows (handoff §2.1). Tools wrap repo.js 1:1:
`stats`, `search_words`, `list_words`, `add_words` (batch), `update_word`, `delete_word`, `set_word_status`, `log_word_error`,
`list_rules`, `get_rule`, `add_rule`, `update_rule`, `list_mistake_patterns`, `log_mistake`, `add_phrases` (batch), `list_phrases`,
`delete_phrase`, `add_text`, `list_texts`, `get_text`. Results are JSON text.

## Phases / owners

1. Orchestrator: scaffold, schema, wiring (done).
2. Agent A (Haiku): repo.js, auth.js, api.js, import.js + tests. ∥ Agent B (Haiku): UI port in `public/`.
3. Agent C (Haiku): mcp.js + tests (needs repo.js).
4. Orchestrator: Dockerfile, compose, Caddy, `.env`, deploy, import real data, end-to-end checks (API, UI via Playwright, MCP via client).
