// The quick known check («Я це вже знаю»): the next New words in queue order, the words marked known (a learned review
// card due in 14 to 28 days, spread over the days, status learned, no deck places, introduced today) and the words not
// known (they stay New and are not shown again). Known and unknown ids are validated, today's open set is left alone,
// and no answer, review log or practice attempt is written. Plus the REST routes. A fake clock; fuzz off.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';

import { buildMigrationCard, parseCard, serializeCard } from '../src/domains/practice/fsrs-scheduling.js';
import { findStartOfDay } from '../src/domains/practice/practice-calendar.js';
import { createPracticeRepository } from '../src/domains/practice/practice-repository.js';
import { ConflictError, ValidationError } from '../src/errors/domain-errors.js';
import { createApplication } from '../src/server/create-application.js';
import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { createTestContext } from './database-test-helpers.js';

const TIME_ZONE = 'Europe/Amsterdam';
const MORNING_IN_AMSTERDAM = '2026-11-14T10:00:00+01:00';
const BEARER = { Authorization: 'Bearer test-api-token' };
const configuration = parseEnvironmentConfiguration({
  NODE_ENV: 'test',
  APP_PASSWORD: 'correct horse',
  SESSION_SECRET: 'test-session-secret',
  API_TOKEN: 'test-api-token',
});

function createFakeClock(startIsoText) {
  let currentTime = Date.parse(startIsoText);
  return { now: () => currentTime };
}

function createFixture() {
  return createTestContext({ clock: createFakeClock(MORNING_IN_AMSTERDAM), isFsrsFuzzEnabled: false });
}

// Words without a textbook chapter: the frequency rank decides the queue order (boek 399 first, paella unranked last).
function addQueueWords(context) {
  const words = context.wordService.createWords([
    { nl: 'paella', uk: 'паелья' },
    { nl: 'lezen', uk: 'читати' },
    { nl: 'boek', uk: 'книга' },
    { nl: 'trui', uk: 'светр' },
    { nl: 'mosselen', uk: 'мідії' },
  ]).added;
  context.priorityService.importFrequencyList([
    { wordForm: 'boek', frequencyRank: 399 },
    { wordForm: 'lezen', frequencyRank: 800 },
    { wordForm: 'trui', frequencyRank: 3231 },
    { wordForm: 'mosselen', frequencyRank: 4500 },
  ]);
  return Object.fromEntries(words.map(word => [word.nl, word.id]));
}

function migrate(context) {
  context.practiceService.migrateToFsrs({ isDryRun: false });
}

function dayStart(calendarDate) {
  return findStartOfDay(calendarDate, TIME_ZONE);
}

// A word that already has a card (learned before), written directly so no set is pinned by a grade.
function giveLearnedCard(context, wordId) {
  const timestamp = Date.parse(MORNING_IN_AMSTERDAM);
  const dueAt = dayStart('2026-11-28');
  createPracticeRepository({ database: context.database }).updateWordSchedule(wordId, {
    fsrsCard: serializeCard(buildMigrationCard({ group: 'learned', dueAt, timestamp })),
    dueAt,
    introducedOn: '2026-11-13',
    learningStatus: 'learned',
    updatedAt: timestamp,
  });
}

function readWordRow(context, wordId) {
  return createPracticeRepository({ database: context.database }).findPracticeWordById(wordId);
}

test('the check lists the New words in queue order, leaves out words with a card, and pages with remaining', () => {
  const context = createFixture();
  migrate(context);
  const ids = addQueueWords(context);
  const first = context.knownCheckService.getKnownCheck({ limit: 2 });
  assert.deepEqual(first.words.map(word => word.nl), ['boek', 'lezen']);
  assert.deepEqual(Object.keys(first.words[0]).sort(), ['article', 'id', 'kind', 'nl', 'uk']);
  assert.equal(first.remaining, 3);
  const all = context.knownCheckService.getKnownCheck({ limit: 50 });
  assert.deepEqual(all.words.map(word => word.nl), ['boek', 'lezen', 'trui', 'mosselen', 'paella']);
  assert.equal(all.remaining, 0);

  giveLearnedCard(context, ids.boek);
  assert.equal(context.knownCheckService.getKnownCheck({ limit: 50 }).words.some(word => word.nl === 'boek'), false);
});

