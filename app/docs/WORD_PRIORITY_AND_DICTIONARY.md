# Word priority, «Словник», quick known check, missing words, de/het entry (14.11.2026)

The learner saw rare words (hoofdgerecht, mosselen, trui) before everyday ones (lezen, boek). Cause: the current and
previous chapter made every word P1 whatever its frequency, and the queue sorted by chapter first, so the 546 words
without a chapter waited at the back of their tier. He asked for all six fixes, a manual priority tag, a «Словник»
instead of «Слова» (edit any word, set its tag, add a word), and a visible entry to the de/het exercise.

Rules for every part: copy every Ukrainian text from this document; new Ukrainian text must be correct literary
Ukrainian (no russianisms, no surzhyk); prompts that make a model write Ukrainian say so explicitly. Light palette,
`--garden-*` tokens; rebuild CSS with `node scripts/build-tokens.js && node scripts/build-app-css.js` in `storybook/`.
Motion per docs/MOTION.md. Pure logic in pure modules with tests. Never edit applied migrations (001–017). Tests:
`docker run --rm -v <app>:/app -v /srv/dutch-project/app/node_modules:/app/node_modules -v /srv/data/dutch/seed:/seed:ro -e DUTCH_SEED=/seed/dutch-export.json -w /app node:24-bookworm-slim node --test`
— all must pass.

## 1. Server: priority, queue order, topic balance, chapter (part S1)

### 1.1 Priority (`priority-calculation.js`)
- Manual tag (`priority_override`): 1 = «Вчити першим», 3 = «Пізніше», null = auto. (2 stays valid for MCP.)
- Auto: the effective rank is the frequency rank, halved for a word of the current or the previous chapter (a lesson
  word counts as twice as common). Effective rank ≤ 2000 → P1, ≤ 5000 → P2, otherwise or unranked → P3. A chapter no
  longer makes a word P1 by itself.
- Examples to test: trui (chapter 7, rank 3231, current 7) → 1615.5 → P1; hoofdgerecht (chapter 6, rank 14309,
  current 7) → 7154.5 → P3; boek (no chapter, 399) → P1; paella (chapter 6, unranked) → P3.

### 1.2 Queue order (`compareQueueOrder`)
Priority; then words tagged «Вчити першим» first; then effective rank ascending (unranked last); then id. The chapter
is no longer a sort key on its own. The preview (`previewPriorities`) uses the same order.

### 1.3 Topic balance in a new set (`new-word-allocation.js` / `word-set-planning.js`)
When the new words of a set are picked, in queue order inside each tier: at most 3 words of one category and at most 2
expressions (`kind = 'expression'`) per set. A candidate over a cap is skipped for now; if the set is still not full
after every tier, the skipped ones fill it in queue order (the caps never leave a set short). Words tagged «Вчити
першим» ignore the caps. Pure function with tests.

### 1.4 Current chapter
- REST: `GET /api/practice/chapter` → `{ chapter }`; `PUT /api/practice/chapter { chapter }` (integer 1–99) → saves,
  recalculates every word, returns `{ chapter }`.
- Automatic: when words are added (REST, MCP, bulk) and one has a chapter higher than the current chapter, the current
  chapter becomes that chapter (and priorities are recalculated).
- Word priorities are recalculated for every word once at startup after this change (a one-off: compare a settings
  marker `priority_rules_version` = 2; run `rerankAllWords`-like recalculation when it is lower, then save it).

### 1.5 Manual tag
`PUT /api/words/:id/priority { tag: 'first' | 'later' | null }` → the word (first → override 1, later → override 3,
null → auto). Word answers (REST/MCP) carry `priority_tag`: 'first' | 'later' | null (from the override; override 2 →
null in the tag but kept in `priority_override`).

Docs: `docs/FSRS_PRACTICE_ARCHITECTURE.md` gets a new section on these rules; practice README; MCP instructions and
`docs/CLAUDE_PROJECT_INSTRUCTIONS.md` one line each. Tests: `test/word-priority-rules.test.js`.

## 2. Server: quick known check and missing words (part S2)

### 2.1 «Я це вже знаю»
- `GET /api/practice/known-check?limit=20` (1–50) → `{ words: [{ id, nl, article, uk, kind }], remaining }`: the next
  new words (no FSRS card) in queue order (§1.2), skipping words already shown in a check (settings key
  `known_check_seen`, a JSON array of ids).
- `POST /api/practice/known-check { known_ids: [], unknown_ids: [] }` → `{ known: n, unknown: m, remaining }`. Known
  words get a review card like the «learned» migration card (`buildMigrationCard({ group: 'learned' })`) due in
  14–28 days (spread evenly by position so they do not all come back on one day), status `learned`, no learning deck
  positions, `introduced_on` today; they are not in today's set. Unknown words only join `known_check_seen` (they stay
  new, in the queue). Both lists are validated (existing new words only; others ignored). Publishes `words`.
- Neither touches answers, statistics or achievements.

