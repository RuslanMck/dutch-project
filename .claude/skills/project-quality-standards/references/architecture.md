# Architecture: isolation, factories, separation of control

## Target structure of `app/`

```
app/
  src/
    server/                         composition root: the only place with side effects at start-up
      start-server.js               entry point: reads configuration, creates the application, listens
      create-application.js         wires database → repositories → services → adapters into an Express app
    configuration/
      environment-configuration.js  parses process.env with environmentSchema and returns a frozen object
    contracts/                      Zod schemas, one file per domain plus shared building blocks
      shared-contracts.js
      word-contracts.js  rule-contracts.js  mistake-contracts.js  phrase-contracts.js  text-contracts.js
      artifact-export-contracts.js  environment-contracts.js
    database/
      create-database-connection.js opens SQLite with the pragmas
      run-database-migrations.js    applies migrations/*.sql in order
      run-in-transaction.js         transaction helper that maps constraint failures to ConflictError
    errors/
      domain-errors.js              NotFoundError, ValidationError, ConflictError
    domains/
      words/
        word-repository.js          SQL for words and word_errors; maps rows ⇄ domain objects
        word-service.js             business rules: status changes, practice results, duplicate detection
        word-routes.js              REST adapter: parses the request, calls the service, sends JSON
        word-tools.js               MCP adapter: registers the word tools
        expression-detection.js     pure: decides kind 'word' | 'expression'
      rules/  mistakes/  phrases/  texts/   same split
    authentication/
      session-cookie.js             sign / verify the session cookie (pure, takes the secret)
      login-rate-limiter.js         failed-login counter (factory with its own state)
      authentication-routes.js      /login, /auth/login, /auth/logout
      require-authentication.js     middleware factory
    model-context-protocol/
      create-mcp-server.js          builds an McpServer and asks each domain to register its tools
      mcp-routes.js                 Streamable HTTP endpoint and its secret/bearer check
      mcp-instructions.js           the server instructions text
    change-events/
      change-event-bus.js           in-process publish/subscribe of "collection changed"
      server-sent-events-routes.js  GET /api/events
    backups/
      database-backup-scheduler.js  daily online backup with retention
  public/                           browser code, no build step (see html-and-css.md)
    index.html  login.html  manifest.webmanifest  icon.svg
    styles/  application.css
    scripts/
      application.js                browser composition root: creates the API client, state store and tabs
      api-client.js                 fetch wrapper and live-update subscription
      state-store.js                in-memory collections and change notifications
      tabs/  word-table-tab.js  flashcards-tab.js  practice-tab.js  rules-tab.js  phrases-tab.js  texts-tab.js
      logic/ answer-checking.js  rule-body-rendering.js  html-escaping.js  levenshtein-distance.js
  scripts/
    import-artifact-export.js       CLI: reads a file, parses it with the contract, calls the import service
  migrations/                       numbered SQL files (database.md)
  test/                             mirrors src/ and public/scripts/ (one test file per module)
```

Folders group by **domain first, layer second**. A change to "how words work" stays inside `domains/words/`.

## Layers and the direction of dependencies

```
adapters (word-routes.js, word-tools.js, browser tabs)
   ↓ call
services (word-service.js)                 ← business rules, transactions, change events
   ↓ call
repositories (word-repository.js)          ← SQL only, row ⇄ object mapping
   ↓ use
database connection (injected)
```

- **Repositories** contain SQL and mapping, nothing else. They make no decisions about status, never validate
  business rules and never publish events. Every query uses bound parameters (`@name` or `?`); never build SQL with
  values in the string. Column lists may be composed from constants, but never from user input.
- **Services** own the rules (for example: "a correct answer moves learning → learned, new stays new"). They open
  transactions, call one or more repositories and publish change events after commit. They do not know HTTP or MCP.
- **Adapters** translate a transport into a service call: parse the input with the contract, call the service, and
  shape the response. They contain no SQL and no business rules. REST routes and MCP tools for the same operation call
  the **same** service function. That is how the REST API and MCP stay consistent.
- **Pure modules** (`expression-detection.js`, `answer-checking.js`, `rule-body-rendering.js`) take values and
  return values. No I/O, no clock, no randomness: pass `now` or a random source in as a parameter, which keeps them
  testable.
