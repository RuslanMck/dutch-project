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
- Grades: `again` (wrong or "DNK"), `hard` (right word with a spelling slip, or a synonym; since §10 the article never affects the grade),
  `good` (fully right). `easy` is never used.
- Only the first answer to a word in a practice session is graded. A second grade of the same word in the same
  `session_id` is rejected with `ConflictError` and changes nothing. A practice reset supersedes the earlier logs (§13.2),
  so the session may grade the word once more after the reset; a third grade is still rejected.
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
| `new-word-planning.js` | service (reads only) | `createNewWordPlanner({ practiceRepository })` → `{ planNewWords({ settings, today, gradedWordIds }), assertExtraNewWordsAllowed({ newWordPlan }), countExtraNewWordsOn(settings, calendarDate) }`. `planNewWords` returns `{ overdueCount, isBlocked, offeredCandidates, introducedTodayCount, newTodayRemainingCount, remainingByPriority }` (the backlog gate of §10.1 and the allowance with the extra words). |
| `practice-repository.js` | SQL | Settings: `listSettings()` → `{ name: parsedJsonValue }`; `saveSetting(name, value)` (JSON.stringify, upsert). Cards: `listPracticeWords()` → all words with `id, nl, uk, article, kind, section_code, status, fsrs_card, due_at, introduced_on, frequency_rank, priority_override, priority, error_count` (from `v_words`); `findPracticeWordById(wordId)`; `updateWordSchedule(wordId, { fsrsCard, dueAt, introducedOn, learningStatus, updatedAt })`; `updateWordPriority(wordId, { priority, priorityOverride })` (priorityOverride undefined = leave as is); `updateWordFrequencyRank(wordId, frequencyRank)`; `listDueWordIds(beforeTimestamp)` ordered by `due_at` ascending; `countIntroducedOnByPriority(calendarDate)` → `{1: n, 2: n, 3: n}`; review logs: `createReviewLog({...})`, `findLatestReviewLogSince({ wordId, sinceTimestamp })` (the word's latest log of the day, any session), `listWordIdsReviewedInSession(sessionId)` (count only logs with `superseded_at` NULL), `markReviewLogsSuperseded(timestamp)` (reset, §13.2), `countFirstGradesSince(timestamp)` → `{ again, hard, good }`. |
| `frequency-repository.js` | SQL | `replaceAllFrequencies(entries)` (delete all, insert), `upsertFrequencies(entries)`, `findRankByForm(wordForm)` → rank or null, `countFrequencies()`. |
| `practice-settings.js` | service | `createPracticeSettings({ practiceRepository })` → `{ readSettings(), saveCurrentChapter(chapter), isFsrsActive(), markFsrsMigrated(timestamp) }`. `readSettings` returns camelCase `{ currentChapter, newPerDay, tierQuota: {1,2,3}, desiredRetention, learnedThresholdDays, timeZone, fsrsMigratedAt }`. |
| `priority-service.js` | service | `createPriorityService({ practiceRepository, frequencyRepository, practiceSettings, runInTransaction, changeEventBus })`: `recalculatePriorities({ wordIds } = {})` (all words when no ids; writes `priority`), `assignNewWordRanking(wordIds)` (frequency rank + priority for just-added words; runs inside the caller's transaction, no event), `setWordPriority(wordId, priorityOrNull)`, `setCurrentChapter(chapter)` (save, recalc all, return preview), `previewPriorities({ chapter })` (no writes; `{ chapter, counts: {1,2,3}, unranked_count, examples: {1: [...], 2: [...], 3: [...]} }` over New words, 10 examples each in queue order `{ id, nl, uk, section, frequency_rank }`), `importFrequencyList(entries, { shouldReplaceExisting })` (writes table, re-ranks every word, recalculates priorities; returns `{ imported, words_ranked, words_unranked }`). Publishes `'words'`. |
| `practice-service.js` | service | `createPracticeService({ practiceRepository, newWordPlanner, practiceSettings, priorityService, wordService, fsrsScheduler, phrasePracticeService, runInTransaction, changeEventBus, clock })`: `getPracticeBatch({ sessionId, maxReviews })`, `gradeWord({ wordId, grade, answer, sessionId })`, `migrateToFsrs({ isDryRun })`, `calculatePracticeStatistics()`. Details in §4. Publishes `'words'`. |
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
  `logic.js` returns `{ grade, message }` (right word → good, the article is ignored since §10; Levenshtein ≤ 1 →
  hard; else again; empty input → not counted); the first answer
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

## 10. Third round: backlog gate, extra new words, optional article (25.10.2026)

Ruslan's new rules; the decisions are settled.

### 10.1 Backend

- **Backlog gate.** A review is *overdue* when its `due_at` is before the start of today (settings' time zone).
  While any word is overdue, `get_practice_batch` returns no new words (`new_words: []`). The check is live: once
  the last overdue word is graded, today's new words unlock the same day. The same rule holds for phrases: while
  any phrase is overdue, `get_phrase_batch` returns no new phrases.
- Batch `counts` gain `overdue` (number of overdue items, not filtered by session) and `new_words_blocked`
  (phrases: `new_phrases_blocked`), true when the gate holds back new items that would otherwise be offered.
- **Extra new words.** A setting `extra_new_words` = `{ "calendar_date": "YYYY-MM-DD", "count": n }` raises
  today's word quota: effective per day = `new_per_day` + (`count` when `calendar_date` is today, else 0). The
  tier quota scales with the number of blocks: blocks = ceil(effective / `new_per_day`), each tier quota × blocks
  (20 → 14/4/2), then the usual redistribution. *Superseded by §12 and §13: the setting `extra_new_words` is no longer
  read; extra words are appended to the intake block (`new_word_block`), and the tier quota scales with the block size.*
- `addExtraNewWords({ count })` (1–50; the contract default is 10): refuses with `ConflictError` while words are
  overdue or while today's New words, regular and extra, are not all introduced yet (`new_today_remaining > 0`), so
  a second call waits until the first extra words are graded; otherwise adds `count` to today's extra (resetting
  it when the stored date is not today) and returns `{ extra_new_words_today, new_today_remaining }`.
  REST `POST /api/practice/extra-new-words` `{ count? }`; MCP tool `add_extra_new_words` (`count?`). Both parse
  `count` with the same contract, so an empty body and no arguments add 10.
- `practice_stats` gains `overdue`, `new_words_blocked`, `extra_new_words_today`; `phrases` gains `overdue` and
  `new_phrases_blocked`.
- Claude instructions (`mcp-instructions.js`, `docs/CLAUDE_PROJECT_INSTRUCTIONS.md`): the article is optional in
  translation practice (ignore a missing or wrong de/het when grading, but mention the right article; article
  practice is separate); explain the backlog gate (new words only once nothing is overdue) and
  `add_extra_new_words` (offer "ще 10 нових слів?" when today's words are done).

### 10.2 Web

- **Article optional.** `gradeTranslationAnswer`: the article no longer affects the grade. A missing or wrong
  de/het with the right word → `good`, message «✓ Правильно (артикль: de)» when the article was missing or wrong.
  Spelling slip (Levenshtein ≤ 1) → `hard`; otherwise `again`. Expressions whose own text starts with de/het
  (no `article`) are still compared in full first.
- **Gate in the Practice tab.** When the batch has `new_words_blocked`, show under the progress line: «Нові слова
  з'являться, коли ви повторите всі прострочені слова.» When the queue empties, fetch the batch again with the same
  session: if it now has new words (the gate opened), add them to the queue and continue with the line «Повторення
  завершено — далі нові слова дня.»
- **Next 10.** When the queue is empty, no new words came back, `new_words_blocked` is false and New words remain
  (sum of `new_remaining_by_priority` > 0), the summary shows a button «Хочете ще 10 нових слів?». It posts
  `POST /api/practice/extra-new-words` `{ count: 10 }`, fetches the batch again and continues. It may be used
  repeatedly.
- **Cards → Фрази** gets the same refetch at the end of the deck (unlocked phrases continue the deck). Cards →
  Слова shows whatever the batch returns.
- **Table.** Remove the «Помилки» and «Статус» columns (and the error-sort toggle that lives in the Помилки header).
  Columns: Слово / Глава / Переклад / Наступне / Пріоритет / delete.

## 11. Practice reset (26.10.2026)

The migration (§4) put the 88 words that were "learning" before FSRS into rotation outside the new-word quota, 22 a
day, so on skipped days the list grew even though the §10 gate held back new words. Ruslan asked for a clean start:
`reset_practice` (`practice-reset-service.js`, MCP only, dry run by default) puts every word and phrase back to New
(no card, no due date, not introduced), clears today's extra new words and keeps review logs and word errors. After it
the only way into rotation is the daily intake (10 words, 7/2/1 by priority, only while nothing is overdue; 5 phrases),
so a skipped day can only bring back words that were actually started.

## 12. Intake blocks: unfinished new words count as an unfinished day (26.10.2026)

Ruslan's rule, made strict: new items come in blocks. The first new word started opens a block of `new_per_day` (10)
and saves it as the setting `new_word_block` = `{ opened_on, size, introduced_at_open }` (`new_phrase_block` for
phrases, size 5). A block stays open until all its items are started, across days: a day left half done offers only
its leftovers on the following days (the same words), a day with nothing done offers the same items again, and a
fresh block opens only once the open one is finished — the same day if the leftovers are finished then. A block counts
only items started since it opened (`introduced_at_open` = items started before), so an earlier block's items never
count against a new one. «ще 10» / `add_extra_new_words` adds to the size of a block finished today; extra words left
unstarted carry over as leftovers. The backlog gate (§10) still holds new items back while anything is overdue. The
setting `extra_new_words` from §10 is no longer read. `reset_practice` clears both blocks. Pure logic:
`intake-block.js` (`resolveIntakeBlock`).

## 13. Struggling-words drill and pinned intake blocks (26.10.2026)

### 13.1 Struggling-words drill (Ruslan's request)

- **Which words:** every word in rotation (has a card) whose most recent graded answer (latest `review_logs` row for
  the word) is `again` or `hard`. A word drops out once its next graded answer is `good`. Order: `error_count`
  descending, then the latest review time descending, then id.
- **No effect on the schedule:** the drill never grades, never writes `review_logs` or `word_errors`, never changes a
  card or status. Only the next real practice (FSRS mode) changes a word.
- **Backend:** `practiceService.listStrugglingWords()` → `{ words: [{ id, uk, nl, article, kind, state, priority,
  error_count, last_grade, last_reviewed_on }], count }`. REST `GET /api/practice/struggling-words`; MCP tool
  `get_struggling_words` (read-only; description: a follow-up drill that changes nothing — Claude quizzes the words
  and does NOT call grade_word or log_word_error for them).
- **Web, Practice tab:** a third mode «Важкі слова» in the mode select, and a button «Потренувати важкі слова (N)» in
  the FSRS summary when N > 0 (it switches to that mode). The drill uses the same question UI and
  `gradeTranslationAnswer` for feedback, posts nothing, puts wrong answers back at the end until typed right, and
  ends with «Тренування завершено: правильно з першого разу X з N.» and the line «Це тренування не змінює розклад
  слів.». With no struggling words: «Важких слів немає.». The mode "i" hint gains: «"Важкі слова" — тренування слів,
  на які ви останнього разу відповіли неправильно або важко; нічого не змінює.»

### 13.2 Review fixes for §11–§12

- **Pinned blocks (fixes the per-priority baseline and the unpinned leftovers).** The intake block stores the ids of
  the items it offered instead of counts: `new_word_block` = `{ opened_on, item_ids: [...], extra_count: n }`
  (`new_phrase_block` the same; phrases get no extra words, so its `extra_count` stays 0). A block opens when its first
  item is started: the items allocated at that moment (7/2/1 by priority for
  words, oldest first for phrases, as today) are pinned. The block's leftovers are its pinned items still New (no
  card); items deleted since count as done. The block is finished when it has no leftovers. While a block from an
  earlier day is unfinished, the batch offers exactly its leftovers. A block finished today stays (no more new items
  today except through extra words); a finished block from an earlier day gives way to a fresh allocation of the
  day's count. Extra words allocate `count` more New words (scaled 7/2/1 per 10, excluding the block's items), append
  their ids and add the number appended to `extra_count`; `extra_new_words_today` is `extra_count` while the block was
  opened today, and 0 otherwise. Starting a New item that is not in the block does not change the block. A stored block
  in the old `{ opened_on, size, introduced_at_open }` form (no `item_ids`) is read as finished. A stored block without
  `extra_count` reads as 0 extra words. `introducedAtOpen` and `countIntroducedByPriority`/`countIntroduced` go away if
  nothing else needs them.
- **Session leftovers.** A leftover graded in the session is not offered again in that session. It still counts in
  `new_today_remaining`, so extra words wait until a session starts it. A word set back to New (`set_word_status` /
  `updateWordStatus('new')`) after a grade in session S is held back in S and offered again in a new session.
- **Remaining count.** `new_today_remaining` is the block's leftovers still to start while a block is open. With no
  block open it is the day's pick (the New words the batch would allocate), so with no New words left it is 0; then
  `add_extra_new_words` appends nothing and saves nothing.
- **Reset and sessions (migration 005).** A reset sets `superseded_at` (ms) on every review log that still counts, in
  its transaction (`markReviewLogsSuperseded`, and `markPhraseReviewLogsSuperseded`); the logs stay as history. Session
  look-ups (`listWordIdsReviewedInSession`, `findLatestReviewLogSince`, and the phrase equivalents) count only logs whose
  `superseded_at` is NULL, so a reset in the middle of a web session is a real fresh start. The one-grade rule is a
  partial unique index: `unique_index_review_logs_on_session_id_and_word_id ON review_logs(session_id, word_id) WHERE
  superseded_at IS NULL`, and the same for `phrase_review_logs`. A second grade of an item in a session is refused by
  the index; after a reset one regrade is allowed, and a third is refused. (`practice_reset_at` is no longer written
  or read.)
- **Reset atomicity.** The reset reads the scheduled words and phrases inside its transaction.
- **First-start cost.** Grading a New item returns at once when the stored block was opened today (one settings read).
  Otherwise it plans the day (one read of the words) and pins the allocation only when no block is open; a block from
  an earlier day that still has leftovers is kept as it is, and the check for leftovers is made by the planning, not
  before it.
- **One guard.** `practiceSettings.readActiveSettings()` throws the one `ConflictError('FSRS practice is not set up
  yet: run migrate_to_fsrs')`; the three services use it.
- **One dry-run schema.** `resetPracticeInputSchema` and `migrateToFsrsInputSchema` derive from one base schema.
- **Allowance.** `calculateNewWordAllowance` takes the block size directly; §10's `extra_new_words` setting is marked
  superseded by §12/§13.

## 14. The learning deck (27.10.2026)

Ruslan saw «Залишилось: 19» after missing 9 of 10 new words: the intake block freed new words once yesterday's were
started, not once they were learned. His rules, with his answers to the open questions:

- A word in the deck needs `required_correct` right answers in a row: 2 for a clean word; each again or hard (both are
  mistakes here) adds one, up to 6, and resets the streak. At the streak's end the word is learned and leaves the deck.
- Every answer counts, repeats at the end of a session too. FSRS still grades only the first answer per session: a
  later answer (no longer a 409) moves only the deck and is kept in `deck_answers`.
- A word enters the deck on its first answer ever, or when a word outside it is answered again or hard (a lapse; it
  comes back with 3 left).
- A word in the deck is due every day (`words.due_at` = the start of tomorrow after each answer); its card keeps the
  FSRS due date, which it follows once learned (tomorrow at the earliest).
- New words fill only the deck's free slots: `new_per_day` plus today's extra words minus the words in the deck. The
  intake block stays, sized to the free slots, and its leftovers are capped by them. Freed slots fill once a day: a
  block opened today stays finished for the day, as before.
- The batch, `grade_word`, `list_words` and `practice_stats` carry the deck (`deck {in_deck, required_correct,
  correct_streak, times_left}`, `counts.deck_size`, `counts.deck_free_slots`); the web practice shows
  «Ще N рази правильно поспіль до вивчення» or «Вивчено ✓» under each answer. «Залишилось» stays the session queue.
- Migration 006 adds the columns and `deck_answers`; `scripts/rebuild-learning-deck.js --apply` replays the review logs
  that still count once (repeats before the deck were not stored, so only first answers replay).

## 15. The deck is the session (27.10.2026)

Ruslan corrected §14: the right answers belong to the session, not to days. His answers: right answers count in total
(a mistake adds one required answer but keeps the ones given), the next 10 new words come at once when a session is
finished, and reviews join the session.

- A session is the learning deck: its words stay, across days and session ids, until each is learned. The batch
  returns them first (`listDeckWordIds`), then the due reviews outside the deck, then the new words. Due and overdue
  counts leave deck words out.
- A word needs `required_correct` right answers in total (`deck_correct_count`, migration 007 renames the streak).
- The web practice puts a word back at the end of the queue while `grade_word` says `deck.in_deck`, so it is asked
  until learned; «Залишилось» is the session's words not learned yet. The line under an answer is «Повторень до
  вивчення: N», «Вивчено ✓ — наступне повторення …» at 0, or «Повторено ✓ …» for a review answered right.
- New words: a fresh allocation of `new_per_day` opens when the block has no leftovers and no word that entered the deck
  as New is left (`deck_entered_by_lapse` = 0), on any day, so a finished session starts the next one at once. Lapses
  do not hold it back. There is no daily limit beyond that.

## 16. Five active words, shuffle and the round summary (27.10.2026)

- **Active window.** The web client rotates among the first 5 words of the queue only (`advanceWindowedQueue` in
  `public/logic.js`). A word not yet learned goes back into the window; a learned word leaves it, and the first waiting
  word takes its place. The progress line reads «Залишилось: N · вчимо 5» while words wait.
- **Shuffle.** A button next to the progress line, on by default and remembered per device (`localStorage.shuffle`).
  On: batches are shuffled (deck and review words still before new ones) and a returning word goes to a random place
  in the window, never straight back. Off: the server's order, and a returning word goes to the back of the window.
- **Round summary.** `GET /api/practice/round-summary` (read only, `round-summary.js`) returns the intake block's words
  with their deck answers: answers, mistakes (again or hard), difficulty (0 easy, 1–2 medium, 3+ hard), the hardest
  word, and the time from the first answer to the last. `active_seconds` adds the gaps between answers and leaves out
  gaps longer than 5 minutes as pauses. A word's answers end at the one that learned it. When the queue runs out and
  the round is complete and `finished_in_session_id` (the session of the answer that learned its last word) is the
  current session, the client shows «Вітаємо!» with these numbers; its button asks the batch for the next words. A
  word learned and later lapsed still counts as learned for the round. The time spent counts every answer between the
  round's first and last (reviews and phrases mixed in too).

## 17. Menu and the statistics page (27.10.2026)

- **Menu.** The sections moved from the tab row into a left drawer (burger button, `setDrawerOpen` in `public/app.js`).
  While it is open the rest of the page is `inert`; Escape, the backdrop and the close button close it. The header
  shows the current section's name.
- **Statistics.** `GET /api/stats/activity?period=day|week|month|year|all` (`src/domains/statistics/learning-activity.js`,
  pure): answers (words and phrases), accuracy, mistakes, time spent (gaps over 5 minutes are pauses), days practised,
  words started and first learned, a chart per hour (day), per day (week = 7 days, month = 30 days) or per month
  (year = the last 12 months, all time), the 5 words with the most mistakes, and the streak of days in a row. Each
  period but all time also returns the period before it for comparison; the year is compared with the same span a
  year earlier. Answers count every row, resets included (they are history); words started and learned count only
  rows since the last reset, so periods before a reset show answers but no started or learned words.
- **Page.** Tiles with the comparison, the bar chart (tap a bar for its numbers), the streak, the hardest words and the
  vocabulary now from `GET /api/stats` («Запам’ятовано надовго» is the learned status: next review 21+ days away).

## 18. Practice sets: at most 10 cards a session (28.10.2026)

Replaces the backlog gate (10.1), the intake blocks (12, 13.2) and the extra new words. The learner's rule: one
session is one set of at most 10 cards, never 11 or 14, and skipped days never pile up more.

- **Terms.** A *card* is one word (or phrase). A *set* is the cards of one session, at most `new_per_day` (10), for
  words and phrases alike. An *old card* is a word still in the learning deck (unfinished from the last set) or a
  review due today, overdue ones included. A *new card* has never been practised.
- **Filling.** Old cards first: deck words, then reviews due today, most overdue first (those graded in this session
  left out). New cards fill only the room left (10 − old), by the priority quota 7, 2, 1 scaled to the room. So 0 old
  gives 10 new, 4 old give 6 new, 10 or more old give no new card; old cards past the tenth wait for the next set.
  Phrases: due phrases first (most overdue), then the oldest New phrases.
- **Pinning.** The batch that plans a set stores it at once (`word_set` / `phrase_set` in `practice_settings`:
  `{ opened_on, opened_at, item_ids }`), so the cards shown are the set; a first answer with no set open pins one too.
  While open, the batch returns only the set's cards not finished yet; nothing joins it, and a first answer to a New
  card outside it is refused (409), so the cap holds for MCP grading too. The batch tools are therefore not read-only. A
  word is finished once it is not New, not in the deck and not due today (learned, or a review answered right); a
  phrase once it is not New and not due today (graded). A deleted card is finished.
- **The next set.** When every card is finished, the same call (same session id) plans the next set the same day. A
  set from an earlier day is not reopened: its deck words come first in the new day's set, then that day's reviews,
  then new words.
- **Client.** The queue holds one set; the 5 active words (16) rotate inside it. When the queue runs out and this
  session finished the set, «Вітаємо! Набір завершено» shows the round summary (16), now of the set's cards and only
  the answers since `opened_at`; «Наступний набір» loads the next one. The overdue gate line and «Хочете ще 10 нових
  слів?» are gone, with `POST /api/practice/extra-new-words` and the MCP tool `add_extra_new_words`.


## 19. Two-way practice: every card in both directions (28.10.2026)

The learner's rule: a word is learned only when it can be translated both ways. A set stays at most 10 cards, but it
is practised in two rounds: **round 1 `uk_nl`** (the Ukrainian is shown, the Dutch is typed, as before) and then
**round 2 `nl_uk`** (the Dutch is shown with its article, the Ukrainian is typed). Phrases get the same two rounds
(self-graded). Shared constants: `src/domains/practice/practice-direction.js` (`UK_TO_NL_DIRECTION`,
`NL_TO_UK_DIRECTION`, `PRACTICE_DIRECTIONS`, `findOtherDirection`, `findWorseGrade`). Schema:
`migrations/008-add-two-way-practice.sql`.

### 19.1 Learning deck per direction (`learning-deck.js`)

- The existing deck columns are the `uk_nl` direction; `deck_reverse_required_correct`, `deck_reverse_correct_count`,
  `deck_reverse_entered_by_lapse` are `nl_uk`. The rules of 14 apply to each direction unchanged (2 right answers to
  start, a mistake adds one up to 6, right answers already given are kept).
- `readDeckPositions(wordRow)` → `{ uk_nl: position|null, nl_uk: position|null }`.
- `applyAnswerToDecks({ deckPositions, direction, grade, isFirstAnswerEver })` → `{ deckPositions, hasEnteredDeck,
  hasLearnedDirection, hasLearned }`. On the word's first answer ever (it was New) **both** directions enter: the
  answered one gets the answer applied as in `applyAnswerToDeck`, the other starts at `{ requiredCorrect: 2,
  correctCount: 0, isLapse: false }`. Otherwise only the answered direction moves (`applyAnswerToDeck` with
  `isFirstAnswerEver: false`, so a mistake outside the deck is a lapse into that direction, a right answer outside it
  stays outside). `hasLearnedDirection`: the answered direction was in the deck and left it now. `hasLearned`:
  `hasLearnedDirection` and the other direction is not in the deck either (the word leaves the deck).
- `describeDeckPositions(deckPositions)` → the `deck` field every adapter shows:
  `{ in_deck, times_left, uk_nl: describeDeckPosition(...), nl_uk: describeDeckPosition(...) }` where `in_deck` is
  either direction in the deck and `times_left` the sum. The grade response adds `has_learned` (the word) and
  `has_learned_direction` at the top level of `deck`. Keep `applyAnswerToDeck`, `describeDeckPosition`,
  `readDeckPosition` (it reads `uk_nl`), add `readReverseDeckPosition`.
- A word is "in the deck" (repository queries: deck words, due reviews exclude deck words, counts, clear) when either
  direction is.

### 19.2 Grading a word (`practice-service.js`)

`gradeWord({ wordId, grade, answer, sessionId, direction = 'uk_nl' })`. In one transaction:

1. `reviewLog` = the word's latest review log that still counts and was reviewed today (since `findStartOfDay(today,
   timeZone)`, `findLatestReviewLogSince`), in whatever session it was graded. A round of the day may be answered in
   another session (a new tab, «Почати знову», MCP), so the session does not decide the case.
2. **No log today** → the first FSRS grade of the day, as today (set pinning and the 409 for a New word outside the
   open set stay): FSRS from the card, the deck via `applyAnswerToDecks`, review log with `direction` and this session
   id, deck answer with `direction` and `is_first_in_session = 1`, a word error when not good. The word is due
   **tomorrow**, whatever its FSRS interval: its other direction is still to be answered, and a review word that is not
   in the deck must come back for the other direction too (the learner's rule: a learned word gets both rounds at its
   review). The FSRS card keeps its own due day for the second direction.
3. **Log today, `direction` differs from `log.direction` and `log.second_grade` is null** → the second direction's first
   answer: the deck moves in `direction`; the log's `second_grade` is set; when `findWorseGrade(log.grade, grade)` is
   worse than the grade the log's card was graded with, FSRS is graded again from the log's `card_before` with the
   worse grade (the due day of the first answer), the word card and the log's `card_after` are replaced. A word error
   is recorded when not good (the typed Ukrainian is the wrong answer). Deck answer `is_first_in_session = 0` (the flag
   stays "the answer that created the log"). The due day: tomorrow when a direction is in the deck, otherwise the card's
   own due day (tomorrow at the earliest). A card reset to New meanwhile (no card) is due tomorrow.
4. **Otherwise** → a repeat (the same direction today, from any session, or the log's other direction already answered):
   only the deck moves in `direction` (as today).
- The review log is one per word and session (unique index): a first grade in a session that already has a log for the
  word from an earlier day fails. The web client starts a new session id each calendar day.
- Status `learning` while in the deck.
- Response adds `direction`; `is_repeat` is true only in case 4; `deck` is the 19.1 shape with `has_learned` and
  `has_learned_direction`.
- Statistics and the struggling words use the session grade `worse(grade, second_grade)` of a log (SQL `CASE`).
- `rebuildLearningDeck` rebuilds the `uk_nl` direction only (review logs with `direction = 'uk_nl'` plus `uk_nl`
  repeats) and leaves `nl_uk` as stored.
- Statistics: the learned moment of a word (`findLearnedMoments`) is the answer after which neither direction is in the
  deck, when one was before. A direction never entered counts as out. The first answer of a New word enters the other
  direction too (`is_first_answer_ever`, from the review log of the same moment).

### 19.3 Sets and rounds (`word-set-planning.js`, `practice-set.js`)

- A card of an open set is **finished** when it is in neither deck direction and has a counting answer in **both**
  directions since the set's `opened_at` (words: `deck_answers`; phrases: `phrase_answers`). A deleted card is
  finished. A New card is pending (no answers).
- The batch returns each card with `directions_left`: the directions whose deck position is not null or that have no
  answer since `opened_at`, in `PRACTICE_DIRECTIONS` order. A freshly planned set has both for every card.
- Planning the next set is unchanged (deck words first, then due reviews, then New in the room left), with "deck" =
  either direction.
- Round summary (`round-summary.js`): answers carry `direction`; a direction's answers end at the one that finished it
  (`required_correct_after` null). A word `is_learned` when both directions finished in the round. Each word adds
  `mistakes: { uk_nl, nl_uk }`. `is_complete` and `finished_in_session_id` follow from that.

### 19.4 Phrases (`phrase-practice-service.js`, `phrase-practice-repository.js`)

`gradePhrase({ phraseId, grade, sessionId, direction = 'uk_nl' })`: a counting `phrase_answers` row for (session,
phrase, direction) → 409 as today. Otherwise insert it, then the phrase's latest review log of today (any session, as in
19.2, `findLatestPhraseReviewLogSince`) decides the case: no log → FSRS as today, log with `direction`, `due_at` tomorrow
(the card keeps its own due day); a log whose other direction is not answered (`second_grade` null) → `second_grade`,
the card graded again from `card_before` when the worse grade is worse, and `due_at` the card's due day (tomorrow at the
earliest); otherwise a repeat of the day: the `phrase_answers` row only, no FSRS change. A phrase is finished in an open
set per 19.3. The batch gives `directions_left`. The reset supersedes `phrase_answers` too.

### 19.5 HTTP, MCP and docs

- `direction` (`'uk_nl' | 'nl_uk'`, optional, default `uk_nl`) on `POST` grade for words and phrases and on the MCP
  tools `grade_practice_word` and `grade_phrase`. Batch responses carry `directions_left` per card. MCP instructions
  and `docs/CLAUDE_PROJECT_INSTRUCTIONS.md`: Claude asks round 1 (Ukrainian → Dutch) for every card of the set, then
  round 2 (Dutch → Ukrainian) in a new order, grading each with its direction.

### 19.6 Web

- Words (Практика): the session keeps `direction` (current round) and the round queue; round 1 is the batch's cards
  with `uk_nl` left, round 2 those with `nl_uk` left. A round with no cards is skipped. Inside a round the 5 active
  words rotate as now (`advanceWindowedQueue`, using `schedule.deck[direction].in_deck`). The progress line names the
  round: `Раунд 1 з 2 · UA → NL · Залишилось: 7 · вчимо 5`. When round 1 empties, round 2 starts with
  `orderNextRound(words, lastWordId)` (shuffled; the first card is never the card just answered, so a word never comes
  straight back in the other direction) and the message `Раунд 2: NL → UA`. When round 2 empties, the round summary /
  next set works as in 18.
- Round 2 card: the Dutch with its article is shown, the placeholder asks for Ukrainian. `gradeReverseTranslationAnswer
  (word, input)` in `logic.js`: empty → not counted (`Напиши відповідь українською`); `dnk` or «Не знаю» → again;
  `normalizeAnswerText(input) === normalizeAnswerText(word.uk)` → good; anything else → again with
  `✗ Правильно: <uk>` and `canOverride: true`. No fuzzy matching (the learner's choice). When `canOverride`, the
  grade is **not posted yet**: «Я мав рацію» posts `good` (message `✓ Зараховано`), Enter / «Далі» posts `again` and
  moves on. Round 1 checking is unchanged.
- The tally and the answered set are kept per direction (`${direction}:${id}`).
- Phrases (Картки → Фрази): round 1 shows the Ukrainian and reveals the Dutch, round 2 the reverse; the front
  selector applies to word cards only. Grades post with `direction`; the same round order rule; the count line names
  the round.
- Round summary screen: each word shows its mistakes per direction (`UA→NL: 1 · NL→UA: 0`).
