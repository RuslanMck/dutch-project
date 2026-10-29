# Word-order exercise («Порядок слів»)

A Duolingo-style exercise: the Ukrainian sentence is shown, the Dutch words lie shuffled in a pile with 2–3 extra
words, and the learner taps them into the answer line in the right order. Tapping a word in the answer line puts it
back in the pile. It is a free exercise: answers are stored for choosing the next sentences, but they never change the
FSRS schedule of words or phrases.

Sentences are made in advance and stored. They come from three sources:

- `mcp`: the Claude Project calls `add_sentences` (prompt in `SENTENCE_GENERATION_PROMPT.md`).
- `import`: a `.md` file with the table of that prompt, uploaded on the page.
- `openrouter`: the «Згенерувати ще» button; the server asks an LLM through OpenRouter. Shown only when
  `OPENROUTER_API_KEY` is set.

## 1. Database: `migrations/009-add-word-order-sentences.sql`

```sql
CREATE TABLE order_sentences (
  id         INTEGER PRIMARY KEY,
  nl         TEXT NOT NULL,
  uk         TEXT NOT NULL,
  rule       TEXT CHECK (rule IN ('v2','inversion','question','modal','separable','negation','subordinate','perfect')),
  source     TEXT NOT NULL CHECK (source IN ('mcp','import','openrouter')),
  nl_key     TEXT NOT NULL UNIQUE,          -- normalizeSentenceKey(nl); duplicates are skipped
  added_at   INTEGER NOT NULL
);
CREATE TABLE order_sentence_answers (
  id           INTEGER PRIMARY KEY,
  sentence_id  INTEGER NOT NULL REFERENCES order_sentences(id) ON DELETE CASCADE,
  answered_at  INTEGER NOT NULL,
  is_correct   INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  answer       TEXT NOT NULL                -- the tiles joined by one space
);
CREATE INDEX index_order_sentence_answers_on_sentence_id ON order_sentence_answers(sentence_id, answered_at);
```

## 2. Pure modules: `src/domains/word-order/`

### `word-order-tiles.js`

- `RULES` – frozen array of the 8 rule names above.
- `splitIntoTiles(dutchSentence)` → array of strings. Split on whitespace; strip `.,?!;:"«»` from both ends of each
  token; drop empty tokens. Case is kept (`'Morgen gaan we naar de markt.'` → `['Morgen','gaan','we','naar','de','markt']`).
- `normalizeSentenceKey(dutchSentence)` → `splitIntoTiles(s).map(lower-case).join(' ')`. Also maps `’ʼ‘` and backtick to `'`.
- `isCorrectOrder({ answerTiles, dutchSentence })` → boolean: `answerTiles.map(lower).join(' ') === normalizeSentenceKey(dutchSentence)`
  (so duplicate words like `de … de` are interchangeable, and case and final punctuation are ignored).
- `validateSentence({ nl, uk })` → `null` when fine, else a Ukrainian reason string. Rules: nl and uk non-blank after trim;
  3–12 tiles; nl has no digits.
- `pickDistractors({ sentenceTiles, vocabulary, random = Math.random })` → 2 or 3 strings (3 when `random() < 0.5`).
  `vocabulary` is an array of Dutch words. Candidates: single tokens (no space, letters, `'` and `-` only), 2+ letters,
  whose lower-case form is not any sentence tile's lower-case form; no repeats (case-insensitive). Picked at random.
  Returns fewer when there are not enough candidates.
- `shuffleTiles(tiles, random = Math.random)` → a new array (Fisher–Yates). When the result equals the input order and
  there are 2+ distinct tiles, shuffle again (at most 10 tries).

### `sentence-markdown.js`

- `parseSentenceMarkdown(markdownText)` → `{ sentences: [{ nl, uk, rule }], errors: [string] }`.
  Finds the first Markdown table whose header row has a column named `Nederlands` (case-insensitive) and one named
  `Українською`; `Правило` is optional. Skips the separator row. Each data row: trims cells; a rule not in `RULES`
  becomes `null`. A row with a blank nl or uk adds an error `рядок N: …` (N = 1-based data row number). No table →
  `errors: ['не знайдено таблицю з колонками «Українською» і «Nederlands»']`. Cells may contain `\|`, which is a
  literal `|`.

