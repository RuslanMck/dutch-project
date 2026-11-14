// Missing common words: the frequency groups the dictionary does not cover (up to rank 4000, 120 groups), the prompt
// (correct literary Ukrainian, categories), the checked answer (ranks, articles, categories, dictionary duplicates,
// the limit), the service with a fake OpenRouter call (never the real API), the category set when a word is added, and
// POST /api/words/suggestions. Nothing is saved by a suggestion.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';

import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { wordCategorySchema } from '../src/contracts/category-contracts.js';
import { createWordInputSchema } from '../src/contracts/word-contracts.js';
import { createChangeEventBus } from '../src/change-events/change-event-bus.js';
import { createDatabaseConnection } from '../src/database/create-database-connection.js';
import { runDatabaseMigrations } from '../src/database/run-database-migrations.js';
import { ValidationError } from '../src/errors/domain-errors.js';
import { createOpenRouterClient } from '../src/integrations/openrouter-client.js';
import { createApplication } from '../src/server/create-application.js';
import { createDomainServices } from '../src/server/create-domain-services.js';
import { buildSuggestionMessages } from '../src/domains/words/word-suggestion-prompt.js';
import {
  findMissingFrequencyGroups,
  parseWordSuggestions,
  tokenizeDutchText,
} from '../src/domains/words/word-suggestion-planning.js';

const BEARER = { Authorization: 'Bearer test-api-token' };
const flush = () => new Promise(resolve => setImmediate(resolve));
const SUGGESTION_MODEL = 'test/suggestion-model';
const configuration = parseEnvironmentConfiguration({
  NODE_ENV: 'test',
  APP_PASSWORD: 'correct horse',
  SESSION_SECRET: 'test-session-secret',
  API_TOKEN: 'test-api-token',
});

