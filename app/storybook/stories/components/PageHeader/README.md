The gold header band at the top of every tab except Головна (which has `HomeHeader`): the page title and a one-line subtitle.

- Same band as `HomeHeader`: a `garden-primary` → `garden-sand` gradient, `garden-radius-lg` bottom corners, `garden-ink` text. Shorter, because no search field overlaps it.
- Title: 26px `--garden-weight-heavy`, the `h1` of the page (`#page-title`, focused on tab change).
- Subtitle: 14px `--garden-weight-regular`, from `TAB_SUBTITLES` in `public/logic.js`. Keep it to a few words; an empty one is hidden.

Markup from `public/index.html`; text set by `showTab` in `public/app.js`; styled by `storybook/styles/garden.css`.
