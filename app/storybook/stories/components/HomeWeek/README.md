The week on Головна: seven cells for the current Monday-to-Sunday week, Monday first, each shaded by the answers of its day.

- Cells: `garden-tint` for no practice, then `garden-sand`, `garden-peach`, `garden-primary`, `garden-mustard` (light fills only, deeper with more answers) for the calendar's four levels (1 to 14 answers, 15 to 34, 35 to 59, 60 and more).
- Today has a 2px `garden-ink` outline and its name in heavy type; a future day is an empty cell with a dashed `garden-line` edge.
- Each cell has an `aria-label` such as «Понеділок: 64 відповіді»; the short day names («Пн» … «Нд») are hidden from screen readers.
- Under the week: «Минулого тижня: 5 днів, 180 відповідей» (the practised days and the answers), and a «Підсумок» link to the Тиждень page.
- Without a calendar the cells show no shade and the line is hidden.

Markup from `public/index.html` (`#home-week`) and `buildHomeWeek` in `public/logic.js`; styled by `storybook/styles/garden.css`. The card is the `stats-card` look.
