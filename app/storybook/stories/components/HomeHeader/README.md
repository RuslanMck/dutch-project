The gold header of Головна: the Dutch greeting by the hour, the date in Ukrainian, the line that says what to do next, and the streak chip.

- `.home-header` — gradient from `garden-primary` to `garden-sand`, `garden-radius-lg` bottom corners, `garden-ink` text.
- `.home-header__date` — the weekday capitalised, the day and the month in the genitive («Вівторок, 17 листопада»).
- `.home-streak` — the chip under the date: `garden-raised` fill, `garden-ink` text, the streak icon; «12 днів» with the right plural. Hidden with no streak.
- The subtitle is set by the Далі card's pick: «Почнімо з повторення», «Час для нових слів», «На сьогодні все зроблено».

Only on Головна; every other tab shows the plain page title. Головна has no search field: Словник has its own.

Accessibility: the greeting is the page's heading and takes the focus when the tab opens.

Markup from `public/index.html` (`#tab-home`); styled by `storybook/styles/garden.css`.
