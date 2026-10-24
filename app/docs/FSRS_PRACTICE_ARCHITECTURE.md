# FSRS practice: architecture and implementation plan

Implements the product plan "Практика слів на FSRS" (24.10.2026). Decisions confirmed by Ruslan: all eight open
questions take the proposed values, the current chapter is 6, the web app's Practice tab switches to FSRS, and the
app is deployed when the tests pass. Writing the frequency ranks and running the real migration still wait for his
"yes".

Read `.claude/skills/project-quality-standards/SKILL.md` and its references before writing code. Every rule there
applies (factories, Zod contracts in `src/contracts/`, whole-word names, folder READMEs, import order, 120 columns).
Do not rename existing DB columns, REST/MCP fields or env vars. Do not touch `artifact/` or `starter/`.

## 1. Behaviour summary

- Every word has an FSRS card (`ts-fsrs` 5.4.2, desired retention 0.9, `enable_short_term: false`, fuzz on in
  production). No card (NULL) means state New.
- With `enable_short_term: false` ts-fsrs moves a New card straight to Review and keeps Review after a lapse,
  so the FSRS states seen in practice are `new` and `review`; status (new/learning/learned) is what tells them apart.
- Grades: `again` (wrong or "DNK"), `hard` (right word, wrong/missing article or a spelling slip, or a synonym),
  `good` (fully right). `easy` is never used.
- Only the first answer to a word in a practice session is graded. A second grade of the same word in the same
  `session_id` is rejected with `ConflictError` and changes nothing.
- A day is a calendar day in `Europe/Amsterdam` (setting `timezone`). "Due today" means `due_at` is before the
  start of tomorrow in that time zone. Due dates are aligned to the start of a calendar day: a grade is due on today
  + the interval in days (at least 1), at 00:00 in that time zone.
- Status is derived: `new` when state is New; `learned` when the scheduled interval (`scheduled_days`, whole days)
  is ≥ `learned_threshold_days` (21); otherwise `learning`. The
  existing `words.status` column is kept and rewritten after every scheduling change, so REST and MCP keep the
  field.
- New words enter rotation at most `new_per_day` (10) per day, by priority quota P1 7 / P2 2 / P3 1. Unused slots
  go to P1, then P2, then P3. Unused quota does not carry over to the next day.
- Priority: manual override wins; else a word whose chapter is the current chapter or the one before → 1; else
  frequency rank ≤ 2000 → 1, ≤ 5000 → 2, otherwise or unranked → 3. Chapter = the integer before the first dot of
  `section_code` (`'6.1'` → 6, `'6'` → 6, `'Д1'` → none).
- Queue order inside a priority: chapter ascending (none last), then frequency rank ascending (unranked last), then
  id.
- Before `migrate_to_fsrs` has run for real, the practice batch and grade endpoints refuse with `ConflictError`
  ("FSRS practice is not set up yet: run migrate_to_fsrs"). Setting `fsrs_migrated_at` switches the system on.

## 2. Database: `migrations/003-add-fsrs-practice.sql`