// A fake OpenRouter call (the client's fetch): it answers with content, and keeps every request body.
function createFakeOpenRouter({ content = '{"suggestions": []}' } = {}) {
  const requests = [];
  const fetchFunction = async (url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  return { requests, fetchFunction };
}

function createFixture({ fake = createFakeOpenRouter(), apiKey = 'test-key' } = {}) {
  const clock = { now: () => Date.parse('2026-11-14T10:00:00+01:00') };
  const database = createDatabaseConnection({ databasePath: ':memory:' });
  runDatabaseMigrations({ database, clock });
  const changeEventBus = createChangeEventBus({ clock });
  const openRouterClient = createOpenRouterClient({ apiKey, model: 'test/model', fetchFunction: fake.fetchFunction });
  const services = createDomainServices({
    database,
    changeEventBus,
    clock,
    isFsrsFuzzEnabled: false,
    openRouterClient,
    configuration: { wordCategoryModel: SUGGESTION_MODEL },
    logger: { error: () => {} },
  });
  return { ...services, database, clock, changeEventBus, fake };
}

// A small frequency list: gaat, ging and gaan share rank 10; huis and huizen share 50; kat is past rank 4000.
const FREQUENCY_ROWS = [
  { wordForm: 'gaat', frequencyRank: 10 },
  { wordForm: 'ging', frequencyRank: 10 },
  { wordForm: 'gaan', frequencyRank: 10 },
  { wordForm: 'huis', frequencyRank: 50 },
  { wordForm: 'huizen', frequencyRank: 50 },
  { wordForm: 'hond', frequencyRank: 120 },
  { wordForm: 'boek', frequencyRank: 399 },
  { wordForm: 'lezen', frequencyRank: 800 },
  { wordForm: 'kat', frequencyRank: 4500 },
];

test('tokens of a Dutch text: lowercase, no leading article, no punctuation, edge apostrophes also without', () => {
  assert.deepEqual(tokenizeDutchText('de Hoofdgerecht'), ['hoofdgerecht']);
  assert.ok(tokenizeDutchText("'s ochtends").includes("'s"));
  assert.ok(tokenizeDutchText("'s ochtends").includes('s'));
  assert.deepEqual(tokenizeDutchText('hoe heet je?'), ['hoe', 'heet', 'je']);
});

test('the missing groups: one per rank, covered groups and ranks past 4000 left out, most frequent first', () => {
  const groups = findMissingFrequencyGroups({
    frequencyRows: FREQUENCY_ROWS,
    dictionaryTexts: ['de ging', 'lezen', 'de huis'],
  });
  assert.deepEqual(groups, [{ rank: 120, forms: ['hond'] }, { rank: 399, forms: ['boek'] }]);
  const limited = findMissingFrequencyGroups({ frequencyRows: FREQUENCY_ROWS, dictionaryTexts: [], groupLimit: 2 });
  assert.deepEqual(limited.map(group => group.rank), [10, 50]);
  assert.deepEqual(limited[0].forms, ['gaat', 'ging', 'gaan']);
});

test('the checked answer: a suggestion needs a group rank, a valid article and category, and a new nl', () => {
  const groups = [{ rank: 10, forms: ['gaat', 'ging', 'gaan'] }, { rank: 399, forms: ['boek'] }];
  const answer = JSON.stringify({
    suggestions: [
      { rank: 399, nl: 'Boek', article: 'het', uk: 'книга', category: 'leisure' },
      { rank: 999, nl: 'vlieg', article: '', uk: 'муха', category: 'nature' },
      { rank: 10, nl: 'gaan', article: '', uk: 'йти', category: 'vehicles' },
      { rank: 10, nl: 'gaan', article: 'pl', uk: 'йти', category: 'actions' },
      { rank: 10, nl: 'gaan', article: '', uk: 'йти', category: 'actions' },
      { rank: 10, nl: 'gaan', article: '', uk: 'йти', category: 'actions' },
      { rank: 10, nl: 'de huis', article: 'het', uk: 'будинок', category: 'home' },
      { rank: 10, nl: 'ging', article: '', uk: '', category: 'actions' },
    ],
  });
  const suggestions = parseWordSuggestions(answer, { groups, dictionaryTexts: ['huis'], limit: 30 });
  assert.deepEqual(suggestions, [
    { nl: 'boek', article: 'het', uk: 'книга', category: 'leisure', frequency_rank: 399 },
    { nl: 'gaan', article: '', uk: 'йти', category: 'actions', frequency_rank: 10 },
  ]);
});

test('the checked answer reads a JSON object inside a code fence, and refuses an answer without suggestions', () => {
  const groups = [{ rank: 399, forms: ['boek'] }];
  const json = '{"suggestions":[{"rank":399,"nl":"boek","article":"het","uk":"книга","category":"leisure"}]}';
  const fenced = '```json\n' + json + '\n```';
  assert.equal(parseWordSuggestions(fenced, { groups, dictionaryTexts: [], limit: 5 }).length, 1);
  assert.throws(() => parseWordSuggestions('не JSON', { groups, dictionaryTexts: [], limit: 5 }), ValidationError);
  assert.throws(
    () => parseWordSuggestions('{"words": []}', { groups, dictionaryTexts: [], limit: 5 }),
    { message: 'у відповіді моделі немає масиву suggestions' },
  );
  const twoOfThree = JSON.stringify({ suggestions: [
    { rank: 399, nl: 'boek', article: 'het', uk: 'книга', category: 'leisure' },
    { rank: 399, nl: 'lezen', article: '', uk: 'читати', category: 'actions' },
    { rank: 399, nl: 'school', article: 'de', uk: 'школа', category: 'work' },
  ] });
  assert.equal(parseWordSuggestions(twoOfThree, { groups, dictionaryTexts: [], limit: 2 }).length, 2);
});

test('the prompt asks for correct literary Ukrainian, lists every category and the groups', () => {
  const [system, user] = buildSuggestionMessages({
    groups: [{ rank: 10, forms: ['gaat', 'ging', 'gaan'] }],
    limit: 15,
  });
  assert.equal(system.role, 'system');
  assert.match(system.content, /correct literary Ukrainian/);
  assert.match(system.content, /no russianisms, no surzhyk, no Russian words/);
  for (const categoryId of ['food', 'home', 'clothes', 'colours', 'numbers', 'people', 'body', 'city', 'work', 'nature',
    'leisure', 'feelings', 'actions', 'talk', 'other']) {
    assert.match(system.content, new RegExp(`${categoryId} \\(`));
  }
  assert.match(system.content, /"suggestions"/);
  assert.equal(user.role, 'user');
  assert.match(user.content, /at most 15 words/);
  assert.match(user.content, /rank 10: gaat, ging, gaan/);
});

test('suggestions without a key are refused; with a key the answer is checked and nothing is saved', async () => {
  const fake = createFakeOpenRouter({ content: JSON.stringify({ suggestions: [
    { rank: 399, nl: 'boek', article: 'het', uk: 'книга', category: 'leisure' },
  ] }) });
  const context = createFixture({ fake, apiKey: '' });
  context.priorityService.importFrequencyList(FREQUENCY_ROWS);
  await assert.rejects(() => context.wordService.suggestWords(), { message: 'Модель не налаштована' });
  assert.equal(fake.requests.length, 0);

  const configured = createFixture({ fake });
  configured.priorityService.importFrequencyList(FREQUENCY_ROWS);
  configured.wordService.createWords([{ nl: 'lezen', uk: 'читати' }]);
  await flush();
  const requestsBefore = fake.requests.length;
  const result = await configured.wordService.suggestWords({ limit: 5 });
  assert.deepEqual(result, {
    suggestions: [{ nl: 'boek', article: 'het', uk: 'книга', category: 'leisure', frequency_rank: 399 }],
  });
  assert.equal(fake.requests.length - requestsBefore, 1, 'one request for the suggestions');
  const suggestionRequest = fake.requests.at(-1);
  assert.equal(suggestionRequest.model, SUGGESTION_MODEL);
  const userContent = suggestionRequest.messages[1].content;
  assert.match(userContent, /rank 120: hond/);
  assert.doesNotMatch(userContent, /kat/, 'a rank past 4000 is not sent');
  assert.doesNotMatch(userContent, /rank 800/, 'a word of the dictionary covers its group');
  assert.equal(configured.wordService.listWords().length, 1, 'nothing is saved');
});

test('a dictionary that covers every group asks the model nothing', async () => {
  const fake = createFakeOpenRouter();
  const context = createFixture({ fake });
  context.priorityService.importFrequencyList([{ wordForm: 'boek', frequencyRank: 399 }]);
  context.wordService.createWords([{ nl: 'boek', uk: 'книга' }]);
  await flush();
  const requestsBefore = fake.requests.length;
  assert.deepEqual(await context.wordService.suggestWords(), { suggestions: [] });
  assert.equal(fake.requests.length, requestsBefore);
});

test('a word added with a category keeps it; the categorizer only fills words without one', async () => {
  const fake = createFakeOpenRouter({ content: JSON.stringify({ categories: {} }) });
  const context = createFixture({ fake });
  assert.equal(createWordInputSchema.safeParse({ nl: 'trein', uk: 'потяг', category: 'city' }).success, true);
  assert.equal(createWordInputSchema.safeParse({ nl: 'trein', uk: 'потяг', category: 'vehicles' }).success, false);
  assert.equal(wordCategorySchema.safeParse('city').success, true);
  const [chosen] = context.wordService.createWords([{ nl: 'trein', uk: 'потяг', category: 'city' }]).added;
  assert.equal(chosen.category, 'city');
  const plain = context.wordService.createWord({ nl: 'bus', uk: 'автобус' });
  assert.equal(plain.category, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.wordService.getWord(chosen.id).category, 'city');
});

test('POST /api/words/suggestions answers with the suggestions; 400 without a key', async () => {
  const fake = createFakeOpenRouter({ content: JSON.stringify({ suggestions: [
    { rank: 399, nl: 'boek', article: 'het', uk: 'книга', category: 'leisure' },
  ] }) });
  const context = createFixture({ fake });
  context.priorityService.importFrequencyList(FREQUENCY_ROWS);
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
    const answer = await fetch(`${base}/api/words/suggestions`, {
      method: 'POST',
      headers: { ...BEARER, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 }),
    });
    assert.equal(answer.status, 200);
    assert.deepEqual(await answer.json(), {
      suggestions: [{ nl: 'boek', article: 'het', uk: 'книга', category: 'leisure', frequency_rank: 399 }],
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }

  const withoutKey = createFixture({ apiKey: '' });
  const withoutKeyApplication = createApplication({
    configuration,
    services: withoutKey,
    changeEventBus: withoutKey.changeEventBus,
    clock: withoutKey.clock,
  });
  const withoutKeyServer = withoutKeyApplication.listen(0, '127.0.0.1');
  await once(withoutKeyServer, 'listening');
  try {
    const answer = await fetch(`http://127.0.0.1:${withoutKeyServer.address().port}/api/words/suggestions`, {
      method: 'POST',
      headers: { ...BEARER, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(answer.status, 400);
    assert.deepEqual(await answer.json(), { error: 'Модель не налаштована' });
  } finally {
    withoutKeyServer.closeAllConnections();
    await new Promise(resolve => withoutKeyServer.close(resolve));
  }
});
