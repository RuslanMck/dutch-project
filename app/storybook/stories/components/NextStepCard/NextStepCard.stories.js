import readme from './README.md?raw';

export default {
  title: 'Components/Study/NextStepCard',
  parameters: { docs: { description: { component: readme } } },
};

const NEXT_ICON = '<svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const card = ({ title, line, second }) => `
<section class="next-card" aria-labelledby="next-card-title">
  <p class="next-card__label">Далі</p>
  <h2 id="next-card-title" class="next-card__title">${title}</h2>
  <p class="next-card__line">${line}</p>
  <button class="next-card__start" type="button">Почати ${NEXT_ICON}</button>
  ${second ? `<button class="next-card__second" type="button">${second}</button>` : ''}
</section>`;

export const Overview = {
  render: () => `<div class="col">${card({
    title: "Запам'ятовування", line: '35 слів на сьогодні · близько 9 хв', second: 'або Нові слова · 0 з 10',
  })}</div>`,
};

export const NewWords = {
  render: () => `<div class="col">${card({
    title: 'Нові слова', line: 'Сьогодні 4 з 10', second: 'або Артикль · de чи het',
  })}</div>`,
};

export const AllDone = {
  render: () => `<div class="col">${card({ title: 'Артикль', line: 'de чи het', second: '' })}</div>`,
};
