# domains

The app's data, business rules and their adapters, one folder per domain. Inside a domain, the *repository* holds the SQL and maps rows to the shape returned to callers; the *service* holds the business rules, opens transactions and publishes change events; the *routes* (REST) and *tools* (MCP) parse input with the contracts and call the same service functions, never the repositories.

## Files

| File | What it does |
|---|---|
| `blank-text.js` | `mapBlankTextToNull`: optional text that is missing or only whitespace is stored as NULL. Pure. |

## Folders

| Folder | Purpose |
|---|---|
| `words/` | Dictionary words and expressions, their errors, practice results and topics. |
| `practice/` | FSRS practice: the batch and grades, each word's schedule, the daily new-word quota and priorities, the frequency list, and the migration to FSRS. |
| `rules/` | Grammar rules, found by id or code. |
| `mistakes/` | Mistake patterns and their cases. |
| `phrases/` | Stable Dutch phrases with their context. |
| `word-order/` | The word-order exercise: stored Dutch sentences (from MCP, a Markdown import or an LLM through OpenRouter), the shuffled set with distractor words, and the answers. |
| `texts/` | Bilingual texts such as textbook dialogues. |
| `sections/` | Textbook sections, created on demand by the other domains. |
| `statistics/` | Counts across all collections. |
| `artifact-export/` | Export to, and import from, the claude.ai artifact's JSON format. |

## Conventions

- Every module exports one `create…` factory that receives its dependencies as one object and returns a frozen object of functions.
- A domain may call another domain's service, never its repository.
- Repositories use bound parameters only; column names are composed only from constants.
- Rows still use the current wire names (`nl`, `uk`, `example_nl`, …). The camelCase rename is a separate, coordinated change.

## How to add a domain

1. Create `domains/<domain>/` with `<domain>-repository.js` and `<domain>-service.js`, each exporting a `create…` factory.
2. Add its contracts in `contracts/<domain>-contracts.js`.
3. Wire it in `server/create-domain-services.js`.
4. Add `<domain>-routes.js` (mount it in `server/create-api-router.js`) and `<domain>-tools.js` (register it in `model-context-protocol/create-mcp-server.js`).
5. Add a README for the folder and a row in this one.
