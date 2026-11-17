import readme from './README.md?raw';

export default {
  title: 'Components/Feedback/AchievementToast',
  parameters: { docs: { description: { component: readme } } },
};

const STAR = '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>';
const TROPHY = '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9.5 17h5"/>';

const toast = ({ title, icon = STAR, leaving = false }) => `
<div class="achievement-toast${leaving ? ' achievement-toast--out' : ''}">
  <span class="medal medal--small medal--shine medal--unlocked"><svg class="achievement-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icon}</svg></span>
  <span class="achievement-toast__text">Нове досягнення: ${title}</span>
</div>`;

// The toast sits at the top of the screen. The wrapper below only places the fixed container in the story frame.
const frame = content => `
<div style="position: relative; height: 140px; overflow: hidden; transform: translateZ(0);">
  <div class="achievement-toasts" aria-live="polite">${content}</div>
</div>`;

// One unlock: the medal pops and a shine passes over it, then the toast leaves by itself after a few seconds.
export const Overview = {
  render: () => frame(toast({ title: 'Перша серія' })),
};

// A second unlock waits in the queue: the app shows one toast at a time, so this is a single toast with another medal.
export const Trophy = {
  render: () => frame(toast({ title: 'Перші 50 слів', icon: TROPHY })),
};

// The toast is on its way out (opacity and a small rise).
export const Leaving = {
  render: () => frame(toast({ title: 'Перша серія', leaving: true })),
};

// A long title wraps on two lines and the medal stays at the start of the toast.
export const LongTitle = {
  render: () => frame(toast({ title: 'Серія днів поспіль без жодного пропуску протягом місяця' })),
};
