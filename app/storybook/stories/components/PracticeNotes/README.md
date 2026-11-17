The small muted lines around the practice answer: the example sentence of the word, the kind of set with its count, the schedule after an answer, the note of a drill or a finished set, and the link to the known-words check.

- `.practice-example` — the example: `.practice-example__nl` in ink and `.practice-example__uk` in muted text, under the answer.
- `.practice-kind-line` — «Сьогодні нових: 4» or «Залишилось на сьогодні: 6», in `garden-ink-soft`.
- `.practice-schedule` — when the word comes back, after an answer.
- `.practice-custom-note` — the note of a drill: the schedule does not change.
- `.practice-done-note` — the note of a finished set: when the next words wait.
- `.practice-known-link` — a text link-button «Перевірити, що я вже знаю» that opens the known-words check.

Use them for one short line of context on the practice screen. Don't use them for a warning or an error (Message, Notice) or for the summary of a set (RoundSummary).

Accessibility: these lines are plain text, read in order after the answer. The link is a real button with its full text; it is not an icon.

Markup from `public/index.html` (`#tab-practice`) and `public/app.js` (`formatScheduleLine`, `renderPracticeKindLine`); texts from `formatPracticeKindLine` and `formatReviewDoneNote` in `public/logic.js`. Styled by `storybook/styles/garden.css`.
