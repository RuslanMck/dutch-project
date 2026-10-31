# Сад layout — bottom navigation, home screen, word sheet, practice progress

The Сад look (colours, type, shapes) shipped first as a restyle. This spec moves the app to the Сад *layout* from the
Storybook sketches. UI text stays Ukrainian; behaviour of practice, grading and the schedule does not change.

## Decisions

| Question | Decision |
|---|---|
| Navigation | A fixed bottom bar replaces the drawer: **Головна · Колоди · ▶ · Статистика · Профіль**. |
| Where the 9 sections go | Home tiles: Картки, Порядок слів, Фрази, Важкі слова. Профіль: Слова (the table), Правила, Тексти, Вийти. ▶ opens Практика. Колоди and Статистика are in the bar. |
| Active item in the bar | Головна for home and its tiles (cards, word order, phrases), ▶ for practice, Профіль for table, rules, texts. |
| ▶ centre button | Opens Практика. The FSRS session already resumes where it stopped, so ▶ continues an open session or starts today's. |
| Greeting | «Hoi!» with «Що вчимо сьогодні?». No name: the repository is public and the app has one user. |
| Home search | A search field; typing and Enter opens Слова with the query applied. |
| «Продовжити» card | FSRS practice: words due today, words in progress, a progress bar of started (not new) / all words. Button opens Практика. Title «Практика на сьогодні» (the FSRS session resumes by itself; the app keeps no reliable «answered today» signal in the browser). |
| Tiles | Картки (word count), Порядок слів (the rule filter summary), Фрази (phrase count), Важкі слова (count from the struggling-words read; starts that drill). |
| First screen | Головна for a new visitor; the last tab is still remembered. |
| Слова | The table stays (bulk editing and sorting). Tapping a word opens a bottom sheet: word with article, translation, example, status, next review, errors, chapter; «Закрити». Delete stays in the row. |
| Practice | A thin progress bar above the question for the set (FSRS and custom drills), from the words left in the queue. The round summary gets a gold celebration header. |
| Old drawer | Removed with its JavaScript. The page title header stays on every tab except Головна, which has the gold header. |

## Phases

- **A.** Bottom bar, Головна, Профіль; drawer removed. `logic.js`: `NAVIGATION_SECTION_FOR_TAB`, `buildHomeSummary`.
- **B.** Word detail sheet on Слова. `logic.js`: `buildWordDetailView`.
- **C.** Practice progress bar and round celebration header. `logic.js`: `computeQueueProgressPercent`.

Each phase adds Storybook stories (BottomNav, HomeHeader, PracticeTile, ContinueCard, ProfileMenu, WordSheet,
ProgressBar) and `node --test` cases for the new pure helpers.

## Not in scope

Reworking Картки, Порядок слів or Статистика screens beyond the Сад styles; a name setting; illustrations.
