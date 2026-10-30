// Custom decks against an in-memory database and a fake clock: create, read, update and delete, the name and word
// rules, a deleted word leaving its decks, the word catalog (difficulty, last practice day), the custom drill's words
// (order, unknown ids, read only), the drill answers log (statistics only), and the REST and MCP adapters. Answers are written straight into deck_answers, the
// table the round summary and the catalog count.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { ConflictError, NotFoundError, ValidationError } from '../src/errors/domain-errors.js';
import { createMcpServer } from '../src/model-context-protocol/create-mcp-server.js';
import { createApplication } from '../src/server/create-application.js';
import { createTestContext } from './database-test-helpers.js';

const TOKEN = 'test-api-token-for-decks';
const SECRET = '0123456789abcdef'.repeat(4);
const TIME_ZONE = 'Europe/Amsterdam';
const START = '2026-10-24T12:00:00+02:00';

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

// The words of the test, created in this order.
function createWords(context, nlTexts) {
  return nlTexts.map(nl => context.wordService.createWord({ nl, uk: `${nl} (переклад)`, article: '' }).id);
}

// One answer in deck_answers. grade: again, hard or good; superseded: true when a practice reset stopped it counting.
function insertDeckAnswer(context, { wordId, grade, answeredAt, direction = 'uk_nl', superseded = false }) {
  context.database.prepare(`
    INSERT INTO deck_answers (word_id, session_id, answered_at, grade, is_first_in_session, required_correct_after,
      correct_count_after, direction, superseded_at)
    VALUES (@wordId, 'session-1', @answeredAt, @grade, 0, NULL, 0, @direction, @supersededAt)
  `).run({ wordId, answeredAt, grade, direction, supersededAt: superseded ? answeredAt : null });
}

