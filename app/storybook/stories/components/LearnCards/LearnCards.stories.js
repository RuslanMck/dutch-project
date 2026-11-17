import readme from './README.md?raw';

export default {
  title: 'Components/Study/LearnCards',
  parameters: { docs: { description: { component: readme } } },
};

export const Overview = {
  render: () => `
<div class="col">
  <button id="learn-resume" class="learn-resume" type="button">
          <span class="learn-resume__text">
            <span id="learn-resume-title" class="learn-resume__title">Продовжити: Нові слова</span>
            <span id="learn-resume-line" class="learn-resume__line">Залишилось 6</span>
          </span>
          <svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
  <div class="learn-daily">
          <button id="learn-new" class="learn-card learn-card--new" type="button">
            <span class="learn-card__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 10.5v6M9 13.5h6"/></svg></span>
            <span class="learn-card__body">
              <span class="learn-card__name">Нові слова</span>
              <span id="learn-new-line" class="learn-card__line">Сьогодні 3 з 10 · 42 слова чекають</span>
              <span class="progress-bar learn-card__bar" aria-hidden="true"><span id="learn-new-fill" class="progress-bar__fill" style="width:30%"></span></span>
            </span>
            <span class="learn-card__side">
              <span id="learn-new-pill" class="learn-pill">Почати</span>
              <span id="learn-new-done" class="learn-done" hidden><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Зроблено</span>
            </span>
          </button>
          <button id="learn-review" class="learn-card learn-card--review" type="button">
            <span class="learn-card__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/><path d="M12 8v4l2.5 1.5"/></svg></span>
            <span class="learn-card__body">
              <span class="learn-card__name">Запам'ятовування</span>
              <span id="learn-review-line" class="learn-card__line">12 слів на сьогодні · близько 3 хв</span>
            </span>
            <span class="learn-card__side">
              <span id="learn-review-pill" class="learn-pill">Почати</span>
              <span id="learn-review-done" class="learn-done" hidden><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Зроблено</span>
            </span>
          </button>
        </div>
</div>
`,
};

export const Finished = {
  render: () => `
<div class="col">
  <div class="learn-daily">
          <button id="learn-new" class="learn-card learn-card--new" type="button">
            <span class="learn-card__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 10.5v6M9 13.5h6"/></svg></span>
            <span class="learn-card__body">
              <span class="learn-card__name">Нові слова</span>
              <span id="learn-new-line" class="learn-card__line">Сьогодні 10 з 10 · 32 слова чекають</span>
              <span class="progress-bar learn-card__bar" aria-hidden="true"><span id="learn-new-fill" class="progress-bar__fill" style="width:100%"></span></span>
            </span>
            <span class="learn-card__side">
              <span id="learn-new-pill" class="learn-pill">Ще 10</span>
              <span id="learn-new-done" class="learn-done"><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Зроблено</span>
            </span>
          </button>
          <button id="learn-review" class="learn-card learn-card--review" type="button">
            <span class="learn-card__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/><path d="M12 8v4l2.5 1.5"/></svg></span>
            <span class="learn-card__body">
              <span class="learn-card__name">Запам'ятовування</span>
              <span id="learn-review-line" class="learn-card__line">На сьогодні все повторено</span>
            </span>
            <span class="learn-card__side">
              <span id="learn-review-pill" class="learn-pill">Почати</span>
              <span id="learn-review-done" class="learn-done"><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Зроблено</span>
            </span>
          </button>
        </div>
</div>
`,
};

export const Unknown = {
  render: () => `
<div class="col">
  <div class="learn-daily">
          <button id="learn-new" class="learn-card learn-card--new" type="button">
            <span class="learn-card__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M12 10.5v6M9 13.5h6"/></svg></span>
            <span class="learn-card__body">
              <span class="learn-card__name">Нові слова</span>
              <span id="learn-new-line" class="learn-card__line">…</span>
              <span class="progress-bar learn-card__bar" aria-hidden="true"><span id="learn-new-fill" class="progress-bar__fill" style="width:0%"></span></span>
            </span>
            <span class="learn-card__side">
              <span id="learn-new-pill" class="learn-pill">Почати</span>
              <span id="learn-new-done" class="learn-done" hidden><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Зроблено</span>
            </span>
          </button>
          <button id="learn-review" class="learn-card learn-card--review" type="button">
            <span class="learn-card__icon"><svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/><path d="M12 8v4l2.5 1.5"/></svg></span>
            <span class="learn-card__body">
              <span class="learn-card__name">Запам'ятовування</span>
              <span id="learn-review-line" class="learn-card__line">…</span>
            </span>
            <span class="learn-card__side">
              <span id="learn-review-pill" class="learn-pill">Почати</span>
              <span id="learn-review-done" class="learn-done" hidden><svg class="garden-icon garden-icon--sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Зроблено</span>
            </span>
          </button>
        </div>
</div>
`,
};

