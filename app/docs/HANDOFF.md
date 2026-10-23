# Dutch матеріали — migration to the VPS (implementation plan)

Audience: a Claude Code session on the VPS that has never seen the original. Everything needed to rebuild the app is in this file plus `dutch-export.json` (a snapshot of all data, taken 2026-10-23).

Source: a claude.ai artifact ("Dutch матеріали", one HTML page with a built-in shared document database). UI language is Ukrainian; keep all UI strings in Ukrainian exactly as quoted below.

---

## 1. What exists today

### 1.1 Data snapshot (from `dutch-export.json`)

| Collection | Docs | What it is |
|---|---|---|
| `words` | 586 | Dutch–Ukrainian dictionary entries (words **and** short expressions mixed) |
| `rules` | 7 | Grammar rules from the textbook, written as mini-markdown |
| `mistakes` | 13 | Recurring grammar-mistake patterns, each with its list of concrete cases (22 cases total) |
| `phrases` | 13 | Contextual phrases (market/shop talk) with a context note |
| `texts` | 1 | Textbook dialogue, bilingual, line-interleaved |

Words breakdown: status new 572 / learning 11 / learned 3. Article de 87 / het 63 / none 436. Only 9 words have an error counter (12 errors in total, max 4 on `groot`). Only 39 words have a chapter (`ch`), all `"6.1"`. 68 words have an example. 518 words have a `topic` (16 distinct topics, e.g. "Розмова: щоденне", "У кафе", "Числа", "De / Het"); 68 have none. 44 examples are "NL — UK", 24 are NL only.

### 1.2 Document shapes (exactly as stored)

```jsonc
// words/<id>
{ "nl": "bestellen", "uk": "замовляти", "art": "" /* "de" | "het" | "" */,
  "ch": "6.1",                      // optional, textbook section; absent on 547/586
  "topic": "У кафе",                // optional, free text, never shown in the UI
  "ex": "Kan ik een toetje bestellen? — Можна замовити десерт?",  // "NL — UK" in ONE string, or NL only, or ""
  "status": "new" /* new | learning | learned */,
  "err": 4,                         // optional; number of times the word was got wrong
  "added": 1792500000036 }          // ms epoch

// rules/<id>   ids: pronomen-werkwoord, modaal, possessief, artikel, rangtelwoorden, pluralis, adjectief
{ "title": "Прикметник перед іменником (adjectief)",
  "topic": "5.5 · прикметник",      // "<rule number> · <word class>"; rule number is a textbook section (5.5) or "Д1" for extras
  "order": 60,                       // sort key ascending
  "body": "<mini-markdown, see 1.4>" }

// mistakes/<id>
{ "rule": "adjectief",              // rules doc id, or the literal "other" (no rules doc exists for it)
  "title": "Додав -e до прикметника з het-словом (een / без артикля)",
  "fix": "het-слово в однині з een, geen або без артикля: без -e.",
  "count": 3,                       // ALWAYS equals cases.length in the snapshot (verified for all 13)
  "last": 1791722520000,            // ms epoch of the latest case
  "cases": [ { "w": "een kleine kind", "r": "een klein kind", "d": "2026-10-11" } ] }  // wrong, right, date

// phrases/<id>
{ "nl": "Gaat het zo mee?", "uk": "Вам так підходить? / ...", "ctx": "Продавець на ринку, ...", "added": 1792240836000 }

// texts/<id>   (only dialoog-6-1)
{ "title": "Dialoog 6.1: In een restaurant", "ch": "6.1", "added": 1792500001000,
  "body": "NL line\nUK line\n\nNL line\nUK line\n..." }   // blank-line separated pairs, speaker prefix "Jasper:" / "Яспер:"
```

Document ids are meaningful in the source: `s-<slug>` (518 words imported from the Word dictionary, carry `topic`), `w01..w11` / `w-<slug>` (13 early words), plain slugs (44 words added from chapter 6.1). Keep them as `legacy_id` so re-imports are idempotent.

### 1.3 Known data quirks (handle during import, do not silently "fix")

