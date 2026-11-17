# Нові слова and Запам'ятовування: two practices instead of one (17.11.2026)

The learner saw mostly old hard words: a set of 10 took the learning deck and every due review first, and New words only
filled the room left, so with 35 reviews due the first New word came in the fourth set. He asked to split the practice:

- **Нові слова** — the current practice, almost unchanged, but its sets hold New words only (no reviews, no hard or
  other repeated words). 10 words a set. After a set: repeat the same 10 (a drill) or take the next 10 New words.
- **Запам'ятовування** — a new practice of the words already practised only (no New words), 10 a set, priority high >
  medium > low, and inside a priority the hardest words first.

Rules for every part: copy every Ukrainian text from this document; new Ukrainian text must be correct literary
Ukrainian (no russianisms, no surzhyk). Light palette, `--garden-*` tokens; rebuild CSS with
`node scripts/build-tokens.js && node scripts/build-app-css.js` in `storybook/`. Motion per docs/MOTION.md. Pure logic in
pure modules with tests. Never edit applied migrations (001–017); no migration is needed here (settings are key/value
rows). Tests: `docker run --rm -v <app>:/app -v /srv/dutch-project/app/node_modules:/app/node_modules -v
/srv/data/dutch/seed:/seed:ro -e DUTCH_SEED=/seed/dutch-export.json -w /app node:24-bookworm-slim node --test` — all
must pass, old tests updated where the old mixed set is asserted.

## 1. Server (part S)

### 1.1 Set kinds
A practice set has a kind: `'new'` or `'review'` (`SET_KINDS` in `practice-set.js`). Both are at most `new_per_day`
(10) words, both are pinned when shown and stay open on their calendar day while a word is pending (`isWordPending`,
unchanged: New, or in a deck direction, or not answered in both directions since the set opened).

- The `new` set is stored in the existing setting `word_set` (`settings.wordSet`, `saveWordSet`), the `review` set in a
  new setting `review_set` (`settings.reviewSet`, `saveReviewSet`). The practice reset clears both.
- **new**: only New words (no FSRS card), by the priority quota and topic caps as now (`allocateSetCandidates`, room =
  the set size). No deck words, no due reviews. There is no catch-up after skipped days: each set is 10 New words, and
  after a finished set the next one may be taken at once, as many as the learner wants.
- **review**: only words with a card that are owed today: the deck words and the reviews due before tomorrow's start,
  **without the words introduced today** (today's New words stay in Нові слова until tomorrow) and without the words
  graded in this session (as now). Order (pure function `compareReviewOrder` in a new pure module
  `review-set-planning.js`, with tests): priority 1, 2, 3; then the harder word first (FSRS `difficulty` descending,
  then `lapses` descending); then the earlier `due_at`; then id. The first 10 make the set.
- `planWordSet({ settings, today, gradedWordIds, kind })`, `planSpareWords({ ..., kind })`,
  `countReviewWordsOwed(...)` (the review candidates left outside the open review set, for the counts). `kind`
  defaults to `'new'`.

### 1.2 Grading
`gradeWord` keeps its rules. The set a first answer of the day pins (`pinWordSet`) follows the word: a word without a
card before the answer → the `new` set, a word with a card → the `review` set. A New word outside the open `new` set
is refused as now (409). `set_word_ids` (offline) pins the set of that same kind.

### 1.3 REST and MCP
- `GET /api/practice/batch?session_id=&kind=new|review` (default `new`): as now, plus `counts.kind`,
  `counts.review_owed` (review words owed today, the open review set included) and `counts.introduced_today`.
- `GET /api/practice/spare-words?session_id=&kind=` and `GET /api/practice/round-summary?kind=` (the summary of that
  kind's pinned set).
- `GET /api/practice/stats` adds `review_owed`.
- MCP `get_practice_batch` gets an optional `kind` ('new' | 'review', default 'new'); describe it in the tool text and
  in `docs/CLAUDE_PROJECT_INSTRUCTIONS.md` (one line).
- Docs: a new section in `docs/FSRS_PRACTICE_ARCHITECTURE.md` («Two practices»), the practice README rows.
- Tests: `test/review-set-planning.test.js` (order, today's New words left out, no New words in a review set, no
  review words in a new set, the two sets pinned apart, a finished new set gives the next 10 New words, the reset
  clears both), REST tests for `kind`.

## 2. Page (part C)

### 2.1 Modes
The mode select «Режим» gets: «Нові слова» (value `fsrs`, the current FSRS practice, kind `new`) and
«Запам'ятовування» (value `review`, the same FSRS machinery with kind `review`), then «Артикль», «Важкі слова» as now.
Every check of `mode === 'fsrs'` that means "the FSRS practice" becomes `isFsrsMode(mode)` (true for both); the FSRS
session (`ui.fsrs`) carries `kind`, and switching between the two modes loads the batch of the chosen kind. The offline
snapshot is kept per kind (`practice-new`, `practice-review`; the old `practice` key is read once as `new` and
deleted). api.js: `getPracticeBatch(sessionId, { kind })`, `getSpareWords(sessionId, kind)`, `getRoundSummary(kind)`.

### 2.2 End of a set
- **Нові слова**, round summary (as now: title, stats, words, drills) with the buttons: «Повторити ці слова» (a custom
  drill of all the set's words, nothing graded — the existing drill, return to the summary), «Ще 10 нових» (the next
  set, the current «Наступний» action) and «Завершити» (as now). When no New words are left: «Нових слів більше немає.
  Усі слова вже в повторенні.» with a button «Перейти до запам'ятовування».
- **Запам'ятовування**, round summary with «Ще 10» (next set) and «Завершити», and the existing hard-word drill buttons.
  When nothing is owed (empty batch): «На сьогодні все повторено» and the line «Наступні слова чекають на завтра: <N>.»
  (due tomorrow, as the current done screen) with a button «Важкі слова» (opens that mode).
- The progress line / hint under the mode for each: Нові слова «Сьогодні нових: <introduced_today>»; Запам'ятовування
  «Залишилось на сьогодні: <review_owed>».

### 2.3 Головна
The tile «Картки» (`home-tile-cards`) becomes «Нові слова» with the line «Сьогодні: <introduced_today> нових»; a new
tile «Запам'ятовування» next to it with the line «<review_owed> на сьогодні» (or «Усе повторено» at 0), opening
Практика in mode `review`. The «Артикль» tile pattern shows how a tile opens a mode.

## 3. Ownership
S: `src/**`, server tests, server docs. C: `public/**`, `storybook/styles/garden.css`, page tests (`test/ui-logic*`,
page structure tests). Each in its own worktree/branch, coded against the shapes above.