- A domain may call another domain's **service**, never its repository. For example, the mistakes service asks the
  rules service to resolve a rule code.

## Factories and inversion of control

Every module with dependencies or state exports a `create…` factory. The factory takes its dependencies as one
named-parameter object and returns a frozen object of functions. Prefer factories over classes; use a class only for
error types or when a library requires one.

```js
// domains/words/word-repository.js
export function createWordRepository({ database }) {
  const selectWordById = database.prepare(`${WORD_SELECT} WHERE words.id = @wordId`);

  function findWordById(wordId) {
    const row = selectWordById.get({ wordId });
    return row ? mapWordRow(row) : null;
  }

  return Object.freeze({ findWordById /* , … */ });
}
```

```js
// domains/words/word-service.js
export function createWordService({ wordRepository, runInTransaction, changeEventBus, clock }) {
  function recordPracticeResult(wordId, practiceResult) {
    const updatedWord = runInTransaction(() => {
      const word = wordRepository.findWordById(wordId);
      if (!word) throw new NotFoundError(`word ${wordId} not found`);
      // … business rule …
      return wordRepository.findWordById(wordId);
    });
    changeEventBus.publishChange('words');
    return updatedWord;
  }

  return Object.freeze({ recordPracticeResult });
}
```

```js
// server/create-application.js (composition root; the only file that knows every concrete implementation)
export function createApplication({ configuration, database }) {
  const changeEventBus = createChangeEventBus();
  const runInTransaction = createTransactionRunner({ database });
  const wordRepository = createWordRepository({ database });
  const wordService = createWordService({ wordRepository, runInTransaction, changeEventBus, clock: Date });
  // … other domains …
  const application = express();
  application.use('/api/words', createWordRoutes({ wordService }));
  return application;
}
```

Rules:
- Factory names are `create<Thing>`, and the returned object is named after the thing (`wordService`, not
  `service`).
- Factories have no side effects beyond preparing statements and creating their own private state. Starting timers,
  listening on ports and reading files happen in the composition root, or in a `start…` function it calls.
- No module-level mutable state (no `let shared`, no `getDb()`/`setDb()`). Tests build their own graph with an
  in-memory database, so test isolation comes for free.
- The browser follows the same shape: `application.js` creates `apiClient`, `stateStore` and each tab with
  `create…Tab({ rootElement, apiClient, stateStore })`. A tab renders and handles only its own section.

## Separation of control

- **Configuration** is read once, in `environment-configuration.js`, parsed with `environmentSchema` and passed
  down. No other module touches `process.env`.
- **Time, randomness, IDs** are injected (`clock`, `randomSource`) wherever results depend on them.
- **Side effects at import time are forbidden.** Importing a module never opens a database, reads env, registers
  routes or starts timers.
- **Change notification** is a dependency (`changeEventBus`), published by services after a successful commit. SSE
  and other listeners subscribe in the composition root.

## Errors

- `errors/domain-errors.js` defines `ValidationError` (bad input), `NotFoundError` and `ConflictError` (constraint
  or duplicate). Services and repositories throw only these, or let unexpected errors propagate.
- Only adapters translate them. REST: one error-handling middleware maps `ValidationError` → 400,
  `NotFoundError` → 404, `ConflictError` → 409, anything else → 500, with `{ "error": message }`, and logs the
  unexpected ones. MCP: the tool wrapper returns `{ isError: true }` with the message.
- No HTTP status codes below the adapter layer, so `error.status = 400` inside a repository is a violation.
- Never swallow an error silently. Catch only to translate, add context, or clean up, then rethrow.

## Size limits (guides, not hard limits)

- A function fits on one screen (≈ 40 lines). Longer ones are split into named steps.
- A module stays under ≈ 300 lines. Past that, it usually has more than one responsibility.
- A function takes at most 3 positional parameters. Past that, use one named-parameter object.

## Exceptions

- `artifact/dutch-materials.html` must stay a single self-contained file, because claude.ai artifacts are one page.
  Inside it, keep the same separation as functions and sections (data access, state, rendering per tab, pure logic),
  in that order, each under a comment header.
- `scripts/` CLIs may read `process.argv` and files directly; they still delegate the work to services.
