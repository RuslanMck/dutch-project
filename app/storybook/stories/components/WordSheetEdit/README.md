The form to edit a word, shown in the word sheet after «Змінити», and the form to add a new word («Додати слово»). Both are the same grid of fields: the Dutch word, the article, the meaning, the topic, the chapter, the two examples, and the actions at the bottom.

- `.sheet__edit` — the form inside the sheet; the margin above it and the `.field` grid (`.field.wide` spans two columns).
- `.field` — one label with its input or select; the span is the visible label.
- `.category-select` — the topic list, filled from the categories of the dictionary.
- `.segmented--three` — the priority choice on the add sheet («Авто», «Вчити першим», «Пізніше»); the value is kept in a hidden input.
- `.sheet__actions--pair` — «Скасувати» (ghost) and «Зберегти» or «Додати» (primary), side by side.

Use it for the fields of one word. Don't use it for the details of a word (WordSheet) or for a single short field (Field).

Accessibility: every input has a visible label; the required fields are marked with `required`. The priority group has `role="group"` and its label.

Markup from `public/index.html` (`#word-sheet-edit`, `#word-add-sheet`); styled by `storybook/styles/garden.css`.
