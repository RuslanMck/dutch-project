# contracts

Zod schemas for every shape that crosses a boundary: REST bodies, queries and path parameters, MCP tool arguments, and the environment. Each shape has exactly one schema here; variants are derived with `.pick()`, `.omit()`, `.partial()` and `.extend()`. Files here import only `zod` and each other: no database, Express or MCP SDK.

## Files

| File | What it does |
|---|---|
| `shared-contracts.js` | Building blocks used by several domains: enumerations (learning status, article, word kind, practice mode, mistake source), ids, calendar dates and text fields. |
| `word-contracts.js` | Words: create, bulk add, update, status change, list and search, practice results, and word errors (by id or by lookup). |
| `rule-contracts.js` | Grammar rules: create, update, and lookup by id or code. |
| `mistake-contracts.js` | Mistake patterns and cases: list filters, create a pattern, add a case, and log a mistake. |
| `phrase-contracts.js` | Phrases: create one, add several, and list. |
| `text-contracts.js` | Bilingual texts: create and update. |
| `environment-contracts.js` | `environmentSchema`: the environment variables the app reads, with their defaults. |

## Conventions

- Field names are the current wire names (`nl`, `uk`, `example_nl`, `rule_code`, …). The move to camelCase is a separate, coordinated change (see `references/current-state.md` in the project-quality-standards skill).
- `.describe()` every field an MCP tool exposes; the description is what Claude reads.
- A schema that only MCP uses, because the tool's arguments differ from REST, is named `…ToolInputSchema` and derived from the REST schema.
- Text building blocks are factories (`createNonEmptyTextSchema()`, `createOptionalTextSchema()`): one schema instance used for two fields of an MCP tool would appear as a JSON Schema `$ref`, which not every MCP client resolves.
