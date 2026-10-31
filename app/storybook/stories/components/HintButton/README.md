A small line «info» icon (circle with an i, 18px, `garden-ink-soft`) next to a label that reveals a `.hint` paragraph (`garden-sand` ground, `garden-ink` text, `small`).

- **Closed:** no border or fill, `garden-ink-soft`; `garden-ink` on hover.
- **Open** (`aria-expanded="true"`): `garden-ink` icon with the circle filled `garden-sand`, matching the hint below it.

Use it for any explanation longer than one line. The button toggles `aria-expanded` and the hint's `hidden`.
The target is 32px (above the 24px WCAG minimum) with a negative margin, so it doesn't make the label row taller.
It always has an `aria-label`; the SVG is `aria-hidden`.

Markup from `public/index.html`; styled by `storybook/styles/garden.css`.
