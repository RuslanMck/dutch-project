The two number forms on Профіль: «Ціль на день» (answers per day, 5 to 500) and «Поточна глава» (1 to 99), each with one field, a «Зберегти» button and a status line.

- `.goal-setting` — the `stats-card` that holds the form.
- `.goal-form__row` — the number field and the `.primary` save button side by side.
- `.goal-form__message` — the status line under the form: the error or the saved text, in `garden-ink-soft`.
- `.hint` — the explanation under the chapter field.

Use it for a single small number with a save. Don't use it for a long form (use Field and the sheet forms).

Accessibility: every input has a visible `label` tied by `for`; the message is `role="status"`; the number field has `inputmode="numeric"` and min/max that match the server rule.

Markup from `public/index.html` (`#goal-form`, `#chapter-form`); styled by `storybook/styles/garden.css`.
