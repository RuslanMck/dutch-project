// Word categories: the list of categories, the column and the PATCH field, the categorizer (60 words per request, unknown
// ids ignored, the background run after adding words, the refusal without a key) with a fake OpenRouter call, and the
// POST /api/words/categorize route. No real OpenRouter request is made.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';

import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { WORD_CATEGORIES, WORD_CATEGORY_IDS } from '../src/contracts/category-contracts.js';
import { updateWordInputSchema } from '../src/contracts/word-contracts.js';
import { createChangeEventBus } from '../src/change-events/change-event-bus.js';
import { createDatabaseConnection } from '../src/database/create-database-connection.js';
import { runDatabaseMigrations } from '../src/database/run-database-migrations.js';
import { mapWordToCompactWord } from '../src/domains/words/compact-word-mapping.js';
import { createOpenRouterClient } from '../src/integrations/openrouter-client.js';
import { createApplication } from '../src/server/create-application.js';
import { createDomainServices } from '../src/server/create-domain-services.js';

const BEARER = { Authorization: 'Bearer test-api-token' };
const configuration = parseEnvironmentConfiguration({
  NODE_ENV: 'test',
  APP_PASSWORD: 'correct horse',
  SESSION_SECRET: 'test-session-secret',
  API_TOKEN: 'test-api-token',
});

// A fake OpenRouter call (the client's fetch). Every word line of the request gets the category categoryFor returns,
// except the words in omitted (left out of the answer); the answer also has an unknown word id, which must be ignored.
function createFakeOpenRouter({ categoryFor = () => 'food', omittedNames = [], status = 200, content } = {}) {
  const requests = [];
  const fetchFunction = async (url, init) => {
    requests.push(JSON.parse(init.body));
    if (status !== 200) return new Response(JSON.stringify({ error: { message: 'boom' } }), { status });
    if (content !== undefined) {
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }
    const categories = {};
    for (const line of wordLinesOf(requests.at(-1))) {
      const [id, nl] = line.split(' | ');
      if (omittedNames.includes(nl)) continue;
      categories[id] = categoryFor(nl);
    }
    categories['999999'] = 'food';
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ categories }) } }] }), {
      status: 200,
    });
  };
  return { requests, fetchFunction };
}

function wordLinesOf(request) {
  return request.messages[1].content.split('\n').filter(line => /^\d+ \| /.test(line));
}

function createFixture({ fake = createFakeOpenRouter(), apiKey = 'test-key' } = {}) {
  const clock = { now: () => Date.parse('2026-11-14T10:00:00+01:00') };
  const database = createDatabaseConnection({ databasePath: ':memory:' });
  runDatabaseMigrations({ database, clock });
  const changeEventBus = createChangeEventBus({ clock });
  const openRouterClient = createOpenRouterClient({ apiKey, model: 'test/model', fetchFunction: fake.fetchFunction });
  const errors = [];
  const services = createDomainServices({
    database,
    changeEventBus,
    clock,
    isFsrsFuzzEnabled: false,
    openRouterClient,
    logger: { error: (...args) => errors.push(args) },
  });
  return { ...services, database, clock, changeEventBus, fake, errors };
}

// nl: woord0, woord1, … and uk: слово0, … ; the first name is words[0].
function makeWords(count) {
  return Array.from({ length: count }, (_, index) => ({ nl: `woord${index}`, uk: `слово${index}` }));
}

// The background run starts inside the add; a flush lets its (immediate) fake answers finish.
const flush = () => new Promise(resolve => setImmediate(resolve));

