A round achievement badge with a line icon: gold when the achievement is unlocked, muted with a greyed icon when it is still locked. The Досягнення page, the unlock toast and the achievement dialog all use it.

- `.medal--unlocked` — a round disc with a gold gradient (`garden-mustard` to `garden-primary`) and an inner ring, icon in `garden-ink`.
- `.medal--locked` — a `garden-sand` disc with a `garden-line` border, icon in `garden-ink-soft` at half opacity.
- `.medal--small` — 44 px, for lists, the recent row and toasts.
- `.medal--large` — 88 px, centred above the title in the dialog.

Use it wherever one achievement is shown by its icon. Don't use it for the count of achievements (use StatTile) or for a whole group of medals (AchievementGroup).

Accessibility: the medal itself is `aria-hidden`; the name is on the parent (`aria-label` on the item or the cell), so the state is in words, not only in colour. The icon is never the only signal: locked medals show their progress as text in AchievementGroup.

Markup from `public/app.js` (`createMedal`, `createMedalCell`) and `public/index.html` (`#profile-achievements-recent`, `#achievement-dialog-medal`); icons from `public/achievement-icons.js`; styled by `storybook/styles/garden.css`.
