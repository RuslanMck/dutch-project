# Navigation redesign: Вчити hub, new Головна, one icon set

Approved by the owner on 17.11.2026 (design pages «Нова навігація», «Сторінка Вчити», «Нова Головна», «Іконки»).
This file is the shared spec for every implementer. All UI text is correct literary Ukrainian (no russianisms).

## 0. Rules for every part

- Styles only in `storybook/styles/garden.css`, colours only through `garden-*` tokens (themes must keep working:
  never a raw hex in CSS or markup, except inside the logo SVG that is already there). Run `npm run app-css`.
- **No large dark areas.** Big cards and strips use light fills (`garden-raised`, `garden-sand`, `garden-tint`,
  `garden-peach`, `garden-blush`, `garden-right-soft`); dark colours (`garden-ink`, `garden-forest`, `garden-rust`) only
  for text, icons and thin lines.
- Icons: 24×24, 2px round stroke, no fill, `class="garden-icon"`, `aria-hidden="true" focusable="false"`; paths in §6.
- Every changed or new component gets its Storybook story + README in the same commit (skill
  `.claude/skills/storybook-maintenance/SKILL.md`). Story markup = app markup.
- Keep the code style of `public/app.js` (small named functions, `$()` helper, comments that say why).
  Pure helpers go to `public/logic.js` with unit tests in `test/`.
- Don't touch server code, migrations, the practice algorithm or the offline store.
- Tests: `docker run --rm -v /srv/dutch-project/app:/app -v /srv/data/dutch/seed:/seed:ro -e DUTCH_SEED=/seed/dutch-export.json -w /app node:24-bookworm-slim node --test`
  must stay green. Update existing tests that pin markup you changed (don't delete their intent).

## 1. Bottom bar (part B)

Five sections, each a section, never an action. No ▶ button.

| Item | `data-nav` | Opens tab | Icon (§6) |
|---|---|---|---|
| Головна | `home` | `home` | home |
| Словник | `dictionary` | `table` | dict |
| **Вчити** (round hub in the middle) | `learn` | `learn` | book |
| Прогрес | `progress` | `stats` | stats |
| Профіль | `profile` | `profile` | profile |

- The hub: a round disc like today's play button (same size and place, `garden-primary` fill, `garden-on-primary`
  icon), with the label «Вчити» under it like the other items. Active state: a 2px `garden-ink` ring around the
  disc and the label in `garden-ink` (no dark fill). `aria-current="page"` as today.
- `NAVIGATION_SECTION_FOR_TAB` / `NAVIGATION_ORDER` in logic.js / app.js:
  - home: `home`
  - dictionary: `table`, `rules`, `texts`
  - learn: `learn`, `practice`, `cards`, `decks`, `phrases`, `word-order`, `rule-quiz`, `known-check`
  - progress: `stats`, `week`, `achievements`
  - profile: `profile`, `settings`
- Order for the slide direction: home, dictionary, learn, progress, profile.
- Titles: `learn: 'Вчити'` / subtitle `'Усі вправи в одному місці'`; `stats` title becomes `'Прогрес'`
  (subtitle stays). `table` title stays «Словник».

## 2. Section tabs inside Словник and Прогрес (part B)

A row of three links under the page header, the existing `.segmented` look, buttons with `data-tab` and
`aria-current="page"` on the current one, inside `<nav class="section-tabs" aria-label="…">`:

- Словник (on `table`, `rules`, `texts`): «Слова» → `table`, «Правила» → `rules`, «Тексти» → `texts`.
- Прогрес (on `stats`, `week`, `achievements`): «Статистика» → `stats`, «Тиждень» → `week`,
  «Досягнення» → `achievements`.

Put the row at the top of each of those six sections (one markup per section, or one shared element moved by
`showTab` — your choice, but the current one must be marked).

## 3. Профіль (part B)

Profile keeps: Ціль на день, Поточна глава, the menu with only «Налаштування», and «Вийти».
Remove from Профіль: the achievements card (achievements live in Прогрес → Досягнення) and the Словник/Правила/Тексти
menu links. Use the new icons for Налаштування (keep its sliders icon) and add the logout icon to «Вийти».

## 4. The Вчити page — new tab `learn` (part B)

Section `#tab-learn` (`data-tab="learn"`), the normal gold page header («Вчити» / subtitle). Top to bottom:

1. **Продовжити strip** `#learn-resume` (button), only when the daily practice has an unfinished set open in this
   visit: `ui.fsrs` has a loaded session of kind new/review with at least one answer given and words left, or a custom
   drill is running. Text «Продовжити: Нові слова» / «Продовжити: Запам'ятовування» / «Продовжити: тренування» and a
   small line «Залишилось N» when known. Light fill (`garden-sand`), ink text, the «Далі» arrow icon on the right.
   Tap → the practice in that mode, as it was. Hidden otherwise (no empty space).
