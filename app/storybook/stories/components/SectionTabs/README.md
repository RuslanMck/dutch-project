The row of section links under the page header of Словник (Слова, Правила, Тексти) and Прогрес (Статистика, Тиждень, Досягнення). Each link is a `data-tab` button; the one on screen has `aria-current="page"`. They are plain tabs with an underline, so they never look like the period or filter segments below them.

- `.section-tabs` — a row of equal tabs on a `garden-line` hairline, 14px below.
- `button` — `garden-ink-soft` text, no fill; `[aria-current="page"]` — `garden-ink` text and a 3px `garden-ink` underline.

When to use: only on the six pages of the two sections. Not for the exercises, which have their own ✕ bar.

Accessibility: a `nav` with a label for its section («Розділи словника» or «Розділи прогресу»); the current link is marked by `aria-current` and the underline, not by colour alone.

Markup from `public/index.html`; styled by `storybook/styles/garden.css`.
