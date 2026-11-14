// The calendar of answers, the week recap (current and previous week) and the daily goal, at service level with a
// fixed clock, and over REST (the three routes, their defaults and their 400s). Answers are written straight into
// deck_answers and drill_answers, the tables the statistics count, so each test states its own history.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';

import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { createApplication } from '../src/server/create-application.js';
import { createTestContext } from './database-test-helpers.js';

const TOKEN = 'test-api-token-for-stats-calendar';
const TIME_ZONE = 'Europe/Amsterdam';
// Saturday 14.11.2026, midday in Amsterdam: this week is 09.11 to 14.11, the previous one 02.11 to 08.11.
const NOW = Date.parse('2026-11-14T12:00:00+01:00');
const at = isoText => Date.parse(isoText);

function createFixture() {
  const context = createTestContext({ clock: { now: () => NOW } });
  const [kat, hond, huis] = [
    context.wordService.createWord({ nl: 'kat', uk: 'кіт', article: 'de' }).id,
    context.wordService.createWord({ nl: 'hond', uk: 'пес', article: '' }).id,
    context.wordService.createWord({ nl: 'huis', uk: 'дім', article: 'het' }).id,
  ];
  const answer = (wordId, grade, isoText) => insertDeckAnswer(context, { wordId, grade, answeredAt: at(isoText) });
  // Previous week (02.11 to 08.11): 7 answers on 3 days, 5 good, hond missed twice.
  answer(kat, 'good', '2026-11-02T10:00:00+01:00');
  answer(hond, 'good', '2026-11-02T10:01:00+01:00');
  answer(hond, 'again', '2026-11-04T09:00:00+01:00');
  answer(hond, 'again', '2026-11-04T09:01:00+01:00');
  answer(kat, 'good', '2026-11-04T09:02:00+01:00');
  answer(huis, 'good', '2026-11-04T09:03:00+01:00');
  answer(huis, 'good', '2026-11-07T20:00:00+01:00');
  // Current week (09.11 to 14.11): 7 deck answers on 4 days, 6 good; huis missed once; a streak of 3 days to today.
  answer(kat, 'good', '2026-11-10T10:00:00+01:00');
  answer(kat, 'good', '2026-11-10T10:02:00+01:00');
  answer(hond, 'good', '2026-11-10T10:04:00+01:00');
  answer(huis, 'again', '2026-11-12T18:00:00+01:00');
  answer(huis, 'good', '2026-11-12T18:01:00+01:00');
  answer(hond, 'good', '2026-11-13T09:00:00+01:00');
  answer(kat, 'good', '2026-11-14T08:00:00+01:00');
  // A custom drill answer today (wrong): it counts as an answer of the day and of the week, not as a correct one.
  context.database.prepare(`
    INSERT INTO drill_answers (word_id, direction, is_correct, answer, source, answered_at)
    VALUES (@wordId, 'uk_nl', 0, 'hond', 'custom', @answeredAt)
  `).run({ wordId: kat, answeredAt: at('2026-11-14T09:00:00+01:00') });
  return { context, kat, hond, huis };
}

// One answer in deck_answers, as the practice writes it (no learning-deck position).
function insertDeckAnswer(context, { wordId, grade, answeredAt }) {
  context.database.prepare(`
    INSERT INTO deck_answers (word_id, session_id, direction, answered_at, grade, is_first_in_session,
      required_correct_after, correct_count_after)
    VALUES (@wordId, @sessionId, 'uk_nl', @answeredAt, @grade, 0, NULL, 0)
  `).run({ wordId, sessionId: `session-${wordId}-${answeredAt}`, answeredAt, grade });
}

test('calendar: one entry per day, oldest first, ending today, with answers and good answers', () => {
  const { context } = createFixture();
  const { days } = context.statisticsService.calculateCalendar({ days: 7 });
  assert.deepEqual(days, [
    { date: '2026-11-08', answers: 0, correct: 0 },
    { date: '2026-11-09', answers: 0, correct: 0 },
    { date: '2026-11-10', answers: 3, correct: 3 },
    { date: '2026-11-11', answers: 0, correct: 0 },
    { date: '2026-11-12', answers: 2, correct: 1 },
    { date: '2026-11-13', answers: 1, correct: 1 },
    { date: '2026-11-14', answers: 2, correct: 1 },
  ]);
  const longCalendar = context.statisticsService.calculateCalendar({ days: 84 }).days;
  assert.equal(longCalendar.length, 84);
  assert.equal(longCalendar[0].date, '2026-08-23');
  assert.deepEqual(longCalendar.find(day => day.date === '2026-11-04'), { date: '2026-11-04', answers: 4, correct: 2 });
});

test('week recap, current week: totals, best day, hardest word, streak', () => {
  const { context } = createFixture();
  assert.deepEqual(context.statisticsService.calculateWeek({ week: 'current' }), {
    range: { start: '2026-11-09', end: '2026-11-14' },
    answers: 8,
    accuracy: 75,
    days_practised: 4,
    active_seconds: 300,
    started_count: 0,
    learned_count: 0,
    best_day: { date: '2026-11-10', answers: 3, accuracy: 100 },
    hardest_word: { nl: 'huis', article: 'het', uk: 'дім', mistakes: 1 },
    streak: { current: 3, longest: 3 },
  });
});

