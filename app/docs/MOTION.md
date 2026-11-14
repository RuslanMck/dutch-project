# Motion (14.11.2026)

Short animations that make answering feel alive. All of them are CSS keyframes or the Web Animations API, no library:
the app stays as light and works offline. `prefers-reduced-motion: reduce` turns every animation and transition off
(one rule in `garden.css`). No animation blocks input: the answer field and «Далі» work at once.

The demo the learner chose from: https://claude.ai/artifact/5BnHTERU1g7WVXiwp4GExf

DOM helpers live in `public/motion.js` (no state of the app), pure choices in `public/logic.js` (tested).

| Where | What |
|---|---|
| Practice, custom drills, form decks, article practice | Checked answer: the input turns green (right) or red with a short shake (wrong). «✓ …» gets a sprout that grows. The message and the example rise in. A new question slides in. |
| Rule exercises | The same for the gap input and the message; the right option pulses, the others fade. Each exercise rises in line by line. |
| Rule exercises loading | A sprout grows in a pot, the caption changes every ~2 s (`RULE_QUIZ_LOADING_PHRASES`), a shimmering outline of the exercise below. |
| Word order | A tapped tile flies to its new place (FLIP: rects before and after the render, keyed by pile index). Right: the answer tiles bounce one by one. Wrong: the answer box shakes. «Генерую…» and «Ще 10» show moving dots. |
| Progress bars | Width grows with a spring, a shine passes over the fill, a full bar turns green. |
| Finish screens (practice round, FSRS session, drills, word order, rule exercises) | The numbers count up from 0; petals fall. `choosePetalCount(correct, total)`: ≥ 90 % → 36, ≥ 70 % → 20, otherwise none. Only when the summary appears, not on a re-render. |
| Cards | The card turns in 3D (rotateY to 90°, the side changes, back to 0°). |
| Bottom menu | A sand pill slides to the chosen item (hidden on the middle play button); the icon hops; the page slides in from the side of the chosen item. |
| Statistics, «Серія днів поспіль» | A flickering flame; when the current streak grew since it was last seen (localStorage `streakSeen`), the digits roll like a meter. |
