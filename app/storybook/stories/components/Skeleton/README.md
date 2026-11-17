Grey placeholder bones that show the shape of a screen while its content loads, so the page does not jump when the content arrives. Today it is used by the rule quiz while the new questions are made.

- `.skeleton` — the column of bones, full width, hidden from screen readers (`aria-hidden`).
- `.skeleton__bone` — one bone; `--short`, `--medium` and `--field` set its width (`--field` matches an input's height).
- `.rule-quiz__loading` — the loading block: a moving pot, the status text and the note «Це може тривати до хвилини.».

Use it for content that is on its way and has a known shape. Don't use it for a short action (a button shows its own state) or for a long wait with no shape (use the status text alone).

Accessibility: the block is `role="status"` with real text, so the wait is announced; the bones carry no meaning and are hidden. For reduced motion the animations are shortened (the global rule in `garden.css`).

Markup from `public/index.html` (`#rule-quiz-loading`); styled by `storybook/styles/garden.css`.
