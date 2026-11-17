import readme from './README.md?raw';

export default {
  title: 'Components/Navigation/HomeHeader',
  parameters: { docs: { description: { component: readme } } },
};

// The streak icon (Серія) as in app.js; the chip is hidden in the app when there is no streak.
const STREAK_ICON = '<svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3c.8 3 5 5 5 10a5 5 0 0 1-10 0c0-2.3 1-3.7 2.2-4.8.1 2 .9 3.1 2 3.3-.4-3.2.1-5.7.8-8.5z"/></svg>';

const header = ({ greeting, date, subtitle, streak }) => `
<div class="home-header">
  <h1 id="home-greeting" class="home-header__greeting">${greeting}</h1>
  <p class="home-header__subtitle">${subtitle}</p>
  <div class="home-header__meta">
    <p class="home-header__date">${date}</p>
    ${streak ? `<p class="home-streak">${STREAK_ICON}<span>${streak}</span></p>` : ''}
  </div>
</div>`;

export const Overview = {
  render: () => `<div class="app" style="padding-bottom:16px">${header({
    greeting: 'Goedemorgen!', date: 'Вівторок, 17 листопада', subtitle: 'Почнімо з повторення', streak: '12 днів',
  })}</div>`,
};

export const NoStreak = {
  render: () => `<div class="app" style="padding-bottom:16px">${header({
    greeting: 'Goedenavond!', date: 'Неділя, 22 листопада', subtitle: 'На сьогодні все зроблено', streak: '',
  })}</div>`,
};