### `sentence-generation-prompt.js`

- `buildGenerationMessages({ knownWords, otherWords, existingSentences, count })` → `[{ role:'system', content },
  { role:'user', content }]`. Content follows `docs/SENTENCE_GENERATION_PROMPT.md`'s rules (level, length, word-order
  rules spread, the main order plus its alternatives (§9), no commas in nl, no digits/names, end with . or ?), lists
  `knownWords` (learning/learned, the words every sentence must draw on), `otherWords` (more vocabulary allowed) and up
  to 200 `existingSentences` not to repeat, and asks for JSON only:
  `{"sentences":[{"nl":"…","uk":"…","rule":"…","structure":[…],"alt_orders":["…"]}]}` with exactly `count` items.
- `parseGeneratedSentences(responseText, { count })` → array of `{ nl, uk, rule }`, at most `count`. Accepts the JSON
  object, also inside a ```` ```json ```` fence, or the text from its first `{` to its last `}`; throws
  `ValidationError('відповідь моделі не JSON')` otherwise. Items without string nl/uk
  are dropped; an unknown rule becomes null.

## 3. OpenRouter client: `src/integrations/openrouter-client.js`

`createOpenRouterClient({ apiKey, model, fetchFunction = fetch, timeoutMilliseconds = 90000 })` → `{ isConfigured,
completeChat(messages) }`. `isConfigured` is `!!apiKey`. `completeChat` POSTs to
`https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer`, `{ model, messages, response_format:
{ type: 'json_object' } }`, an `AbortSignal.timeout`, and returns `choices[0].message.content`. A non-2xx response or
a network error throws `Error('OpenRouter: <status or message>')`; never include the key in errors or logs.

Environment (`environment-contracts.js`, `environment-configuration.js`, `.env.example`):
`OPENROUTER_API_KEY` (default `''`) → `openRouterApiKey`; `OPENROUTER_MODEL` (default `anthropic/claude-sonnet-4.5`)
→ `openRouterModel`. Both are trimmed; a blank key means not configured, a blank model means the default. Neither is required.

## 4. Repository, service

`word-order-repository.js` (`createWordOrderRepository({ database })`), SQL only:
- `insertSentence({ nl, uk, rule, source, nlKey, addedAt })` → id, or `null` when nl_key exists (`INSERT … ON CONFLICT(nl_key) DO NOTHING`).
- `findSentenceById(id)`, `deleteSentence(id)`.
- `listSentencesNewestFirst()` → rows with `times_answered`, `times_correct`, `last_answered_at` (LEFT JOIN aggregate).
- `listSentencesForSet(limit)` → rows ordered: last answer wrong first (by last_answered_at desc), then never answered
  (by added_at asc), then the rest by last_answered_at asc. Ties by `random()`.
- `listVocabulary()` → `[{ nl, status }]` of all words.
- `createAnswer({ sentenceId, answeredAt, isCorrect, answer })`.
- `countSentences()`.

`word-order-service.js` (`createWordOrderService({ wordOrderRepository, openRouterClient, runInTransaction,
changeEventBus, clock, random = Math.random })`); publishes `'word-order'` after changes:
- `addSentences(inputs, { source })` → `{ added: [sentence], skipped: [{ nl, reason }] }`. Each input is validated
  (`validateSentence`); invalid ones and duplicates (reason `'вже є'`) are skipped, not thrown. One transaction.
- `importMarkdown(markdownText)` → `parseSentenceMarkdown`; when it finds no sentences, throws `ValidationError` with its
  errors joined; else `{ ...addSentences(sentences, { source: 'import' }), errors }`.
- `generateSentences({ count = 20 })` → throws `ValidationError('OpenRouter не налаштовано')` when not configured;
  builds messages from vocabulary (knownWords = all with status learning/learned; otherWords = the rest, shuffled with `random`, first 300) and the
  existing sentences; calls the client; parses; `addSentences(…, { source: 'openrouter' })`.
- `listSentences({ limit })` → newest first: `{ id, nl, uk, rule, source, added_at, times_answered, times_correct,
  last_answered_at }`.
- `deleteSentence(id)` → NotFoundError when missing.
- `getSentenceSet({ size = 10 })` → `{ sentences: [{ id, uk, rule, tiles: [string] }], total, can_generate }`. Tiles =
  `shuffleTiles([...splitIntoTiles(nl), ...pickDistractors(...)])` with vocabulary = all word nl. The Dutch sentence is
  not sent.
- `answerSentence({ id, tiles })` → records the answer; returns `{ is_correct, correct_nl, correct_tiles }`.

## 5. Adapters

Contracts `src/contracts/word-order-contracts.js`: sentence input `{ nl, uk, rule?: enum|null }`;
`addSentencesInputSchema { sentences: 1..200 }`; `answerInputSchema { tiles: array of non-empty strings, 1..20 }`;
`importInputSchema { markdown: string 1..200000 }`; `generateInputSchema { count?: 5..30 }`; list `{ limit?: 1..5000 }`;
path `{ id }`.

REST `word-order-routes.js` under `/api`:

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/word-order/sentences` | | `listSentences()` |
| POST | `/word-order/sentences` | `{ sentences }` | 201 `addSentences(…, {source:'mcp'})` |
| DELETE | `/word-order/sentences/:id` | | `{ ok: true }` |
| GET | `/word-order/set` | | `getSentenceSet()` |
| POST | `/word-order/sentences/:id/answer` | `{ tiles }` | `answerSentence` |
| POST | `/word-order/import` | `{ markdown }` | `importMarkdown` |
| POST | `/word-order/generate` | `{ count? }` | `generateSentences` |

