import readme from './README.md?raw';

export default {
  title: 'Components/Navigation/HomeHeader',
  parameters: { docs: { description: { component: readme } } },
};

// The streak icon (Серія) as in app.js; the chip is hidden in the app when there is no streak.
const STREAK_ICON = '<svg class="garden-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3c.8 3 5 5 5 10a5 5 0 0 1-10 0c0-2.3 1-3.7 2.2-4.8.1 2 .9 3.1 2 3.3-.4-3.2.1-5.7.8-8.5z"/></svg>';

// The logo of the header (index.html), the same drawing as the splash screen's.
const LOGO = `<svg class="home-header__logo" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs><linearGradient id="header-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6b676"/><stop offset="1" stop-color="#c39f5c"/></linearGradient><clipPath id="header-clip"><rect width="120" height="120" rx="27"/></clipPath></defs><g clip-path="url(#header-clip)"><rect width="120" height="120" fill="url(#header-bg)"/><path d="M0 100 C30 92 90 92 120 100 V120 H0z" fill="#3e5240"/><path d="M52 98 L56 52 H64 L68 98z" fill="#3b2216"/><path d="M54 52 L60 43 L66 52z" fill="#9b411c"/><rect x="57" y="84" width="6" height="14" rx="3" fill="#f3c7a7"/><g><g transform="rotate(20 60 48)"><rect x="58" y="16" width="4" height="30" rx="2" fill="#fffcf7"/><rect x="62" y="18" width="8" height="22" rx="2" fill="#fffcf7" opacity=".75"/></g><g transform="rotate(110 60 48)"><rect x="58" y="16" width="4" height="30" rx="2" fill="#fffcf7"/><rect x="62" y="18" width="8" height="22" rx="2" fill="#fffcf7" opacity=".75"/></g><g transform="rotate(200 60 48)"><rect x="58" y="16" width="4" height="30" rx="2" fill="#fffcf7"/><rect x="62" y="18" width="8" height="22" rx="2" fill="#fffcf7" opacity=".75"/></g><g transform="rotate(290 60 48)"><rect x="58" y="16" width="4" height="30" rx="2" fill="#fffcf7"/><rect x="62" y="18" width="8" height="22" rx="2" fill="#fffcf7" opacity=".75"/></g><circle cx="60" cy="48" r="4.5" fill="#e3922a"/></g><g transform="translate(21 110) scale(1.25)"><g><g><path d="M0 0 V-16" stroke="#3e5240" stroke-width="2.6" stroke-linecap="round"/><path d="M0 -4 C-6 -4 -9 -9 -9 -14 C-4 -13 0 -9 0 -4z" fill="#3e5240"/></g><g><path d="M0 -16 C-6 -16 -8 -22 -7 -29 C-4 -27 -2 -25 0 -22 C2 -25 4 -27 7 -29 C8 -22 6 -16 0 -16z" fill="#e3922a"/><path d="M0 -16 C-3 -16 -4 -23 -2 -29 L0 -31 L2 -29 C4 -23 3 -16 0 -16z" fill="#f3c7a7"/></g></g></g><g transform="translate(39 114) scale(1)"><g><g><path d="M0 0 V-16" stroke="#3e5240" stroke-width="2.6" stroke-linecap="round"/><path d="M0 -4 C-6 -4 -9 -9 -9 -14 C-4 -13 0 -9 0 -4z" fill="#3e5240"/></g><g><path d="M0 -16 C-6 -16 -8 -22 -7 -29 C-4 -27 -2 -25 0 -22 C2 -25 4 -27 7 -29 C8 -22 6 -16 0 -16z" fill="#9b411c"/><path d="M0 -16 C-3 -16 -4 -23 -2 -29 L0 -31 L2 -29 C4 -23 3 -16 0 -16z" fill="#e3922a"/></g></g></g><g transform="translate(81 114) scale(1)"><g><g><path d="M0 0 V-16" stroke="#3e5240" stroke-width="2.6" stroke-linecap="round"/><path d="M0 -4 C-6 -4 -9 -9 -9 -14 C-4 -13 0 -9 0 -4z" fill="#3e5240"/></g><g><path d="M0 -16 C-6 -16 -8 -22 -7 -29 C-4 -27 -2 -25 0 -22 C2 -25 4 -27 7 -29 C8 -22 6 -16 0 -16z" fill="#9b411c"/><path d="M0 -16 C-3 -16 -4 -23 -2 -29 L0 -31 L2 -29 C4 -23 3 -16 0 -16z" fill="#e3922a"/></g></g></g><g transform="translate(99 110) scale(1.25)"><g><g><path d="M0 0 V-16" stroke="#3e5240" stroke-width="2.6" stroke-linecap="round"/><path d="M0 -4 C-6 -4 -9 -9 -9 -14 C-4 -13 0 -9 0 -4z" fill="#3e5240"/></g><g><path d="M0 -16 C-6 -16 -8 -22 -7 -29 C-4 -27 -2 -25 0 -22 C2 -25 4 -27 7 -29 C8 -22 6 -16 0 -16z" fill="#e3922a"/><path d="M0 -16 C-3 -16 -4 -23 -2 -29 L0 -31 L2 -29 C4 -23 3 -16 0 -16z" fill="#f3c7a7"/></g></g></g></g></svg>`;

const header = ({ greeting, date, subtitle, streak }) => `
<div class="home-header">
  <div class="home-header__title">
    ${LOGO}
    <h1 id="home-greeting" class="home-header__greeting" tabindex="-1">${greeting}</h1>
  </div>
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
