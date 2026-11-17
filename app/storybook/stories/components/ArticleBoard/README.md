The article exercise («Артикль»): one Dutch word on a chip and two baskets, «de» and «het». The learner drags the chip into the right basket or taps a basket. The baskets count the words put into them.

- `.article-chip` — the word on a card; `--dragging` while it is held (lifted, shadow); `--gone` after it flew into the right basket.
- `.article-basket` — a basket button with its name and a count (`.article-basket__count`, muted); `--over` when the chip is above it, `--right` after the right answer (a green glow), `--shake` after a wrong one.
- `.article-hint` — the line under the baskets: «Натисни на кошик або перетягни в нього слово».

Use it for the article of a noun: de or het. Don't use it for the whole word (the dictionary and the flash card show the article with the word).

Accessibility: the chip is focusable (`tabindex="0"`) and takes the arrow keys (`aria-keyshortcuts="ArrowLeft ArrowRight"`); the baskets are buttons with their names; the right and wrong answer also has words in the message line, not only the glow or the shake.

Markup from `public/index.html` (`#practice-board`) and `public/app.js` (`renderArticleBoard`); the count text from `formatBasketCount`. Styled by `storybook/styles/garden.css`.