MCP `word-order-tools.js`: `add_sentences`, `list_sentences` (default limit 100), `delete_sentence` (destructive),
`get_word_order_set` (read-only; returns the set), `check_word_order` (`{ id, tiles }` → answerSentence),
`generate_sentences` (`{ count? }`). Wire into `create-domain-services.js`, `create-api-router.js`,
`create-mcp-server.js`; describe the tools in `mcp-instructions.js` and `docs/CLAUDE_PROJECT_INSTRUCTIONS.md`.

## 6. Page (`public/`)

Drawer link `Порядок слів` (`data-tab="word-order"`), after `Фрази`. Section `#tab-word-order`:

- Progress `Речення 3 з 10`, the Ukrainian sentence (large), the answer line (a bordered area with tiles, min height
  of two tile rows; placeholder «Натискай слова знизу»), the pile (tiles as buttons; a used tile leaves an empty
  placeholder of its size in the pile so the pile does not jump).
- `Перевірити` (disabled while the answer line is empty). Right → green «Правильно ✓», wrong → red with «Правильно:
  <correct_nl>»; then `Далі`. After the last one: «Готово: 8 з 10 правильно» and `Ще 10`.
- Empty state (no sentences): text pointing to the Claude Project prompt and the buttons below.
- Below, a «Речення (N)» block: `Згенерувати ще 20` (only when `can_generate`; shows «Генерую…» while waiting),
  `Імпорт .md` (file input, `.md,text/markdown,text/plain`; reports «Додано X, пропущено Y»), and a collapsible list
  of sentences (uk / nl, `✓ 3 / 4`) with a delete button each (confirm first).
- Pure state in `logic.js`: `createWordOrderState(tiles)` → `{ pile: [{ index, text, used }], answer: [index] }`;
  `placeTile(state, index)`, `returnTile(state, answerPosition)` (both return new state); `readAnswerTiles(state)` →
  strings. Tiles are buttons (keyboard works), min 44px tall.
