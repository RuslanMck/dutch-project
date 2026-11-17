// Головна (docs/NAVIGATION_REDESIGN.md §7): the greeting and the date, the streak chip, the Далі card's pick, the week
// strip, the three numbers and the next medal. The pure helpers are tested here; the page's wiring is read from source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHomeNumbers,
  buildHomeWeek,
  formatHomeDate,
  formatNextAchievementLine,
  formatStreakChip,
  greetingForHour,
  localIsoDate,
  pickNextAchievement,
  pickNextStep,
} from '../public/logic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = name => fs.readFileSync(path.join(here, '..', 'public', name), 'utf8');
const html = read('index.html');
const appSource = read('app.js');
const css = fs.readFileSync(path.join(here, '..', 'storybook', 'styles', 'garden.css'), 'utf8');

// The body of one CSS rule by its selector (the first one), without the braces.
function ruleBody(selector) {
  const start = css.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, `${selector} has a rule`);
  return css.slice(start, css.indexOf('}', start));
}

// The text of one app.js function, from its header to the next top-level function or section.
function functionSource(header) {
  const start = appSource.indexOf(header);
  assert.ok(start >= 0, `${header} is in app.js`);
  const end = appSource.indexOf('\n}\n', start);
  return appSource.slice(start, end + 3);
}

// Seven days of the calendar window ending on `last` (an ISO date), each with the answers given.
function calendarDays(last, answersByDate = {}) {
  const [year, month, day] = last.split('-').map(Number);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day - 13 + index));
    const iso = date.toISOString().slice(0, 10);
    return { date: iso, answers: answersByDate[iso] ?? 0, correct: 0 };
  });
}

// ---------- greeting and date ----------

test('greetingForHour: Goedemorgen from 5:00, Goedemiddag from 12:00, Goedenavond from 18:00 and through the night', () => {
  assert.equal(greetingForHour(0), 'Goedenavond!');
  assert.equal(greetingForHour(4), 'Goedenavond!');
  assert.equal(greetingForHour(5), 'Goedemorgen!');
  assert.equal(greetingForHour(11), 'Goedemorgen!');
  assert.equal(greetingForHour(12), 'Goedemiddag!');
  assert.equal(greetingForHour(17), 'Goedemiddag!');
  assert.equal(greetingForHour(18), 'Goedenavond!');
  assert.equal(greetingForHour(undefined), 'Hoi!');
});

test('formatHomeDate: the capitalised weekday, the day and the month in the genitive', () => {
  assert.equal(formatHomeDate(new Date(2026, 10, 17, 9)), 'Вівторок, 17 листопада');
  assert.equal(formatHomeDate(new Date(2026, 10, 16, 9)), 'Понеділок, 16 листопада');
  assert.equal(formatHomeDate(new Date(2026, 10, 22, 9)), 'Неділя, 22 листопада');
  assert.equal(formatHomeDate(new Date(2026, 0, 5, 9)), 'Понеділок, 5 січня');
  assert.equal(formatHomeDate(new Date(2026, 4, 9, 9)), 'Субота, 9 травня');
});

test('localIsoDate: the local calendar day with two-digit month and day', () => {
  assert.equal(localIsoDate(new Date(2026, 10, 7, 23, 50)), '2026-11-07');
  assert.equal(localIsoDate(new Date(2026, 11, 31, 0, 5)), '2026-12-31');
});

test('formatStreakChip: «день», «дні», «днів»; no streak gives nothing, so the chip stays hidden', () => {
  assert.equal(formatStreakChip(0), '');
  assert.equal(formatStreakChip(null), '');
  assert.equal(formatStreakChip(undefined), '');
  assert.equal(formatStreakChip(1), '1 день');
  assert.equal(formatStreakChip(2), '2 дні');
  assert.equal(formatStreakChip(4), '4 дні');
  assert.equal(formatStreakChip(5), '5 днів');
  assert.equal(formatStreakChip(11), '11 днів');
  assert.equal(formatStreakChip(12), '12 днів');
  assert.equal(formatStreakChip(21), '21 день');
});

// ---------- the Далі card ----------

test('pickNextStep: words owed come first, with the minutes; the second suggestion is the next one in the order', () => {
  const step = pickNextStep({ reviewOwed: 35, introducedToday: 0, strugglingCount: 3 });
  assert.equal(step.subtitle, 'Почнімо з повторення');
  assert.deepEqual(step.main, { id: 'review', title: "Запам'ятовування", line: '35 слів на сьогодні · близько 9 хв' });
  assert.deepEqual(step.second, { id: 'new', title: 'Нові слова', label: 'або Нові слова · 0 з 10' });
});