2. **Щодня** label, then two full-width cards (buttons):
   - `#learn-new` «Нові слова», icon new; line «Сьогодні X з 10 · N слів чекають» (X = introduced today, capped
     display at the set size; N = words still new). Thin progress bar X/10. Right side pill «Почати», or «Ще 10» and a
     «Зроблено» mark with the check icon when X ≥ 10. Tap → `openFsrsPractice('fsrs')`.
   - `#learn-review` «Запам'ятовування», icon review; line «N слів на сьогодні · близько M хв»
     (M = max(1, round(N × 15 s / 60))); when N = 0: «На сьогодні все повторено» + «Зроблено» mark, pill «Почати»
     stays (it shows the done screen). Tap → `openFsrsPractice('review')`.
   Counts come from the same source as today's home tiles (`loadHomePracticeCounts`, `/api/practice/stats`);
   unknown → line «…» never «undefined». Fills: new = `garden-right-soft`, review = `garden-peach`.
3. **Слова** label, three tiles in a row (`.learn-tiles`, 3 columns, wrap to 2 under 340px):
   Артикль (icon article, «de чи het», → `openArticlePractice`), Важкі слова (icon hard, «N слів» from the struggling
   count, → today's struggling handler), Що я знаю (icon known, «Пропусти знайомі», → tab `known-check`).
4. **Речення** label, three tiles: Порядок слів (icon order, «Склади речення», → `word-order`), Граматика (icon
   grammar, «У реченнях», → `rule-quiz`), Фрази (icon phrases, «N на сьогодні» from phrases due+new set, else
   «Фрази з діалогів», → `phrases`).
   Tile: icon in a small rounded square with a light fill, name (strong), one short line (soft). Raised card.
5. **Мої колоди** label with an «Усі» link-button on the right (→ tab `decks`, the full deck page as today), then a
   horizontal scroll strip of small cards: first «Усі слова» (Картки · total words, → tab `cards`), then the user's
   decks from `api.listDecks()` (name, word count, thin progress bar if the deck list gives progress), then
   «Нова колода» (add icon, → tab `decks` and open its create form if one exists, else just the tab).

Tab `cards` and `decks` stay as pages; they are now reached from here.

## 5. Exercise screens: full screen with ✕ (part B)

Tabs `practice`, `cards`, `phrases`, `word-order`, `rule-quiz`, `known-check`, and a deck practice if it is its own
tab: while one of them is shown, the bottom bar and the gold header are hidden (`body.is-exercise`) and an exercise
bar sits at the top: `<header class="exercise-bar">` with an `.icon-button` ✕ (close icon, `aria-label="Закрити
вправу"`) on the left and the exercise name (h1, `tabindex="-1"`, gets the focus as the page title does now).
✕ returns to `learn` and restores the scroll position the Вчити page had.

Practice page: the «Режим» select block (`.hint-field` with the label, the info button, the select, the hint and the
«Перевірити, що я вже знаю» link) and the `practice-mode-chip` are no longer shown; the mode is chosen on Вчити.
Keep `<select id="practice-mode">` in the DOM but `hidden`, because app.js reads and writes it. The exercise bar title
shows the mode name («Нові слова», «Запам'ятовування», «Артикль», «Важкі слова», «Тренування»). Keep the progress bar,
the answer form and the `practice-meta` buttons as they are; the existing «is-practice-focused» behaviour stays
correct (header hidden — now always). The page must not jump while the keyboard is open (keep today's focus logic).

## 6. Icons (both parts use these exact paths)

Bottom bar:
- home: `<path d="M3.5 10.5L12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5h4v5"/>`
- dict: `<path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 1h12v-3"/><path d="M9.5 12.5l2-5.5 2 5.5M10.2 10.8h2.6"/>`
- book (Вчити): `<path d="M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1V19c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6.5V20"/>`
- stats: `<path d="M4 20h16"/><path d="M7 16v-3M12 16V9M17 16V5"/>`
- profile: `<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-3.8 4-5.8 7.5-5.8s6.5 2 7.5 5.8"/>`

Exercises: new `<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 10.5v6M9 13.5h6"/>`;
review `<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/><path d="M12 8v4l2.5 1.5"/>`;
article `<path d="M3.5 12.5L11 5h8.5v8.5L12 21z"/><circle cx="15.5" cy="9" r="1.2"/>`;
hard `<path d="M9 8a3 3 0 0 1 6 0"/><path d="M7 9.5h10l1.5 10.5h-13z"/>`;
known `<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.2l2.6 2.6 4.8-5.4"/>`;
order `<path d="M4 6h9M4 12h9M4 18h6"/><path d="M18 4v15M15 16l3 3 3-3"/>`;
grammar `<path d="M14.5 4.5l5 5L9 20H4v-5z"/><path d="M13 6l5 5"/>`;
phrases `<path d="M4 5h11v8H9l-5 4z"/><path d="M15 9h5v8l-3-2h-6v-2"/>`;
cards `<rect x="4" y="7" width="12" height="14" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12"/>`;
decks `<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>`.

Progress / home: goal `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/>`;
streak `<path d="M12 3c.8 3 5 5 5 10a5 5 0 0 1-10 0c0-2.3 1-3.7 2.2-4.8.1 2 .9 3.1 2 3.3-.4-3.2.1-5.7.8-8.5z"/>`;
week `<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="M8.5 14h.01M12 14h.01M15.5 14h.01"/>`;
medal `<circle cx="12" cy="14.5" r="5.5"/><path d="M9 9.8L6.5 3h4l1.5 3.5L13.5 3h4L15 9.8"/>`;
rules `<path d="M3 5h6a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5H21z"/>`;
texts `<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>`;
logout `<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/>`.

Actions: search `<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>`; add `<path d="M12 5v14M5 12h14"/>`;
close `<path d="M6 6l12 12M18 6L6 18"/>`; next `<path d="M5 12h14M13 6l6 6-6 6"/>`;
check `<path d="M5 12.5l4.5 4.5L19 7.5"/>`.

Replace the old paths of these meanings wherever the app shows them (home tiles go away; profile menu, stats,
week, achievements, dictionary search, practice summary buttons that already carry an icon). Update
`stories/foundations/Icons.stories.js` to the new set (drop the filled ▶ and its `garden-icon--filled` rule).

## 7. The new Головна (part C, after part B is merged)

`#tab-home` keeps its own header (no gold page header). Top to bottom:

1. **Header**: the logo as now; greeting by local time: «Goedemorgen!» (5:00–11:59), «Goedemiddag!» (12:00–17:59),
   «Goedenavond!» (18:00–4:59); under it the date «Вівторок, 17 листопада» (Ukrainian weekday + day + month in the
   genitive, capitalised weekday) and a streak chip (streak icon + «12 днів», correct plural: 1 день, 2–4 дні,
   5+ днів; 0 → chip hidden). Streak from `api.getActivity('week')` → `streak.current` (already used by Статистика).
   The search form leaves Головна (Словник has its own search).
2. **Далі card** `#home-next` — a light card (`garden-sand` fill, ink text; no dark fill): small label «Далі»,
   title, line, a «Почати» primary button, and under it a small second suggestion link «або …». Pick, in order:
   review owed > 0 → «Запам'ятовування», «N слів на сьогодні · близько M хв»; else new words today < 10 →
   «Нові слова», «Сьогодні X з 10»; else → «Важкі слова» (if struggling count > 0, «N слів для тренування») or
   «Артикль» («de чи het»). The second suggestion is the next item in the same order that is not the first
   (e.g. «або Нові слова · 0 з 10»). The line above the card (the header subtitle) says «Почнімо з повторення» /
   «Час для нових слів» / «На сьогодні все зроблено». Pure function `pickNextStep(counts)` in logic.js + tests.
3. **Ціль на день** — the existing goal ring card, unchanged in behaviour.
4. **Цей тиждень** — card with seven cells Пн…Нд of the current calendar week (Monday first), shade by answers
   (0 = `garden-tint`; then `garden-sand`, `garden-primary`, `garden-mustard` at 1–19, 20–59, 60+ — reuse the
   calendar's level logic if it exists), today outlined with a 2px `garden-ink` ring, future days dashed outline.
   Data: `api.getCalendar(14)`. Under it a line «Минулого тижня: N днів, M відповідей» and a «Підсумок» link-button
   → tab `week`. Each cell has an `aria-label` like «Понеділок: 64 відповіді».
5. **Three numbers** in a row (stat tiles): «N слів учу» (stats words.learning + fsrs review count, i.e. started and
   not finished — use `buildHomeSummary`'s started count if it fits), «N нових сьогодні» (introduced_today),
   «N% правильно за 7 днів» (`good_share_7_days` from `/api/practice/stats`, rounded). Unknown → «—».
6. **Наступне досягнення** — one row: medal icon, «Наступне досягнення: «title»», line with what's left
   («Ще 2 дні серії» / «Ще 7 слів» / generic «Ще N»), from `api.getAchievements()`: among locked medals with
   progress, the one with the highest current/target; tap → tab `achievements`. Hidden when none.

Remove from Головна: the search form, the «Практика на сьогодні» continue card, the «Тренування» heading and every
practice tile (they live in Вчити). Remove their CSS and stories (ContinueCard, PracticeTiles) only if nothing else
uses the classes; otherwise update the stories.

## 8. Storybook backfill (part A, in parallel with B)

Stories were last brought up to date on 31.10. Add a story + README for every app component that has none, using
the app's current markup: goal ring card, calendar heatmap, week recap, achievements page (medal, group, toast),
letter diff, article baskets, rule-quiz screens, known-check, dictionary rows/chips/filters, word sheet edit form,
round summary drills, offline banner, splash screen, the theme picker (exists), segmented section tabs — whatever is
in `public/index.html` / `public/app.js` and missing in `stories/components/`. Do NOT write stories for parts B and C
replace (bottom bar, home tiles, continue card, home header, practice mode select, profile menu) — those parts update
them. Only touch `storybook/stories/**` and the folder READMEs.

## 9. Order and review

A and B in parallel (separate worktrees) → merge → C on top → tests → clean-context review → fixes → trial copy
(Playwright on 390×844: every tab, the hub, ✕ back, Далі, a full practice set) → deploy (backup first) → push.