```sql
ALTER TABLE words ADD COLUMN fsrs_card TEXT;          -- ts-fsrs card as JSON; NULL = state New (not in rotation)
ALTER TABLE words ADD COLUMN due_at INTEGER;           -- copy of the card's due for indexed selection; NULL = New
ALTER TABLE words ADD COLUMN introduced_on TEXT;       -- YYYY-MM-DD (Amsterdam) the word entered rotation; NULL = New
ALTER TABLE words ADD COLUMN frequency_rank INTEGER;   -- rank in the frequency list; NULL = not in the list
ALTER TABLE words ADD COLUMN priority_override INTEGER CHECK (priority_override IN (1, 2, 3)); -- NULL = none
ALTER TABLE words ADD COLUMN priority INTEGER NOT NULL DEFAULT 3 CHECK (priority IN (1, 2, 3)); -- cached, see note
CREATE INDEX index_words_on_due_at ON words(due_at);
CREATE INDEX index_words_on_introduced_on ON words(introduced_on);
CREATE INDEX index_words_on_priority ON words(priority);

CREATE TABLE review_logs (
  id           INTEGER PRIMARY KEY,
  word_id      INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  session_id   TEXT NOT NULL,
  reviewed_at  INTEGER NOT NULL,
  grade        TEXT NOT NULL CHECK (grade IN ('again', 'hard', 'good')),
  answer       TEXT,                                -- NULL = not given
  card_before  TEXT,                                -- JSON; NULL = the word was New
  card_after   TEXT NOT NULL                        -- JSON
);
CREATE UNIQUE INDEX unique_index_review_logs_on_session_id_and_word_id ON review_logs(session_id, word_id);
CREATE INDEX index_review_logs_on_word_id ON review_logs(word_id);
CREATE INDEX index_review_logs_on_reviewed_at ON review_logs(reviewed_at);

CREATE TABLE practice_settings (
  name  TEXT PRIMARY KEY,
  value TEXT NOT NULL                               -- JSON
);
INSERT INTO practice_settings (name, value) VALUES
  ('current_chapter', '6'),
  ('new_per_day', '10'),
  ('tier_quota', '{"1":7,"2":2,"3":1}'),
  ('desired_retention', '0.9'),
  ('learned_threshold_days', '21'),
  ('timezone', '"Europe/Amsterdam"');
-- 'fsrs_migrated_at' (ms) is inserted by migrate_to_fsrs.

CREATE TABLE word_frequencies (
  word_form       TEXT PRIMARY KEY COLLATE NOCASE,  -- any form (gaat, ging, gaan); lowercase
  frequency_rank  INTEGER NOT NULL                  -- rank of the form's lemma, 1 = most frequent
);
```

Note in the migration comment: `priority` and `status` are cached derivations, kept because the queue is ordered
and filtered by them; they are rewritten by the practice services whenever their inputs change.

## 3. Modules

New domain folder `src/domains/practice/` (with `README.md`). Pure modules have no I/O.

