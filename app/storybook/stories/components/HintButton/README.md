The «i» button next to a line of practice that reveals a `.hint` paragraph (`garden-sand` ground, `garden-ink` text, `small`). In the app it is `#practice-progress-hint-button`, in the practice progress row: it explains what the remaining count means.

It is a plain `IconButton` (`.icon-button`, 44px target) with a 22px `garden-icon` info icon, placed in the row of the practice's other icon buttons.

- **Closed** (`aria-expanded="false"`): `garden-ink-soft` icon, no fill; the hint is `hidden`.
- **Open** (`aria-expanded="true"`): `garden-ink` on a `garden-sand` square, the same "on" state as every icon button; the hint shows under the row.

Use it for any explanation longer than one line. The button toggles `aria-expanded` and the hint's `hidden`. It always has an `aria-label`; the SVG is `aria-hidden`. The mode select and its explanation are gone: the mode is chosen on Вчити.

Markup from `public/index.html` (`#practice-progress-hint-button`, `#practice-progress-hint`); styled by `storybook/styles/garden.css`.