1. **Words and expressions share one collection.** 137 entries have 3+ words in `nl` (e.g. `hoe heet je?`, `ik wil graag contant betalen`). Mark them `kind='expression'` (heuristic: 3+ whitespace-separated tokens or ends with `?`/`.`), do not move them to `phrases`.
2. **10 `nl` values occur twice**: eten, mes, nemen, raam, rekening, rest, melk, tafel, vinden, zitten (one `s-` row, one chapter-6.1 row). Import both, write them to an `import-report.txt` for manual merge. No UNIQUE constraint on `nl`.
3. **`mistakes.rule = "other"` is a pseudo-rule.** The UI invents a virtual rule "Інші помилки / поза правилами" when any such mistake exists. In SQL: `rule_id = NULL`.
4. **The DB holds 586 entries, but the source Word dictionary is described as ~789 entries.** Reconcile against `Dutch Dictionary.docx` (in the claude.ai "Dutch" project) later; not a migration blocker.
5. `ex` mixes "NL — UK" and NL-only. Parse on the first ` — `; if absent put everything in `example_nl`.
6. `topic` and `ch` are never editable/visible in the current UI (only `ch` is shown in the table). Imported anyway.

### 1.4 Rule body mini-markdown (renderer must be ported verbatim)

Blocks are split on blank lines. A block is:
- **table** if every line starts with `|` (separator rows like `|---|---|` are dropped; first remaining row is the header),
- **list** if every line starts with `- `,
- **example box** if every line starts with `>`,
- otherwise a **paragraph** (lines joined with `<br>`).

Inline: HTML is escaped first, then `**x**` → `<b>x</b>`. Nothing else. All 7 rule bodies use only this. Store the body as-is in the DB; do not convert to HTML or full markdown.

---

## 2. What the app does (behaviour to reproduce)

Single page, one 640px column, six tabs, remembered in `localStorage` key `tab`. Dark/light via `prefers-color-scheme` with accent `#c2410c` (dark `#fb923c`). Live updates: the page subscribes to all collections, so edits made elsewhere (Claude writing during lessons) appear without reload. On the VPS use SSE or polling every ~5 s.

**1 · Таблиця** (words table). Columns: Слово (`art nl`), Глава, Переклад, Помилки, Статус, delete. Rows ordered by `added` ascending. "Помилки ↓" header toggles sort by error count descending. The status button cycles `new → learning → learned → new` (labels нове / вчу / знаю). Delete is two-click: first click turns `×` into "видалити?", second deletes; switching tabs disarms. Add form: Слово (nl), Переклад, article select (— / de / het), Глава, Приклад → creates word with `status='new'`, no error count.

**2 · Картки** (flashcards). Pool = words with `status != 'learned'`. A card shows `art nl`; click flips to `uk` + example. Buttons: **Знаю** → mark current word `learned` (pool shrinks, same index shows the next card); **Ще раз** → mark `learning` and go to next card. When the pool is empty: "Усе вивчено". **Do not port the existing bug**: in the source, "Ще раз" increments the index *before* marking, so it marks the *next* card as `learning`, not the current one. Intended behaviour: mark current, then advance.

**3 · Практика** (typed practice). Mode select:
- `all` "Слова: переклад → nl (з артиклем або без)": shows `uk`, user types Dutch, optional leading `de`/`het`.
- `art` "Артикль: de чи het": shows `nl`, user types only `de` or `het` (anything else → "Напиши лише de або het"); only words whose article is de/het.

Pool excludes `learned`. Random word, never the same twice in a row; empty pool → "Немає слів для цього режиму". Check (Enter or button, which then becomes "Далі"): input lowercased, whitespace collapsed.
- `all`: strip optional leading article. Exact match of the word → correct, *unless* an article was typed and the word has a different article → "Слово вірно, але артикль: ✗ → ✓" (counts as wrong). Levenshtein distance ≤ 1 → "Майже, перевір літери. Правильно: …" (counts as wrong). Otherwise "✗ Правильно: …".
- `art`: correct iff input equals the word's article.
- Session score "Вірно: ok з tot" is kept in memory only (not persisted).
- Result → state change: **correct** → `learning` becomes `learned`, `new` stays `new`; **wrong** → status `learning` and one error event is recorded.

