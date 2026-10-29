# Custom practice and decks («Колоди»)

Extra drilling that never changes a word's schedule: only the regular daily practice grades words. Two entry points:

1. **After a set**: the round summary («Вітаємо! Набір завершено») offers «Повторити важкі (n)» and «Важкі й середні
   (n)» next to «Наступний набір». They drill those words of the finished set.
2. **Decks**: a menu section «Колоди» where the learner builds named word lists and drills them any time.

Both use one client-side **custom drill**: round 1 UA → NL, then round 2 NL → UA (as in the daily practice), nothing
posted to the grading endpoints.

## 1. Custom drill (page, `public/`)

Generalise the existing struggling-words drill (`createStrugglingDrill`, `startStrugglingDrill`, …, app.js «3b · Важкі
слова») into a custom drill used by the struggling drill, the round-summary buttons and decks:

- `startCustomDrill({ title, words })` — `words` in the practice-word shape (`id, uk, nl, article, kind, …`). Practice
  mode `'custom'` on the «Практика» tab (the struggling drill becomes a custom drill with title «Важкі слова»).
- Round 1 (UA → NL): every word until typed right once; a wrong word comes back later (existing `advanceDrillQueue`).
  Checked with `gradeTranslationAnswer`, «Не знаю» reveals.
- Round 2 (NL → UA): the same words in a new order whose first word is not the last word of round 1 (`orderNextRound`
  or the same idea). Checked strictly with `gradeReverseTranslationAnswer`; a wrong answer shows «Я мав рацію» (counts
  as right, in the drill only) and «Далі».
- Progress line: `<title> · Раунд 1 з 2 · UA → NL · Залишилось: 7` (reuse the daily formatter where possible).
- End: «Готово!» with `правильно з першого разу: UA → NL x з n · NL → UA y з n`, buttons «Ще раз» (same words,
  new order) and «Назад» (back to where the drill started: the round summary, the deck list, or the normal practice).
- A visible note under the progress line: «Тренування — розклад слів не змінюється».
- Nothing is posted: no grade, no deck answer, no review log (a test asserts the drill code calls no grading API).
- Deleted words leave the drill (as today for the struggling drill).

Round-summary buttons: `round.words` carry `difficulty` (`easy|medium|hard`). «Повторити важкі (n)» = hard; «Важкі й
середні (n)» = hard + medium; each hidden when n = 0. The drill words come from `GET /api/practice/drill-words?ids=…`.

## 2. Server

### 2.1 Drill words