- `api.js`: `getWordOrderSet`, `answerWordOrder(id, tiles)`, `listOrderSentences`, `deleteOrderSentence`,
  `importOrderSentences(markdown)`, `generateOrderSentences(count)`.

## 7. Tests

- `test/word-order-logic.test.js`: the pure modules of §2.
- `test/word-order.test.js`: service + REST + MCP with the existing test helpers (OpenRouter faked with a
  `fetchFunction`).
- `test/ui-logic.test.js`: the logic.js state functions.

## 8. Rule filter and sentence schema

### 8.1 Schema (structure) of a sentence

Each sentence may have a `structure`: the sentence split into ordered segments, each with a Ukrainian role, e.g.
`[{ text: 'Deze week', role: 'час' }, { text: 'ben', role: 'дієслово' }, { text: 'ik', role: 'підмет' },
{ text: 'jarig', role: 'прикметник' }]`. Shown after every answer as the schema `час > дієслово > підмет > прикметник`
with each segment's Dutch above its role.

- Roles (recommended list, `STRUCTURE_ROLES` in word-order-tiles.js): підмет, дієслово, модальне дієслово, допоміжне
  дієслово, інфінітив, дієприкметник, відокремлювана частина, додаток, прикметник, час, місце, спосіб, причина,
  заперечення, сполучник, питальне слово, частка (particle or modal word: misschien, ook, toch, maar, even, wel, eens).
  Another short role (1–30 chars) is kept as given.
- Migration `010-add-sentence-structure.sql`: `ALTER TABLE order_sentences ADD COLUMN structure TEXT;` (JSON array,
  NULL = no schema).
- `normalizeStructure({ nl, structure })` (word-order-tiles.js) → the cleaned array (texts and roles trimmed; roles
  lower-cased) or `null` when missing/invalid. Valid when 1–12 segments, each with non-blank text and role, and
  `normalizeSentenceKey(segments' texts joined by ' ')` equals `normalizeSentenceKey(nl)`. A segment whose text has no
  word in it (punctuation only) makes it invalid. Segment texts are kept as written.
- `parseStructureText(text)` (sentence-markdown.js) → array or null. Format: segments joined by ` + ` (the spaces are
  optional: `Ik (підмет)+ga (дієслово)` works), each `<Dutch> (<role>)`, e.g.
  `Deze week (час) + ben (дієслово) + ik (підмет) + jarig (прикметник)`. The role is the last `(...)` of a segment, so
  Dutch text may hold brackets; backticks and `*`/`_` around a text or role are dropped.
- Markdown table: optional column `Схема` in that format (emphasis/backticks stripped as for other cells).
- Service `addSentences`: input may carry `structure` (array). Invalid structure → sentence still added without it,
  plus a warning `{ nl, reason: 'схема не збігається з реченням' }`. On a duplicate whose stored structure is NULL and
  the input has a valid one, fill structure (and rule when stored rule is NULL) → reported in `updated` (a sentence
  added earlier in the same call stays in `added` only, in its latest state). Result:
  `{ added, updated, skipped, warnings }`. `importMarkdown` returns the same plus `errors`.
- `updateSentence({ id, uk?, rule?, structure? })` → the sentence; invalid structure → ValidationError. REST
  `PATCH /word-order/sentences/:id`; MCP `update_sentence`.
- `answerSentence` also returns `rule` and `structure` (array or null). `listSentences` rows include `structure`.
- OpenRouter prompt and response: each item also has `structure` (array of `{ text, role }`, roles from the list);
  `parseGeneratedSentences` keeps it (array or null).
- MCP `add_sentences` schema: `structure` optional array of `{ text, role }`; description explains it with an
  example and the role list. `docs/SENTENCE_GENERATION_PROMPT.md` asks for the `Схема` column and passes
  `structure` to add_sentences.

### 8.2 Rule filter

