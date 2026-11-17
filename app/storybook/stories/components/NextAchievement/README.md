The medal row on Головна: the next medal to earn, the one locked medal closest to done, with what is still missing.

- Medal icon in a `garden-sand` square; the title «Наступне досягнення: «…»» in heavy `garden-ink`; the line under it in `garden-ink-soft`, such as «Ще 2 дні серії» or «Ще 7 слів».
- Tapping the row opens the Досягнення page (the same `data-tab` as the section tabs).
- The row is hidden when no locked medal has started, or when the medals are not read.
- A long title wraps inside the row; the arrow stays on the right.

Accessibility: the whole row is one button, so its text is its name; the icons are hidden from screen readers.

Markup from `public/index.html` (`#home-achievement`) and `pickNextAchievement` in `public/logic.js`; styled by `storybook/styles/garden.css`.
