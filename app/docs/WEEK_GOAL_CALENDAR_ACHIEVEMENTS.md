# Week recap, daily goal, calendar, letter diff, article baskets, achievements (14.11.2026)

The learner chose these from the ideas demo (https://claude.ai/artifact/DRmWLHpcSebZ2yiHmL7WSs): «Тиждень у підсумку»,
«Ціль на день», «Календар занять», «Де саме помилка», «Артикль: два кошики» (dragged, not tapped), «Досягнення» (many),
plus achievements for words of a category (5 / 10 / 15 … words of food, clothes, colours …).

Rules for every part:
- Every Ukrainian text is copied from this document. New Ukrainian text must be correct literary Ukrainian (no
  russianisms, no surzhyk). No emoji in UI text except where written here.
- Light palette only, the `--garden-*` tokens of `storybook/styles/garden.css`. After editing garden.css run
  `docker run --rm -v "$PWD":/app -w /app/storybook node:24-bookworm-slim node scripts/build-app-css.js` in `app/`.
- Motion follows docs/MOTION.md: use `replayClass`, `celebrateWhenShown`, `countUpNumbers`, `dropPetals` from
  `public/motion.js`; animations respect reduced motion; nothing blocks input.
- Pure logic goes to `public/logic.js` (client) or a pure module (server) with tests. textContent / `esc()` only.
- Server: the domain layout of `src/domains/*` (repository, service, routes, contracts, README), wired in
  `src/server/create-domain-services.js` and `src/server/create-api-router.js`. Never edit applied migrations
  (001–016). Answers counted by the statistics («Відповідей») are the activity answers of
  `statistics-repository.js` (deck answers, review logs, phrase logs, drill answers); use the same source.
- Calendar dates are in the practice time zone (`practiceSettings.readSettings().timeZone`), as the statistics do.
- Tests: `docker run --rm -v <app>:/app -v /srv/dutch-project/app/node_modules:/app/node_modules -v /srv/data/dutch/seed:/seed:ro -e DUTCH_SEED=/seed/dutch-export.json -w /app node:24-bookworm-slim node --test`.
  All tests must pass.

## 1. Server: calendar, week recap, daily goal (part S1)

### 1.1 `GET /api/stats/calendar?days=84`
`days` 7–371, default 84. → `{ days: [{ date: '2026-11-14', answers: 12, correct: 10 }] }`, one entry per calendar day,
oldest first, ending today (days with no answers have 0). `correct` = answers graded good (drill: is_correct).

### 1.2 `GET /api/stats/week?week=current|previous`
Default `current`: Monday of this week to today. `previous`: last Monday–Sunday. →
```
{ range: { start: '2026-11-09', end: '2026-11-14' },
  answers, accuracy (0–100 integer, null with no answers), days_practised, active_seconds,
  started_count, learned_count,
  best_day: { date, answers, accuracy } | null,        // most answers; tie → higher accuracy, then earlier
  hardest_word: { nl, article, uk, mistakes } | null,   // the activity's first hardest word
  streak: { current, longest } }
```
Reuse `summarizeLearningActivity` / `resolvePeriodRange` / `calculateStreak` where possible.

### 1.3 Daily goal
Setting `daily_goal` in `practice_settings`, default 20, integer 5–500.
`GET /api/goal` → `{ goal: 20, today: { date: '2026-11-14', answers: 14 } }`.
`PUT /api/goal { goal }` → the same shape; 400 outside 5–500.

Contracts in `src/contracts/statistics-contracts.js`; tests in `test/stats-calendar-week-goal.test.js`; README of the
statistics domain updated.

## 2. Server: word categories and achievements (part S2)

### 2.1 Categories — migration `017-add-word-categories.sql`
`ALTER TABLE words ADD COLUMN category TEXT;` and an index on it. Category ids and names (`src/contracts/category-contracts.js`,
exported `WORD_CATEGORIES`, frozen, in this order):

| id | name |
|---|---|
| food | Їжа й напої |
| home | Дім і побут |
| clothes | Одяг |
| colours | Кольори |
| numbers | Числа й час |
| people | Люди й родина |
| body | Тіло й здоров'я |
| city | Місто й транспорт |
| work | Робота й навчання |
| nature | Природа й погода |
| leisure | Відпочинок і хобі |
| feelings | Почуття й характер |
| actions | Дії |
| talk | Розмова й фрази |
| other | Інше |

- Words in REST and MCP answers carry `category` (null until set). `PATCH /api/words/:id` accepts `category` (an id
  above or null; another value → 400).
- `src/domains/words/word-categorizer.js`: asks OpenRouter (the existing client; model from env `WORD_CATEGORY_MODEL`,
  default `google/gemini-3.7-flash`, add it to `environment-contracts.js` and `.env.example`) to sort words into the
  ids, 60 words per request: the prompt (English) lists the ids with their meaning and the words as
  `id | nl | uk`, and asks for JSON `{ "categories": { "<word id>": "<category id>" } }`. Unknown ids or categories in
  the answer are ignored. Verbs go to `actions` unless another category fits better (e.g. `koken` → food is fine).
  Expressions and phrases → `talk` unless clearly another topic.
- `categorizeUncategorizedWords({ limit = 300 })` → `{ categorized, remaining }`; `POST /api/words/categorize`
  (body `{ limit? }`) runs it; 400 «Модель не налаштована» when OpenRouter has no key. After words are added (REST or
  MCP `add_words`), uncategorized words are categorized in the background (one run at a time, errors logged, never
  failing the add).
- The OpenRouter call is injected, so tests use a fake.

### 2.2 Achievements — domain `src/domains/achievements/`
`GET /api/achievements` →
```
{ groups: [{ id, title }],
  achievements: [{ id, group, title, description, icon, unlocked, progress: { current, target } }] }
```
`progress.current` is capped at `target` for unlocked ones. The catalog is pure (`achievement-catalog.js`), facts come
from one repository read (`achievement-repository.js`), the service matches them. Icons are names the page draws
(`star`, `flame`, `calendar`, `check`, `sentence`, `rule`, `sun`, `moon`, `weekend`, `return`, `bolt`, `leaf`,
`target`, plus one per category: the category id). MCP tool `list_achievements` (read-only) too.

Facts (practice time zone): learned words (status `learned`), learned words per category, activity answers total,
days practised, longest streak, perfect sets (a deck-answer `session_id` with ≥ 5 counting answers and every grade
`good`), most words learned in one day (`findLearnedMoments`), word-order correct answers and the longest run of
correct answers in a row, rule-exercise correct answers and longest correct run, drill answers, an activity answer
before 08:00, an answer at 23:00 or later, a weekend with both Saturday and Sunday practised, a comeback (practice
after a gap of ≥ 3 days without answers), daily goal reached on N days (activity answers that day ≥ the current goal).

Groups and catalog (id → title, description; `{n}` is the target):

| group id | group title | ids and targets | title | description |
|---|---|---|---|---|
| words | Слова | words-10, -25, -50, -100, -250, -500, -1000 | Вивчено {n} слів | Вивчи {n} слів в обидва боки |
| streak | Серія днів | streak-3, -7, -14, -30, -60, -100 | {n} днів поспіль | Практикуй {n} днів без пропусків |
| answers | Відповіді | answers-100, -500, -1000, -5000, -10000 | {n} відповідей | Дай {n} відповідей у практиці |
| days | Дні практики | days-10, -30, -100, -365 | {n} днів практики | Практикуй у {n} різних днів |
| goal | Ціль на день | goal-1, -7, -30, -100 | Ціль виконано {n} разів | Досягни денної цілі {n} разів |
| perfect | Без помилок | perfect-1, -10, -50 | Ідеальний набір: {n} | Заверши набір без жодної помилки {n} разів |
| fast | Швидкість | fast-5, -10, -20 | {n} слів за день | Вивчи {n} слів за один день |
| order | Порядок слів | order-10, -50, -200, order-run-10 | {n} речень правильно / 10 речень поспіль | Склади {n} речень правильно / Склади 10 речень поспіль без помилки |
| rules | Вправи з правил | rules-10, -50, -200, rules-run-10 | {n} правильних відповідей / 10 правильних поспіль | Дай {n} правильних відповідей у вправах / Дай 10 правильних відповідей поспіль |
| drill | Тренування | drill-100, -500 | {n} відповідей у тренуванні | Дай {n} відповідей у тренуваннях і колодах |
| habits | Звички | early-bird, night-owl, weekend, comeback | Ранній птах / Нічна сова / Вихідні з користю / Повернення | Практикуй до 8:00 / Практикуй о 23:00 чи пізніше / Практикуй і в суботу, і в неділю / Повернися до практики після перерви в 3 дні |
| categories | Теми слів | for every category except `other`: `<id>-5, -10, -15, -25, -50` | «<name>»: {n} | Вивчи {n} слів теми «<name>» |

Plural forms in titles use the `pluralize` style (1 слово, 2 слова, 5 слів; 1 день, 2 дні, 5 днів; 1 відповідь,
2 відповіді, 5 відповідей; 1 речення, 5 речень; 1 раз, 2 рази, 5 разів). E.g. «Вивчено 10 слів», «3 дні поспіль»,
«Ціль виконано 1 раз», «Ціль виконано 7 разів».

Tests in `test/achievements.test.js` and `test/word-categories.test.js`; READMEs; `mcp-instructions.js` and
`docs/CLAUDE_PROJECT_INSTRUCTIONS.md` mention the category field and the achievements tool in one line each.

## 3. Page: letter diff and article baskets (part C1)

### 3.1 Де саме помилка
Pure `buildLetterDiff(typed, right)` in logic.js: case-insensitive alignment (Levenshtein with backtrace) →
`[{ kind: 'same'|'wrong'|'extra'|'missing', typed?, right? }]` (`wrong`: a substituted letter, `extra`: a typed
letter not in the answer, `missing`: an answer letter not typed). Returns null when the edit distance is more than
`max(2, ⌊right.length / 3⌋)` or either side is empty (too far apart to be useful).

In the practice (UA → NL of the FSRS practice and the word custom drills, not form decks): after a checked answer
that is not `good`, when the typed text (without the article) and the right word give a diff, show under the message
`#practice-diff` with two rows: «Ти написав» and «Правильно», letters as spans. In «Ти написав» a `wrong`/`extra`
letter is struck through (`.letter--bad`, the strike line draws in); in «Правильно» a `wrong`/`missing` letter drops in
(`.letter--fix`, green). Hidden otherwise. The article is compared separately: when only the article is wrong, no diff
(the message already says so).

### 3.2 Артикль: два кошики (mode «Артикль»)
The article practice (`renderArticlePractice`) shows the word as a draggable chip above two baskets «de» and «het»
(instead of the text input). Drag the chip (pointer events, touch-action none) and drop it over a basket; on release
over a basket it is answered. A right answer: the chip flies into the basket and fades, the basket glows green and
pulses, its counter goes up («3 слова»), the next word pops in. A wrong answer: the basket shakes red, the chip flies
back, the message shows «✗ Правильно: het huis» and the right basket glows; «Далі» (the existing button) continues.
Released outside a basket: the chip springs back. Keyboard: the chip is focusable; arrow left = de, arrow right = het,
and the baskets are also buttons (so it stays usable without dragging). Hint under the baskets:
«Перетягни слово в кошик». Score line unchanged («Вірно: …» → change it to «Правильно: x з y»).

Tests: `test/letter-diff.test.js` (alignment cases: huiz/huis, fiest/fiets, morgan/morgen, nagerect/nagerecht,
too far → null), the article hit test as a pure function `findBasketAt(point, rects)`.

## 4. Page: daily goal, week recap, calendar (part C2)

### 4.1 Ціль на день (Головна)
A card under the greeting header, above «Практика на сьогодні»: a ring (SVG, stroke-dashoffset, spring), the number
inside (`14` and small «з 20»), the line «Ще 6 відповідей до цілі» / «Ціль виконано! Можна ще, але вже без поспіху.»
When the goal is reached for the first time today (remember the date in localStorage `goalCelebrated`) the ring turns
green and petals burst around it once. Data: `GET /api/goal`, refreshed when Головна is shown and after the practice
posts answers (on showing Головна is enough). Offline: the card hides.

Profile: a field «Ціль на день» (number input 5–500, step 5) with «Зберегти»; saved via `PUT /api/goal`; message
«Збережено» or the server error.

### 4.2 Тиждень у підсумку (new tab `week`)
Title «Тиждень у підсумку», subtitle «Твій тиждень коротко». Opened from a home tile (in `.practice-tiles`, title
«Тиждень у підсумку», line «Підсумок тижня»). Story slides with progress segments on top; auto-advance every 4 s;
tap the right half = next, left half = back; it stops on the last slide (no loop). Slides (skip a slide whose data is
null or 0):
1. «Цього тижня» · big `<answers>` · «відповідей, <accuracy> % правильно»
2. «Нових слів» · big `<started_count>` · «почато, <learned_count> вивчено»
3. «Найкращий день» · big weekday name (понеділок … неділя) · «<answers> відповідей, <accuracy> % правильно»
4. «Найважче слово» · big `de rekening` · «<mistakes> помилок — воно буде частіше»
5. «Серія» · big «<current> днів» · «найдовша — <longest> днів»
6. «Час навчання» · big «2 год 5 хв» (formatDuration) · «за <days_practised> днів практики»
Below the story: two buttons «Цей тиждень» / «Минулий тиждень» (week=current / previous; the chosen one is pressed).
Empty week: one slide «Цього тижня ще немає відповідей» · «Почни практику, і тут з'явиться підсумок».
Pure `buildWeekSlides(week)` in logic.js with tests. Plurals with the existing `pluralize`.

### 4.3 Календар занять (Статистика)
A new stats card «Календар занять» (after the chart): 12 weeks (`GET /api/stats/calendar?days=84`), columns = weeks
(Monday on top), 5 levels by answers (0, 1–14, 15–34, 35–59, 60+): `--garden-tint`, `#e6d6ad`, `--garden-primary`,
`--garden-olive`, `--garden-forest`. Cells pop in as a wave the first time the card renders in a visit. Tap a day →
the line under it: «14.11: 54 відповіді, 90 % правильно» or «14.11: без практики». A legend «менше … більше».
Horizontal scroll inside the card if narrow. Pure `buildCalendarGrid(days)` → weeks of cells with level and label,
tested.

## 5. Page: achievements (part C3)

- Profile, above the menu: a card «Досягнення» with the count «Отримано 12 з 87», a row of the latest unlocked medals
  (up to 6), and «Усі досягнення» opening the new tab `achievements` (title «Досягнення», subtitle «Твої відзнаки»).
- The tab: groups in the server order, each a section with its title and a grid of medals (4 per row at 360 px).
  A medal: round, unlocked = gold gradient with the icon, locked = muted with the icon greyed; under it the title and,
  when locked, a thin progress bar with «7 / 10». Tap a medal → a sheet/dialog with the title, description and progress
  («Отримано» or «Ще 3 до відзнаки»).
- New unlocks: the page keeps the ids seen in localStorage `achievementsSeen`. On load of the list (when Profile or
  the tab is shown, and on Головна after practice), ids unlocked but not seen get a toast at the top «Нове досягнення:
  <title>» with the medal popping and a shine sweeping over it, one after another; then they are saved as seen. The very
  first load saves all current unlocks as seen without toasts (no flood).
- Icons: small inline SVGs drawn in `public/achievement-icons.js` (exported `drawAchievementIcon(name)` returning an
  SVG element), simple 24×24 strokes in the style of the bottom-menu icons; one per icon name of §2.2 including every
  category id (food: a fork and knife, home: a house, clothes: a T-shirt, colours: a palette, numbers: a clock,
  people: two people, body: a heart, city: a bus, work: a book, nature: a leaf and sun, leisure: a ball, feelings: a
  smile, actions: a running figure or arrow, talk: a speech bubble).
- `api.js` gets `getAchievements`, and C2 adds `getGoal`, `saveGoal`, `getWeek`, `getCalendar`.

## 6. Order and ownership
S1 and S2 are server parts; C1–C3 page parts coded against the shapes above. Each part works in its own git worktree
and branch and touches only what its part needs; shared files (`index.html`, `app.js`, `logic.js`, `api.js`,
`garden.css`, `create-domain-services.js`, `create-api-router.js`) get small, local additions so the branches merge.
