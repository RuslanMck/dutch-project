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
| Word order | A tapped tile flies to its new place (FLIP: rects before and after the render, keyed by pile index). Right: the answer tiles bounce one by one. Wrong: the answer box shakes. «Генерую…» and «Ще 10» show blinking dots. |
| Progress bars | Width grows with a spring, a shine passes over the fill, a full bar turns green. |
| Finish screens (practice round, FSRS session, drills, word order, rule exercises) | The numbers count up from 0; petals fall. `choosePetalCount(correct, total)`: ≥ 90 % → 36, ≥ 70 % → 20, otherwise none. Only when the summary appears, not on a re-render. |
| Cards | The card turns in 3D (rotateY to 90°, the side changes, back to 0°). |
| Bottom menu | A sand pill slides to the chosen item (hidden on the middle play button); the icon hops; the page slides in from the side of the chosen item. |
| Statistics, «Серія днів поспіль» | A flickering flame; when the current streak grew since it was last seen (localStorage `streakSeen`), the digits roll like a meter. |

One-shot animations play once: `replayClass` takes its class off after 1.5 s (an element leaving `display:none`
restarts its animations, so a class left on would replay on every return to the tab), a grown sprout stays still, and
the rule exercise adds its pulse or shake only when the result first arrives. Summary rows are updated in place
(`renderSummaryItems`), so a re-render does not cut a count-up short. The streak rolls only on the visible
Статистика tab. A second tap on a card waits for the turn to finish. The menu pill is placed again when the menu
resizes (ResizeObserver) and when the font has loaded.

## Article baskets and the letter diff (plan §3)

- Артикль: the word is a chip above the «de» and «het» baskets. A drop on a basket, a tap on a basket and the arrow
  keys all answer the same way (`answerArticle`): the chip flies into the basket (`flyChipInto`). Right: the basket
  glows green and pulses, its count goes up, and the next word pops in after 900 ms («Далі» moves on at once). Wrong:
  the basket shakes, the chip goes in and back, the right basket glows, and «Далі» moves on. Released outside a
  basket, the chip springs back (`springBackArticleChip`). The drag uses pointer events with pointer capture; the
  hit test is `findBasketAt` in `logic.js`.
- Де саме помилка: the letter diff appears with a new message only (`renderPracticeDiff`). The typed letters strike
  through (the line draws in); the right letters drop in. Both use the `diff-enter` class, removed after 1.5 s.
- Reduced motion: the flight and spring-back are skipped (`isMotionReduced`); the CSS switches off the rest. The
  right answer still moves on after 900 ms, since that is a pause, not an animation.
