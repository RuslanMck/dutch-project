// The Головна and Статистика helpers of §4: the daily goal card, the week recap slides and the calendar grid.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildCalendarGrid,
  buildGoalView,
  buildWeekSlides,
  calendarLevel,
  weekdayName,
} from '../public/logic.js';

const fullWeek = {
  range: { start: '2026-11-09', end: '2026-11-14' },
  answers: 54,
  accuracy: 90,
  days_practised: 3,
  active_seconds: 7500,
  started_count: 6,
  learned_count: 2,
  best_day: { date: '2026-11-11', answers: 30, accuracy: 93 },
  hardest_word: { nl: 'rekening', article: 'de', uk: 'рахунок', mistakes: 4 },
  streak: { current: 3, longest: 5 },
};

test('buildGoalView: the ring percent, the number and the line before the goal is reached', () => {
  const view = buildGoalView({ goal: 20, answers: 14 });
  assert.equal(view.reached, false);
  assert.equal(view.percent, 70);
  assert.equal(view.number, '14');
  assert.equal(view.ofText, 'з 20');
  assert.equal(view.line, 'Ще 6 відповідей до цілі');
});

test('buildGoalView: the line uses the plural forms and the reached text', () => {
  assert.equal(buildGoalView({ goal: 20, answers: 19 }).line, 'Ще 1 відповідь до цілі');
  assert.equal(buildGoalView({ goal: 25, answers: 2 }).line, 'Ще 23 відповіді до цілі');
  const reached = buildGoalView({ goal: 20, answers: 20 });
  assert.equal(reached.reached, true);
  assert.equal(reached.percent, 100);
  assert.equal(reached.line, 'Ціль виконано! Можна ще, але вже без поспіху.');
  assert.equal(buildGoalView({ goal: 20, answers: 45 }).percent, 100);
});

test('weekdayName gives the Ukrainian weekday in lower case', () => {
  assert.equal(weekdayName('2026-11-09'), 'понеділок');
  assert.equal(weekdayName('2026-11-11'), 'середа');
  assert.equal(weekdayName('2026-11-14'), 'субота');
  assert.equal(weekdayName('2026-11-15'), 'неділя');
});

test('buildWeekSlides: a full week gives six slides in the plan order', () => {
  const slides = buildWeekSlides(fullWeek);
  assert.deepEqual(slides.map(slide => slide.id), ['answers', 'started', 'best-day', 'hardest', 'streak', 'time']);
  assert.deepEqual(slides[0], { id: 'answers', title: 'Цього тижня', big: '54', text: 'відповіді, 90 % правильно', countUp: true });
  assert.deepEqual(slides[1], { id: 'started', title: 'Нових слів', big: '6', text: 'почато, 2 вивчено', countUp: true });
  assert.deepEqual(slides[2], { id: 'best-day', title: 'Найкращий день', big: 'середа', text: '30 відповідей, 93 % правильно', countUp: false });
  assert.deepEqual(slides[3], { id: 'hardest', title: 'Найважче слово', big: 'de rekening', text: '4 помилки — воно буде частіше', countUp: false });
  assert.deepEqual(slides[4], { id: 'streak', title: 'Серія', big: '3 дні', text: 'найдовша — 5 днів', countUp: true });
  assert.deepEqual(slides[5], { id: 'time', title: 'Час навчання', big: '2 год 5 хв', text: 'за 3 дні практики', countUp: false });
});

test('buildWeekSlides: a slide whose data is null or 0 is left out, and no accuracy is shown without answers', () => {
  const slides = buildWeekSlides({
    ...fullWeek, accuracy: null, started_count: 0, best_day: null, hardest_word: null, streak: { current: 0, longest: 2 },
    active_seconds: 0,
  });
  assert.deepEqual(slides.map(slide => slide.id), ['answers']);
  assert.equal(slides[0].text, 'відповіді');
  const withoutMistakes = buildWeekSlides({ ...fullWeek, hardest_word: { nl: 'huis', article: 'het', uk: 'дім', mistakes: 0 } });
  assert.ok(!withoutMistakes.some(slide => slide.id === 'hardest'));
});