`GET /api/practice/drill-words?ids=1,2,3` (max 1000 ids, a deck's size; unknown ids skipped) → `{ words: [practice word] }`
in the given order, the same shape as the batch words (`mapToPracticeWord`). All ids are read in one query. Read-only.

### 2.2 Decks — migration `012-add-custom-decks.sql`

```sql
CREATE TABLE custom_decks (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX unique_index_custom_decks_on_name ON custom_decks(name COLLATE NOCASE);
CREATE TABLE custom_deck_words (
  deck_id   INTEGER NOT NULL REFERENCES custom_decks(id) ON DELETE CASCADE,
  word_id   INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (deck_id, word_id)
);
CREATE INDEX index_custom_deck_words_on_word_id ON custom_deck_words(word_id);
```

Domain `src/domains/decks/` (repository, service, routes, tools, README), contracts `src/contracts/deck-contracts.js`,
wired like the other domains. Publishes change collection `'decks'`.

- `listDecks()` → `[{ id, name, description, word_count, created_at, updated_at }]`, newest updated first.
- `getDeck(id)` → deck + `words` (catalog rows, §2.3) in the order added. NotFoundError when missing.
- `createDeck({ name, description, word_ids })`: name trimmed and NFC-normalised, 1–80 chars, unique ignoring case
  (ConflictError «Колода з такою назвою вже є»); description optional ≤ 500; `word_ids` 1–1000, unknown ids →
  ValidationError listing them; duplicates ignored.
- `updateDeck(id, { name?, description?, word_ids?, add_word_ids?, remove_word_ids? })`: `word_ids` replaces the list;
  add/remove change it. The name is trimmed and NFC-normalised as in create. A deck may not end with 0 words
  (ValidationError).
- A deck holds at most 1000 words, checked after create and after every update (including `add_word_ids`): more is a
  ValidationError «у колоді може бути щонайбільше 1000 слів», and the change is not saved.
- `deleteDeck(id)`.

REST under `/api`: `GET /decks`, `POST /decks` (201), `GET /decks/:id`, `PATCH /decks/:id`, `DELETE /decks/:id`,
`GET /decks/word-catalog`.

MCP tools: `list_decks`, `get_deck`, `create_deck`, `update_deck`, `delete_deck` (destructive). Describe them in
`mcp-instructions.js` and `docs/CLAUDE_PROJECT_INSTRUCTIONS.md` (decks are for extra drilling and never change the
schedule; Claude can build a deck from e.g. `get_struggling_words` or a section).

### 2.3 Word catalog (for the picker)

`GET /api/decks/word-catalog` → `{ words: [{ id, nl, article, uk, section, status, difficulty, mistake_count,
answer_count, last_practiced_on }] }`, all words, sorted by `nl`.

- `answer_count`: all counting answers of the word ever (`deck_answers` rows with `superseded_at IS NULL`, both
  directions), the lifetime count.
- `mistake_count`: the mistakes among the word's last 10 counting answers (newest first by `answered_at`, then `id`),
  so a long-practised word does not drift to hard on old mistakes. A mistake = a grade other than good, the same as
  the round summary's notion. Fewer than 10 answers: all of them count.
- `difficulty`: `null` when never answered, else `classifyDifficulty(mistake_count)` from `round-summary.js`
  (0 → easy, 1–2 → medium, ≥3 → hard).
- `last_practiced_on`: calendar date (practice time zone) of the latest answer, or null.

## 3. Page «Колоди» (`public/`)

Drawer link «Колоди» (`data-tab="decks"`) after «Практика». Three views inside `#tab-decks`:

1. **List**: «Створити колоду» (primary) on top; then each deck as a card: name, description (muted), «N слів», buttons
   «Практикувати», «Змінити», «Видалити» (confirm with the existing askConfirm dialog). Empty state: one line on what a
   deck is and the create button.
2. **Picker** («Обери слова»): search input (Dutch or Ukrainian, accent/case-insensitive), filter chips (Усі, Важкі,
   Середні, Легкі, Нові, Обрані), sort select (за алфавітом, спочатку важкі, давно не практиковані). Each row: checkbox
   (the whole row toggles it, ≥44px), `de huis — будинок`, a difficulty badge (the round summary's badge styles;
   «нове» when null), muted «востаннє: 28.10» or «ще не практиковано». «Обрати всі видимі» / «Зняти всі». A sticky
   bottom bar: «Обрано: N» and «Додати слова» (disabled at 0) → confirmation. «Скасувати» back to the list.
3. **Confirmation**: the selected words (each with a remove ×), name input (required, autofocus), description textarea,
   «Створити колоду» (or «Зберегти» when editing), «Назад» (to the picker, selection kept). Server errors (duplicate
   name) shown inline.

«Змінити» opens the picker with the deck's words checked and the confirmation prefilled. «Практикувати» switches to
the «Практика» tab and starts the custom drill with title «Колода: <name>»; «Назад» at the end returns to «Колоди».

Large lists: render rows efficiently (build once, filter by toggling `hidden`, or render only matching rows); 600+
words must stay smooth on a phone. Works at 360px, light and dark. textContent only.

Pure helpers in `logic.js` with tests (`test/ui-logic.test.js`): filtering/sorting the catalog, the selection
summary, the drill round planning and end summary text, the round-summary button counts.

## 4. Tests

- Server (`test/decks.test.js`): create/list/get/update/delete; name uniqueness ignoring case and NFC; unknown word ids;
  empty deck refused; the 1000-word cap; word deleted → leaves the deck (cascade) and publishes `decks` too; a deck
  left with 0 words stays; catalog difficulty over the last 10 answers, lifetime answer_count, and last_practiced_on;
  drill-words order, unknown ids and the 1000-id limit; REST and MCP (update `test/mcp.test.js` tool list).
- Page logic as above.