- `getSentenceSet({ size = 10, rules })`: `rules` = array of rule names and/or `'none'` (sentences without a rule);
  missing, empty or with no valid name = all (unknown names are dropped first). Only matching sentences are chosen (same ordering as before). Response adds
  `rule_counts: { v2: n, …, perfect: n, none: n }` over all sentences, and `total` = matching count.
- REST `GET /word-order/set?rules=v2,inversion,none` (unknown names ignored; empty or unknown-only = all rules). MCP `get_word_order_set` gets an
  optional `rules` array.
- Page: above the exercise, a dropdown (a `<details>` with a summary «Правила: усі» / «Правила: 3 з 9») holding a
  checkbox per rule with its Ukrainian name and count, plus «Усі» / «Жодного» shortcuts. Names: v2 «Дієслово на 2-му
  місці», inversion «Інверсія», question «Питання», modal «Модальне дієслово + інфінітив», separable
  «Відокремлювані дієслова», negation «niet / geen», subordinate «Підрядне речення», perfect «Минулий час
  (perfectum)», none «Без правила». Rules with 0 sentences are shown disabled. The choice is kept in localStorage
  (try/catch) and changing it loads a new set (when nothing is checked, show «Обери хоча б одне правило» and no set).
- After «Перевірити»: under the right/wrong message, the rule's Ukrainian name and the schema: segments in a row
  that wraps, each a small box with the Dutch on top and the role below, `>` between boxes, and a text line
  `час > дієслово > підмет > прикметник`. Each role has a consistent colour from a small palette (existing tokens; 
  readable in light and dark). No schema → nothing shown.

## 9. Several correct word orders

Dutch often allows more than one natural order (a time/manner adverbial at the front or after the verb; a
subordinate clause before or after the main clause). A sentence therefore has a list of accepted orders.

### 9.1 Model

- `orders` (API, `string[][]`): the accepted orders as tile lists. `orders[0]` is the canonical order =
  `splitIntoTiles(nl)`; the rest come from the stored alternatives. `nl` stays the canonical sentence and the source
  of the pile's tiles.
- Migration `011-add-alternative-word-orders.sql`: `ALTER TABLE order_sentences ADD COLUMN alt_orders TEXT NOT NULL
  DEFAULT '[]';` — a JSON array of alternative sentences (strings, as written, e.g. `"Omdat ik dorst heb, neem ik een
  drankje."`). Existing sentences get `[]`, so their `orders` is `[current order]`. Schema rows are unaffected.
- Tile comparison ignores case and punctuation (as `isCorrectOrder` already does), because a fronted clause changes
  capitals and adds a comma. Words themselves must match exactly.

### 9.2 Pure functions (word-order-tiles.js)

- `isSameWordMultiset(tilesA, tilesB)` → boolean: same tiles with the same counts, compared lower-case with
  apostrophes normalised (the `normalizeSentenceKey` mapping).
- `normalizeAltOrders({ nl, altOrders, structure })` → `{ altOrders: string[], rejected: [{ order, reason }] }`.
  Each alternative (string, trimmed; also accepts an array of tiles, joined by spaces) is rejected when:
  blank → `'порожній порядок'`; not the same word multiset as `nl` → `'інші слова, ніж у реченні'`; its key equals
  `nl`'s key or an earlier alternative's → `'такий порядок уже є'`; `structure` is given and the alternative is not
  a concatenation of the structure's segments in some order (each segment's tiles contiguous, every segment used
  once; compare lower-case) → `'не збігається зі схемою'`. Max 5 alternatives (rest rejected `'забагато порядків'`).
- `listAcceptedOrders({ nl, altOrders })` → `string[][]` = `[splitIntoTiles(nl), ...altOrders.map(splitIntoTiles)]`.
- `findMatchingOrderIndex({ answerTiles, orders })` → index of the first order equal to the answer (lower-case,
  apostrophes normalised), or `-1`. `isCorrectOrder` stays for compatibility (canonical only).

### 9.3 Service and adapters

