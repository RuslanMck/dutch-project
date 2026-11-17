The top bar of a full-screen exercise. On Практика it names the mode (Нові слова, Запам'ятовування, Артикль, Важкі слова, Тренування); the other exercises name their page (Картки, Фрази, Порядок слів, Вправи з правил, Що я вже знаю). It replaces the gold header and the bottom bar while an exercise is on screen (`body.is-exercise`). The ✕ on the left goes back to Вчити, at the scroll position it had there.

- `.exercise-bar` — a flex row, 12px below; shown only in `body.is-exercise`.
- `.exercise-bar__title` — the exercise's name, 20px, in the heavy weight; it takes the focus when the screen opens, as the page title does.
- The ✕ is an `.icon-button` with the close icon and `aria-label="Закрити вправу"`.

Accessibility: the title is the first heading of the screen; the ✕ has its label. The title is focusable (`tabindex="-1"`) and shows no focus ring.

Markup from `public/index.html`; styled by `storybook/styles/garden.css`.
