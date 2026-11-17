Three numbers under the week on Головна, in the same tile look as the statistics page.

- «N слів учу»: words in progress, the learning words plus the FSRS review set.
- «N нових сьогодні»: the new words of today; the noun agrees with the count («нове», «нові», «нових»).
- «N% правильно за 7 днів»: the share of right answers over the last seven days, rounded.

Each tile is a `stat-tile` (`garden-raised`, `garden-line` edge, `garden-radius`): the number is the big heavy text, the words under it are `garden-ink-soft`. Unknown numbers show «—», never a zero or an empty value.

Markup from `public/index.html` (`#home-numbers`) and `buildHomeNumbers` in `public/logic.js`; styled by `storybook/styles/garden.css`.