test('a known word gets a learned card due in 14 to 28 days, no deck places, not counted as introduced', () => {
  const context = createFixture();
  migrate(context);
  const ids = addQueueWords(context);
  const result = context.knownCheckService.recordKnownCheck({ knownIds: [ids.boek, ids.lezen], unknownIds: [] });
  assert.deepEqual(result, { known: 2, unknown: 0, remaining: 3 });
  for (const wordId of [ids.boek, ids.lezen]) {
    const row = readWordRow(context, wordId);
    const card = parseCard(row.fsrs_card);
    assert.equal(row.status, 'learned');
    assert.equal(row.introduced_on, null);
    assert.equal(row.deck_required_correct, null);
    assert.equal(row.deck_reverse_required_correct, null);
    assert.equal(card.state, 2, 'review');
    assert.ok(row.due_at >= dayStart('2026-11-28') && row.due_at <= dayStart('2026-12-12'), 'due 14 to 28 days out');
    assert.equal(row.due_at, card.due.getTime());
  }
  const lastCheck = context.knownCheckService.getKnownCheck({ limit: 50 });
  assert.equal(lastCheck.words.some(word => word.id === ids.boek), false, 'a known word is not new any more');
});

test('known words are spread over the days, earliest for the first in queue order', () => {
  const context = createFixture();
  migrate(context);
  const names = Array.from({ length: 20 }, (_, index) => `woord${index}`);
  const ids = context.wordService.createWords(names.map(nl => ({ nl, uk: `${nl} переклад` }))).added.map(w => w.id);
  context.knownCheckService.recordKnownCheck({ knownIds: ids, unknownIds: [] });
  const dueTimes = ids.map(wordId => readWordRow(context, wordId).due_at);
  assert.equal(dueTimes[0], dayStart('2026-11-28'));
  assert.equal(dueTimes.at(-1), dayStart('2026-12-12'));
  assert.ok(new Set(dueTimes).size >= 14, 'the known words do not all come back on one day');
  const sortedDueTimes = [...dueTimes].sort((first, second) => first - second);
  assert.deepEqual(sortedDueTimes, dueTimes, 'queue order gives the earlier days');
});

test('an unknown word stays New, is recorded as seen, and is not shown in the next check', () => {
  const context = createFixture();
  migrate(context);
  const ids = addQueueWords(context);
  const result = context.knownCheckService.recordKnownCheck({ knownIds: [], unknownIds: [ids.paella] });
  assert.deepEqual(result, { known: 0, unknown: 1, remaining: 4 });
  const row = readWordRow(context, ids.paella);
  assert.equal(row.fsrs_card, null);
  assert.equal(row.status, 'new');
  assert.equal(row.due_at, null);
  assert.deepEqual(context.practiceSettings.readSettings().knownCheckSeen, [ids.paella]);
  const shown = context.knownCheckService.getKnownCheck({ limit: 50 });
  assert.equal(shown.words.some(word => word.nl === 'paella'), false);
  assert.equal(shown.words[0].nl, 'boek');
});