- `addSentences`: input may carry `alt_orders` (array of strings or tile arrays; a single string is one order).
  Authoring is strict for alternatives: if any alternative is rejected, the whole sentence is skipped with reason
  `'альтернативний порядок: <reason> («<order>»)'` (the sentence is not added half-checked). Validation uses the
  sentence's valid structure if it has one. Source `openrouter` (generated) instead drops each rejected alternative
  with a warning and keeps the sentence. Fill-on-repeat (§8.1) also fills `alt_orders` when the stored list is
  empty and the input's alternatives are usable → `updated`. Fill-on-repeat of a missing schema is refused (a
  warning names the alternative) when a stored alternative does not fit that schema. When the stored list is
  non-empty and the input's differs, the input is ignored with a warning (change it with `update_sentence`).
- `updateSentence({ id, uk?, rule?, structure?, alt_orders? })`: alternatives validated against the stored `nl` and
  the resulting structure; any rejection → `ValidationError` with the reason. Changing `structure` re-checks the
  stored alternatives; a mismatch → `ValidationError`.
- `getSentenceSet` items add `order_count` (number of accepted orders; the orders themselves are not sent).
- `answerSentence` returns, in addition: `matched_order` (index or `-1`), `orders` (`string[]`, each accepted order
  as tiles joined by spaces, canonical first), `has_other_orders` (`orders.length > 1`). `is_correct` = `matched_order
  >= 0`. `correct_nl` stays the canonical sentence. The stored answer row is unchanged.
- `listSentences` rows add `alt_orders` (strings) and `order_count`.
- Markdown import: optional column `Інші порядки`: alternatives separated by `;` (spaces around it optional); an empty cell, a dash (`—`, `–`, `-`) or `немає`/`none`
  = none. A rejected
  alternative skips that sentence with the reason (row number in the reason).
- OpenRouter generation: the prompt asks for `alt_orders` (all other natural orders, may be empty) and parses them.
- Contracts: `alt_orders` optional, lenient in `add_sentences` (any value; validated in the service), strict in
  `update_sentence` (array of strings, max 5).
- MCP: `add_sentences`, `update_sentence`, `generate_sentences` descriptions explain `alt_orders` with the example
  `nl: "Ik neem een drankje omdat ik dorst heb."`, `alt_orders: ["Omdat ik dorst heb, neem ik een drankje."]`, and
  that every alternative must use exactly the same words and the same schema segments. `check_word_order` describes
  the new fields. Docs: `SENTENCE_GENERATION_PROMPT.md` replaces «Only one correct word order…» with: list every
  other natural order in the `Інші порядки` column (and `alt_orders`), keeping the same words and segments; prefer
  the most neutral order as the main one. Also `mcp-instructions.js`, `CLAUDE_PROJECT_INSTRUCTIONS.md`.

### 9.4 Page

- Under the Ukrainian sentence, a small label from `order_count`: `Один правильний порядок` (1) or `Можливо кілька
  порядків` (>1).
- After «Перевірити»:
  - correct, `matched_order === 0`: «Правильно ✓» (as now).
  - correct, `matched_order > 0`: «Правильно ✓» and a muted line «Основний варіант: <orders[0]>».
  - wrong: «Правильно: <correct_nl>»; when `has_other_orders`, also «Є й інші правильні варіанти:» followed by the
    other orders (orders[1..]) as a short list.
  - The schema shown is always the canonical one (as now).
- Sentences list shows the alternatives under each sentence (muted, «також: …»).

### 9.5 Tests

- One order: only the canonical tiles are accepted; any other permutation → `is_correct: false`, `matched_order -1`.
- Two orders: both accepted (`matched_order` 0 and 1); a third permutation rejected.
- Authoring: an alternative with a different word set → sentence skipped (add_sentences / import) or ValidationError
  (update_sentence); an extra or missing word rejected; a case/punctuation-only difference is NOT a different word
  set; a duplicate of the canonical order rejected; an alternative that breaks the schema's segments rejected.
- Migration: existing sentences have `alt_orders = '[]'` and `order_count` 1.
- Page logic: label from order_count; feedback lines for the three cases.
