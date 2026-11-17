One group of achievements on the Досягнення page: a title («Серія днів», «Слова») and a grid of medal cells. Each cell is a button with its medal, its name and, while locked, a progress bar with «N / M».

- `.achievement-group` — the section of one group; its `h2` is `.stats-card__title`.
- `.medal-grid` — the grid of cells, two or three per row by width.
- `.medal-cell` — the whole cell is the tap target (at least 44 px tall) and opens the medal's dialog.
- `.medal-cell__title` — the name, wrapping onto two lines when long.
- `.medal-bar` and `.medal-cell__count` — the progress of a locked medal; unlocked cells have neither.

Use it for a list of medals grouped by topic. Don't use it for one medal (Medal) or for the notification after an unlock (AchievementToast).

Accessibility: the cell's `aria-label` gives the name and the state in words («Ще 13 до відзнаки», «Отримано»). The bar is `aria-hidden` because the count text says the same.

Markup from `public/app.js` (`createAchievementGroup`, `createMedalCell`); styled by `storybook/styles/garden.css`.
