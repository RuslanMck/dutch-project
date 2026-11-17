Налаштування: the list of colour themes. A tap applies the theme to the whole app at once and keeps it on this device.

- `.theme-picker` — a borderless `fieldset` with the «Тема» legend, a hint and the «Осінній гарбуз» group label.
- `.theme-option` — a `garden-raised` card with `data-theme="<id>"`, so each card is drawn in its own theme's
  colours: five swatches (`garden-paper`, `garden-sand`, `garden-primary`, `garden-mustard`, `garden-forest`), the
  name, a one-line mood in `garden-ink-soft`, and a check mark.
- Chosen: a 2px `garden-ink` border and the check mark. Keyboard focus: a `garden-ink` outline.

The themes come from `colorThemes` in `tokens/tokens.json`; `npm run tokens` turns each into a `[data-theme]` block.
On `<html>` the attribute switches the app; `public/theme.js` puts the saved one there before the page draws.

Use it only in Налаштування. Don't use `data-theme` elsewhere to tint a single component.

Accessibility: real radio inputs named `theme` inside a `fieldset` with a `legend`; the input is visually hidden but
stays focusable, and the choice is shown by the border and the check, not by colour alone.

Markup from `public/index.html` (`#tab-settings`); styled by `storybook/styles/garden.css`.
