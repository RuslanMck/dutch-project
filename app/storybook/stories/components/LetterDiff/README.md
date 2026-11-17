After a wrong answer in practice, the two rows show where the mistake is, letter by letter: «Ти написав» with the typed letters, «Правильно» with the right ones. The wrong and extra letters are struck through in `garden-wrong`; the right and missing ones drop in in `garden-forest`.

- `.letter-diff__row` — one row: a muted label («Ти написав» / «Правильно») and the letters.
- `.letter` — one letter, 20 px, heavy weight, each with its own `--delay` so the row animates in turn.
- `.letter--bad` — typed wrong or extra: struck through.
- `.letter--fix` — right but missing or wrong: the right letter in forest.

Use it for a spelling mistake in a single word. Don't use it for a whole sentence (the word-order and rule-quiz screens show the sentence) or as the only feedback: the message line always says the right answer in words.

Accessibility: the colour is never alone; the strike-through marks the wrong letter and the row labels say which row is which. For reduced motion the animation is shortened to almost nothing (the global rule in `garden.css`).

Markup from `public/app.js` (`buildLetterRow`, `renderPracticeDiff`) and `public/index.html` (`#practice-diff`); letters from `buildLetterDiff` in `public/logic.js`. Styled by `storybook/styles/garden.css`.