test('pickNextStep: nothing owed and the daily set not full gives the new words, the Артикль link after them', () => {
  const step = pickNextStep({ reviewOwed: 0, introducedToday: 4, strugglingCount: 0 });
  assert.equal(step.subtitle, 'Час для нових слів');
  assert.deepEqual(step.main, { id: 'new', title: 'Нові слова', line: 'Сьогодні 4 з 10' });
  assert.deepEqual(step.second, { id: 'article', title: 'Артикль', label: 'або Артикль · de чи het' });
});

test('pickNextStep: the set full, words to drill give Важкі слова; the plural follows the count', () => {
  const one = pickNextStep({ reviewOwed: 0, introducedToday: 10, strugglingCount: 1 });
  assert.equal(one.main.id, 'struggling');
  assert.equal(one.main.line, '1 слово для тренування');
  assert.equal(one.subtitle, 'На сьогодні все зроблено');
  assert.equal(one.second.id, 'article');
  const many = pickNextStep({ reviewOwed: 0, introducedToday: 12, strugglingCount: 5 });
  assert.equal(many.main.line, '5 слів для тренування');
});

test('pickNextStep: all done leaves the Артикль alone and no second link', () => {
  const step = pickNextStep({ reviewOwed: 0, introducedToday: 10, strugglingCount: 0 });
  assert.equal(step.main.id, 'article');
  assert.equal(step.main.line, 'de чи het');
  assert.equal(step.subtitle, 'На сьогодні все зроблено');
  assert.equal(step.second, null);
});

test('pickNextStep: unknown counts make no suggestion and never print undefined or NaN', () => {
  const none = pickNextStep();
  assert.equal(none.main.id, 'new');
  assert.equal(none.main.line, 'Сьогодні — з 10');
  assert.equal(none.second.id, 'article');
  const partial = pickNextStep({ reviewOwed: null, introducedToday: NaN, strugglingCount: undefined });
  assert.equal(partial.main.id, 'new');
  for (const value of [none, partial]) assert.doesNotMatch(JSON.stringify(value), /undefined|NaN/);
});

test('pickNextStep: a single owed word is «1 слово», and review is the main card when owed', () => {
  const step = pickNextStep({ reviewOwed: 1, introducedToday: 10, strugglingCount: 0 });
  assert.equal(step.main.id, 'review');
  assert.equal(step.main.line, '1 слово на сьогодні · близько 1 хв');
  assert.equal(step.second.id, 'article');
});

// ---------- the week strip ----------

