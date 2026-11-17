The «Що я вже знаю» screen: a batch of new words as chips, and the learner taps the words they already know. The known words go to review in two to four weeks instead of being learned as new.

- `.known-check__chip` — one word with its article and meaning («de fiets · велосипед»); `aria-pressed="true"` shows a «✓» before the word and fills the chip in `garden-forest` with `garden-paper` text.
- `.known-check__actions` — «Знаю всі» (ghost: mark the whole batch) and «Готово» (primary: save the choice).
- `.known-check__result` — the outcome after «Готово»: the count of known words, the next batch («Далі (ще 5)») or the end line («Нових слів більше немає»).
- `.known-check__note` — the explanation at the top.

Use it for a quick check of words the learner already knows. Don't use it for practice (the practice screens) or for marking one word (the word sheet has the priority).

Accessibility: each chip is a button with `aria-pressed`; the check mark is text (`✓`) from CSS, so the state is not colour alone. The result line is `role="status"`.

Markup from `public/index.html` (`#tab-known-check`) and `public/app.js` (`buildKnownCheckChip`, `renderKnownCheck`); texts from `buildKnownCheckResult` in `public/logic.js`. Styled by `storybook/styles/garden.css`.
