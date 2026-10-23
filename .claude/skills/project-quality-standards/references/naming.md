# Naming

Names are explicit: a reader who has never seen the code understands what a name holds or does without looking it
up. Whole words, in English (UI text stays Ukrainian, but identifiers are English).

## No abbreviations

Spell every word out. The only short forms allowed are these acronyms, which are treated as words:

`id`, `url`, `html`, `css`, `json`, `sql`, `api`, `http`, `https`, `mcp`, `sse`, `utc`, `uuid`, `iso`

In camelCase, an acronym is capitalized like a word: `apiClient`, `mcpServer`, `htmlText`, `parseJson`,
`wordId`. Avoid two acronyms in a row.

Replacements for the short forms found in this codebase:

| Instead of | Write |
|---|---|
| `db` | `database` |
| `tx`, `tx(fn)` | `runInTransaction(operation)` |
| `err`, `e` | `error` |
| `req`, `res` | `request`, `response` |
| `i`, `j`, `idx` | `index`, `wordIndex`, `cardIndex` |
| `n`, `o`, `r`, `v`, `w`, `p`, `c` | the noun: `normalizedWord`, `options`, `parseResult`, `value`, `word`, `pattern`, `mistakeCase` |
| `q` | `searchText` |
| `opts` | `options` |
| `ts`, `now()` | `timestampMilliseconds`, `clock.now()` |
| `ins`, `stmt` | `insertWordErrorStatement` |
| `cur`, `tot`, `ok` (counter) | `currentQuestion`, `totalAnswers`, `correctAnswers` |
| `nl`, `uk` | `dutchText`, `ukrainianText` (data); `dutch`, `ukrainian` (language) |
| `art` | `article` |
| `ex` | `example`, `exampleDutch`, `exampleUkrainian` |
| `ch` | `sectionCode` |
| `err` (count) | `errorCount` |
| `ctx` | `context` |
| `esc` | `escapeHtml` |
| `$` | `findElementById` |
| `repo` | `wordRepository` (one per domain) |
| `msg` | `message` |
| `btn` | `button` |
| `cfg`, `conf` | `configuration` |
| `tmp`, `temp` | describe the content: `unsavedDraft` |

Single-letter names are allowed nowhere, including arrow parameters (`words.map(word => …)`) and loop indexes.

## Files and folders

| Kind | Rule | Examples |
|---|---|---|
| Folders | kebab-case; plural for collections of peers, singular for one concept | `domains/`, `contracts/`, `authentication/`, `model-context-protocol/` |
| JavaScript modules | kebab-case `<subject>-<role>.js`; the role says what the module is | `word-repository.js`, `word-service.js`, `word-routes.js`, `word-tools.js`, `session-cookie.js` |
| Pure logic modules | kebab-case noun phrase of the capability | `answer-checking.js`, `rule-body-rendering.js`, `levenshtein-distance.js` |
| Factory-only modules | `create-<thing>.js` | `create-application.js`, `create-mcp-server.js` |
| Entry points / CLIs | verb phrase | `start-server.js`, `import-artifact-export.js` |
| Tests | the module's name + `.test.js`, in a mirror folder under `test/` | `test/domains/words/word-service.test.js` |
| Test helpers | `<purpose>-test-helpers.js` | `database-test-helpers.js` |
| SQL migrations | `NNN-<verb>-<object>.sql`, three digits, never reused | `003-rename-word-text-columns.sql` |
| HTML pages | kebab-case noun | `index.html`, `login.html` |
| Stylesheets | kebab-case | `styles/application.css` |
| Markdown docs | `README.md` per folder; other docs UPPER_SNAKE_CASE (`PLAN.md`, `HANDOFF.md`) or kebab-case, consistent within a folder | |
| Data files | kebab-case noun, plural for lists | `starter/words.json`, `starter/rules.json` |
| Claude skills | `.claude/skills/<kebab-case-name>/SKILL.md` | `project-quality-standards` |

The file name matches its main export: `word-repository.js` exports `createWordRepository`.

## JavaScript identifiers

