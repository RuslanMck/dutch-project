The Далі card on Головна: the one thing to do next, with a «Почати» button and a small «або …» link to the second choice.

- Light fill `garden-sand`, `garden-ink` text, `garden-ink-soft` for the line; never a dark fill.
- The label «Далі» in small text, the title in heavy `garden-ink`, the line below it.
- «Почати» is the primary button (`garden-primary` fill, `garden-on-primary` text) with the next arrow icon.
- The «або …» link is text only, underlined, `garden-ink`; it is hidden when there is no second choice.
- The order of the choices: words owed for review, then the new words of the day, then the words to drill, then the Артикль.
- When everything is done the card still offers the Артикль, and the link is left out.

Accessibility: the title is the card's heading (`aria-labelledby`); each button names its exercise in its text. The «або …» link is a button, so it can be reached with the keyboard.

Markup from `public/index.html` (`#home-next`), chosen by `pickNextStep` in `public/logic.js`; styled by `storybook/styles/garden.css`.