### 2.2 Missing common words
- `POST /api/words/suggestions { limit = 30 }` → `{ suggestions: [{ nl, article, uk, category, frequency_rank }] }`.
  Candidates: groups of `word_frequencies` rows sharing one rank (one lemma), rank ≤ 4000, not covered by the
  dictionary (no form of the group appears as a token of any word's `nl`, ignoring de/het and punctuation); the 120
  most frequent groups are sent to OpenRouter (model `WORD_CATEGORY_MODEL`) with their forms. The prompt (English) asks
  for useful words for an A1–A2 learner: the dictionary form (infinitive, singular noun), the article for nouns, a
  Ukrainian translation, and one category id of `WORD_CATEGORIES`; skip pronouns, articles, names, numbers written as
  words, and words the forms do not clearly identify; return JSON `{ "suggestions": [...] }` sorted by usefulness, at
  most `limit`. The prompt must say: the Ukrainian translation is correct literary Ukrainian, no russianisms or
  surzhyk. Items whose `nl` already exists in the dictionary are dropped. Nothing is saved.
- 400 «Модель не налаштована» without a key. The OpenRouter call is injected; tests use a fake.
- Adding chosen suggestions uses the existing bulk add (`POST /api/words` or the bulk route the page already uses),
  with `category` accepted on add (if the add contract lacks it, add it).

Docs: README of the domains, `docs/FSRS_PRACTICE_ARCHITECTURE.md` section for the check. Tests:
`test/known-check.test.js`, `test/word-suggestions.test.js`.

## 3. Page: «Словник» (part C1)
The «Слова» tab (`table`) becomes «Словник» (title «Словник», subtitle «Усі твої слова»). Profile menu link and the
home search lead to it; Головна gets a tile «Словник» with the line «<N> слів».

- Top: search (Dutch or Ukrainian, accent-insensitive), filter chips row 1 «Усі», «Нові», «Вчу», «Вивчені»,
  row 2 «Вчити першим», «Пізніше»; a category select «усі теми» + `WORD_CATEGORIES` names (the client copy of the list
  goes to `logic.js`, same ids and names as `src/contracts/category-contracts.js`).
- Primary button «Додати слово» → the sheet in add mode: «Слово», «Переклад», «Артикль» (—, de, het), «Тема»
  (category select, «—» = визначить автоматично), «Глава», «Приклад NL», «Приклад UK», «Пріоритет» (segmented:
  «Авто», «Вчити першим», «Пізніше»), buttons «Додати» / «Скасувати». The old always-visible add form is removed.
- The list: one row per word (not a table), newest first: `de huis` (article muted) — `будинок`; under it small chips:
  the category name, the status («нове», «вчу», «вивчене»), «★ першим» or «пізніше» when tagged, and the next review
  date when there is one («повтор 18.11»). Rows render efficiently for 700+ words (build once per data change, filter
  by toggling `hidden`).
- Tap a row → the existing word sheet (details) with: a segmented «Пріоритет: Авто / Вчити першим / Пізніше» that
  saves at once (`PUT /api/words/:id/priority`), «Змінити» (the edit form now also has «Тема»), and «Видалити» (moved
  here from the row; confirm with the existing dialog).
- Card «Часті слова, яких бракує» at the bottom: text «Поширені нідерландські слова, яких ще немає у словнику.»,
  button «Підказати слова» → loading line «Шукаю слова…» (the growing pot loader of motion.js is fine) → a checklist
  (`Додати` checkboxes, all checked by default) of `de fiets — велосипед · Місто й транспорт`, buttons «Додати вибрані
  (n)» and «Скасувати». After adding: «Додано n слів».
- api.js: `setWordPriorityTag(id, tag)`, `getWordSuggestions(limit)`.

## 4. Page: known check, de/het entry, chapter (part C2)
- New tab `known-check` (title «Що я вже знаю», subtitle «Швидка перевірка слів»), opened from a Головна tile «Що я
  вже знаю» (line «Пропусти знайомі слова») and from a link in the practice mode hint area «Перевірити, що я вже знаю».
  The page shows the next 20 words (`GET /api/practice/known-check`) as tappable chips `de huis · будинок`; tapping
  toggles «знаю» (green, a check). Buttons: «Знаю всі» (marks all), «Готово» (POST: chosen → known, the rest →
  unknown). After it: «Позначено як знайомі: n. Ці слова прийдуть на повторення пізніше.» and «Далі (ще <remaining>)»
  for the next batch, or «Нових слів більше немає» when none left. A note under the title: «Познач слова, які ти вже
  знаєш. Вони не прийдуть як нові, а одразу підуть на повторення через 2–4 тижні.»
- de/het: a Головна tile «Артикль» (line «de чи het») that opens Практика in mode «Артикль» (`art`); Колоди «Готові
  колоди» gets a card «Артикль: de чи het» with «Практикувати» doing the same.
- Профіль: a field «Поточна глава» (number 1–99, «Зберегти») under the goal field, using `GET/PUT
  /api/practice/chapter`; hint «Слова поточної і попередньої глави вважаються вдвічі поширенішими. Глава оновлюється
  сама, коли додаєш слова з новішої глави.»; message «Збережено».
- api.js: `getKnownCheck(limit)`, `postKnownCheck(knownIds, unknownIds)`, `getChapter()`, `saveChapter(chapter)`.

## 5. Ownership
S1, S2 server; C1, C2 page, coded against the shapes above. Each in its own worktree/branch; shared files get small
local additions.

## 6. After the review (14.11.2026)
- Words marked known in the check are kept in the setting `known_check_known`: the achievements leave them out, and
  their `introduced_on` stays null (not today's introductions). A practice reset clears both check lists.
- The chapter follows added words at most two chapters ahead (a typo such as '76' does not move it).
- Suggestions are added in one request, `POST /api/words/bulk` (existing words skipped); a failure keeps the checklist.
- The add sheet clears the form once the word is saved, so a failed tag never leads to a second copy.
- The word sheet shows a failed priority save inside the sheet. A search from Головна clears the filters.
- A category cleared in the edit form («визначить автоматично») is sorted again in the background.