test('buildWeekSlides: plurals of answers, days and mistakes follow the number', () => {
  const one = buildWeekSlides({ ...fullWeek, answers: 1, best_day: { date: '2026-11-10', answers: 2, accuracy: 50 },
    hardest_word: { nl: 'huis', article: 'het', uk: 'дім', mistakes: 1 }, streak: { current: 1, longest: 1 }, days_practised: 1 });
  assert.equal(one[0].text, 'відповідь, 90 % правильно');
  assert.equal(one.find(slide => slide.id === 'best-day').text, '2 відповіді, 50 % правильно');
  assert.equal(one.find(slide => slide.id === 'hardest').text, '1 помилка — воно буде частіше');
  assert.equal(one.find(slide => slide.id === 'streak').big, '1 день');
  assert.equal(one.find(slide => slide.id === 'time').text, 'за 1 день практики');
});

test('buildWeekSlides: an empty week has one slide with the empty text', () => {
  for (const week of [null, { answers: 0 }]) {
    const slides = buildWeekSlides(week);
    assert.equal(slides.length, 1);
    assert.equal(slides[0].big, 'Цього тижня ще немає відповідей');
    assert.equal(slides[0].text, "Почни практику, і тут з'явиться підсумок");
  }
});

test('calendarLevel uses the five steps 0, 1–14, 15–34, 35–59 and 60 and more', () => {
  assert.deepEqual([0, 1, 14, 15, 34, 35, 59, 60, 200].map(calendarLevel), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('buildCalendarGrid: weeks are columns from Monday, padded with null, with labels', () => {
  // 2026-11-11 is a Wednesday: two empty cells before it in its week.
  const days = [
    { date: '2026-11-11', answers: 54, correct: 49 },
    { date: '2026-11-12', answers: 0, correct: 0 },
    { date: '2026-11-13', answers: 15, correct: 15 },
  ];
  const { weeks } = buildCalendarGrid(days);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].length, 7);
  assert.equal(weeks[0][0], null);
  assert.equal(weeks[0][1], null);
  assert.deepEqual(weeks[0][2], {
    date: '2026-11-11', answers: 54, correct: 49, accuracy: 91, level: 3, label: '11.11: 54 відповіді, 91 % правильно',
  });
  assert.equal(weeks[0][3].label, '12.11: без практики');
  assert.equal(weeks[0][3].level, 0);
  assert.equal(weeks[0][4].level, 2);
  assert.equal(weeks[0][4].label, '13.11: 15 відповідей, 100 % правильно');
  assert.equal(weeks[0][6], null);
});

test('buildCalendarGrid: a Sunday ends a column and a new week starts on Monday', () => {
  // 2026-11-09 is a Monday: nine days from Monday give one full week and the Monday of the next.
  const days = [];
  for (let day = 9; day <= 17; day += 1) days.push({ date: `2026-11-${String(day).padStart(2, '0')}`, answers: 1, correct: 1 });
  const { weeks } = buildCalendarGrid(days);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0][0].date, '2026-11-09');
  assert.equal(weeks[0][6].date, '2026-11-15');
  assert.equal(weeks[1][0].date, '2026-11-16');
  assert.equal(weeks[1][1].date, '2026-11-17');
  assert.equal(weeks[1][2], null);
  assert.deepEqual(buildCalendarGrid([]), { weeks: [] });
});

test('buildWeekSlides: the previous week says «Минулого тижня»', () => {
  const slides = buildWeekSlides({ answers: 5, accuracy: 80, started_count: 0, learned_count: 0, best_day: null,
    hardest_word: null, streak: { current: 0, longest: 0 }, active_seconds: 0, days_practised: 1 }, 'previous');
  assert.equal(slides[0].title, 'Минулого тижня');
  assert.equal(buildWeekSlides({ answers: 0 }, 'previous')[0].big, 'Минулого тижня не було відповідей');
});
