A short message at the top of the screen when the learner unlocks an achievement: «Нове досягнення: Перша серія», with the small medal beside it. One toast at a time; it leaves by itself and never blocks taps.

- `.achievement-toasts` — the fixed container at the top, centred, with `aria-live="polite"`.
- `.achievement-toast` — the card: a light raised fill, one line of text.
- `.medal--shine` — the shine that passes over the medal once, with `.medal--pop` for the pop-in.
- `.achievement-toast--out` — the leaving state (fade and a small rise) before the toast is removed.

Use it for a new unlock the learner did not ask for. Don't use it for errors or for a confirmation of a tap (Notice or Message).

Accessibility: the text is the announcement (`aria-live="polite"`), so the medal is `aria-hidden`. The toast does not take focus and needs no action; the medal itself can be read on the Досягнення page.

Markup from `public/app.js` (`showNextAchievementToast`); styled by `storybook/styles/garden.css`. The container sits outside `main` in `public/index.html` (`#achievement-toasts`).
