The practice calendar on the Статистика page: one square per day, weeks as columns with Monday on top, shaded by the answers of that day. Tapping a day shows its detail under the grid.

- `.calendar__cell--l0` … `--l4` — the five levels: 0 answers (the palest), 1–14, 15–34, 35–59, 60 and more (the darkest, `garden-forest`).
- `.calendar__cell[aria-pressed="true"]` — the chosen day, outlined in `garden-ink`.
- `.calendar__legend` — the scale with the words «менше» and «більше».
- `.calendar__detail` — the line under the grid: «Торкнися дня, щоб побачити деталі.» or the day's label («02.11: 64 відповіді, 81 % правильно»).

Use it for the answers per day over a few months. Don't use it for a single number (StatTile) or the week's bars (BarChart).

Accessibility: every cell is a button with an `aria-label` that gives the date, the answer count and the accuracy, so the colour is never the only signal. The legend is `aria-hidden`; the words in it repeat what the detail line says.

Markup from `public/app.js` (`renderCalendar`, `buildCalendarGrid`) and `public/index.html` (`#stats-calendar`); styled by `storybook/styles/garden.css`.
