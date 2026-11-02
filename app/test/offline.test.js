// Server side of the offline app: the app version and the service worker route, the client answer receipts (a repeated
// answer is stored once), answers dated by the phone (answered_at), the set the phone practised offline (set_word_ids
// and when it started, set_opened_at), the spare words, and the MCP grade_word schema, which takes none of the offline
// fields. Fuzz is off, so due dates are exact.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { gradeWordToolInputSchema } from '../src/contracts/practice-contracts.js';
import { computeAppVersion } from '../src/server/app-version.js';
import { createApplication } from '../src/server/create-application.js';
import { createTestContext } from './database-test-helpers.js';

const configuration = parseEnvironmentConfiguration({
  NODE_ENV: 'test',
  APP_PASSWORD: 'correct horse',
  SESSION_SECRET: 'test-session-secret',
  API_TOKEN: 'test-api-token',
});
const BEARER = { Authorization: 'Bearer test-api-token' };
const MORNING_IN_AMSTERDAM = '2026-10-24T12:00:00+02:00';
const MILLISECONDS_PER_DAY = 24 * 3600_000;
const SERVICE_WORKER_SOURCE = "const APP_VERSION = '__APP_VERSION__';\n";

const temporaryDirectories = [];
let fixtureDirectory;

before(() => {
  fixtureDirectory = makeTemporaryPublicDirectory({ 'sw.js': SERVICE_WORKER_SOURCE, 'app.css': 'body { margin: 0; }' });
});

after(() => {
  for (const directory of temporaryDirectories) fs.rmSync(directory, { recursive: true, force: true });
});

// A temporary directory with the given files (relative path to text), standing in for public/.
function makeTemporaryPublicDirectory(fileContentsByPath) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-test-'));
  temporaryDirectories.push(directory);
  for (const [relativePath, content] of Object.entries(fileContentsByPath)) {
    const filePath = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return directory;
}

function createFakeClock(startIsoText) {
  let currentTime = Date.parse(startIsoText);
  return {
    now() {
      return currentTime;
    },
    moveTo(isoText) {
      currentTime = Date.parse(isoText);
    },
  };
}

function createOfflineContext() {
  return createTestContext({ clock: createFakeClock(MORNING_IN_AMSTERDAM) });
}

// Adds words to one textbook section; returns their ids.
function addWords(context, sectionCode, dutchTexts) {
  const wordInputs = dutchTexts.map(dutchText => ({ nl: dutchText, uk: `${dutchText} (переклад)`, section: sectionCode }));
  return context.wordService.createWords(wordInputs).added.map(word => word.id);
}

function countRows(context, tableName) {
  return context.database.prepare(`SELECT COUNT(*) FROM ${tableName}`).pluck().get();
}

// The pinned set saved in the practice settings, or null.
function readWordSetSetting(context) {
  const storedValue = context.database.prepare("SELECT value FROM practice_settings WHERE name = 'word_set'")
    .pluck().get();
  return storedValue === undefined ? null : JSON.parse(storedValue);
}

