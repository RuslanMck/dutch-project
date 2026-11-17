The tiles of Вчити under «Слова» (Артикль, Важкі слова, Що я знаю) and «Речення» (Порядок слів, Граматика, Фрази), and the «Мої колоди» strip.

- `.learn-tiles` — three columns, two under 340px. `.learn-tile` — a raised card: a 40px square with a `garden-sand` fill holding the line icon, the name in the heavy weight, one short line in `garden-ink-soft`.
- `.learn-deck` — a raised card in the horizontal strip: «Усі слова» (Картки) first, then the decks, then «Нова колода» with a dashed outline. An empty deck is disabled.

The tiles open their page or exercise (`data-tab`, or a button for Важкі слова); a deck starts its practice; «Усі» opens the Колоди page.

Accessibility: each tile and deck is one button, and its text is its name and line. A disabled deck says why in its line.

Markup from `public/index.html` (tiles) and `app.js` (the deck strip); styled by `storybook/styles/garden.css`.
