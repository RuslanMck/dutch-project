# Offline-friendly app (branch `offline-friendly`)

Goal: the app opens without internet, shows the last data it saw, and lets the learner practise words offline; answers
reach the server, with the time they were given, once the phone is online again. Three levels, built together:

- **A · App shell**: a service worker caches the page and its files; an offline banner; the app can be installed (PWA).
- **B · Read offline**: GET `/api/*` answers are kept and served when the network is down.
- **C · Practise offline**: word grades and drill answers go to an outbox on the phone and are replayed in order; the
  current set survives a reload; one more set can be practised offline.

Out of scope (online only, with a clear «Немає зв'язку» notice): adding, editing or deleting words, phrases, decks,
sentences, rules; phrase cards («Картки»); word order («Порядок слів»); MCP.

## 1. Server

### 1.1 Service worker route and app version — `src/server/app-version.js`, `src/server/create-application.js`

- `computeAppVersion(publicDirectory)`: a short hash (first 12 hex chars of sha256) over the names and contents of every
  file under `public/` except `fonts/` (sorted by path), computed once at startup.
- `GET /sw.js` is served **before** sign-in (it holds no data): the file `public/sw.js` with the text `__APP_VERSION__`
  replaced by the version, `Content-Type: text/javascript; charset=utf-8`, `Cache-Control: no-cache`.
- `GET /api/version` (behind sign-in) → `{ version }`.
- The PWA icons `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` join
  `PUBLIC_FILE_NAMES_BEFORE_SIGN_IN`.

### 1.2 Answers with a time and an id — migration `015-add-client-answer-receipts.sql`

```sql
CREATE TABLE client_answer_receipts (
  client_answer_id TEXT PRIMARY KEY,
  kind             TEXT NOT NULL CHECK (kind IN ('grade', 'drill')),
  response         TEXT NOT NULL,          -- the JSON returned the first time
  created_at       INTEGER NOT NULL
);
CREATE INDEX index_client_answer_receipts_on_created_at ON client_answer_receipts(created_at);
```

`POST /api/practice/grades` and `POST /api/practice/drill-answers` accept three optional fields (contracts in
`src/contracts/practice-contracts.js`; the MCP `grade_word` tool does **not** get them):

- `client_answer_id`: string 8–100 chars. When a receipt with this id exists, the stored response is returned again
  (same status as the first time: 200 for grades, 201 for drill answers) and nothing is written. Otherwise the answer is
  processed and its response stored in the same transaction. Receipts older than 30 days are deleted when a new one is
  written.
- `answered_at`: integer ms since epoch, when the learner answered. A time ahead of the server counts as now (a phone
  clock running fast must not lose the answer); more than 7 days in the past is refused (ValidationError, 400). Missing =
  now (today's behaviour).
- `set_word_ids` (grades only): array of 1–20 word ids, the set the phone practised offline (§3.4).

Grading with `answered_at` uses it everywhere the grade now uses `clock.now()`: the FSRS review time, the review log,
the deck answer, the calendar day (`today`) and the set pinning. A grade whose word already has a review log or a deck
answer **later** than `answered_at` is refused with ConflictError (409) «пізніша відповідь уже є»: the schedule never
moves backwards. Drill answers store `answered_at` as their time.

`set_word_ids`: in `gradeFirstInSessionInTransaction`, when the planner finds **no open set** for that day (the stored
set is from another day or has no pending word), the set is pinned to these ids instead of the planned one: keep the
ids that exist, in the given order, without repeats, at most `newPerDay`; `openedOn` = that day, `openedAt` =
`answered_at`. When an open set exists the field is ignored and today's rule applies (a New word outside the open set →
409).

### 1.3 Spare words — `GET /api/practice/spare-words?session_id=…`

The words the next set will most likely draw from, for the phone to keep: reviews due before tomorrow's start (most
overdue first) that are **not** in the current set and not graded in this session, then New words in queue order with
the priority quota (`allocateNewWords`), up to `newPerDay` words in all. Each as a practice word (`mapToPracticeWord`,
`directions_left` both). Read-only: pins nothing, writes nothing. `{ words: [...] }`. Planner function
`planSpareWords({ settings, today, excludeIds, count })` in `word-set-planning.js`.

