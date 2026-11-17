import readme from './README.md?raw';

export default {
  title: 'Components/Content/NextAchievement',
  parameters: { docs: { description: { component: readme } } },
};

const MEDAL_ICON = '<svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="14.5" r="5.5"/><path d="M9 9.8L6.5 3h4l1.5 3.5L13.5 3h4L15 9.8"/></svg>';
const NEXT_ICON = '<svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const medal = (title, line) => `<button class="home-achievement" type="button">
  <span class="home-achievement__icon">${MEDAL_ICON}</span>
  <span class="home-achievement__text">
    <span class="home-achievement__title">Наступне досягнення: «${title}»</span>
    <span class="home-achievement__line">${line}</span>
  </span>
  ${NEXT_ICON}
</button>`;

export const Overview = {
  render: () => `<div class="col">${medal('Серія 7 днів', 'Ще 2 дні серії')}</div>`,
};

export const WordsLeft = {
  render: () => `<div class="col">${medal('Словник на 100 слів', 'Ще 7 слів')}</div>`,
};

export const LongTitle = {
  render: () => `<div class="col">${medal('Тиждень поспіль без жодного пропущеного дня', 'Ще 1 день серії')}</div>`,
};
