The two-layer bar above the practice question: how much of the set (or drill) is done, word by word.

- **Learned** (`garden-forest`, solid): the words with no round left, as a share of the set.
- **In play** (`garden-primary` stripes): the progress made by the words in the active window or already started —
  their finished rounds and, for FSRS words, the right answers their deck still needs. A mistake only slows a word
  down, so the bar never jumps back the way a queue-length bar did.
- **Waiting** (`garden-tint` track): the rest.
- The legend under the bar names the three counts: «Вивчено 3 · Вчимо 4 · Чекають 3».

The numbers come from `buildSetProgress` in `public/logic.js`; a layer at 0 is hidden so the 2px gap shows only
between two layers. Use it for a set of words practised in rounds (Нові слова, Запам'ятовування, drills); a plain
share of something uses `ProgressBar`.

Accessibility: `role="progressbar"`, `aria-valuenow` = the learned share, `aria-valuetext` = «Вивчено 3 з 10, вчимо 4,
чекають 3»; the legend is `aria-hidden` because the value text says the same.

Markup from `public/index.html`; styled by `storybook/styles/garden.css`.
