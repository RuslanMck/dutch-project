// Tests for the Досягнення page (docs/WEEK_GOAL_CALENDAR_ACHIEVEMENTS.md §5): the pure helpers of logic.js, the medal icons
// and the wiring in index.html, app.js, api.js, sw.js and garden.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TAB_TITLES,
  TAB_SUBTITLES,
  NAVIGATION_SECTION_FOR_TAB,
  summarizeAchievements,
  pickRecentAchievements,
  groupAchievements,
  achievementProgressPercent,
  formatAchievementProgress,
  formatAchievementLeft,
  findNewUnlocks,
  markUnlockedSeen,
  formatAchievementToast,
  ACHIEVEMENT_RECENT_COUNT,
} from '../public/logic.js';
import { ACHIEVEMENT_ICON_NAMES, achievementIconParts } from '../public/achievement-icons.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const readPublic = name => fs.readFileSync(path.join(here, '..', 'public', name), 'utf8');

const groups = [
  { id: 'words', title: 'Слова' },
  { id: 'streak', title: 'Серія днів' },
];
const achievements = [
  { id: 'words-10', group: 'words', title: 'Вивчено 10 слів', description: 'Вивчи 10 слів в обидва боки', icon: 'star',
    unlocked: true, progress: { current: 10, target: 10 } },
  { id: 'words-25', group: 'words', title: 'Вивчено 25 слів', description: 'Вивчи 25 слів в обидва боки', icon: 'star',
    unlocked: false, progress: { current: 7, target: 25 } },
  { id: 'streak-3', group: 'streak', title: '3 дні поспіль', description: 'Практикуй 3 дні без пропусків', icon: 'flame',
    unlocked: true, progress: { current: 3, target: 3 } },
  { id: 'streak-7', group: 'streak', title: '7 днів поспіль', description: 'Практикуй 7 днів без пропусків', icon: 'flame',
    unlocked: false, progress: { current: 3, target: 7 } },
];

test('summarizeAchievements gives «Отримано 12 з 87»', () => {
  assert.deepEqual(summarizeAchievements(achievements), { unlocked: 2, total: 4, text: 'Отримано 2 з 4' });
  const many = Array.from({ length: 87 }, (_, index) => ({ id: `a${index}`, unlocked: index < 12 }));
  assert.equal(summarizeAchievements(many).text, 'Отримано 12 з 87');
  assert.equal(summarizeAchievements([]).text, 'Отримано 0 з 0');
});

test('pickRecentAchievements: only unlocked medals, the later ones of the list first, at most six', () => {
  assert.deepEqual(pickRecentAchievements(achievements).map(a => a.id), ['streak-3', 'words-10']);
  const many = Array.from({ length: 9 }, (_, index) => ({ id: `a${index}`, unlocked: true }));
  assert.equal(pickRecentAchievements(many).length, ACHIEVEMENT_RECENT_COUNT);
  assert.equal(ACHIEVEMENT_RECENT_COUNT, 6);
  assert.deepEqual(pickRecentAchievements([{ id: 'x', unlocked: false }]), []);
});

test('groupAchievements keeps the server group order and leaves out empty groups', () => {
  const grouped = groupAchievements([groups[1], { id: 'empty', title: 'Порожня' }, groups[0]], achievements);
  assert.deepEqual(grouped.map(group => group.id), ['streak', 'words']);
  assert.deepEqual(grouped[1].items.map(a => a.id), ['words-10', 'words-25']);
  assert.equal(grouped[0].title, 'Серія днів');
});

test('achievementProgressPercent: full when unlocked, otherwise current over target, never above 100', () => {
  assert.equal(achievementProgressPercent(achievements[0]), 100);
  assert.equal(achievementProgressPercent(achievements[1]), 28);
  assert.equal(achievementProgressPercent({ unlocked: false, progress: { current: 30, target: 10 } }), 100);
  assert.equal(achievementProgressPercent({ unlocked: false, progress: { current: 0, target: 0 } }), 0);
});

test('formatAchievementProgress and formatAchievementLeft give «7 / 10», «Отримано» and «Ще 3 до відзнаки»', () => {
  assert.equal(formatAchievementProgress(achievements[1]), '7 / 25');
  assert.equal(formatAchievementProgress({ unlocked: false, progress: { current: 12, target: 10 } }), '10 / 10');
  assert.equal(formatAchievementLeft(achievements[0]), 'Отримано');
  assert.equal(formatAchievementLeft({ unlocked: false, progress: { current: 7, target: 10 } }), 'Ще 3 до відзнаки');
});