| Kind | Casing | Rule | Examples |
|---|---|---|---|
| Variables, parameters | camelCase | noun phrase of what it holds | `selectedWord`, `practiceMode`, `rulesWithMistakes` |
| Booleans | camelCase | `is`, `has`, `should`, `can`, `was` prefix | `isFlipped`, `hasMistakes`, `shouldSkipExisting` |
| Collections | camelCase | plural noun | `words`, `mistakeCases` |
| Maps / lookup objects | camelCase | `<value>By<key>` | `wordById`, `labelByLearningStatus`, `nextStatusByStatus` |
| Counts | camelCase | `<thing>Count` | `errorCount`, `remainingCardCount` |
| Quantities with units | camelCase | unit suffix, spelled out | `sessionMaximumAgeSeconds`, `pollingIntervalMilliseconds` |
| Timestamps | camelCase | `<event>At` (ms epoch), dates `<event>On` | `addedAt`, `occurredOn` |
| Functions | camelCase | verb first (see vocabulary) | `recordPracticeResult`, `renderRuleBody` |
| Factories | camelCase | `create<Thing>` | `createWordService` |
| Event handlers | camelCase | `handle<Element><Event>` | `handleWordFormSubmit`, `handleCardClick` |
| Module constants (fixed values) | UPPER_SNAKE_CASE | | `SESSION_COOKIE_NAME`, `MAXIMUM_FAILED_LOGINS` |
| Zod schemas | camelCase | `…Schema` (contracts.md) | `createWordInputSchema` |
| Classes (errors only) | PascalCase | noun + `Error` | `NotFoundError` |
| JSDoc types | PascalCase | noun | `Word`, `MistakePattern` |
| Private helpers | camelCase | not exported; no `_` prefix | `mapWordRow` |

### Function verb vocabulary

Use these verbs with these meanings, so the name tells the reader the behaviour:

| Verb | Meaning |
|---|---|
| `get…` | returns the item, **throws `NotFoundError`** if it is missing |
| `find…` | returns the item or `null`; `find…s` returns a possibly empty list |
| `list…` | returns a list, possibly filtered |
| `search…` | text search, ranked |
| `create…` | factory, or inserts a new record and returns it |
| `add…` | appends to a collection the caller owns (`addMistakeCase`) |
| `update…` | changes fields of an existing record |
| `delete…` | removes; returns nothing, or `{ deleted: true }` at the adapter |
| `record…` / `log…` | appends an event (`recordPracticeResult`, `logMistake`) |
| `calculate…`, `count…` | pure computation |
| `is…`, `has…`, `can…` | returns a boolean, no side effects |
| `parse…` | text or unknown → validated value, throws on failure |
| `format…`, `render…` | value → text / HTML |
| `map…` | converts one representation into another (`mapWordRow`) |
| `ensure…` | returns the existing record, or creates it (`ensureTopic`) |
| `publish…`, `subscribe…` | events |
| `start…`, `stop…` | begins / ends a long-running effect (server, timer) |
| `handle…` | event handler, adapter only |

## REST, MCP and events

| Element | Rule | Examples |
|---|---|---|
| REST paths | kebab-case plural nouns; sub-resources nested; actions as nouns | `/api/words/:wordId/practice-results`, `/api/mistake-patterns/:patternId/cases` |
| Path parameters | camelCase `<entity>Id` | `:wordId` |
| Query parameters | camelCase | `?learningStatus=learning&searchText=huis` |
| MCP tool names | snake_case `verb_object` (MCP convention) | `search_words`, `log_mistake` |
| MCP / REST JSON fields | camelCase | `errorCount`, `exampleDutch` |
| Change-event collections | kebab-case plural | `words`, `mistake-patterns` |

## Environment variables

UPPER_SNAKE_CASE, prefixed by what they configure, written out in full: `APPLICATION_PASSWORD`, `SESSION_SECRET`,
`API_TOKEN`, `MCP_SECRET`, `DATABASE_PATH`, `BACKUP_DIRECTORY`, `BACKUP_RETENTION_COUNT`. Every variable appears in
`.env.example` with a comment.

## Database elements

See `database.md`: tables plural snake_case, columns singular snake_case whole words, `<singular_table>_id`,
`<event>_at`, `<event>_on`, `is_<adjective>`, `index_<table>_on_<columns>`, `view_<purpose>`.

## HTML and CSS

See `html-and-css.md`: ids kebab-case `<area>-<element>[-<role>]`, BEM classes, `data-` attributes kebab-case,
CSS custom properties `--<category>-<name>`.
