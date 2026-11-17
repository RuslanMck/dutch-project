The cards of Вчити: the «Продовжити» strip and the two daily practices, Нові слова and Запам'ятовування.

- `.learn-resume` — `garden-sand` strip with «Продовжити: …» in `garden-ink` and the next arrow. Shown only when a set or a drill is open in this visit with answers given and words left; otherwise it is not drawn.
- `.learn-card--new` — `garden-right-soft`: «Сьогодні X з 10 · N слів чекають», a thin bar for X out of 10, and the pill «Почати», or «Ще 10» with a «Зроблено» mark once the set is full.
- `.learn-card--review` — `garden-peach`: «N слів на сьогодні · близько M хв» (15 seconds a word, at least one minute); with nothing owed «На сьогодні все повторено» and the «Зроблено» mark. The pill «Почати» stays: it opens the done screen.
- `.learn-pill` — a `garden-primary` pill with `garden-on-primary` text; `.learn-done` — the check icon and «Зроблено» in `garden-forest`.

An unknown count (not read yet, or the read failed) shows «…», never a number guessed.

Accessibility: each card is one button; its name and line are its text. The bar is decorative: the line says the number. «Зроблено» is text, so it does not rely on colour.

Markup from `public/index.html`; styled by `storybook/styles/garden.css`.
