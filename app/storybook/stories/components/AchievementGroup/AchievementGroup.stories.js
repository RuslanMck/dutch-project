import readme from './README.md?raw';

export default {
  title: 'Components/Content/AchievementGroup',
  parameters: { docs: { description: { component: readme } } },
};

const ICONS = {
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  flame: '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-5-4-9-2 2-2 4-2 4-1-1-2-2-2-4-2 2-4 5-4 9a6 6 0 0 0 6 6z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
};

const icon = name => `<svg class="achievement-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

// One medal cell: the whole cell is the tap target. A locked one shows its bar and «N / M».
const cell = ({ title, name, unlocked, current = 0, target = 0, left }) => {
  const percent = unlocked ? 100 : Math.min(100, Math.round((current / target) * 100));
  const count = `${Math.min(current, target)} / ${target}`;
  const body = unlocked
    ? ''
    : `<span class="medal-bar" aria-hidden="true"><span style="width: ${percent}%"></span></span><span class="medal-cell__count">${count}</span>`;
  return `
<button class="medal-cell" type="button" aria-label="${title}. ${left}">
  <span class="medal ${unlocked ? 'medal--unlocked' : 'medal--locked'}" aria-hidden="true">${icon(name)}</span>
  <span class="medal-cell__title">${title}</span>${body}
</button>`;
};

// A group section: a title and a grid of medals in the server's order.
const group = (title, cells) => `
<section class="achievement-group" aria-label="${title}">
  <h2 class="stats-card__title">${title}</h2>
  <div class="medal-grid">${cells.join('')}</div>
</section>`;

const streak = [
  { title: 'Перша серія', name: 'flame', unlocked: true, current: 3, target: 3, left: 'Отримано' },
  { title: 'Тиждень поспіль', name: 'calendar', unlocked: false, current: 4, target: 7, left: 'Ще 3 до відзнаки' },
  { title: 'Місяць поспіль', name: 'calendar', unlocked: false, current: 4, target: 30, left: 'Ще 26 до відзнаки' },
];

const words = [
  { title: 'Перші 10 слів', name: 'star', unlocked: true, current: 10, target: 10, left: 'Отримано' },
  { title: 'Перші 50 слів', name: 'star', unlocked: false, current: 37, target: 50, left: 'Ще 13 до відзнаки' },
];

// The Досягнення tab: one section per group, unlocked medals in gold, locked ones with their progress.
export const Overview = {
  render: () => `<div class="col" style="max-width:420px">${group('Серія днів', streak.map(cell))}${group('Слова', words.map(cell))}</div>`,
};

// A locked medal with progress: the bar fills by current / target and the count shows «4 / 7».
export const Locked = {
  render: () => group('Серія днів', [cell(streak[1])]),
};

// Unlocked medals only: no bar, the name and «Отримано».
export const Unlocked = {
  render: () => group('Слова', [cell(words[0]), cell({ ...streak[0], title: 'Перша серія' })]),
};

// A long title wraps under the medal and keeps the cell's height even.
export const LongTitle = {
  render: () => group('Серія', [cell({
    title: 'Серія днів поспіль без жодного пропуску',
    name: 'flame',
    unlocked: false,
    current: 2,
    target: 14,
    left: 'Ще 12 до відзнаки',
  })]),
};