test('week recap, previous week: Monday to Sunday before this one, streak at its end', () => {
  const { context } = createFixture();
  assert.deepEqual(context.statisticsService.calculateWeek({ week: 'previous' }), {
    range: { start: '2026-11-02', end: '2026-11-08' },
    answers: 7,
    accuracy: 71,
    days_practised: 3,
    active_seconds: 240,
    started_count: 0,
    learned_count: 0,
    best_day: { date: '2026-11-04', answers: 4, accuracy: 50 },
    hardest_word: { nl: 'hond', article: '', uk: 'пес', mistakes: 2 },
    // 08.11 has no answers, so the streak at the end of that week is the one ending on 07.11; the longer streak of
    // this week comes later and does not count.
    streak: { current: 1, longest: 1 },
  });
});

test('week recap with no answers: zeros, null accuracy and null best day and hardest word', () => {
  const context = createTestContext({ clock: { now: () => at('2026-11-18T12:00:00+01:00') } });
  const week = context.statisticsService.calculateWeek({ week: 'current' });
  assert.deepEqual(
    [week.range, week.answers, week.accuracy, week.best_day, week.hardest_word, week.streak],
    [{ start: '2026-11-16', end: '2026-11-18' }, 0, null, null, null, { current: 0, longest: 0 }],
  );
});

test('daily goal: 20 by default, today\'s answers counted (drills too), and saved', () => {
  const { context } = createFixture();
  assert.deepEqual(context.statisticsService.calculateDailyGoal(), {
    goal: 20,
    today: { date: '2026-11-14', answers: 2 },
  });
  assert.deepEqual(context.statisticsService.saveDailyGoal({ goal: 30 }), {
    goal: 30,
    today: { date: '2026-11-14', answers: 2 },
  });
  assert.equal(context.practiceSettings.readSettings().dailyGoal, 30);
});

const configuration = parseEnvironmentConfiguration({
  NODE_ENV: 'test',
  APP_PASSWORD: 'correct horse',
  SESSION_SECRET: 'test-session-secret',
  API_TOKEN: TOKEN,
});
const httpContext = createFixture().context;
const application = createApplication({
  configuration,
  services: httpContext,
  changeEventBus: httpContext.changeEventBus,
  clock: httpContext.clock,
});
const server = application.listen(0, '127.0.0.1');
let base;
const BEARER = { Authorization: `Bearer ${TOKEN}` };
const JSON_BEARER = { ...BEARER, 'Content-Type': 'application/json' };

before(async () => {
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

test('REST: calendar, week and goal routes, their defaults and the 400s for out-of-range values', async () => {
  const calendar = await fetch(`${base}/api/stats/calendar?days=7`, { headers: BEARER });
  assert.equal(calendar.status, 200);
  const calendarBody = await calendar.json();
  assert.equal(calendarBody.days.length, 7);
  assert.deepEqual(calendarBody.days.at(-1), { date: '2026-11-14', answers: 2, correct: 1 });

  assert.equal((await (await fetch(`${base}/api/stats/calendar`, { headers: BEARER })).json()).days.length, 84);
  for (const query of ['days=6', 'days=372', 'days=abc']) {
    const refused = await fetch(`${base}/api/stats/calendar?${query}`, { headers: BEARER });
    assert.equal(refused.status, 400, query);
  }

  const week = await (await fetch(`${base}/api/stats/week?week=previous`, { headers: BEARER })).json();
  assert.equal(week.range.start, '2026-11-02');
  assert.equal((await fetch(`${base}/api/stats/week?week=next`, { headers: BEARER })).status, 400);
  const currentWeek = await (await fetch(`${base}/api/stats/week`, { headers: BEARER })).json();
  assert.equal(currentWeek.accuracy, 75);

  const goal = await (await fetch(`${base}/api/goal`, { headers: BEARER })).json();
  assert.deepEqual(goal, { goal: 20, today: { date: '2026-11-14', answers: 2 } });
  for (const body of [{ goal: 4 }, { goal: 501 }, { goal: 20.5 }, { goal: '20' }, {}]) {
    const refused = await fetch(`${base}/api/goal`, { method: 'PUT', headers: JSON_BEARER, body: JSON.stringify(body) });
    assert.equal(refused.status, 400, JSON.stringify(body));
  }
  const saved = await fetch(`${base}/api/goal`, { method: 'PUT', headers: JSON_BEARER, body: JSON.stringify({ goal: 45 }) });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { goal: 45, today: { date: '2026-11-14', answers: 2 } });
  assert.equal((await (await fetch(`${base}/api/goal`, { headers: BEARER })).json()).goal, 45);
});

test('REST: the statistics routes need the token', async () => {
  assert.equal((await fetch(`${base}/api/stats/week`)).status, 401);
  assert.equal((await fetch(`${base}/api/goal`)).status, 401);
});