test('ids that are not New words or are in today\'s set are ignored; a word in both lists is refused', () => {
  const context = createFixture();
  migrate(context);
  const ids = addQueueWords(context);
  giveLearnedCard(context, ids.boek);
  const cardBefore = readWordRow(context, ids.boek).fsrs_card;
  const result = context.knownCheckService.recordKnownCheck({
    knownIds: [ids.boek, 999999, ids.lezen],
    unknownIds: [],
  });
  assert.deepEqual(result, { known: 1, unknown: 0, remaining: 3 }, 'boek has a card already, 999999 is no word');
  assert.equal(readWordRow(context, ids.boek).fsrs_card, cardBefore, 'the word with a card is untouched');

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's2' });
  const setWordIds = batch.new_words.map(word => word.id);
  assert.ok(setWordIds.length > 0);
  const setWordId = setWordIds[0];
  const setNl = batch.new_words[0].nl;
  assert.equal(context.knownCheckService.getKnownCheck({ limit: 50 }).words.some(word => word.id === setWordId), false);
  const setResult = context.knownCheckService.recordKnownCheck({ knownIds: [setWordId], unknownIds: [] });
  assert.equal(setResult.known, 0, `the open set word ${setNl} is not marked known`);
  assert.equal(readWordRow(context, setWordId).fsrs_card, null);

  assert.throws(
    () => context.knownCheckService.recordKnownCheck({ knownIds: [ids.lezen], unknownIds: [ids.lezen] }),
    ValidationError,
  );
});

test('the check writes no answer, review log, deck answer or practice attempt', () => {
  const context = createFixture();
  migrate(context);
  const ids = addQueueWords(context);
  const countRows = () => ['review_logs', 'deck_answers', 'practice_attempts', 'word_errors']
    .map(table => context.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  const before = countRows();
  context.knownCheckService.recordKnownCheck({ knownIds: [ids.boek], unknownIds: [ids.lezen] });
  assert.deepEqual(countRows(), before);
});

test('before the FSRS migration the check refuses, like the other practice reads', () => {
  const context = createFixture();
  addQueueWords(context);
  assert.throws(() => context.knownCheckService.getKnownCheck(), ConflictError);
  assert.throws(() => context.knownCheckService.recordKnownCheck({ knownIds: [1] }), ConflictError);
});

test('GET and POST /api/practice/known-check: the words, the counts, 400 for bad input', async () => {
  const context = createFixture();
  migrate(context);
  const ids = addQueueWords(context);
  const application = createApplication({
    configuration,
    services: context,
    changeEventBus: context.changeEventBus,
    clock: context.clock,
  });
  const server = application.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const listed = await fetch(`${base}/api/practice/known-check?limit=2`, { headers: BEARER });
    assert.equal(listed.status, 200);
    const listBody = await listed.json();
    assert.deepEqual(listBody.words.map(word => word.nl), ['boek', 'lezen']);
    assert.equal(listBody.remaining, 3);

    const badLimit = await fetch(`${base}/api/practice/known-check?limit=0`, { headers: BEARER });
    assert.equal(badLimit.status, 400);

    const posted = await fetch(`${base}/api/practice/known-check`, {
      method: 'POST',
      headers: { ...BEARER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ known_ids: [ids.boek], unknown_ids: [ids.lezen] }),
    });
    assert.equal(posted.status, 200);
    assert.deepEqual(await posted.json(), { known: 1, unknown: 1, remaining: 3 });

    const both = await fetch(`${base}/api/practice/known-check`, {
      method: 'POST',
      headers: { ...BEARER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ known_ids: [ids.trui], unknown_ids: [ids.trui] }),
    });
    assert.equal(both.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('known words earn no medals, and a practice reset clears the check lists', () => {
  const context = createFixture();
  migrate(context);
  const ids = addQueueWords(context);
  context.knownCheckService.recordKnownCheck({ knownIds: [ids.boek, ids.lezen], unknownIds: [ids.trui] });
  const facts = context.achievementService.listAchievements().achievements;
  assert.deepEqual(facts.find(medal => medal.id === 'words-10').progress, { current: 0, target: 10 });
  assert.deepEqual(context.practiceSettings.readSettings().knownCheckKnown.sort(), [ids.boek, ids.lezen].sort());
  context.practiceResetService.resetPractice({ isDryRun: false });
  const settings = context.practiceSettings.readSettings();
  assert.deepEqual([settings.knownCheckSeen, settings.knownCheckKnown], [[], []]);
});
