# Zod contracts

A *contract* is the Zod schema for a shape that crosses a boundary. Contracts are the single source of truth for
validation, documentation (MCP tool descriptions) and types (JSDoc).

## Where contracts live

- `app/src/contracts/<domain>-contracts.js`, one file per domain (`word-contracts.js`, `rule-contracts.js`,
  `mistake-contracts.js`, `phrase-contracts.js`, `text-contracts.js`).
- `shared-contracts.js` holds the building blocks used by several domains: `identifierSchema`,
  `calendarDateSchema`, `articleSchema`, `learningStatusSchema`, and the text factories
  `createNonEmptyTextSchema()` and `createOptionalTextSchema()`. Building blocks that one MCP tool may use for
  several fields must be factories: the MCP SDK turns a reused schema instance into a JSON Schema `$ref`, which not
  every MCP client resolves.
- `environment-contracts.js` holds `environmentSchema`. `artifact-export-contracts.js` holds the shape of
  `dutch-export.json`, and `starter-data-contracts.js` holds the shapes of `starter/words.json` and
  `starter/rules.json`.
- Contract files import only `zod` and other contract files. No database, no Express, no MCP SDK.

## Naming

| Kind | Pattern | Example |
|---|---|---|
| Domain object returned to callers | `<entity>Schema` | `wordSchema`, `mistakePatternSchema` |
| Input to create | `create<Entity>InputSchema` | `createWordInputSchema` |
| Input to update (partial) | `update<Entity>InputSchema` | `updateWordInputSchema` |
| Other operation input | `<operation>InputSchema` | `recordPracticeResultInputSchema`, `logMistakeInputSchema` |
| List / search query | `list<Entities>QuerySchema` | `listWordsQuerySchema` |
| Path parameters | `<entity>PathParametersSchema` | `wordPathParametersSchema` |
| Enumerations | `<concept>Schema` + exported values `<CONCEPT>_VALUES` | `learningStatusSchema`, `LEARNING_STATUS_VALUES` |
| Type for JSDoc | PascalCase noun, from the schema | `/** @typedef {import('zod').infer<typeof wordSchema>} Word */` |

## Writing schemas

```js
// contracts/word-contracts.js
import { z } from 'zod';

import {
  articleSchema,
  createNonEmptyTextSchema,
  identifierSchema,
  learningStatusSchema,
} from './shared-contracts.js';

export const createWordInputSchema = z.object({
  dutchText: createNonEmptyTextSchema().describe('Dutch word or expression, e.g. "bestellen" or "hoe heet je?"'),
  ukrainianText: createNonEmptyTextSchema().describe('Ukrainian translation'),
  article: articleSchema.default('').describe("'de', 'het' or '' for none"),
  exampleDutch: z.string().trim().optional().describe('Dutch example sentence'),
  exampleUkrainian: z.string().trim().optional().describe('Ukrainian translation of the example'),
  sectionCode: z.string().trim().optional().describe("textbook chapter code, e.g. '6.1'"),
  topicName: z.string().trim().optional(),
  learningStatus: learningStatusSchema.default('new'),
}).strict();

export const updateWordInputSchema = createWordInputSchema.partial().strict()
  .refine(input => Object.keys(input).length > 0, 'at least one field is required');

export const wordSchema = createWordInputSchema.extend({
  id: identifierSchema,
  kind: z.enum(['word', 'expression']),
  errorCount: z.number().int().nonnegative(),
  addedAt: z.number().int(),
  updatedAt: z.number().int(),
});
```

Rules:
- **One schema per shape.** Variants are derived with `.pick()`, `.omit()`, `.partial()`, `.extend()` and
  `.merge()`. Copy-pasting a field list into a second file (as `mcp.js` and `repo.js` do today) is a violation.
- **Inputs are `.strict()`,** so an unknown key is an error instead of being silently dropped. That catches typos
  such as `artcle`.
- **Normalize in the schema:** `.trim()`, `.toLowerCase()` where the domain is case-insensitive, `.default()` for
  defaults, `z.coerce.number()` only for query strings and path parameters.
- **`.describe()` every field** that an MCP tool exposes. The description is what Claude reads, so write it for
  that reader.
- **Business rules that need the database** (for example "does this rule code exist") belong in the service, not in
  a `.refine()`.
- **Property names are camelCase** in every JSON payload: REST, MCP arguments and results, browser state. The
  repository maps snake_case columns to camelCase, and that mapping is the only place both spellings appear.

## Where contracts are parsed (boundaries)

| Boundary | Who parses | With |
|---|---|---|
| REST body, query, path parameters | the route adapter, before calling the service | `createWordInputSchema.parse(request.body)` etc. |
| MCP tool arguments | the MCP SDK, from `inputSchema: createWordInputSchema.shape` | the same schema as REST |
| Service entry | services trust adapter-parsed input; a service called from a CLI or another service gets already-parsed values | n/a |
| Environment | `environment-configuration.js` at start-up; failure stops the process with the issue list | `environmentSchema` |
| Files: artifact export, starter data | the import script, before touching the database | `artifactExportSchema`, `starterWordsSchema` |
| Database rows | the repository mapping (`mapWordRow`); in tests, assert `wordSchema.parse(result)` | `wordSchema` |
| Browser | no Zod (no build step). Forms do light checks; the server is the authority, and the API client treats a 400 response as a message to show | n/a |

- Use `schema.parse()` at boundaries and let the `ZodError` reach the adapter, which maps it to `ValidationError`.
  Use `safeParse()` only where a failure is an expected branch, not an error.
- Error messages list every issue as `path: message` joined by `; `, so a caller can fix all of them in one try.

## Contracts that other parties depend on

- MCP tool names and arguments are used by the claude.ai skills (`dutch-exercise-check`, `dutch-sentence-translation`)
  and by the MCP server instructions. REST fields are used by `public/scripts/api-client.js`. When a contract changes,
  update those users in the same change, and say so in the commit message.
- `starter/*.json` and the artifact page share a legacy field set (`nl`, `uk`, `art`, `ex`). It is described by
  `starter-data-contracts.js` as it is. Renaming those keys requires changing the artifact in the same commit.
- The artifact export format (`dutch-export.json`) is produced by claude.ai, so its schema describes it as it is and
  maps it to our names in the import service.