// Runs the body against the app on a free port, serving the fixture public directory unless another is given.
async function withServer(context, runWithBase, publicDirectory = fixtureDirectory) {
  const application = createApplication({
    configuration,
    services: context,
    changeEventBus: context.changeEventBus,
    clock: context.clock,
    publicDirectory,
  });
  const server = application.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await runWithBase(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

function postJson(base, requestPath, body) {
  return fetch(`${base}${requestPath}`, {
    method: 'POST',
    headers: { ...BEARER, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getJson(base, requestPath) {
  return fetch(`${base}${requestPath}`, { headers: BEARER });
}

test('the app version is stable for the same files and changes when a file changes; fonts are left out', () => {
  const directory = makeTemporaryPublicDirectory({
    'index.html': '<p>a</p>',
    'js/app.js': 'first',
    'fonts/font.woff2': 'font',
  });
  const version = computeAppVersion(directory);
  assert.match(version, /^[0-9a-f]{12}$/);
  assert.equal(computeAppVersion(directory), version);

  fs.writeFileSync(path.join(directory, 'fonts/font.woff2'), 'another font');
  assert.equal(computeAppVersion(directory), version, 'a font change keeps the version');

  fs.writeFileSync(path.join(directory, 'js/app.js'), 'second');
  assert.notEqual(computeAppVersion(directory), version, 'a content change gives a new version');

  fs.writeFileSync(path.join(directory, 'js/app.js'), 'first');
  assert.equal(computeAppVersion(directory), version, 'the same content gives the same version again');

  fs.writeFileSync(path.join(directory, 'added.txt'), '');
  assert.notEqual(computeAppVersion(directory), version, 'an added file gives a new version');
});

test('GET /sw.js is served without sign-in, with the version filled in and no-cache', () => withServer(
  createOfflineContext(),
  async base => {
    const response = await fetch(`${base}/sw.js`, { redirect: 'manual' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(await response.text(), `const APP_VERSION = '${computeAppVersion(fixtureDirectory)}';\n`);
  },
));

test('GET /sw.js is a 404 JSON when public/sw.js does not exist', () => {
  const directoryWithoutWorker = makeTemporaryPublicDirectory({ 'app.css': '' });
  return withServer(createOfflineContext(), async base => {
    const response = await fetch(`${base}/sw.js`, { redirect: 'manual' });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not found' });
  }, directoryWithoutWorker);
});

test('GET /api/version needs sign-in and gives the app version', () => withServer(createOfflineContext(), async base => {
  assert.equal((await fetch(`${base}/api/version`)).status, 401);
  const response = await getJson(base, '/api/version');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { version: computeAppVersion(fixtureDirectory) });
}));

test('a grade posted twice with the same client_answer_id is written once and answered with the same body', () => {
  const context = createOfflineContext();
  const [kat] = addWords(context, '6.1', ['kat']);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  return withServer(context, async base => {
    const body = { word_id: kat, grade: 'good', session_id: 's1', client_answer_id: 'grade-answer-0001' };
    const first = await postJson(base, '/api/practice/grades', body);
    const second = await postJson(base, '/api/practice/grades', body);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const firstText = await first.text();
    assert.equal(await second.text(), firstText);
    assert.equal(countRows(context, 'review_logs'), 1);
    assert.equal(countRows(context, 'deck_answers'), 1);
    assert.equal(countRows(context, 'client_answer_receipts'), 1);
  });
});

test('a drill answer posted twice with the same client_answer_id is stored once and answered 201 both times', () => {
  const context = createOfflineContext();
  const [kat] = addWords(context, '6.1', ['kat']);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  return withServer(context, async base => {
    const body = { word_id: kat, direction: 'uk_nl', is_correct: true, source: 'round', client_answer_id: 'drill-answer-01' };
    const first = await postJson(base, '/api/practice/drill-answers', body);
    const second = await postJson(base, '/api/practice/drill-answers', body);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const firstText = await first.text();
    assert.equal(await second.text(), firstText);
    assert.equal(countRows(context, 'drill_answers'), 1);
  });
});

test('a client_answer_id shorter than 8 characters is refused with 400', () => {
  const context = createOfflineContext();
  const [kat] = addWords(context, '6.1', ['kat']);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  return withServer(context, async base => {
    const response = await postJson(base, '/api/practice/grades', {
      word_id: kat, grade: 'good', session_id: 's1', client_answer_id: 'short',
    });
    assert.equal(response.status, 400);
    assert.equal(countRows(context, 'review_logs'), 0);
  });
});

test('answered_at ahead of the server counts as now; more than 7 days old is refused with 400', () => {
  const context = createOfflineContext();
  const [kat, hond] = addWords(context, '6.1', ['kat', 'hond']);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  const now = Date.parse(MORNING_IN_AMSTERDAM);
  return withServer(context, async base => {
    const inTheFuture = await postJson(base, '/api/practice/grades', {
      word_id: kat, grade: 'good', session_id: 's1', answered_at: now + 3 * 60_000,
    });
    assert.equal(inTheFuture.status, 200);
    const reviewTime = context.database.prepare('SELECT reviewed_at FROM review_logs WHERE word_id = ?').get(kat);
    assert.equal(reviewTime.reviewed_at, now);

    const tooOld = await postJson(base, '/api/practice/grades', {
      word_id: kat, grade: 'good', session_id: 's1', answered_at: now - 8 * MILLISECONDS_PER_DAY,
    });
    assert.equal(tooOld.status, 400);

    const drillTooOld = await postJson(base, '/api/practice/drill-answers', {
      word_id: kat, direction: 'uk_nl', is_correct: false, source: 'round', answered_at: now - 8 * MILLISECONDS_PER_DAY,
    });
    assert.equal(drillTooOld.status, 400);

    const justInTime = await postJson(base, '/api/practice/grades', {
      word_id: hond, grade: 'good', session_id: 's1', answered_at: now - 6 * MILLISECONDS_PER_DAY,
    });
    assert.equal(justInTime.status, 200);
  });
});

test('a grade earlier than the last answer of its word is refused with 409', () => {
  const context = createOfflineContext();
  const [kat] = addWords(context, '6.1', ['kat']);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  return withServer(context, async base => {
    const now = Date.parse(MORNING_IN_AMSTERDAM);
    assert.equal((await postJson(base, '/api/practice/grades', { word_id: kat, grade: 'good', session_id: 's1' })).status, 200);
    const earlier = await postJson(base, '/api/practice/grades', {
      word_id: kat, grade: 'good', session_id: 's1', answered_at: now - 60_000,
    });
    assert.equal(earlier.status, 409);
    assert.equal((await earlier.json()).error, 'пізніша відповідь уже є');
    assert.equal(countRows(context, 'review_logs'), 1);
  });
});

test('answered_at of yesterday puts the review log, the deck answer and the calendar day on yesterday', () => {
  const context = createOfflineContext();
  const [kat] = addWords(context, '6.1', ['kat']);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  const yesterdayEvening = Date.parse('2026-10-23T18:30:00+02:00');
  return withServer(context, async base => {
    const response = await postJson(base, '/api/practice/grades', {
      word_id: kat, grade: 'good', session_id: 's1', answered_at: yesterdayEvening,
    });
    assert.equal(response.status, 200);
    assert.equal(context.database.prepare('SELECT reviewed_at FROM review_logs').pluck().get(), yesterdayEvening);
    assert.equal(context.database.prepare('SELECT answered_at FROM deck_answers').pluck().get(), yesterdayEvening);
    assert.equal(context.database.prepare('SELECT introduced_on FROM words WHERE id = ?').pluck().get(kat), '2026-10-23');
  });
});

test('set_word_ids pins the set when no set is open today, keeping the known ids in order', () => {
  const context = createOfflineContext();
  const [kat, hond, vis] = addWords(context, '6.1', ['kat', 'hond', 'vis']);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  return withServer(context, async base => {
    const response = await postJson(base, '/api/practice/grades', {
      word_id: hond,
      grade: 'good',
      session_id: 'offline-1',
      client_answer_id: 'set-pinned-0001',
      set_word_ids: [hond, 999999, kat, hond],
    });
    assert.equal(response.status, 200);
    const storedSet = readWordSetSetting(context);
    assert.deepEqual(storedSet.item_ids, [hond, kat]);
    assert.equal(storedSet.opened_at, Date.parse(MORNING_IN_AMSTERDAM));

    const batch = await (await getJson(base, '/api/practice/batch?session_id=offline-1')).json();
    assert.equal(batch.counts.is_set_open, true);
    const batchIds = [...batch.reviews, ...batch.new_words].map(word => word.id);
    assert.deepEqual(batchIds.sort(), [kat, hond].sort());
    assert.ok(!batchIds.includes(vis));
  });
});

test('set_word_ids is ignored when a set is open today', () => {
  const context = createOfflineContext();
  const [kat, hond, vis] = addWords(context, '6.1', ['kat', 'hond', 'vis']);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  return withServer(context, async base => {
    await getJson(base, '/api/practice/batch?session_id=offline-2');
    const openSet = readWordSetSetting(context);
    assert.equal(openSet.item_ids.length, 3);
    const response = await postJson(base, '/api/practice/grades', {
      word_id: kat, grade: 'good', session_id: 'offline-2', set_word_ids: [vis],
    });
    assert.equal(response.status, 200);
    assert.deepEqual(readWordSetSetting(context).item_ids, openSet.item_ids);
    assert.ok([kat, hond, vis].every(wordId => openSet.item_ids.includes(wordId)));
  });
});

test('set_word_ids replaces an open set when the graded word is in the phone\'s set and not in the open one', () => {
  const context = createOfflineContext();
  const wordIds = addWords(context, '6.1', Array.from({ length: 12 }, (_, index) => `woord-${index + 1}`));
  context.practiceService.migrateToFsrs({ isDryRun: false });
  return withServer(context, async base => {
    await getJson(base, '/api/practice/batch?session_id=offline-3');
    const openSet = readWordSetSetting(context);
    const phoneSet = wordIds.filter(wordId => !openSet.item_ids.includes(wordId));
    assert.equal(phoneSet.length, 2);
    const response = await postJson(base, '/api/practice/grades', {
      word_id: phoneSet[0], grade: 'good', session_id: 'offline-3', set_word_ids: phoneSet,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(readWordSetSetting(context).item_ids, phoneSet);
  });
});

test('a phone set pinned by its spare word opens at set_opened_at, so the answers it got earlier count for it', () => {
  const context = createOfflineContext();
  const wordIds = addWords(context, '6.1', Array.from({ length: 12 }, (_, index) => `woord-${index + 1}`));
  context.practiceService.migrateToFsrs({ isDryRun: false });
  const setStartedAt = Date.parse('2026-10-24T12:01:00+02:00');
  return withServer(context, async base => {
    await getJson(base, '/api/practice/batch?session_id=offline-4');
    const openSet = readWordSetSetting(context);
    const learningWordId = openSet.item_ids[0];
    const spareWordId = wordIds.find(wordId => !openSet.item_ids.includes(wordId));
    const phoneSetWordIds = [learningWordId, spareWordId];
    const gradeOffline = (wordId, answeredAt) => postJson(base, '/api/practice/grades', {
      word_id: wordId, grade: 'good', session_id: 'offline-4', answered_at: answeredAt,
      set_word_ids: phoneSetWordIds, set_opened_at: setStartedAt,
    });
    context.clock.moveTo('2026-10-24T12:10:00+02:00');

    // The learning word is in the open set, so it does not pin the phone's set yet.
    assert.equal((await gradeOffline(learningWordId, setStartedAt + 60_000)).status, 200);
    assert.deepEqual(readWordSetSetting(context).item_ids, openSet.item_ids);

    // The spare word is outside the open set: the phone's set is pinned and opens at the phone's set_opened_at.
    assert.equal((await gradeOffline(spareWordId, setStartedAt + 4 * 60_000)).status, 200);
    const storedSet = readWordSetSetting(context);
    assert.deepEqual(storedSet.item_ids, phoneSetWordIds);
    assert.equal(storedSet.opened_at, setStartedAt);

    // The learning word's answer, given before the spare word, counts for the new set: both answers are in the round.
    const { round } = await (await getJson(base, '/api/practice/round-summary')).json();
    assert.equal(round.answer_count, 2);
  });
});

test('set_opened_at older than 7 days is not used: the phone\'s set opens at the answer\'s time', () => {
  const context = createOfflineContext();
  const [kat, hond] = addWords(context, '6.1', ['kat', 'hond']);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  const now = Date.parse(MORNING_IN_AMSTERDAM);
  return withServer(context, async base => {
    const response = await postJson(base, '/api/practice/grades', {
      word_id: hond, grade: 'good', session_id: 'offline-5', set_word_ids: [hond, kat],
      set_opened_at: now - 8 * MILLISECONDS_PER_DAY,
    });
    assert.equal(response.status, 200);
    assert.equal(readWordSetSetting(context).opened_at, now);
  });
});

test('spare words: the next set\'s words outside the open set, up to new_per_day, and read only', () => {
  const context = createOfflineContext();
  addWords(context, '6.1', Array.from({ length: 25 }, (_, index) => `woord-${index + 1}`));
  context.practiceService.migrateToFsrs({ isDryRun: false });
  return withServer(context, async base => {
    const batch = await (await getJson(base, '/api/practice/batch?session_id=s1')).json();
    const setWordIds = [...batch.reviews, ...batch.new_words].map(word => word.id);
    assert.equal(setWordIds.length, 10);
    const setBefore = readWordSetSetting(context);
    const deckAnswersBefore = countRows(context, 'deck_answers');

    const response = await getJson(base, '/api/practice/spare-words?session_id=s1');
    assert.equal(response.status, 200);
    const { words } = await response.json();
    assert.equal(words.length, 10);
    const spareWordIds = words.map(word => word.id);
    assert.equal(new Set(spareWordIds).size, 10);
    assert.ok(spareWordIds.every(wordId => !setWordIds.includes(wordId)));
    for (const word of words) assert.deepEqual(word.directions_left, ['uk_nl', 'nl_uk']);

    assert.deepEqual(readWordSetSetting(context), setBefore);
    assert.equal(countRows(context, 'deck_answers'), deckAnswersBefore);
  });
});

test('spare words leave out the words graded in this session, but not in another session', () => {
  const context = createOfflineContext();
  const [first, second] = addWords(context, '6.1', ['eerste', 'tweede']);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  return withServer(context, async base => {
    assert.equal((await postJson(base, '/api/practice/grades', { word_id: first, grade: 'good', session_id: 's1' })).status, 200);
    // The next day the set of the first day is no longer open: the word graded in s1 is still in the deck.
    context.clock.moveTo('2026-10-25T12:00:00+01:00');
    const fromSessionOne = await (await getJson(base, '/api/practice/spare-words?session_id=s1')).json();
    const fromSessionTwo = await (await getJson(base, '/api/practice/spare-words?session_id=s2')).json();
    assert.deepEqual(fromSessionOne.words.map(word => word.id), [second]);
    assert.deepEqual(fromSessionTwo.words.map(word => word.id), [first, second]);
  });
});

test('receipts older than 30 days are deleted when a new one is written', () => {
  const context = createOfflineContext();
  const [first, second] = addWords(context, '6.1', ['eerste', 'tweede']);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  context.practiceService.gradeWord({ wordId: first, grade: 'good', sessionId: 's1', clientAnswerId: 'old-answer-0001' });
  context.clock.moveTo('2026-11-24T12:00:00+01:00');
  context.practiceService.gradeWord({ wordId: second, grade: 'good', sessionId: 's1', clientAnswerId: 'new-answer-0001' });
  const receiptIds = context.database.prepare('SELECT client_answer_id FROM client_answer_receipts').pluck().all();
  assert.deepEqual(receiptIds, ['new-answer-0001']);
});

test('the MCP grade_word schema takes none of the offline fields', () => {
  assert.deepEqual(Object.keys(gradeWordToolInputSchema.shape).sort(), ['answer', 'direction', 'grade', 'id', 'session_id']);
  const withOfflineField = field => gradeWordToolInputSchema.safeParse({
    id: 1, grade: 'good', session_id: 's1', [field]: 'x',
  });
  assert.equal(withOfflineField('client_answer_id').success, false);
  assert.equal(withOfflineField('answered_at').success, false);
  assert.equal(withOfflineField('set_word_ids').success, false);
  assert.equal(withOfflineField('set_opened_at').success, false);
});
