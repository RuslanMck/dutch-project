import readme from './README.md?raw';

export default {
  title: 'Components/Feedback/Splash',
  parameters: { docs: { description: { component: readme } } },
};

// The loading screen. The app's splash is position: fixed; the wrapper only keeps it inside the story frame.
const frame = (content, cls = '') => `
<div style="position: relative; height: 480px; overflow: hidden; transform: translateZ(0); border-radius: 12px;">
  <div class="splash${cls}" role="status" aria-label="Завантаження">
    <svg class="splash__logo" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs><linearGradient id="splash-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6b676"/><stop offset="1" stop-color="#c39f5c"/></linearGradient><clipPath id="splash-clip"><rect width="120" height="120" rx="27"/></clipPath></defs><g clip-path="url(#splash-clip)"><rect width="120" height="120" fill="url(#splash-bg)"/><path d="M0 100 C30 92 90 92 120 100 V120 H0z" fill="#3e5240"/><path d="M52 98 L56 52 H64 L68 98z" fill="#3b2216"/><path d="M54 52 L60 43 L66 52z" fill="#9b411c"/><rect x="57" y="84" width="6" height="14" rx="3" fill="#f3c7a7"/><g class="logo-sails"><g transform="rotate(20 60 48)"><rect x="58" y="16" width="4" height="30" rx="2" fill="#fffcf7"/><rect x="62" y="18" width="8" height="22" rx="2" fill="#fffcf7" opacity=".75"/></g><g transform="rotate(110 60 48)"><rect x="58" y="16" width="4" height="30" rx="2" fill="#fffcf7"/><rect x="62" y="18" width="8" height="22" rx="2" fill="#fffcf7" opacity=".75"/></g><g transform="rotate(200 60 48)"><rect x="58" y="16" width="4" height="30" rx="2" fill="#fffcf7"/><rect x="62" y="18" width="8" height="22" rx="2" fill="#fffcf7" opacity=".75"/></g><g transform="rotate(290 60 48)"><rect x="58" y="16" width="4" height="30" rx="2" fill="#fffcf7"/><rect x="62" y="18" width="8" height="22" rx="2" fill="#fffcf7" opacity=".75"/></g><circle cx="60" cy="48" r="4.5" fill="#e3922a"/></g><g transform="translate(21 110) scale(1.25)"><g class="logo-tulip logo-tulip--1"><g class="logo-tulip__stem"><path d="M0 0 V-16" stroke="#3e5240" stroke-width="2.6" stroke-linecap="round"/><path d="M0 -4 C-6 -4 -9 -9 -9 -14 C-4 -13 0 -9 0 -4z" fill="#3e5240"/></g><g class="logo-tulip__head"><path d="M0 -16 C-6 -16 -8 -22 -7 -29 C-4 -27 -2 -25 0 -22 C2 -25 4 -27 7 -29 C8 -22 6 -16 0 -16z" fill="#e3922a"/><path d="M0 -16 C-3 -16 -4 -23 -2 -29 L0 -31 L2 -29 C4 -23 3 -16 0 -16z" fill="#f3c7a7"/></g></g></g><g transform="translate(39 114) scale(1)"><g class="logo-tulip logo-tulip--2"><g class="logo-tulip__stem"><path d="M0 0 V-16" stroke="#3e5240" stroke-width="2.6" stroke-linecap="round"/><path d="M0 -4 C-6 -4 -9 -9 -9 -14 C-4 -13 0 -9 0 -4z" fill="#3e5240"/></g><g class="logo-tulip__head"><path d="M0 -16 C-6 -16 -8 -22 -7 -29 C-4 -27 -2 -25 0 -22 C2 -25 4 -27 7 -29 C8 -22 6 -16 0 -16z" fill="#9b411c"/><path d="M0 -16 C-3 -16 -4 -23 -2 -29 L0 -31 L2 -29 C4 -23 3 -16 0 -16z" fill="#e3922a"/></g></g></g><g transform="translate(81 114) scale(1)"><g class="logo-tulip logo-tulip--3"><g class="logo-tulip__stem"><path d="M0 0 V-16" stroke="#3e5240" stroke-width="2.6" stroke-linecap="round"/><path d="M0 -4 C-6 -4 -9 -9 -9 -14 C-4 -13 0 -9 0 -4z" fill="#3e5240"/></g><g class="logo-tulip__head"><path d="M0 -16 C-6 -16 -8 -22 -7 -29 C-4 -27 -2 -25 0 -22 C2 -25 4 -27 7 -29 C8 -22 6 -16 0 -16z" fill="#9b411c"/><path d="M0 -16 C-3 -16 -4 -23 -2 -29 L0 -31 L2 -29 C4 -23 3 -16 0 -16z" fill="#e3922a"/></g></g></g><g transform="translate(99 110) scale(1.25)"><g class="logo-tulip logo-tulip--4"><g class="logo-tulip__stem"><path d="M0 0 V-16" stroke="#3e5240" stroke-width="2.6" stroke-linecap="round"/><path d="M0 -4 C-6 -4 -9 -9 -9 -14 C-4 -13 0 -9 0 -4z" fill="#3e5240"/></g><g class="logo-tulip__head"><path d="M0 -16 C-6 -16 -8 -22 -7 -29 C-4 -27 -2 -25 0 -22 C2 -25 4 -27 7 -29 C8 -22 6 -16 0 -16z" fill="#e3922a"/><path d="M0 -16 C-3 -16 -4 -23 -2 -29 L0 -31 L2 -29 C4 -23 3 -16 0 -16z" fill="#f3c7a7"/></g></g></g></g></svg>
    <p class="splash__name">Dutch матеріали</p>
    <div class="splash__bar" aria-hidden="true"><i></i></div>
    <p class="splash__caption">Ловлю вітер…</p>
  </div>
</div>`;

// The windmill turns and the tulips grow while the first data loads.
export const Overview = {
  render: () => frame(''),
};

// When the data is on screen the splash fades out (opacity and visibility, then it is removed).
export const Leaving = {
  render: () => frame('', ' splash--gone'),
};
