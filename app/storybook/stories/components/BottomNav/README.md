The fixed bottom bar on every tab, five sections: Головна, Словник, Вчити, Прогрес, Профіль. Вчити is the round hub in the middle: a `garden-primary` disc with a `garden-on-primary` book icon, labelled like the other items. The section on screen has `aria-current="page"`. A plain item lights its icon on a `garden-sand` pill; the hub gets a 2px `garden-ink` ring round its disc and the label in `garden-ink` (no dark fill). A page without an item of its own lights its section (`NAVIGATION_SECTION_FOR_TAB`).

- `.bottom-nav` — `garden-raised`, `garden-radius-lg`, `garden-shadow`, 68px tall, safe-area aware. Hidden on the exercise screens.
- `.bottom-nav__item` — a plain section: 24px line icon and a label in `garden-ink-soft`, `garden-ink` when current.
- `.bottom-nav__hub` — Вчити: the same height as the items; the `.bottom-nav__disc` (60px, `garden-primary`, `garden-lift`, ringed in `garden-paper`) hangs above the bar.

The bar stays put when the section changes: the new page slides in from the side, and `.app` clips that slide (`overflow-x: clip`), so the screen never grows wider and a phone never shifts the fixed bar.

Accessibility: a `nav` labelled «Розділи»; every item is a button with its visible label, so no item needs an `aria-label`.

Markup from `public/index.html`; styled by `storybook/styles/garden.css`.