function countRows(context, tableName) {
  return context.database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

const clock = createFakeClock(START);
const context = createTestContext({ clock });
const [huis, fiets, boek, school, kat] = createWords(context, ['het huis', 'de fiets', 'het boek', 'de school', 'de kat']);

test('create a deck: the words in the order given, repeats once, listed newest first', () => {
  const deck = context.deckService.createDeck({ name: '  Huis en fiets ', description: '  ', word_ids: [fiets, huis, fiets] });
  assert.equal(deck.name, 'Huis en fiets');
  assert.equal(deck.description, null);
  assert.equal(deck.word_count, 2);
  assert.deepEqual(deck.words.map(word => word.id), [fiets, huis]);
  assert.equal(deck.words[0].nl, 'de fiets');
  assert.equal(deck.words[0].difficulty, null);

  clock.moveTo('2026-10-24T12:01:00+02:00');
  const second = context.deckService.createDeck({ name: 'School', description: 'Op school', word_ids: [school] });
  const listed = context.deckService.listDecks();
  assert.deepEqual(listed.map(item => item.name), ['School', 'Huis en fiets']);
  assert.equal(listed[0].word_count, 1);
  assert.equal(listed[0].description, 'Op school');
  assert.equal(second.words.length, 1);
});

test('the name is unique ignoring case, Cyrillic included', () => {
  context.deckService.createDeck({ name: 'Ідея', word_ids: [boek] });
  assert.throws(() => context.deckService.createDeck({ name: 'ідея', word_ids: [boek] }), error => {
    assert.ok(error instanceof ConflictError);
    assert.equal(error.message, 'Колода з такою назвою вже є');
    return true;
  });
  assert.throws(() => context.deckService.createDeck({ name: 'HUIS EN FIETS', word_ids: [boek] }), ConflictError);
  const other = context.deckService.createDeck({ name: 'Kat', word_ids: [kat] });
  // Renaming a deck to its own name is not a clash.
  assert.equal(context.deckService.updateDeck(other.id, { name: 'KAT' }).name, 'KAT');
});

test('unknown word ids are refused and the deck is not created', () => {
  const decksBefore = countRows(context, 'custom_decks');
  assert.throws(() => context.deckService.createDeck({ name: 'Fout', word_ids: [huis, 999998, 999999] }), error => {
    assert.ok(error instanceof ValidationError);
    assert.match(error.message, /999998, 999999/);
    return true;
  });
  assert.equal(countRows(context, 'custom_decks'), decksBefore);
});

test('update: replace, add, remove, clear the description, and a deck keeps at least one word', () => {
  const deck = context.deckService.createDeck({ name: 'Wijzigen', description: 'x', word_ids: [huis, fiets] });
  const replaced = context.deckService.updateDeck(deck.id, { word_ids: [boek, huis] });
  assert.deepEqual(replaced.words.map(word => word.id), [boek, huis]);

  const added = context.deckService.updateDeck(deck.id, { add_word_ids: [fiets, huis, school] });
  assert.deepEqual(added.words.map(word => word.id), [boek, huis, fiets, school], 'a word already in keeps its place');

  const removed = context.deckService.updateDeck(deck.id, { remove_word_ids: [huis, kat] });
  assert.deepEqual(removed.words.map(word => word.id), [boek, fiets, school]);

  const cleared = context.deckService.updateDeck(deck.id, { description: '', name: 'Nieuw' });
  assert.equal(cleared.description, null);
  assert.equal(cleared.name, 'Nieuw');

  assert.throws(() => context.deckService.updateDeck(deck.id, { word_ids: [huis], add_word_ids: [kat] }), ValidationError);
  assert.throws(() => context.deckService.updateDeck(deck.id, { word_ids: [] }), ValidationError);
  assert.throws(() => context.deckService.updateDeck(deck.id, { remove_word_ids: [boek, fiets, school] }), ValidationError);
  // The refused update changed nothing.
  const unchanged = context.deckService.getDeck(deck.id);
  assert.deepEqual(unchanged.words.map(word => word.id), [boek, fiets, school]);
  assert.equal(unchanged.name, 'Nieuw');
});

test('get and delete: an unknown deck is not found; deleting keeps the words', () => {
  const deck = context.deckService.createDeck({ name: 'Weg', word_ids: [kat] });
  context.deckService.deleteDeck(deck.id);
  assert.throws(() => context.deckService.getDeck(deck.id), NotFoundError);
  assert.throws(() => context.deckService.deleteDeck(deck.id), NotFoundError);
  assert.equal(context.wordService.getWord(kat).nl, 'de kat');
});

test('a deleted word leaves its decks, and the decks change is published', () => {
  const temporary = context.wordService.createWord({ nl: 'tijdelijk', uk: 'тимчасово', article: '' }).id;
  const deck = context.deckService.createDeck({ name: 'Tijdelijk', word_ids: [temporary, kat] });
  const collections = [];
  const unsubscribe = context.changeEventBus.subscribeToChanges(event => collections.push(event.collection));
  context.wordService.deleteWord(temporary);
  unsubscribe();
  assert.deepEqual(collections, ['words', 'decks']);
  const after = context.deckService.getDeck(deck.id);
  assert.equal(after.word_count, 1);
  assert.deepEqual(after.words.map(word => word.id), [kat]);
});

test('a deck that loses its last word by deletion stays, with word_count 0', () => {
  const lonely = context.wordService.createWord({ nl: 'eenzaam', uk: 'самотньо', article: '' }).id;
  const deck = context.deckService.createDeck({ name: 'Eenzaam', word_ids: [lonely] });
  context.wordService.deleteWord(lonely);
  const listed = context.deckService.listDecks().find(item => item.id === deck.id);
  assert.equal(listed.word_count, 0);
  assert.deepEqual(context.deckService.getDeck(deck.id).words, []);
});

test('a deck holds at most 1000 words: created and updated, refused with the Ukrainian message', () => {
  const bulkIds = context.wordService.createWords(
    Array.from({ length: 1000 }, (_, index) => ({ nl: `bulkwoord ${index}`, uk: `масове ${index}`, article: '' })),
  ).added.map(word => word.id);
  const extraId = context.wordService.createWord({ nl: 'extra bulk', uk: 'зайве', article: '' }).id;
  assert.throws(() => context.deckService.createDeck({ name: 'Te veel', word_ids: [...bulkIds, extraId] }), error => {
    assert.ok(error instanceof ValidationError);
    assert.equal(error.message, 'у колоді може бути щонайбільше 1000 слів');
    return true;
  });

  const full = context.deckService.createDeck({ name: 'Vol', word_ids: bulkIds });
  assert.equal(full.word_count, 1000);
  assert.throws(() => context.deckService.updateDeck(full.id, { add_word_ids: [extraId] }), ValidationError);
  assert.equal(context.deckService.getDeck(full.id).word_count, 1000, 'the refused update changed nothing');
  const swapped = context.deckService.updateDeck(full.id, { remove_word_ids: [bulkIds[0]], add_word_ids: [extraId] });
  assert.equal(swapped.word_count, 1000);
  assert.equal(swapped.words.at(-1).id, extraId);
});

test('deck names are NFC: a decomposed spelling of a name is stored composed and clashes with it', () => {
  const deck = context.deckService.createDeck({ name: 'Café', word_ids: [boek] });
  assert.equal(deck.name, 'Café');
  assert.throws(() => context.deckService.createDeck({ name: 'CAFÉ', word_ids: [boek] }), ConflictError);
  const other = context.deckService.createDeck({ name: 'Anders', word_ids: [boek] });
  assert.throws(() => context.deckService.updateDeck(other.id, { name: ' Café ' }), ConflictError);
});

test('the catalog: difficulty from the mistakes, last practice day in the practice time zone, sorted by nl', () => {
  const tracked = context.wordService.createWord({ nl: 'het tracking', uk: 'трек', article: 'het' }).id;
  const hard = context.wordService.createWord({ nl: 'de hard', uk: 'важко', article: 'de' }).id;
  const medium = context.wordService.createWord({ nl: 'de middel', uk: 'середньо', article: 'de' }).id;
  const easy = context.wordService.createWord({ nl: 'de makkelijk', uk: 'легко', article: 'de' }).id;
  // 23:30 UTC on 24 October is 01:30 on 25 October in Amsterdam.
  insertDeckAnswer(context, { wordId: tracked, grade: 'good', answeredAt: Date.parse('2026-10-24T10:00:00Z') });
  insertDeckAnswer(context, { wordId: tracked, grade: 'again', answeredAt: Date.parse('2026-10-24T23:30:00Z') });
  insertDeckAnswer(context, { wordId: tracked, grade: 'good', answeredAt: Date.parse('2026-10-24T23:45:00Z'), superseded: true });
  insertDeckAnswer(context, { wordId: hard, grade: 'again', answeredAt: Date.parse('2026-10-20T08:00:00Z') });
  insertDeckAnswer(context, { wordId: hard, grade: 'hard', answeredAt: Date.parse('2026-10-20T08:01:00Z'), direction: 'nl_uk' });
  insertDeckAnswer(context, { wordId: hard, grade: 'again', answeredAt: Date.parse('2026-10-20T08:02:00Z') });
  insertDeckAnswer(context, { wordId: medium, grade: 'hard', answeredAt: Date.parse('2026-10-21T08:00:00Z') });
  insertDeckAnswer(context, { wordId: medium, grade: 'good', answeredAt: Date.parse('2026-10-21T08:01:00Z') });
  insertDeckAnswer(context, { wordId: easy, grade: 'good', answeredAt: Date.parse('2026-10-22T08:00:00Z') });
  // Three old mistakes, then ten right answers: only the last ten count for the difficulty, the lifetime answer count is 13.
  const veteran = context.wordService.createWord({ nl: 'de veteraan', uk: 'ветеран', article: 'de' }).id;
  for (let day = 1; day <= 3; day += 1) {
    insertDeckAnswer(context, { wordId: veteran, grade: 'again', answeredAt: Date.parse(`2026-09-0${day}T08:00:00Z`) });
  }
  for (let day = 1; day <= 10; day += 1) {
    insertDeckAnswer(context, { wordId: veteran, grade: 'good', answeredAt: Date.parse(`2026-10-${10 + day}T08:00:00Z`) });
  }
  // The other way round: ten right answers long ago, then three mistakes in a row: hard.
  const slipping = context.wordService.createWord({ nl: 'de terugval', uk: 'спад', article: 'de' }).id;
  for (let day = 1; day <= 10; day += 1) {
    insertDeckAnswer(context, { wordId: slipping, grade: 'good', answeredAt: Date.parse(`2026-08-${10 + day}T08:00:00Z`) });
  }
  for (let day = 1; day <= 3; day += 1) {
    insertDeckAnswer(context, { wordId: slipping, grade: 'again', answeredAt: Date.parse(`2026-10-${10 + day}T08:00:00Z`) });
  }

  const { words } = context.deckService.listWordCatalog();
  const byNl = Object.fromEntries(words.map(word => [word.nl, word]));
  assert.deepEqual(words.map(word => word.nl), words.map(word => word.nl).sort());

  assert.equal(byNl['het tracking'].answer_count, 2, 'the superseded answer does not count');
  assert.equal(byNl['het tracking'].mistake_count, 1);
  assert.equal(byNl['het tracking'].difficulty, 'medium');
  assert.equal(byNl['het tracking'].last_practiced_on, '2026-10-25');

  assert.equal(byNl['de hard'].answer_count, 3);
  assert.equal(byNl['de hard'].mistake_count, 3);
  assert.equal(byNl['de hard'].difficulty, 'hard');
  assert.equal(byNl['de hard'].last_practiced_on, '2026-10-20');

  assert.equal(byNl['de middel'].mistake_count, 1);
  assert.equal(byNl['de middel'].difficulty, 'medium');

  assert.equal(byNl['de makkelijk'].mistake_count, 0);
  assert.equal(byNl['de makkelijk'].difficulty, 'easy');

  assert.equal(byNl['de veteraan'].answer_count, 13, 'the answer count is lifetime');
  assert.equal(byNl['de veteraan'].mistake_count, 0, 'the old mistakes are outside the last ten answers');
  assert.equal(byNl['de veteraan'].difficulty, 'easy');

  assert.equal(byNl['de terugval'].answer_count, 13);
  assert.equal(byNl['de terugval'].mistake_count, 3, 'the last ten: three mistakes and seven right answers');
  assert.equal(byNl['de terugval'].difficulty, 'hard');

  assert.equal(byNl['de kat'].difficulty, null, 'never answered');
  assert.equal(byNl['de kat'].answer_count, 0);
  assert.equal(byNl['de kat'].last_practiced_on, null);
});

test('drill words: the order of the ids, repeats once, unknown ids skipped, and nothing is graded', () => {
  const reviewLogsBefore = countRows(context, 'review_logs');
  const answersBefore = countRows(context, 'deck_answers');
  const { words } = context.practiceService.getDrillWords({ wordIds: [kat, 999997, huis, kat] });
  assert.deepEqual(words.map(word => word.id), [kat, huis]);
  assert.equal(words[0].uk, 'de kat (переклад)');
  assert.equal(countRows(context, 'review_logs'), reviewLogsBefore);
  assert.equal(countRows(context, 'deck_answers'), answersBefore);
});

test('deck words in the catalog and deck match the catalog fields', () => {
  const deck = context.deckService.createDeck({ name: 'Catalogus', word_ids: [huis] });
  const catalogRow = context.deckService.listWordCatalog().words.find(word => word.id === huis);
  assert.deepEqual(deck.words[0], catalogRow);
});

// REST and MCP adapters on one listening server.
const application = createApplication({
  configuration: parseEnvironmentConfiguration({ NODE_ENV: 'test', MCP_SECRET: SECRET, API_TOKEN: TOKEN }),
  services: context,
  changeEventBus: context.changeEventBus,
  clock,
});
const server = application.listen(0, '127.0.0.1');
let base;

before(async () => {
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

async function restCall(method, path, body) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('REST: create (201), list, catalog before the id route, update, delete, and drill words', async () => {
  const created = await restCall('POST', '/decks', { name: 'REST', word_ids: [school, boek] });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.words.map(word => word.id), [school, boek]);

  const listed = await restCall('GET', '/decks');
  assert.equal(listed.status, 200);
  assert.equal(listed.body[0].name, 'REST');

  const catalog = await restCall('GET', '/decks/word-catalog');
  assert.equal(catalog.status, 200);
  assert.ok(catalog.body.words.length >= 5);

  const duplicate = await restCall('POST', '/decks', { name: 'rest', word_ids: [school] });
  assert.equal(duplicate.status, 409);

  const emptyDeck = await restCall('POST', '/decks', { name: 'Leeg', word_ids: [] });
  assert.equal(emptyDeck.status, 400);

  const patched = await restCall('PATCH', `/decks/${created.body.id}`, { remove_word_ids: [school] });
  assert.equal(patched.status, 200);
  assert.deepEqual(patched.body.words.map(word => word.id), [boek]);

  const missing = await restCall('GET', '/decks/999999');
  assert.equal(missing.status, 404);
  const badId = await restCall('GET', '/decks/abc');
  assert.equal(badId.status, 400);

  const deleted = await restCall('DELETE', `/decks/${created.body.id}`);
  assert.deepEqual(deleted.body, { ok: true });

  const drill = await fetch(`${base}/api/practice/drill-words?ids=${kat},${huis},99999`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(drill.status, 200);
  assert.deepEqual((await drill.json()).words.map(word => word.id), [kat, huis]);

  const badDrill = await fetch(`${base}/api/practice/drill-words?ids=1,x`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.equal(badDrill.status, 400);

  // A whole deck (1000 ids, most of them unknown) is accepted; 1001 ids are not.
  const deckSizedIds = Array.from({ length: 1000 }, (_, index) => index + 1);
  const fullDrill = await fetch(`${base}/api/practice/drill-words?ids=${[kat, ...deckSizedIds.slice(1)].join(',')}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(fullDrill.status, 200);
  assert.equal((await fullDrill.json()).words[0].id, kat);
  const tooManyDrill = await fetch(`${base}/api/practice/drill-words?ids=${[...deckSizedIds, 1001].join(',')}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(tooManyDrill.status, 400);
});

test('MCP: the deck tools create, read, update and delete decks', async () => {
  const mcpServer = createMcpServer(context);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await mcpServer.connect(serverTransport);
  const client = new Client({ name: 'decks-test', version: '1.0.0' });
  await client.connect(clientTransport);

  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, result.content?.[0]?.text);
    return JSON.parse(result.content[0].text);
  };

  const created = await call('create_deck', { name: 'MCP', word_ids: [fiets] });
  assert.equal(created.word_count, 1);
  const updated = await call('update_deck', { id: created.id, add_word_ids: [huis] });
  assert.equal(updated.words.length, 2);
  assert.equal((await call('get_deck', { id: created.id })).words.length, 2);
  assert.ok((await call('list_decks', {})).some(deck => deck.id === created.id));
  assert.deepEqual(await call('delete_deck', { id: created.id }), { ok: true });

  const missing = await client.callTool({ name: 'get_deck', arguments: { id: created.id } });
  assert.equal(missing.isError, true);
  await client.close();
});

// ---------- drill answers: logged for the statistics, the schedule untouched ----------

test('recordDrillAnswer logs the answer and changes nothing of the word; a deleted word takes its answers along', () => {
  const drillClock = createFakeClock('2026-10-30T09:00:00+01:00');
  const drillContext = createTestContext({ clock: drillClock });
  const [wordId] = createWords(drillContext, ['de tafel']);
  const wordBefore = drillContext.database.prepare('SELECT * FROM words WHERE id = ?').get(wordId);
  const { id } = drillContext.practiceService.recordDrillAnswer({
    wordId, direction: 'nl_uk', isCorrect: false, answer: 'стілець', source: 'deck',
  });
  assert.deepEqual(drillContext.database.prepare('SELECT * FROM drill_answers WHERE id = ?').get(id), {
    id, word_id: wordId, direction: 'nl_uk', is_correct: 0, answer: 'стілець', source: 'deck',
    answered_at: drillClock.now(),
  });
  assert.deepEqual(drillContext.database.prepare('SELECT * FROM words WHERE id = ?').get(wordId), wordBefore);
  for (const tableName of ['deck_answers', 'review_logs', 'word_errors']) assert.equal(countRows(drillContext, tableName), 0);
  assert.throws(
    () => drillContext.practiceService.recordDrillAnswer({ wordId: 99999, direction: 'uk_nl', isCorrect: true, source: 'deck' }),
    NotFoundError,
  );
  drillContext.wordService.deleteWord(wordId);
  assert.equal(countRows(drillContext, 'drill_answers'), 0);
});

test('drill answers count in the activity totals, chart and streak, but not in the hardest words', () => {
  const drillClock = createFakeClock('2026-10-30T09:00:00+01:00');
  const drillContext = createTestContext({ clock: drillClock });
  const [tafel, stoel] = createWords(drillContext, ['de tafel', 'de stoel']);
  const record = (wordId, isCorrect) => drillContext.practiceService.recordDrillAnswer({
    wordId, direction: 'uk_nl', isCorrect, answer: '', source: 'round',
  });
  record(tafel, false);
  drillClock.moveTo('2026-10-30T09:01:00+01:00');
  record(tafel, true);
  record(stoel, true);
  const activity = drillContext.statisticsService.calculateActivity({ period: 'day' });
  assert.equal(activity.totals.answers, 3);
  assert.equal(activity.totals.drill_answers, 3);
  assert.equal(activity.totals.word_answers, 0);
  assert.equal(activity.totals.mistakes, 1);
  assert.equal(activity.totals.days_practised, 1);
  const nineOClock = activity.chart.buckets.find(bucket => bucket.key === '9');
  assert.deepEqual([nineOClock.answers, nineOClock.drill_answers, nineOClock.mistakes], [3, 3, 1]);
  assert.equal(activity.streak.is_today_practised, true);
  assert.deepEqual(activity.hardest_words, []);
});

test('REST: POST /practice/drill-answers logs an answer (201); a bad body is a 400, an unknown word a 404', async () => {
  const before = countRows(context, 'drill_answers');
  const created = await restCall('POST', '/practice/drill-answers', {
    word_id: huis, direction: 'uk_nl', is_correct: true, answer: 'huis', source: 'struggling',
  });
  assert.equal(created.status, 201);
  assert.equal(typeof created.body.id, 'number');
  assert.equal(countRows(context, 'drill_answers'), before + 1);
  const badSource = await restCall('POST', '/practice/drill-answers', {
    word_id: huis, direction: 'uk_nl', is_correct: true, source: 'fsrs',
  });
  assert.equal(badSource.status, 400);
  const unknownWord = await restCall('POST', '/practice/drill-answers', {
    word_id: 99999, direction: 'uk_nl', is_correct: true, source: 'deck',
  });
  assert.equal(unknownWord.status, 404);
});