### 1.4 Tests (`test/offline.test.js`)

App version is stable for the same files and changes when a file changes; `/sw.js` served without sign-in with the
version filled in and `no-cache`; `/api/version`; a grade with `client_answer_id` posted twice writes once and returns
the same body; drill answer the same; `answered_at` in the future / older than 7 days → 400; a grade earlier than the
word's last answer → 409; `answered_at` of yesterday puts the review log and the calendar day on yesterday;
`set_word_ids` pins the set when none is open and is ignored when one is; spare words exclude the current set and the
session's graded words and respect the size; MCP `grade_word` schema unchanged.

## 2. Service worker — `public/sw.js`

- `const APP_VERSION = '__APP_VERSION__'`; caches `shell-<version>` and `api-v1`. On `activate`, delete other
  `shell-*` caches and call `clients.claim()`; `install` precaches the shell and calls `skipWaiting()`.
- Shell: `/`, `/index.html`, `/app.js`, `/api.js`, `/logic.js`, `/offline-store.js`, `/app.css`, `/icon.svg`,
  `/manifest.webmanifest`, the PNG icons, the font files used by `app.css` (list them explicitly).
- **Navigations** (`request.mode === 'navigate'`): network first; on a network error or no answer within 4 s, the cached
  `/index.html`. A redirect to `/login` from the network passes through (signed out).
- **Shell files and fonts** (same origin, GET, not `/api/`): network first, falling back to the cache; a good network
  answer refreshes the cache entry.
- **GET `/api/*`** except `/api/events` and `/api/health`: network first with a 6 s timeout; a 200 answer is stored in
  `api-v1` under its full URL; on a network error or timeout the stored answer is returned with the extra header
  `X-Offline-Cache: <ms when stored>` (store the time in a header of the cached copy, e.g. `X-Stored-At`). No stored
  answer → a 503 JSON `{ "error": "Немає зв'язку", "offline": true }`.
- Never touches non-GET requests, other origins, `/api/events`, `/auth/*`, `/mcp`.
- Message `{ type: 'clear-data' }` deletes `api-v1` (logout).

## 3. Page (`public/`)

### 3.1 Registration, version, logout

- `app.js` registers `/sw.js` when `serviceWorker` exists (after load; failures ignored).
- On logout submit (`.profile-logout`): post `clear-data` to the worker, clear the outbox and snapshot stores
  (`offline-store.js`), then let the form submit. If the outbox holds answers, ask first (askConfirm): «N відповідей
  ще не надіслано. Вийти й видалити їх?».

### 3.2 Network errors — `api.js`

`request()`: a `fetch` rejection (network down) throws an Error with `offline: true`, `status: 0`, message «Немає
зв'язку». A 503 whose JSON has `offline: true` the same. A response with `X-Offline-Cache` sets
`lastOfflineCacheTime` (exported getter) so the banner can say how old the data is. New exports: `getSpareWords`,
`getAppVersion`, and `postWithoutRedirect(url, body)` for the outbox (a 401 does **not** redirect; it throws
`status: 401`). `gradePracticeWord` and `postDrillAnswer` take the new optional fields.

### 3.3 Outbox and snapshot — `public/offline-store.js` (IndexedDB `dutch-offline`, with an in-memory fallback)

- Store `outbox`: `{ seq (auto), kind: 'grade' | 'drill', url, body, created_at }`. `enqueue`, `listAll` (by seq),
  `remove(seq)`, `count`, `clear`.
- Store `snapshot`: one record per key: `practice` (§3.4), `spare` (spare words + calendar date + session id).
- `flushOutbox({ post, onProgress })`: posts entries **one at a time in seq order**. 2xx or 409 or 400 → remove (a 409 or
  400 is counted as `dropped`); network error → stop (try later); 401 → stop and report `needsLogin`. Only one flush runs
  at a time. Returns `{ sent, dropped, remaining, needsLogin }`.