| File | Kind | Exports |
|---|---|---|
| `practice-calendar.js` | pure | `formatCalendarDateInTimeZone(timestamp, timeZone)` → `'YYYY-MM-DD'`; `findStartOfDay(calendarDate, timeZone)` → ms of 00:00 local; `addDaysToCalendarDate(calendarDate, dayCount)` → `'YYYY-MM-DD'`. Use `Intl.DateTimeFormat` with `timeZone`; must be right across DST (2026-10-25 is a 25-hour day in Amsterdam). |
| `fsrs-scheduling.js` | pure (wraps ts-fsrs) | `createFsrsScheduler({ desiredRetention, isFuzzEnabled })` → `{ gradeCard(card, grade, timestamp) }` returning `{ card, dueAt, intervalDays }`; `card` null = new (use `createEmptyCard`). `serializeCard(card)` → JSON string with ISO dates; `parseCard(json)` → card with `Date` objects. `deriveLearningStatus(card, learnedThresholdDays)` → `'new' \| 'learning' \| 'learned'`. `calculateIntervalDays(card)` = `card.scheduled_days` when it is set, else round((due − last_review) / day). `buildMigrationCard({ group, dueAt, timestamp })` for groups `'learning'` (state Review, stability 1, difficulty 6, reps 1, lapses 1, last_review = timestamp − 1 day, scheduled_days 1) and `'learned'` (state Review, stability 21, difficulty 5, reps 3, lapses 0, last_review = due − 21 days, due = dueAt, scheduled_days 21). Grade map: again → `Rating.Again`, hard → `Rating.Hard`, good → `Rating.Good`. |
| `priority-calculation.js` | pure | `parseChapterNumber(sectionCode)` → integer or null. `calculatePriority({ priorityOverride, chapterNumber, frequencyRank, currentChapter })` → 1–3 (rules in §1). `compareQueueOrder(first, second)` for `{ priority, chapterNumber, frequencyRank, id }` (§1). `calculateFrequencyRank(dutchText, findRankByForm)`: lowercase, drop a leading `de `/`het `, strip punctuation `?!.,;:()"'…`; one token → its rank or null; several tokens → the largest (rarest) rank of the tokens, or null when any token is unranked. |
| `new-word-allocation.js` | pure | `allocateNewWords({ candidatesByPriority, introducedTodayByPriority, newPerDay, tierQuota })` → ordered array of chosen candidates. Remaining = newPerDay − all introduced today. Each priority first gets min(its quota − introduced today in it, available). Leftover slots go to P1, then P2, then P3. Never more than remaining. Candidates in each list are already in queue order. Output order: P1 picks, then P2, then P3. |
| `practice-repository.js` | SQL | Settings: `listSettings()` → `{ name: parsedJsonValue }`; `saveSetting(name, value)` (JSON.stringify, upsert). Cards: `listPracticeWords()` → all words with `id, nl, uk, article, kind, section_code, status, fsrs_card, due_at, introduced_on, frequency_rank, priority_override, priority, error_count` (from `v_words`); `findPracticeWordById(wordId)`; `updateWordSchedule(wordId, { fsrsCard, dueAt, introducedOn, learningStatus, updatedAt })`; `updateWordPriority(wordId, { priority, priorityOverride })` (priorityOverride undefined = leave as is); `updateWordFrequencyRank(wordId, frequencyRank)`; `listDueWordIds(beforeTimestamp)` ordered by `due_at` ascending; `countIntroducedOnByPriority(calendarDate)` → `{1: n, 2: n, 3: n}`; review logs: `createReviewLog({...})`, `findReviewLog(sessionId, wordId)`, `listWordIdsReviewedInSession(sessionId)`, `countFirstGradesSince(timestamp)` → `{ again, hard, good }`. |
| `frequency-repository.js` | SQL | `replaceAllFrequencies(entries)` (delete all, insert), `upsertFrequencies(entries)`, `findRankByForm(wordForm)` → rank or null, `countFrequencies()`. |
| `practice-settings.js` | service | `createPracticeSettings({ practiceRepository })` → `{ readSettings(), saveCurrentChapter(chapter), isFsrsActive(), markFsrsMigrated(timestamp) }`. `readSettings` returns camelCase `{ currentChapter, newPerDay, tierQuota: {1,2,3}, desiredRetention, learnedThresholdDays, timeZone, fsrsMigratedAt }`. |
| `priority-service.js` | service | `createPriorityService({ practiceRepository, frequencyRepository, practiceSettings, runInTransaction, changeEventBus })`: `recalculatePriorities({ wordIds } = {})` (all words when no ids; writes `priority`), `assignNewWordRanking(wordIds)` (frequency rank + priority for just-added words; runs inside the caller's transaction, no event), `setWordPriority(wordId, priorityOrNull)`, `setCurrentChapter(chapter)` (save, recalc all, return preview), `previewPriorities({ chapter })` (no writes; `{ chapter, counts: {1,2,3}, unranked_count, examples: {1: [...], 2: [...], 3: [...]} }` over New words, 10 examples each in queue order `{ id, nl, uk, section, frequency_rank }`), `importFrequencyList(entries, { shouldReplaceExisting })` (writes table, re-ranks every word, recalculates priorities; returns `{ imported, words_ranked, words_unranked }`). Publishes `'words'`. |
| `practice-service.js` | service | `createPracticeService({ practiceRepository, practiceSettings, priorityService, wordRepository, fsrsScheduler, runInTransaction, changeEventBus, clock })`: `getPracticeBatch({ sessionId, maxReviews })`, `gradeWord({ wordId, grade, answer, sessionId })`, `migrateToFsrs({ isDryRun })`, `calculatePracticeStatistics()`. Details in §4. Publishes `'words'`. |
| `practice-tools.js` | MCP adapter | Registers the 8 tools in §5. |
| `practice-routes.js` | REST adapter | `GET /practice/batch?session_id=&max_reviews=`, `POST /practice/grades` `{ word_id, grade, answer, session_id }`, `GET /practice/stats`, `GET /practice/priorities/preview?chapter=`. |

Contracts: new `src/contracts/practice-contracts.js` with `practiceGradeSchema` (`z.enum(['again','hard','good'])`),
`practiceSessionIdSchema` (string 1–100), and one schema per tool/route input (§5). Add `wordPriorityValueSchema`
(1–3). Word list filters extend `word-contracts.js` (§6).

Composition root: `src/server/create-domain-services.js` builds `practiceSettings`, `priorityService`,
`practiceService` (with `createFsrsScheduler({ desiredRetention: settings.desiredRetention, isFuzzEnabled })`;
`createDomainServices` takes an optional `isFsrsFuzzEnabled = true`, tests pass `false`), passes `priorityService`
and `practiceSettings` into `createWordService`, and returns `practiceService` and `priorityService`.
`create-mcp-server.js` and `create-api-router.js` register the new tools and routes.

## 4. Practice service details

`getPracticeBatch({ sessionId, maxReviews })`:
1. Refuse unless FSRS is active.
2. today = calendar date of `clock.now()`; tomorrowStart = start of today + 1 day.
3. reviews = words with `due_at < tomorrowStart`, not already graded in this session, most overdue first
   (`due_at` ascending), cut to `maxReviews` when given.
4. New words: candidates = state New words not graded in this session, grouped by `priority`, each list in queue
   order; `allocateNewWords` with today's introduced counts.
5. Return `{ session_id, reviews: [word], new_words: [word], counts: { due, introduced_today, new_today_remaining,
   new_remaining_by_priority: {1,2,3} } }`. `word` = `{ id, uk, nl, article, kind, state, priority }`, state as
   `'new' | 'learning' | 'review' | 'relearning'` from the card.

`gradeWord({ wordId, grade, answer, sessionId })` in one transaction:
1. Refuse unless FSRS is active; word must exist (`NotFoundError`); a review log for (session, word) →
   `ConflictError("word N was already graded in session S")`.
2. `fsrsScheduler.gradeCard(card, grade, now)`. Due dates are aligned to the start of the calendar day:
   `intervalDays = max(1, card.scheduled_days)`, `dueAt = findStartOfDay(addDaysToCalendarDate(today, intervalDays),
   timeZone)` (`today` is the grade's calendar day in the setting's time zone), and `card.due = dueAt` before the card
   is serialized. Status = `deriveLearningStatus`.
3. Update the schedule; set `introduced_on` = today when the word was New.
4. Insert the review log; on `again`/`hard` insert a `word_errors` row (`source 'practice'`, `mode 'translate'`,
   `wrong_answer` = answer) through `wordRepository.createWordError`.
5. Return `{ word: compact word, grade, state, status, interval_days, next_due_on }` (`next_due_on` in the setting's
   time zone).

`migrateToFsrs({ isDryRun = true })`:
- Refuse if already migrated (`ConflictError`).
- Groups by the current `status` column: `learning` words sorted by error_count desc, then id, split into 4 chunks
  as even as possible; chunk k gets `due_at` = start of (today + k) days. `learned` words: due = start of
  (today + 21 days). `new` words: stay NULL.
- Dry run returns `{ dry_run: true, learning: n, learned: n, new: n, learning_due_by_day: { 'YYYY-MM-DD': n },
  learned_due_on }` and writes nothing. A real run writes cards (`buildMigrationCard`), `introduced_on` = yesterday
  for learning/learned (they were in rotation already, so they stay outside today's new-word quota), recalculates statuses, calls `priorityService.recalculatePriorities()`, saves
  `fsrs_migrated_at`, and returns the same summary with `dry_run: false`.

`calculatePracticeStatistics()`: `{ due_today, due_tomorrow (due in tomorrow only), introduced_today,
new_remaining_by_priority, states: { new, learning, review, relearning }, good_share_7_days,
good_share_30_days }` (good share = good / all first grades in the window, null when none).

## 5. MCP tools (new)

| Tool | Input | Notes |
|---|---|---|
| `get_practice_batch` | `session_id`, `max_reviews?` | §4 |
| `grade_word` | `id`, `grade`, `answer?`, `session_id` | §4 |
| `set_current_chapter` | `chapter` (int 1–99) | returns the preview |
| `set_word_priority` | `id`, `priority` (1–3 or null) | returns the compact word |
| `import_frequency_list` | `entries: [{ form, rank }]` (1–20000 per call), `replace_existing?` (default false) | |
| `preview_priorities` | `chapter?` | read-only |
| `migrate_to_fsrs` | `dry_run?` (default true) | destructive annotation |
| `practice_stats` | — | read-only |

Also `scripts/import-frequency-list.js <path-to-tsv>`: reads `form<TAB>rank` lines and calls
`priorityService.importFrequencyList(entries, { shouldReplaceExisting: true })` (follow `scripts/import.js` for
how a script opens the database and services).

## 6. Changes to existing code

- `word-service.js`: `createWord(s)` stores status `'new'` when FSRS is active, and calls
  `priorityService.assignNewWordRanking(ids)` inside the transaction. `updateWord` recalculates the word's priority
  when `section` or `nl` changes; a `status` change is allowed only to `'new'` once FSRS is active (resets
  `fsrs_card`, `due_at`, `introduced_on` to NULL), `learning`/`learned` → `ValidationError` ("status follows the
  FSRS schedule"). Same for `updateWordStatus`. Before FSRS is active the old behaviour stays.
  `recordPracticeResult` (the web article drill) keeps writing attempts and errors but never changes status.
  `logWordError` only adds an error (no status change); `logWordErrorByLookup` creates a missing word as `new`.
- `word-repository.js`: `WORD_SELECT` also returns `priority`, `frequency_rank`, `due_at`, and the card's state is
  derived in the service (or select `fsrs_card` and map it). New filters `state`, `priority`, `due_before` (ms) and
  sort orders `due` (due_at ascending, NULL last) and `frequency` (frequency_rank ascending, NULL last).
- `word-tools.js`: tool descriptions for `add_words`, `log_word_error`, `set_word_status`, `list_words` updated;
  compact word adds `priority`, `frequency_rank`, `next_due_on`.
- `statistics`: `stats` adds `fsrs: { new, learning, review, relearning, due_today }`.
- Web (`public/`): the Practice tab gets modes "Переклад (FSRS)" (default) and "Артикль" (old drill, unchanged).
  FSRS mode: on open, a session id (`crypto.randomUUID()`, kept in `sessionStorage` as `{ sessionId, calendarDate }`
  and replaced when the Amsterdam day changes or a session finishes) and a batch from
  `/api/practice/batch`; questions show `uk`, the learner types Dutch; `gradeTranslationAnswer(word, input)` in
  `logic.js` returns `{ grade, message }` (exact incl. right article → good; right word with wrong or missing
  article for de/het nouns, or Levenshtein ≤ 1 → hard; else again; empty input → not counted); the first answer
  per word posts to `/api/practice/grades`; again/hard words go to the end of the local queue and repeat ungraded
  until right; the end shows a summary (again/hard/good counts, new words introduced, due tomorrow from
  `/api/practice/stats`). If the batch request returns 409 (not migrated), show "Практика FSRS ще не налаштована".
  Cards tab: the "Знаю"/"Ще раз" buttons are replaced by "Далі" (browse only; statuses follow FSRS). The word
  table's status button becomes a plain badge.
- `mcp-instructions.js` and `docs/CLAUDE_PROJECT_INSTRUCTIONS.md`: how Claude runs a practice session (blocks of
  10, first answer graded with `grade_word`, mistakes repeated at the end ungraded, DNK = again, synonym = hard,
  summary at the end; mistakes in exercises/lessons only use `log_word_error`).

## 7. Tests (`node --test`, in Docker)

New `test/practice.test.js` (service level, fuzz off, a controllable clock) covering every acceptance criterion:
quota and the 10/day cap; redistribution when a priority is empty; good > hard > again due dates; second grade in
a session rejected with the schedule unchanged; chapter change moves P1; override survives a chapter change;
dry-run writes nothing, real run gives 4 learning due days and 513-style New words untouched; Amsterdam day
boundary (a grade at 23:30 local counts for that day; DST day 2026-10-25). Unit tests for the pure modules in
`test/practice-logic.test.js`. MCP tests extend `test/mcp.test.js` (tool list, `grade_word` round trip). UI logic
tests extend `test/ui-logic.test.js` for `gradeTranslationAnswer`. Existing tests whose expectations change
(status changes on practice/log error) are updated, not deleted.

Run: `docker run --rm -v /srv/dutch-project/app:/app -v /srv/data/dutch/seed:/seed:ro -e DUTCH_SEED=/seed/dutch-export.json -w /app node:24-bookworm-slim npm test`

## 8. Work packages

| # | Package | Files (owned exclusively) | Depends on |
|---|---|---|---|
| 1 | Data layer | `migrations/003-add-fsrs-practice.sql`, `migrations/README.md`, `practice-repository.js`, `frequency-repository.js` (`ts-fsrs` ^5.4.2 is already installed by the orchestrator) | — |
| 2 | Pure logic | `practice-calendar.js`, `fsrs-scheduling.js`, `priority-calculation.js`, `new-word-allocation.js`, `test/practice-logic.test.js` | 1 (ts-fsrs installed) |
| 3 | Practice services and adapters | `practice-settings.js`, `priority-service.js`, `practice-service.js`, `practice-tools.js`, `practice-routes.js`, `practice-contracts.js`, `src/domains/practice/README.md`, `create-domain-services.js`, `create-mcp-server.js`, `create-api-router.js`, `scripts/import-frequency-list.js`, `test/practice.test.js`, `test/mcp.test.js` | 1, 2 |
| 4 | Existing words/statistics | `word-service.js`, `word-repository.js`, `word-tools.js`, `word-routes.js`, `word-contracts.js`, statistics files, `test/domain-services.test.js`, `test/http.test.js` | 3 (interfaces) |
| 5 | Web and docs | `public/*`, `test/ui-logic.test.js`, `mcp-instructions.js`, `docs/*`, READMEs not owned above | 3 (routes) |

Packages 1+2 run first, 3 next, then 4 and 5 in parallel. Nobody commits; the orchestrator commits after review.

## 9. Phrase practice and the practice UI (second round, 24.10.2026)

Ruslan's eleven UI changes; the decisions are settled.

### 9.1 Backend (phrases on FSRS, plus one field for words)

- `migrations/004-add-phrase-fsrs-practice.sql`: `phrases` gains `fsrs_card TEXT` (NULL = New), `due_at INTEGER`
  (NULL = New), `introduced_on TEXT` (NULL = New) and `status TEXT NOT NULL DEFAULT 'new' CHECK (status IN
  ('new','learning','learned'))` (cached derivation, like `words.status`); indexes `index_phrases_on_due_at`,
  `index_phrases_on_introduced_on`. New table `phrase_review_logs` (same columns as `review_logs` with `phrase_id`
  instead of `word_id`, no `answer`), `unique_index_phrase_review_logs_on_session_id_and_phrase_id`, indexes on
  `phrase_id` and `reviewed_at`. Setting `('phrase_new_per_day', '5')`. Existing phrases start as New; no migration
  tool is needed (phrases had no status before).
- Rules: 5 new phrases per day, oldest first (`added_at`, then `id`), no priority tiers. One card per phrase whatever
  side is shown. Only the first grade per phrase in a session counts (`ConflictError` on a second). Grades
  again/hard/good chosen by the learner. Same FSRS scheduler, day boundary and status derivation as words. Due dates
  are the start of the calendar day today + interval days (at least 1) in the settings' time zone, as for words. No
  `word_errors`. Gated by the same `isFsrsActive()` check.
- Files: `src/domains/practice/phrase-practice-repository.js` (SQL) and `phrase-practice-service.js`
  (`getPhraseBatch({ sessionId, maxReviews })`, `gradePhrase({ phraseId, grade, sessionId })`,
  `calculatePhraseStatistics()`), contracts in `practice-contracts.js`, routes in `practice-routes.js`, tools in
  `practice-tools.js`.
- REST: `GET /api/practice/phrases/batch?session_id=&max_reviews=` →
  `{ session_id, reviews: [phrase], new_phrases: [phrase], counts: { due, introduced_today, new_today_remaining,
  new_remaining } }`, phrase = `{ id, nl, uk, context, state, status }`.
  `POST /api/practice/phrases/grades` `{ phrase_id, grade, session_id }` →
  `{ phrase: { id, nl, uk, context, state, status, next_due_on }, grade, state, status, interval_days,
  next_due_on }`. 409 before FSRS is active and on a repeat grade.
- MCP: `get_phrase_batch` (`session_id`, `max_reviews?`, read-only), `grade_phrase` (`id`, `grade`, `session_id`).
  `practice_stats` gains `phrases: { due_today, due_tomorrow, introduced_today, new_remaining, states }`.
- Phrase list (REST `GET /api/phrases`, MCP `list_phrases`) adds `status` and `next_due_on`.
- Words: the `grade_word` / `POST /api/practice/grades` result's `word` gains `error_count` (after the grade's own
  error row is written), so the web app can show "помилок: N".

### 9.2 Web (`public/`)

Table tab
1. The add-word form's single example input ("NL — UK", parsed by `splitExample`) becomes two inputs,
   "Приклад NL" and "Приклад UK" (sent as `example_nl` / `example_uk`).
2. Word table columns: Слово / Глава / Переклад / Помилки / Статус / Наступне / Пріоритет / delete. "Наступне" =
   `next_due_on` formatted short (e.g. `25.10`), empty for new words; "Пріоритет" = `P1`–`P3`. At 390 px the page
   must not scroll sideways; the table may scroll inside `.table-wrap`.

Practice tab
3. «Не знаю» button: on the first answer in the session it grades `again`, shows the right answer with its
   article and requeues the word at the end; on a repeat it only shows the answer and requeues (no grade sent).
4. After a checked answer, one more line under `#practice-msg` from the grade response:
   "Наступне повторення: через N днів · <status> · помилок: <error_count>" (status labels for this line:
   new «нове», learning «вивчається», learned «вивчено»; "через 1 день / 2–4 дні / 5+ днів" Ukrainian plural). On a
   repeat: "повтор — не зараховується".
5. An "i" hint button next to «Залишилось: N»: «Скільки слів залишилось у сьогоднішній сесії, разом зі словами,
   які ви пропустили — вони повертаються в кінці, тому число може зростати.»
6. An "i" hint button next to «Режим»: «"Переклад (FSRS)" змінює розклад повторень кожного слова. "Артикль" — це
   тренування, яке нічого не змінює.» The article drill's pool becomes words in rotation (status learning or
   learned) that have de/het.
7. A trash button for the current word: an accessible `<dialog>` asks «Ви впевнені, що хочете видалити слово
   "…"?» and says the word's review history and error count are deleted too. On confirm: DELETE the word, drop it
   from the queue and move on. The word table's delete uses the same dialog (the two-step "видалити?" button goes).

Cards tab
8. Mode select "Картки — Слова" / "Картки — Фрази". Words mode shows today's practice batch (reviews + new words)
   from `GET /api/practice/batch` with the practice session id (read-only, no grades, no side effects). A direction
   switch: NL on the front or UK on the front. The counter shows how many cards are left in today's batch. A clear
   note: «Картки (Слова) не змінюють оцінку слова. Щоб покращити оцінку, відповідайте правильно в Практиці.»
9. Phrases mode: today's phrase batch from `GET /api/practice/phrases/batch` (same session id, same direction
   switch). After revealing the back the learner grades «Знову» (again) / «Важко» (hard) / «Добре» (good); only the
   first grade per phrase in the session is posted; again/hard phrases come back at the end of the session
   (ungraded repeats). The Phrases tab shows each phrase's status.
10. «Не знаю» in both card modes. Words: it only reveals the back (same as tapping the card).
11. Phrases: «Не знаю» reveals the back and grades again in one step.
