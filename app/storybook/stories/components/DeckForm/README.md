The forms of a word deck (Колоди): the picker where the learner chooses words from the dictionary, and the form that names the deck and saves it. A deck is an extra list for practice; it does not change the review schedule.

- `.deck-form` — the form: the title, a name field, an optional description and the list of chosen words.
- `.deck-form-word` — one chosen word («de fiets — велосипед») with `.del`, a close icon button that removes it; the label names the word.
- `.deck-form__actions` — «Назад» (plain) and «Створити колоду» (primary, off until a word is chosen).
- `.deck-picker` — the picker before the form: `.deck-picker__head`, the search, `.deck-chips` filters, `.deck-picker__tools` (the sort and the select-all buttons) and `.deck-bar` with the count and «Додати слова».

Use it to build a deck of chosen words. Don't use it for the list of decks (DeckCard) or for the words of the dictionary (DictionaryList).

Accessibility: each input has a label; the remove buttons have an `aria-label` with the word; the count of words and the selected count are `role="status"`; the save button is disabled, not hidden, until a word is chosen.

Markup from `public/index.html` (`#decks-form`, `#decks-picker-view`) and `public/app.js` (`renderDeckForm`); words from `formatDeckWordLabel` in `public/logic.js`. Styled by `storybook/styles/garden.css`.
