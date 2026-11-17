The dictionary page («Словник») in its parts: the search with «Додати слово», the filter chips for the state and the priority, the topic select, the list of word rows, and the card that suggests common words the dictionary does not have yet.

- `.dict-toolbar` — the search field and the primary «Додати слово».
- `.dict-chips` — a row of toggle chips (`aria-pressed`); the state chips «Усі», «Нові», «Вчу», «Вивчені» and the priority chips «Вчити першим», «Пізніше».
- `.dict-category` — the topic select («усі теми» first).
- `.dict-list` and `.dict-row` — one row per word: `.dict-row__word` (the article in `.art` and the Dutch word), `.dict-row__translation` in muted text, and `.dict-row__chips`.
- `.dict-chip` with a tone: `--category`, `--learning`, `--learned`, `--first`, `--later` have their own colour; `--new` and `--due` use the plain chip.
- `.dict-suggest` — the card at the bottom: the checklist of suggested words (`.deck-row`) and «Додати вибрані (N)».
- `.empty` — the line «Нічого не знайдено.» when the search or the filter has no match.

Use it for the word list and its controls. Don't use it for one word's details (WordSheet) or for the words of a deck (DeckForm, DeckCard).

Accessibility: the search has a label; the chips are toggle buttons with `aria-pressed`, so the state is not colour alone; each row is one button that opens the word's sheet, with the full text inside it. The list has `aria-label="Слова"`.

Markup from `public/index.html` (`#tab-table`, `#suggest-card`) and `public/app.js` (`buildDictionaryRows`, `renderSuggestions`); chip texts from `buildWordChips` in `public/logic.js`. Styled by `storybook/styles/garden.css`.
