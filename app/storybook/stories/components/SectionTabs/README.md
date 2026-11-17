The row of section links under the page header of Словник (Слова, Правила, Тексти) and Прогрес (Статистика, Тиждень, Досягнення). Each link is a `data-tab` button; the one on screen has `aria-current="page"` and is filled in `garden-primary` like a pressed segment. The row uses the `.segmented` look with three columns.

- `.section-tabs` — the `.segmented--three` grid, 14px below.
- `.section-tabs button[aria-current="page"]` — `garden-primary` fill, `garden-on-primary` text.

When to use: only on the six pages of the two sections. Not for the exercises, which have their own ✕ bar.

Accessibility: a `nav` with a label for its section («Розділи словника» or «Розділи прогресу»); the current link is marked by `aria-current`, not by colour alone (the text is the same).

Markup from `public/index.html`; styled by `storybook/styles/garden.css`.
