The «i» next to a label that reveals a `.hint` paragraph (`garden-sand` ground, `garden-ink` text, `small`).
It is an `IconButton` in its compact size: `.icon-button.icon-button--compact` (32px target) with a `garden-icon--sm` (18px) info icon,
so it doesn't make the label row much taller. Beside other icon buttons (the practice meta row) use the normal
`.icon-button` with a 22px icon.

- **Closed:** `garden-ink-soft`, no fill.
- **Open** (`aria-expanded="true"`): `garden-ink` on a `garden-sand` square — the same "on" state as every icon button.

Use it for any explanation longer than one line. The button toggles `aria-expanded` and the hint's `hidden`.
It always has an `aria-label`; the SVG is `aria-hidden`.

Markup from `public/index.html`; styled by `storybook/styles/garden.css`.
