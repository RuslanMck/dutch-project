Plain `<button>` styled by the base stylesheet: `garden-sand` fill, no border, `garden-radius-sm`, weight 700, at least `tap-min` tall.

- `.primary` — gold `garden-primary` fill, dark `garden-on-primary` text (6.6:1, never cream), weight 800, `garden-radius` corners and the `garden-lift` shadow. One per view: the action that moves study forward (Перевірити, Далі, Додати).
- default — secondary choices (Не знаю, Скасувати, Назад).
- `.ghost` — transparent, `garden-ink-soft` text; low-stakes exits (Вийти).
- `.danger` — deep rust `garden-wrong` fill, cream `garden-raised` text; only inside a confirm dialog.
- Disabled "waiting" buttons drop to 50% opacity.

Consumer supplies: the label (Ukrainian verb), `type`. Study actions in a row use `flex:1` and `tap-large` height.

Markup from `public/index.html`; styled by `storybook/styles/garden.css`.