test('findNewUnlocks: the first load (nothing saved) gives no toasts; later only unseen unlocks, in list order', () => {
  assert.deepEqual(findNewUnlocks(achievements, [], true), []);
  assert.deepEqual(findNewUnlocks(achievements, [], false).map(a => a.id), ['words-10', 'streak-3']);
  assert.deepEqual(findNewUnlocks(achievements, ['words-10'], false).map(a => a.id), ['streak-3']);
  assert.deepEqual(findNewUnlocks(achievements, ['words-10', 'streak-3'], false), []);
  const locked = achievements.map(a => ({ ...a, unlocked: false }));
  assert.deepEqual(findNewUnlocks(locked, [], false), []);
});

test('markUnlockedSeen adds every unlock once and keeps the saved ids', () => {
  assert.deepEqual(markUnlockedSeen(achievements, []), ['words-10', 'streak-3']);
  assert.deepEqual(markUnlockedSeen(achievements, ['old', 'words-10']), ['old', 'words-10', 'streak-3']);
  assert.deepEqual(markUnlockedSeen([], ['a', 'a']), ['a']);
});

test('formatAchievementToast: «Нове досягнення: <title>»', () => {
  assert.equal(formatAchievementToast(achievements[2]), 'Нове досягнення: 3 дні поспіль');
});

test('every icon name of the plan is drawn, with one icon per category id', () => {
  const planIcons = ['star', 'flame', 'calendar', 'check', 'sentence', 'rule', 'sun', 'moon', 'weekend', 'return', 'bolt',
    'leaf', 'target', 'trophy', 'crown', 'compass', 'layers'];
  const categoryIds = ['food', 'home', 'clothes', 'colours', 'numbers', 'people', 'body', 'city', 'work', 'nature', 'leisure',
    'feelings', 'actions', 'talk', 'other'];
  for (const name of [...planIcons, ...categoryIds]) {
    assert.ok(ACHIEVEMENT_ICON_NAMES.includes(name), `${name} is drawn`);
    assert.ok(achievementIconParts(name).length > 0, `${name} has parts`);
  }
  assert.equal(ACHIEVEMENT_ICON_NAMES.length, planIcons.length + categoryIds.length);
});

test('the achievements tab belongs to Прогрес and has its title and subtitle', () => {
  assert.equal(TAB_TITLES.achievements, 'Досягнення');
  assert.equal(TAB_SUBTITLES.achievements, 'Твої відзнаки');
  assert.equal(NAVIGATION_SECTION_FOR_TAB.achievements, 'progress');
});

test('app.js lists the tab, loads the medals and fills the tab (the Профіль card is gone)', () => {
  const appSource = readPublic('app.js');
  assert.match(appSource, /const TABS = \[[^\]]*'achievements'[^\]]*\];/);
  assert.doesNotMatch(appSource, /renderProfileAchievements/);
  assert.match(appSource, /achievements: renderAchievementsPage,/);
  assert.match(appSource, /await api\.getAchievements\(\)/);
  assert.match(appSource, /localStorage\.setItem\(ACHIEVEMENTS_SEEN_KEY/);
  assert.match(appSource, /from '\.\/achievement-icons\.js'/);
});

test('api.js has getAchievements on GET /api/achievements', () => {
  assert.match(readPublic('api.js'), /export const getAchievements = \(\) => request\('GET', '\/api\/achievements'\);/);
});

test('sw.js precaches the achievement icons', () => {
  assert.match(readPublic('sw.js'), /'\/achievement-icons\.js'/);
});

test('index.html has the tab in Прогрес, the toast box and the medal dialog; the Профіль card is gone', () => {
  const html = readPublic('index.html');
  for (const id of ['tab-achievements', 'achievements-message', 'achievements-groups', 'achievement-toasts', 'achievement-dialog',
    'achievement-dialog-medal', 'achievement-dialog-title', 'achievement-dialog-description', 'achievement-dialog-bar']) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id}`);
  }
  assert.doesNotMatch(html, /profile-achievements/);
  assert.match(html, /<nav class="section-tabs" aria-label="Розділи прогресу">[\s\S]*?<button type="button" data-tab="achievements">Досягнення<\/button>/);
});

test('garden.css: the medal grid has 4 columns and the toast and shine use the motion keyframes', () => {
  const css = readPublic('../storybook/styles/garden.css');
  assert.match(css, /\.medal-grid \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.medal-cell \{[^}]*min-height: 44px/);
  assert.match(css, /\.medal--shine::after[^}]*motion-glint/);
  assert.match(css, /\.achievement-toasts \{[^}]*position: fixed/);
});
