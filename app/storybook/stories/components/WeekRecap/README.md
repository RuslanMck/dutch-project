The week in slides on the Тиждень у підсумку page: a short story with a progress bar on top (one segment per slide), a big number or text, and tap zones on the left and right to step back and forward. Under it, the choice between this week and the last one.

- `.week-story__segment` — one slide's segment; `--timed` is the slide on screen (it fills by itself), `--done` the ones already shown.
- `.week-story__big` — the big number in `garden-ink`; `--text` for the empty week, when the number is a sentence.
- `.week-story__zone--back` / `--next` — invisible tap areas over the slide, with an `aria-label` each.
- `.segmented--two` — «Цей тиждень» / «Минулий тиждень» (`aria-pressed` on the current one).

Use it for the weekly summary in slides. Don't use it for a table of days (Calendar) or the whole stats page (BarChart, StatTile).

Accessibility: the zones are buttons with «Попередній слайд» and «Наступний слайд»; the slide text is real text, so a screen reader reads it without the animation. For reduced motion the animations are shortened (the global rule in `garden.css`).

Markup from `public/index.html` (`#tab-week`) and `public/app.js` (`renderWeekSlide`); slides from `buildWeekSlides` in `public/logic.js`. Styled by `storybook/styles/garden.css`.
