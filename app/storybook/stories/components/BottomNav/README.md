The fixed bottom bar on every tab: Головна, Колоди, ▶ (Практика), Статистика, Профіль. The current item has `aria-current="page"`: its icon sits on a `garden-sand` pill (▶ gets a `garden-ink` ring). Tabs without their own item light their group (`NAVIGATION_SECTION_FOR_TAB`).

- `.bottom-nav` — `garden-raised`, `garden-radius-lg`, `garden-shadow`, 68px tall, safe-area aware.
- `.bottom-nav__play` — 60px `garden-primary` disc with `garden-lift`, ringed in `garden-paper`.

Accessibility: a `nav` labelled «Розділи»; ▶ has `aria-label="Практика"`.

Markup from `public/index.html`; styled by `storybook/styles/garden.css`.