test('buildHomeWeek: seven cells, Monday first, the current Monday–Sunday week, today marked and the future left empty', () => {
  const week = buildHomeWeek({ days: calendarDays('2026-11-17', { '2026-11-16': 64 }), todayIso: '2026-11-17' });
  assert.equal(week.cells.length, 7);
  assert.deepEqual(week.cells.map(cell => cell.date), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  assert.equal(week.cells[0].short, 'Пн');
  assert.equal(week.cells[6].short, 'Нд');
  assert.equal(week.cells[0].label, 'Понеділок: 64 відповіді');
  assert.equal(week.cells[0].level, 4);
  assert.equal(week.cells[1].isToday, true);
  assert.equal(week.cells[0].isToday, false);
  assert.equal(week.cells[2].isFuture, true);
  assert.equal(week.cells[2].answers, null);
  assert.equal(week.cells[2].label, 'Середа: ще попереду');
});

test('buildHomeWeek: the labels agree «відповідь», «відповіді», «відповідей» and say when a day had no practice', () => {
  const week = buildHomeWeek({
    days: calendarDays('2026-11-22', { '2026-11-16': 1, '2026-11-17': 3, '2026-11-18': 12, '2026-11-19': 0, '2026-11-20': 11 }),
    todayIso: '2026-11-22',
  });
  assert.equal(week.cells[0].label, 'Понеділок: 1 відповідь');
  assert.equal(week.cells[1].label, 'Вівторок: 3 відповіді');
  assert.equal(week.cells[2].label, 'Середа: 12 відповідей');
  assert.equal(week.cells[3].label, 'Четвер: без практики');
  assert.equal(week.cells[4].label, 'П\'ятниця: 11 відповідей');
  assert.equal(week.cells[6].isToday, true, 'a Sunday is the last cell and today');
  assert.equal(week.cells[6].isFuture, false);
});

test('buildHomeWeek: on a Monday the rest of the week is still ahead; a week that starts in last month', () => {
  const monday = buildHomeWeek({ days: calendarDays('2026-11-16'), todayIso: '2026-11-16' });
  assert.equal(monday.cells[0].isToday, true);
  assert.ok(monday.cells.slice(1).every(cell => cell.isFuture));
  const december = buildHomeWeek({ days: calendarDays('2026-12-02'), todayIso: '2026-12-02' });
  assert.equal(december.cells[0].date, '2026-11-30');
  assert.equal(december.cells[2].date, '2026-12-02');
  assert.equal(december.cells[2].isToday, true);
});

test('buildHomeWeek: last week says the practised days and the answers; no calendar gives no numbers', () => {
  const days = calendarDays('2026-11-17', { '2026-11-09': 5, '2026-11-10': 0, '2026-11-14': 20 });
  assert.equal(buildHomeWeek({ days, todayIso: '2026-11-17' }).previousLine, 'Минулого тижня: 2 дні, 25 відповідей');
  const unknown = buildHomeWeek({ days: null, todayIso: '2026-11-17' });
  assert.equal(unknown.previousLine, '');
  assert.deepEqual(unknown.cells.map(cell => cell.answers), [null, null, null, null, null, null, null]);
  assert.equal(unknown.cells[0].label, 'Понеділок: немає даних');
  assert.equal(unknown.cells[2].label, 'Середа: ще попереду', 'the future is known even when the calendar is not');
  assert.equal(unknown.cells[0].level, 0);
});

test('buildHomeWeek: an empty calendar is a quiet week, with no days practised last week', () => {
  const week = buildHomeWeek({ days: [], todayIso: '2026-11-17' });
  assert.equal(week.cells[0].label, 'Понеділок: без практики');
  assert.equal(week.previousLine, 'Минулого тижня: 0 днів, 0 відповідей');
});

// ---------- the numbers ----------

test('buildHomeNumbers: words in progress (learning + review), new today, and the right share of 7 days', () => {
  const numbers = buildHomeNumbers({ learning: 78, fsrsReview: 88, introducedToday: 0, goodShare7Days: 0.484 });
  assert.deepEqual(numbers.map(number => number.value), ['166', '0', '48%']);
  assert.deepEqual(numbers.map(number => number.label), ['слів вчу', 'нових сьогодні', 'правильно за 7 днів']);
});

test('buildHomeNumbers: the plural forms of the words and the new ones; a missing review set counts as none', () => {
  const one = buildHomeNumbers({ learning: 1, fsrsReview: null, introducedToday: 1, goodShare7Days: 1 });
  assert.equal(one[0].value, '1');
  assert.equal(one[0].label, 'слово вчу');
  assert.equal(one[1].label, 'нове сьогодні');
  assert.equal(one[2].value, '100%');
  assert.equal(buildHomeNumbers({ learning: 2 })[0].label, 'слова вчу');
  assert.equal(buildHomeNumbers({ learning: 5 })[0].label, 'слів вчу');
});

test('buildHomeNumbers: unknown values show a dash, never undefined or NaN', () => {
  const numbers = buildHomeNumbers({});
  assert.deepEqual(numbers.map(number => number.value), ['—', '—', '—']);
  assert.deepEqual(numbers.map(number => number.label), ['слів вчу', 'нових сьогодні', 'правильно за 7 днів']);
  assert.doesNotMatch(JSON.stringify(buildHomeNumbers({ learning: NaN, introducedToday: undefined, goodShare7Days: null })), /undefined|NaN/);
});

// ---------- the next medal ----------

test('pickNextAchievement: the locked medal with the highest share of its target that has started', () => {
  const next = pickNextAchievement([
    { id: 'a', title: 'Перша', group: 'answers', unlocked: true, progress: { current: 10, target: 10 } },
    { id: 'b', title: 'Далеко', group: 'words', unlocked: false, progress: { current: 2, target: 100 } },
    { id: 'c', title: 'Серія 7', group: 'streak', unlocked: false, progress: { current: 5, target: 7 } },
    { id: 'd', title: 'Ще не почато', group: 'days', unlocked: false, progress: { current: 0, target: 3 } },
  ]);
  assert.deepEqual(next, { id: 'c', title: 'Серія 7', line: 'Ще 2 дні серії' });
});

test('pickNextAchievement: nothing started, everything unlocked or no list gives null', () => {
  assert.equal(pickNextAchievement([]), null);
  assert.equal(pickNextAchievement(), null);
  assert.equal(pickNextAchievement([{ id: 'x', title: 'X', group: 'words', unlocked: true, progress: { current: 5, target: 5 } }]), null);
  assert.equal(pickNextAchievement([{ id: 'y', title: 'Y', group: 'words', unlocked: false, progress: { current: 0, target: 5 } }]), null);
});

test('formatNextAchievementLine: the words of each group agree with the number', () => {
  assert.equal(formatNextAchievementLine('streak', 1), 'Ще 1 день серії');
  assert.equal(formatNextAchievementLine('streak', 2), 'Ще 2 дні серії');
  assert.equal(formatNextAchievementLine('words', 7), 'Ще 7 слів');
  assert.equal(formatNextAchievementLine('answers', 5), 'Ще 5 відповідей');
  assert.equal(formatNextAchievementLine('days', 3), 'Ще 3 дні практики');
  assert.equal(formatNextAchievementLine('goal', 4), 'Ще 4');
});

// ---------- the page ----------

test('Головна markup: the header with date and streak, the Далі card, the goal, the week, the numbers and the medal', () => {
  const start = html.indexOf('<section id="tab-home"');
  const home = html.slice(start, html.indexOf('<section id="tab-learn"'));
  const order = ['id="home-date"', 'id="home-streak"', 'id="home-next"', 'id="home-goal"', 'id="home-week"', 'class="home-numbers"', 'id="home-achievement"']
    .map(marker => home.indexOf(marker));
  assert.ok(order.every(index => index > 0), 'every part is there');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in the order of the spec');
  assert.match(home, /id="home-next-button"[^>]*data-next="review"/);
  assert.match(home, /id="home-next-second"[^>]*hidden/);
  assert.match(home, /data-tab="week"/);
  assert.match(home, /data-tab="achievements"/);
});

test('Головна loses the search form and the continue card; no practice tiles come back', () => {
  const home = html.slice(html.indexOf('<section id="tab-home"'), html.indexOf('<section id="tab-learn"'));
  assert.doesNotMatch(home, /home-search|continue-card|home-continue|home-progress|practice-tile|Тренування</);
  assert.doesNotMatch(appSource, /handleHomeSearch|home-continue|home-search/);
});

test('Далі: «Почати» and «або …» open the exercise as Вчити does; the review, new, struggling and article paths', () => {
  const next = functionSource('function handleHomeNextClick(event) {');
  assert.match(next, /data-next/);
  assert.match(next, /openFsrsPractice\('review'\)/);
  assert.match(next, /openFsrsPractice\('fsrs'\)/);
  assert.match(next, /handleHomeStrugglingTile\(\)/);
  assert.match(next, /openArticlePractice\(\)/);
  assert.match(appSource, /\$\('home-next'\)\.addEventListener\('click', handleHomeNextClick\)/);
});

test('renderHome: unknown data stays a dash or hides the part; the goal ring is drawn as before', () => {
  const render = functionSource('function renderHome() {');
  assert.match(render, /renderHomeGoal\(\);/);
  assert.match(functionSource('function renderHomeAchievement() {'), /\.hidden = !next/);
  assert.match(functionSource('function renderHomeStreak() {'), /hidden = !chip/);
});

test('the styles of Головна: the Далі card is light (garden-sand), never a dark token fill', () => {
  assert.match(ruleBody('.next-card'), /background: var\(--garden-sand\)/);
  assert.doesNotMatch(ruleBody('.next-card'), /background: var\(--garden-(ink|forest|rust)\)/);
  for (const selector of ['.home-week__cell--l4', '.home-week__cell--l3', '.home-achievement']) {
    assert.doesNotMatch(ruleBody(selector), /#[0-9a-fA-F]{3,6}|rgb/, `${selector} uses tokens only`);
  }
  assert.doesNotMatch(css.slice(css.indexOf('/* Головна (docs'), css.indexOf('.home-achievement > .garden-icon')), /#[0-9a-fA-F]{3,6}\b/);
});