**4 · Правила** (rules). Search box filters on rule title + number + body + the text of its mistakes (titles and wrong/right strings). Each rule is an accordion (open state survives re-render; all matches open while searching). Summary row: title, red badge with total mistake count for the rule (hidden when 0), right-aligned tag = rule `topic`. Body = rendered mini-markdown, followed by "Мої помилки" when the rule has mistakes: patterns sorted by count desc then last desc; each shows title, `×count`, the `fix` line, and the last 3 cases as ~~wrong~~ → right (newest first). Pseudo-rule "Інші помилки" (`topic` "поза правилами") is appended when `other` mistakes exist. Empty state: "Тут з'являться граматичні правила: артиклі, дієслова, порядок слів."

**5 · Фрази**. List newest first: NL (bold), UK, context in grey, two-click delete. Add form: Фраза (nl), Переклад, Контекст (необов'язково). Empty: "Фраз поки немає."

**6 · Тексти**. Read-only list: title, "Глава X", body with preserved line breaks (`white-space: pre-wrap`). Texts are only created by Claude, there is no add form (keep it that way, or add one later). Empty: "Текстів поки немає."

### 2.1 Claude-side workflows that write to this data (must keep working after migration)

These currently go through the artifact database tool; after migration they must go through the VPS API/CLI (section 5):
1. **Exercise checking** (skill `dutch-exercise-check`): after every check, log grammar mistakes — find an existing pattern for the same rule/kind and add a case (count+1, new `last`), otherwise create a pattern (`title`, one-line `fix`); no matching rule → `rule=other`. Words got wrong → `words.err + 1` and status `learning`; unknown word → create with `err=1`, `learning`. Words the user marks "DNK" → create with status `new` if missing. Feedback always cites the rule number shown in the UI (e.g. 5.5).
2. **Sentence/dialogue translation** (skill `dutch-sentence-translation`): on request, new words go to the dictionary, stable phrases to `phrases` with `ctx` = dialogue name.
3. Dictionary entries carry the textbook chapter in `ch` (e.g. 6.1).

---

## 3. Target database (SQLite)

Decisions and why:
- **Mistake counts and word error counts are derived, not stored.** In the snapshot `count == cases.length` for every mistake, so a case/event table loses nothing and removes the "counter drifted from the list" failure mode. Legacy word `err` values (no history) become `legacy_import` events with unknown date.
- Timestamps: INTEGER milliseconds since epoch (same as source). Case dates: `YYYY-MM-DD` text.
- Original document ids kept in `legacy_id` (unique) so the import can be re-run to pick up changes made in the artifact before cutover.

```sql
-- schema.sql  (core: normalised version of today's data)
PRAGMA foreign_keys = ON;

CREATE TABLE sections (               -- textbook sections referenced by rules/words/texts
  code        TEXT PRIMARY KEY,       -- '5.5', '6.1', 'Д1' (Д* = rules not from the textbook)
  title       TEXT,
  is_textbook INTEGER NOT NULL DEFAULT 1 CHECK (is_textbook IN (0,1))
);

CREATE TABLE topics (                 -- thematic buckets of the dictionary ("У кафе", "Числа", ...)
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE rules (
  id           INTEGER PRIMARY KEY,
  legacy_id    TEXT UNIQUE,           -- 'adjectief', 'pluralis', ...
  code         TEXT NOT NULL,         -- number shown to the user and cited in feedback: '5.5', 'Д1'
  category     TEXT,                  -- word class after the dot in the old topic: 'прикметник'
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,         -- mini-markdown (section 1.4)
  sort_order   INTEGER NOT NULL,      -- old `order`
  section_code TEXT REFERENCES sections(code),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_rules_code ON rules(code);   -- deliberately not UNIQUE

CREATE TABLE texts (
  id           INTEGER PRIMARY KEY,
  legacy_id    TEXT UNIQUE,
  title        TEXT NOT NULL,
  section_code TEXT REFERENCES sections(code),
  body         TEXT NOT NULL,         -- NL/UK interleaved, blank-line separated
  added_at     INTEGER NOT NULL
);

CREATE TABLE words (
  id           INTEGER PRIMARY KEY,
  legacy_id    TEXT UNIQUE,
  nl           TEXT NOT NULL,
  uk           TEXT NOT NULL,
  article      TEXT NOT NULL DEFAULT '' CHECK (article IN ('','de','het')),
  kind         TEXT NOT NULL DEFAULT 'word' CHECK (kind IN ('word','expression')),
  example_nl   TEXT,
  example_uk   TEXT,
  topic_id     INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  section_code TEXT REFERENCES sections(code),   -- old `ch`
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','learning','learned')),
  added_at     INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_words_status ON words(status);
CREATE INDEX idx_words_nl     ON words(nl COLLATE NOCASE);   -- lookups by nl; NOT unique (homographs/duplicates exist)

CREATE TABLE word_errors (            -- one row per time a word was got wrong
  id           INTEGER PRIMARY KEY,
  word_id      INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  occurred_at  INTEGER,               -- NULL only for legacy_import (date unknown)
  source       TEXT NOT NULL CHECK (source IN ('practice','exercise','lesson','legacy_import')),
  mode         TEXT CHECK (mode IN ('translate','article')),   -- practice mode, else NULL
  wrong_answer TEXT
);
CREATE INDEX idx_word_errors_word ON word_errors(word_id);

CREATE TABLE phrases (
  id           INTEGER PRIMARY KEY,
  legacy_id    TEXT UNIQUE,
  nl           TEXT NOT NULL,
  uk           TEXT NOT NULL,
  context      TEXT,                  -- old `ctx`
  text_id      INTEGER REFERENCES texts(id) ON DELETE SET NULL,
  section_code TEXT REFERENCES sections(code),
  added_at     INTEGER NOT NULL
);

CREATE TABLE mistake_patterns (       -- "kind of mistake"; was a mistakes/<id> doc
  id         INTEGER PRIMARY KEY,
  legacy_id  TEXT UNIQUE,
  rule_id    INTEGER REFERENCES rules(id) ON DELETE SET NULL,  -- NULL = old rule "other"
  title      TEXT NOT NULL,           -- what went wrong
  fix        TEXT,                    -- one-line correct rule
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_patterns_rule ON mistake_patterns(rule_id);

CREATE TABLE mistake_cases (          -- one concrete occurrence; was mistakes.cases[]
  id          INTEGER PRIMARY KEY,
  pattern_id  INTEGER NOT NULL REFERENCES mistake_patterns(id) ON DELETE CASCADE,
  wrong_text  TEXT NOT NULL,          -- old `w`
  right_text  TEXT NOT NULL,          -- old `r`
  occurred_on TEXT NOT NULL,          -- 'YYYY-MM-DD', old `d`
  source      TEXT CHECK (source IN ('exercise','lesson','practice')),   -- NULL for imported cases
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_cases_pattern ON mistake_cases(pattern_id);

-- Derived numbers the UI shows
CREATE VIEW v_words AS
  SELECT w.*, (SELECT COUNT(*) FROM word_errors e WHERE e.word_id = w.id) AS error_count
  FROM words w;

CREATE VIEW v_mistake_patterns AS
  SELECT p.*, COUNT(c.id) AS count, MAX(c.occurred_on) AS last_on, MAX(c.id) AS last_case_id
  FROM mistake_patterns p LEFT JOIN mistake_cases c ON c.pattern_id = p.id
  GROUP BY p.id;

CREATE VIEW v_rule_errors AS         -- the red badge on each rule; rule_id NULL = "Інші помилки"
  SELECT p.rule_id AS rule_id, COUNT(c.id) AS error_count
  FROM mistake_patterns p JOIN mistake_cases c ON c.pattern_id = p.id
  GROUP BY p.rule_id;
```

### 3.1 Field mapping (old → new)

| Old | New |
|---|---|
| `words.art` | `words.article` |
| `words.ch` | `words.section_code` (create `sections` row if missing) |
| `words.topic` | `topics` row + `words.topic_id` |
| `words.ex` | split on first ` — ` → `example_nl`, `example_uk` |
| `words.err = n` | n rows in `word_errors` with `source='legacy_import'`, `occurred_at=NULL` |
| `words.added` | `added_at` (`updated_at` = same) |
| `rules.topic "5.5 · прикметник"` | `code='5.5'`, `category='прикметник'`, `section_code='5.5'` (for `Д1`: `is_textbook=0`) |
| `rules.order` | `sort_order` |
| `mistakes.rule = <id>` / `"other"` | `rule_id` via rules.legacy_id / NULL |
| `mistakes.count`, `last` | dropped (derived from cases); assert `count == len(cases)` during import |
| `mistakes.cases[].w / r / d` | `mistake_cases.wrong_text / right_text / occurred_on` |
| `phrases.ctx` | `phrases.context` |
| `texts.ch` | `texts.section_code` |

Expected row counts after import: words 586, word_errors 12, rules 7, mistake_patterns 13, mistake_cases 22, phrases 13, texts 1, sections 8 (1.4, 2.8, 3.6, 3.8, 5.4, 5.5, 6.1, Д1), topics 16, words with `kind='expression'` 137. Rule badges (`v_rule_errors`): adjectief 10, pluralis 5, artikel 4, modaal 1, pronomen-werkwoord 1, NULL ("Інші помилки") 1 — total 22.

### 3.2 Optional additions (not in the artifact; build in phase 4)

```sql
CREATE TABLE exercises (              -- the "5/8" score the feedback format already produces
  id           INTEGER PRIMARY KEY,
  taken_at     INTEGER NOT NULL,
  section_code TEXT REFERENCES sections(code),
  kind         TEXT,                  -- 'translate-uk-nl', 'plural-drill', ...
  score_right  INTEGER NOT NULL,
  score_total  INTEGER NOT NULL
);
ALTER TABLE mistake_cases ADD COLUMN exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL;
ALTER TABLE word_errors   ADD COLUMN exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL;

CREATE TABLE practice_attempts (      -- every practice answer, right or wrong (today only the session score in memory)
  id INTEGER PRIMARY KEY, word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  at INTEGER NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('translate','article')),
  answer TEXT, correct INTEGER NOT NULL CHECK (correct IN (0,1))
);
```
Also worth adding later: a topic filter on the Таблиця tab (the topic data exists but has no UI) and a `phrase_words` link table if sentence breakdowns should become queryable.

---

## 4. Architecture and stack (defaults, change if you prefer)

- **Backend:** Node 22 + TypeScript, Hono, `better-sqlite3`, Zod validation. One process, one SQLite file (`/data/dutch.db`), WAL mode. Single user, so no ORM needed; plain SQL migrations in `migrations/NNN_*.sql` with a tiny runner.
- **Frontend:** keep it a vanilla page — port the existing HTML/CSS/JS, split into `index.html`, `app.css`, `app.js`. Replace `window.claude.use('db')` with a small `api.js` adapter exposing the same calls (`collection().add`, `doc().update/delete`, `onSnapshot`) so the UI code barely changes, with SSE (`GET /api/events`) triggering refetch. No framework.
- **Hosting:** Docker Compose (`app` + `caddy`), HTTPS via Caddy. Auth: HTTP basic auth on the UI via Caddy; API accepts `Authorization: Bearer $DUTCH_API_TOKEN` for the CLI/Claude. Token in `.env`, never committed.
- **Backups:** nightly `sqlite3 dutch.db ".backup /backups/dutch-$(date +%F).db"` via cron, keep 30; plus `GET /api/export` returning the same JSON shape as `dutch-export.json`.
- **Personal data stays out of git.** Commit only code, migrations and `seed.example/`; the real export lives in `/data/seed/` (git-ignored) so the repo can be shared as a template.
- **Tests:** Vitest for the pure logic (levenshtein, practice result rules, rule renderer, import mapping), Playwright for the UI behaviours in section 2.

## 5. API and CLI contract

REST (JSON), all under `/api`, all writes transactional:

| Endpoint | Purpose |
|---|---|
| `GET /words?status=&topic=&sort=errors` · `POST /words` · `PATCH /words/:id` · `DELETE /words/:id` | dictionary CRUD; list returns `error_count` from `v_words` |
| `POST /words/:id/result` `{correct, mode, wrong_answer?}` | applies the practice rules from section 2 (status change + error event) in one transaction |
| `POST /words/:id/errors` `{source, wrong_answer?}` | log an error from a lesson/exercise (sets status `learning`) |
| `GET/POST/PATCH/DELETE /rules` | rules (body is the mini-markdown) |
| `GET /mistake-patterns?rule=<code>` · `POST /mistake-patterns` · `POST /mistake-patterns/:id/cases` `{wrong, right, date, source}` | the exercise-check logging flow |
| `GET/POST/DELETE /phrases`, `GET/POST/DELETE /texts` | phrases and texts |
| `GET /events` (SSE) · `GET /export` · `POST /import` | live refresh, backup, idempotent import |

CLI `dutch` (thin wrapper over the API, so Claude Code can call it from Bash and the old skills can be rewritten against it). Minimum commands:
`dutch word add|find|err|status`, `dutch mistake log --rule 5.5 --pattern <id|new> --title … --fix … --wrong … --right …`, `dutch rule list|show`, `dutch phrase add --ctx …`, `dutch export`.
Both skills (`dutch-exercise-check`, `dutch-sentence-translation`) must be rewritten to call this CLI instead of the artifact database; keep their feedback format and rules unchanged.

---

## 6. Phases (each ends with something runnable)

1. **Skeleton + schema.** Repo, Docker Compose, Caddy, migration `001_init.sql` = the SQL in section 3. *Done when* `sqlite3 dutch.db .schema` matches and the app serves a health endpoint over HTTPS with basic auth.
2. **Import.** `scripts/import.ts` reads `dutch-export.json` (path argument), applies section 3.1, idempotent via `legacy_id`, writes `import-report.txt` (the 10 duplicate `nl` values, any `count != len(cases)`, unknown rule ids, expression heuristics applied). *Done when* row counts equal the expected counts in 3.1 and a second run changes nothing.
3. **API + UI port.** Endpoints from section 5, then the six tabs with the behaviours in section 2 (with the card-button bug fixed). *Done when* the Playwright suite below passes.
4. **CLI + skills.** Build `dutch` CLI, rewrite the two skills, run one real exercise-check round end to end. Then optional additions from 3.2.
5. **Cutover.** Re-export from the artifact (final delta), re-run import, switch lessons to the VPS, keep the artifact read-only for a couple of weeks as fallback, then archive. Set up backups and verify a restore once.

## 7. Acceptance tests (Playwright / Vitest)

- Table: add a word → appears last with status "нове"; status button cycles нове → вчу → знаю → нове; "Помилки ↓" puts `groot` (4) first; delete needs two clicks, switching tab disarms.
- Cards: "Знаю" on word A removes it from the pool; "Ще раз" on word A marks **A** `learning` and shows B (regression for the old bug); empty pool shows "Усе вивчено".
- Practice `all`: `het huis`/`huis` correct; `de huis` → "Слово вірно, але артикль", counted wrong; `huiz` → "Майже…", counted wrong; wrong answer sets status `learning` and `error_count` +1; correct answer moves `learning` → `learned` and leaves `new` as `new`.
- Practice `art`: only de/het words offered; input `xx` → "Напиши лише de або het".
- Rules: badge for `adjectief` shows 10 right after import (assert against `v_rule_errors` in later tests, since lessons change it); search for `kleine` opens the matching rule; "Інші помилки" appears only when a NULL-rule pattern exists; rule `5.4` table renders as `<table>`, `**-en**` as `<b>`.
- Mistake logging via API: adding a case to an existing pattern raises `count` by 1 and updates the "last 3 cases" list; a new pattern with `rule=null` creates the pseudo-rule block.
- Import: counts from 3.1, idempotency, `word_errors` for `groot` = 4 `legacy_import` rows.
- Realtime: a write through the CLI shows up in an open browser tab within ~5 s.

## 8. Open items for the owner

- Reconcile 586 DB words vs ~789 in the Word dictionary (1.3 #4).
- Decide the duplicate pairs from `import-report.txt` (1.3 #2).
- Auth model if the app is ever opened to other learners (the schema is single-user: no `user_id` anywhere; adding one means a `user_id` on words, word_errors, mistake_patterns, phrases, texts).
