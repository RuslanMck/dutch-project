import readme from './README.md?raw';

export default {
  title: 'Components/Data/HomeWeek',
  parameters: { docs: { description: { component: readme } } },
};

// One day of the week strip. level 0 to 4 is the calendar's shade; today is outlined; a future day is dashed.
const cell = ({ short, label, level, today = false, future = false }) => `
  <li class="home-week__day${today ? ' home-week__day--today' : ''}">
    <span class="home-week__cell home-week__cell--l${level}${future ? ' home-week__cell--future' : ''}" role="img" aria-label="${label}"></span>
    <span class="home-week__name" aria-hidden="true">${short}</span>
  </li>`;

const week = (days, previousLine) => `
<section class="stats-card home-week" aria-labelledby="home-week-title" style="margin-top:0">
  <div class="home-week__head">
    <h2 id="home-week-title" class="stats-card__title">Цей тиждень</h2>
    <button class="home-week__link" type="button">Підсумок</button>
  </div>
  <ol class="home-week__days">${days.map(cell).join('')}</ol>
  ${previousLine ? `<p class="home-week__prev muted">${previousLine}</p>` : ''}
</section>`;

export const Overview = {
  render: () => `<div class="col">${week([
    { short: 'Пн', label: 'Понеділок: 64 відповіді', level: 4 },
    { short: 'Вт', label: 'Вівторок: 12 відповідей', level: 1, today: true },
    { short: 'Ср', label: 'Середа: ще попереду', level: 0, future: true },
    { short: 'Чт', label: 'Четвер: ще попереду', level: 0, future: true },
    { short: 'Пт', label: "П'ятниця: ще попереду", level: 0, future: true },
    { short: 'Сб', label: 'Субота: ще попереду', level: 0, future: true },
    { short: 'Нд', label: 'Неділя: ще попереду', level: 0, future: true },
  ], 'Минулого тижня: 5 днів, 180 відповідей')}</div>`,
};

export const Shades = {
  render: () => `<div class="col">${week([
    { short: 'Пн', label: 'Понеділок: без практики', level: 0 },
    { short: 'Вт', label: 'Вівторок: 9 відповідей', level: 1 },
    { short: 'Ср', label: 'Середа: 30 відповідей', level: 2 },
    { short: 'Чт', label: 'Четвер: 45 відповідей', level: 3 },
    { short: 'Пт', label: 'П\'ятниця: 80 відповідей', level: 4 },
    { short: 'Сб', label: 'Субота: 1 відповідь', level: 1, today: true },
    { short: 'Нд', label: 'Неділя: ще попереду', level: 0, future: true },
  ], 'Минулого тижня: 0 днів, 0 відповідей')}</div>`,
};

export const NoData = {
  render: () => `<div class="col">${week([
    { short: 'Пн', label: 'Понеділок: немає даних', level: 0 },
    { short: 'Вт', label: 'Вівторок: немає даних', level: 0, today: true },
    { short: 'Ср', label: 'Середа: ще попереду', level: 0, future: true },
    { short: 'Чт', label: 'Четвер: ще попереду', level: 0, future: true },
    { short: 'Пт', label: "П'ятниця: ще попереду", level: 0, future: true },
    { short: 'Сб', label: 'Субота: ще попереду', level: 0, future: true },
    { short: 'Нд', label: 'Неділя: ще попереду', level: 0, future: true },
  ], '')}</div>`,
};
