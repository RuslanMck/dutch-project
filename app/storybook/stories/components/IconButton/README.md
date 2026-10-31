A 44px transparent button holding one 22px line icon (`.garden-icon`). See **Foundations/Icons** for the icon rules.

- **Rest:** `garden-ink-soft`; `garden-ink` on hover.
- **On** (`aria-pressed="true"` for toggles like shuffle, `aria-expanded="true"` for the «i» hints): `garden-ink` on a
  `garden-sand` square with `garden-radius-sm`. Every icon button uses this one "on" state.
- **Compact** (`.icon-button--compact`): 32px target with an 18px `garden-icon--sm`, only inline next to a label.
- `.del` is the row delete in lists and tables: an 18px close icon. First tap adds `.armed`, which shows
  «видалити?» in `garden-wrong`; the second tap deletes.
- Always pass an `aria-label` in Ukrainian.

Markup from `public/index.html` and `public/app.js`; styled by `storybook/styles/garden.css`.