- Flush triggers: app start, the `online` event, every 30 s while entries remain and `navigator.onLine`, after each
  enqueue when online. After a flush that sent anything, refresh `words` and the stats.
- Every grade and drill answer gets `client_answer_id` (`crypto.randomUUID()` or the existing `createSessionId`) and
  `answered_at = Date.now()` **when the learner answers**, online or not, so a retried post is never counted twice.

### 3.4 Practice offline (`app.js`, pure helpers in `logic.js`)

- `postFsrsGrade`: on an `offline` error the grade is enqueued (with `set_word_ids` = the words of the set on screen)
  instead of being rolled back; the word then follows the existing no-schedule path (`grade !== 'good'` stays in the
  round). Other errors behave as today.
- Custom drills: `logDrillAnswer` enqueues on an offline error.
- **Snapshot**: after a batch loads and after every answer, save `{ sessionId, calendarDate, words (the batch words with
  directions_left), answeredKeys, tally, introducedCount, offlineSet: bool }` under `practice`. When `getPracticeBatch`
  fails offline, a snapshot of the same calendar date and session restores the set (words whose both directions are
  answered are left out); otherwise the practice shows «Немає зв'язку. Практика продовжиться, щойно з'явиться інтернет».
- **Spare words**: after each batch loads online, fetch `getSpareWords(sessionId)` and save them under `spare`.
- **Offline next set**: «Наступний набір» while offline (or the batch request failing offline) builds a set with
  `buildOfflineSet({ stillLearning, spare, setSize })` (logic.js): first the words of the finished set that are still
  learning (graded again or hard in this set), then spare words not already in it, up to `setSize`; it is practised like a
  normal set and every grade carries `set_word_ids` = its ids. No spare words saved → the message above.
- The round summary works offline from local data (the server summary is fetched only when online; offline it shows the
  local tally). The drill buttons stay.

### 3.5 Banner and notices

- A thin banner under the header, `#offline-banner` (`role="status"`), hidden when online with an empty outbox:
  - offline: «Офлайн · показано збережене[ · оновлено 14:32]» (time from `lastOfflineCacheTime`, when known);
  - answers waiting: «Не надіслано відповідей: 3» (+ «Надіслати» button when online);
  - after login is needed: «Увійди, щоб надіслати відповіді (3)» with a link to `/login`;
  - after a flush with dropped answers: a notice «N відповідей не зараховано: пізніші вже були».
- Any other write that fails offline shows the existing notice with «Немає зв'язку — зміни не збережено».
- The live updates (`subscribe`) do not poll while `navigator.onLine` is false; `online` triggers one refresh of all.

### 3.6 Warm-up for reading offline

After sign-in and on each `online` event (at most once every 10 minutes): fetch in the background the lists the tabs
use (words, topics, rules, mistake patterns, phrases, texts, decks, the deck word catalog, stats, activity for the
default period) and, for each deck, its drill words, so the service worker has them. Errors ignored.

### 3.7 PWA

PNG icons made from `icon.svg` (192, 512, a maskable 512 with padding on the theme background, apple-touch-icon 180),
`manifest.webmanifest` lists them plus `id: "/"`, `description`; `index.html` gets `<link rel="apple-touch-icon">`.

## 4. Tests on the page side (`test/ui-logic.test.js`, `test/offline-store.test.js`)

`buildOfflineSet` (order, still-learning first, no repeats, size), the snapshot restore filter, the banner text helper
`formatOfflineBanner({ isOnline, pendingCount, cacheTime, needsLogin })`, and `flushOutbox` with a fake store and a
fake `post` (order, stop on network error, drop on 409/400, needsLogin on 401, a single run at a time) using the
in-memory fallback. Section-3b whitelist test: the drill code may now enqueue drill answers.

## 5. Browser checks before review

On a copy of the data (dutch-try container), Playwright with `context.setOffline(true)`: the page reloads offline and
shows the banner; Слова and Колоди show data; a practice set started online is finished offline after a reload; answers
are queued; going online sends them in order (each once) and the banner clears; an offline next set is practised and
synced; logout clears the caches.