async function withApplication(context, run) {
  const application = createApplication({
    configuration,
    services: context,
    changeEventBus: context.changeEventBus,
    clock: context.clock,
  });
  const server = application.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test('the categories are the fifteen of the plan, in order, with their Ukrainian names', () => {
  assert.deepEqual(WORD_CATEGORY_IDS, [
    'food', 'home', 'clothes', 'colours', 'numbers', 'people', 'body', 'city', 'work', 'nature', 'leisure',
    'feelings', 'actions', 'talk', 'other',
  ]);
  assert.equal(WORD_CATEGORIES[0].name, 'Їжа й напої');
  assert.equal(WORD_CATEGORIES[6].name, 'Тіло й здоров\'я');
  assert.equal(WORD_CATEGORIES[14].name, 'Інше');
  assert.ok(Object.isFrozen(WORD_CATEGORIES));
  assert.ok(WORD_CATEGORIES.every(category => Object.isFrozen(category)));
});

test('the words table has the category column, empty until it is set', () => {
  const context = createFixture();
  const columnNames = context.database.prepare('PRAGMA table_info(words)').all().map(column => column.name);
  assert.ok(columnNames.includes('category'));
  const word = context.wordService.createWord({ nl: 'brood', uk: 'хліб' });
  assert.equal(word.category, null);
  assert.equal(mapWordToCompactWord(word).category, null);
});

test('PATCH changes the category; a value outside the list is refused, null clears it', () => {
  assert.equal(updateWordInputSchema.safeParse({ category: 'food' }).success, true);
  assert.equal(updateWordInputSchema.safeParse({ category: null }).success, true);
  assert.equal(updateWordInputSchema.safeParse({ category: 'vehicles' }).success, false);
  const context = createFixture();
  const word = context.wordService.createWord({ nl: 'brood', uk: 'хліб' });
  assert.equal(context.wordService.updateWord(word.id, { category: 'food' }).category, 'food');
  assert.equal(context.wordService.updateWord(word.id, { category: null }).category, null);
});

test('the categorizer sorts 60 words per request, ignores unknown ids and categories, and runs after an add', async () => {
  const fake = createFakeOpenRouter({
    categoryFor: nl => (nl === 'woord1' ? 'vehicles' : 'food'),
    omittedNames: ['woord0'],
  });
  const context = createFixture({ fake });
  context.wordService.createWords(makeWords(130));
  await flush();
  assert.equal(fake.requests.length, 3, 'the add started one background run of three requests');
  assert.deepEqual(fake.requests.map(request => wordLinesOf(request).length), [60, 60, 10]);
  assert.match(fake.requests[0].messages[0].content, /food: /);
  assert.match(fake.requests[0].messages[0].content, /"categories"/);
  assert.equal(fake.requests[0].model, 'test/model');
  const categorized = context.wordService.listWords().filter(word => word.category !== null);
  assert.equal(categorized.length, 128, 'woord0 was left out and woord1 got an unknown category');
  assert.equal(context.wordService.listWords().find(word => word.nl === 'woord2').category, 'food');

  const result = await context.wordService.categorizeWords({ limit: 300 });
  assert.deepEqual(result, { categorized: 0, remaining: 2 });
  assert.equal(fake.requests.length, 4, 'the two words left are asked once more, and nothing else is');
});

test('a run that fails is logged and the add still succeeds', async () => {
  const context = createFixture({ fake: createFakeOpenRouter({ content: '{"words": {}}' }) });
  const { added } = context.wordService.createWords(makeWords(2));
  await flush();
  assert.equal(added.length, 2);
  assert.equal(context.errors.length, 1);
  await assert.rejects(() => context.wordService.categorizeWords(), error => {
    assert.equal(error.name, 'ValidationError');
    assert.match(error.message, /categories/);
    return true;
  });
});

test('without an OpenRouter key the categorizer refuses, and an add starts no run', async () => {
  const fake = createFakeOpenRouter();
  const context = createFixture({ fake, apiKey: '' });
  context.wordService.createWords(makeWords(3));
  await flush();
  assert.equal(fake.requests.length, 0);
  await assert.rejects(() => context.wordService.categorizeWords(), { message: 'Модель не налаштована' });
});

test('POST /api/words/categorize sorts the words and answers with the counts; 400 without a key', async () => {
  const context = createFixture({ fake: createFakeOpenRouter({ omittedNames: ['woord0'] }) });
  context.wordService.createWords(makeWords(3));
  await flush();
  await withApplication(context, async base => {
    const answer = await fetch(`${base}/api/words/categorize`, {
      method: 'POST',
      headers: { ...BEARER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 }),
    });
    assert.equal(answer.status, 200);
    assert.deepEqual(await answer.json(), { categorized: 0, remaining: 1 });
  });

  const withoutKey = createFixture({ apiKey: '' });
  await withApplication(withoutKey, async base => {
    const answer = await fetch(`${base}/api/words/categorize`, {
      method: 'POST',
      headers: { ...BEARER, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(answer.status, 400);
    assert.deepEqual(await answer.json(), { error: 'Модель не налаштована' });
  });
});

test('PATCH /api/words/:id takes a category id or null, and refuses another value with 400', async () => {
  const context = createFixture();
  const word = context.wordService.createWord({ nl: 'fiets', uk: 'велосипед' });
  await withApplication(context, async base => {
    const patch = body => fetch(`${base}/api/words/${word.id}`, {
      method: 'PATCH',
      headers: { ...BEARER, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const set = await patch({ category: 'city' });
    assert.equal(set.status, 200);
    assert.equal((await set.json()).category, 'city');
    const refused = await patch({ category: 'vehicles' });
    assert.equal(refused.status, 400);
    const cleared = await patch({ category: null });
    assert.equal((await cleared.json()).category, null);
  });
});
