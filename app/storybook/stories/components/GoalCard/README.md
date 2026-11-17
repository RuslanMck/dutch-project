The daily goal on Головна: a ring that fills with the answers of today, the number in its middle («6 з 10») and one line under the title («Ще 4 відповіді до цілі»).

- default — the arc in `garden-primary` on a `garden-tint` track; the card is `garden-raised`.
- `.goal-card--reached` — the arc turns `garden-forest` and the line says the goal is done. The ring stays full; extra answers do not show as more than 100%.

Use it for the one daily target. Don't use it for a long-term count (use StatTile) or for the goal form (GoalForm).

Accessibility: the line is `role="status"`, so a change is read out. The ring is decorative (`aria-hidden`); the number and the line carry the meaning.

Markup from `public/index.html` (`#home-goal`) and `public/logic.js` (`buildGoalView`); styled by `storybook/styles/garden.css`.
