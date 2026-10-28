// The word-order exercise: the service (adding, import, set, answers, generation through a fake OpenRouter), the REST
// routes and the MCP tools, against an in-memory database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { NotFoundError, ValidationError } from '../src/errors/domain-errors.js';
import { createTransactionRunner } from '../src/database/run-in-transaction.js';
import { createWordOrderRepository } from '../src/domains/word-order/word-order-repository.js';
import { createWordOrderService } from '../src/domains/word-order/word-order-service.js';
import { createOpenRouterClient } from '../src/integrations/openrouter-client.js';
import { createApplication } from '../src/server/create-application.js';
import { createTestContext } from './database-test-helpers.js';

const SECRET = '0123456789abcdef'.repeat(4);
const TOKEN = 'test-api-token-for-word-order';
const BEARER = { Authorization: `Bearer ${TOKEN}` };

const KOFFIE = { nl: 'Ik drink koffie.', uk: 'Я п\'ю каву.', rule: 'v2' };
const MES = { nl: 'Heb je een mes?', uk: 'Маєш ніж?', rule: 'question' };
const MARKT = { nl: 'Morgen gaan we naar de markt.', uk: 'Завтра ми йдемо на ринок.', rule: 'inversion' };
const RAAM = { nl: 'We willen bij het raam zitten.', uk: 'Ми хочемо сидіти біля вікна.', rule: 'modal' };
const VOCABULARY_WORDS = ['huis', 'fiets', 'boek', 'appel', 'water'];

// Each sentence gets the next time, so the order of addition and of answers is known.
function createCountingClock() {
  let time = 1_000_000;
  return Object.freeze({ now: () => (time += 1000) });
}

// A fresh database with the vocabulary of VOCABULARY_WORDS and no sentences.
function createFixture() {
  const context = createTestContext({ clock: createCountingClock() });
  context.wordService.createWords(VOCABULARY_WORDS.map(nl => ({ nl, uk: `${nl} (uk)` })));
  return context;
}

function addFixtureSentences(context, sentences) {
  return context.wordOrderService.addSentences(sentences, { source: 'mcp' }).added;
}

function sentenceTilesOf(nl) {
  return nl.replace(/[.?]/g, '').split(' ');
}

test('addSentences adds valid sentences and skips repeats, short, numbered and blank ones', () => {
  const context = createFixture();
  const { added, skipped } = context.wordOrderService.addSentences([
    KOFFIE,
    { nl: 'ik DRINK koffie', uk: 'я п\'ю каву', rule: null },
    { nl: 'Ik.', uk: 'Я.' },
    { nl: 'Ik drink 2 koffie.', uk: 'Я п\'ю 2 кави.' },
    { nl: '   ', uk: 'порожньо' },
    MES,
  ], { source: 'mcp' });
  assert.deepEqual(added.map(sentence => sentence.nl), [KOFFIE.nl, MES.nl]);
  assert.equal(added[1].rule, 'question');
  assert.equal(added[0].source, 'mcp');
  assert.equal(skipped[0].reason, 'вже є');
  assert.equal(skipped.length, 4);
  assert.match(skipped[1].reason, /від 3 до 12 слів/);
  assert.match(skipped[2].reason, /цифр/);
  assert.match(skipped[3].reason, /порожнє/);
});

test('importMarkdown reads the sentence table and reports rows without a translation', () => {
  const context = createFixture();
  const markdown = [
    '# Порядок слів — 2026-10-28',
    '',
    '| # | Українською | Nederlands | Правило |',
    '|---|---|---|---|',
    `| 1 | ${KOFFIE.uk} | ${KOFFIE.nl} | v2 |`,
    `| 2 | ${MARKT.uk} | ${MARKT.nl} | inversion |`,
    '| 3 |  | Dit is leuk. | v2 |',
  ].join('\n');
  const result = context.wordOrderService.importMarkdown(markdown);
  assert.equal(result.added.length, 2);
  assert.equal(result.added[1].rule, 'inversion');
  assert.equal(result.added[1].source, 'import');
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /рядок 3/);
  assert.throws(() => context.wordOrderService.importMarkdown('no table here'), ValidationError);
});

test('the set lists the last answer wrong first, then never answered, then the rest', () => {
  const context = createFixture();
  const [koffie, mes, markt, raam] = addFixtureSentences(context, [KOFFIE, MES, MARKT, RAAM]);
  context.wordOrderService.answerSentence({ id: mes.id, tiles: [...sentenceTilesOf(MES.nl)].reverse() });
  context.wordOrderService.answerSentence({ id: markt.id, tiles: sentenceTilesOf(MARKT.nl) });

  const { sentences } = context.wordOrderService.getSentenceSet({ size: 10 });
  assert.deepEqual(sentences.map(sentence => sentence.id), [mes.id, koffie.id, raam.id, markt.id]);
});

test('the set does not send the Dutch sentence, and its tiles are the sentence words plus 2 or 3 distractors', () => {
  const context = createFixture();
  addFixtureSentences(context, [KOFFIE, MES, MARKT]);
  const { sentences, total, can_generate: canGenerate } = context.wordOrderService.getSentenceSet();
  assert.equal(total, 3);
  assert.equal(canGenerate, false);
  const text = JSON.stringify(sentences);
  for (const sentence of [KOFFIE, MES, MARKT]) assert.equal(text.includes(sentence.nl), false);
  for (const sentence of sentences) {
    assert.equal('nl' in sentence, false);
    const nl = [KOFFIE, MES, MARKT].find(item => item.uk === sentence.uk).nl;
    const remainingTiles = [...sentence.tiles];
    for (const tile of sentenceTilesOf(nl)) {
      const index = remainingTiles.indexOf(tile);
      assert.notEqual(index, -1, `tile ${tile} missing`);
      remainingTiles.splice(index, 1);
    }
    assert.ok([2, 3].includes(remainingTiles.length), `${remainingTiles.length} distractors`);
    for (const distractor of remainingTiles) assert.ok(VOCABULARY_WORDS.includes(distractor));
  }
});

test('answerSentence says whether the order is right (case and final punctuation ignored) and stores the answer', () => {
  const context = createFixture();
  const [koffie] = addFixtureSentences(context, [KOFFIE]);
  const wrong = context.wordOrderService.answerSentence({ id: koffie.id, tiles: ['koffie', 'drink', 'Ik'] });
  assert.equal(wrong.is_correct, false);
  assert.equal(wrong.correct_nl, KOFFIE.nl);
  assert.deepEqual(wrong.correct_tiles, ['Ik', 'drink', 'koffie']);
  const right = context.wordOrderService.answerSentence({ id: koffie.id, tiles: ['ik', 'Drink', 'koffie'] });
  assert.equal(right.is_correct, true);

  const stored = context.database.prepare(
    'SELECT answer, is_correct FROM order_sentence_answers WHERE sentence_id = ? ORDER BY id',
  ).all(koffie.id);
  assert.deepEqual(stored, [
    { answer: 'koffie drink Ik', is_correct: 0 },
    { answer: 'ik Drink koffie', is_correct: 1 },
  ]);
  const [listed] = context.wordOrderService.listSentences();
  assert.equal(listed.times_answered, 2);
  assert.equal(listed.times_correct, 1);
});

test('deleteSentence removes a sentence and throws NotFoundError for a missing one', () => {
  const context = createFixture();
  const [koffie] = addFixtureSentences(context, [KOFFIE]);
  context.wordOrderService.deleteSentence(koffie.id);
  assert.equal(context.wordOrderService.listSentences().length, 0);
  assert.throws(() => context.wordOrderService.deleteSentence(koffie.id), NotFoundError);
});

test('generateSentences is refused when OpenRouter is not configured', async () => {
  const context = createFixture();
  assert.deepEqual(context.wordOrderService.getSentenceSet(), { sentences: [], total: 0, can_generate: false });
  await assert.rejects(context.wordOrderService.generateSentences(), {
    name: 'ValidationError',
    message: 'OpenRouter не налаштовано',
  });
});

test('generateSentences with a configured client saves the sentences with source openrouter', async () => {
  const context = createFixture();
  const requests = [];
  const fetchFunction = async (url, init) => {
    requests.push({ url, init });
    const content = JSON.stringify({
      sentences: [
        { nl: 'Ik heb een huis.', uk: 'У мене є дім.', rule: 'perfect' },
        { nl: 'Ik drink water.', uk: 'Я п\'ю воду.', rule: 'v2' },
        { nl: 'ik drink water', uk: 'повтор', rule: 'v2' },
      ],
    });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const service = createWordOrderService({
    wordOrderRepository: createWordOrderRepository({ database: context.database }),
    openRouterClient: createOpenRouterClient({ apiKey: 'test-key', model: 'test/model', fetchFunction }),
    runInTransaction: createTransactionRunner({ database: context.database }),
    changeEventBus: context.changeEventBus,
    clock: context.clock,
  });

  const result = await service.generateSentences({ count: 5 });
  assert.equal(result.added.length, 2);
  assert.ok(result.added.every(sentence => sentence.source === 'openrouter'));
  assert.equal(result.skipped[0].reason, 'вже є');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.model, 'test/model');
  assert.match(body.messages[1].content, /Make 5 new sentences\./);
});

// REST and MCP: one application with the fixture services, bearer token for /api and the secret path for /mcp.
const context = createFixture();
const application = createApplication({
  configuration: parseEnvironmentConfiguration({ NODE_ENV: 'test', API_TOKEN: TOKEN, MCP_SECRET: SECRET }),
  services: context,
  changeEventBus: context.changeEventBus,
  clock: context.clock,
});
const server = application.listen(0, '127.0.0.1');
let base;
const clients = [];

before(async () => {
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const client of clients) await client.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

function postJson(path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { ...BEARER, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('REST: add, list, set, answer, import, delete', async () => {
  const added = await postJson('/api/word-order/sentences', { sentences: [KOFFIE, MES] });
  assert.equal(added.status, 201);
  const addedBody = await added.json();
  assert.equal(addedBody.added.length, 2);
  assert.equal(addedBody.added[0].source, 'mcp');

  const listed = await fetch(`${base}/api/word-order/sentences`, { headers: BEARER });
  assert.equal((await listed.json()).length, 2);

  const set = await (await fetch(`${base}/api/word-order/set`, { headers: BEARER })).json();
  assert.equal(set.sentences.length, 2);
  assert.equal(JSON.stringify(set).includes(KOFFIE.nl), false);
  assert.equal(set.can_generate, false);

  const koffieId = addedBody.added[0].id;
  const answer = await postJson(`/api/word-order/sentences/${koffieId}/answer`, { tiles: ['Ik', 'drink', 'koffie'] });
  assert.deepEqual(await answer.json(), {
    is_correct: true,
    correct_nl: KOFFIE.nl,
    correct_tiles: ['Ik', 'drink', 'koffie'],
  });

  const badAnswer = await postJson(`/api/word-order/sentences/${koffieId}/answer`, { tiles: [] });
  assert.equal(badAnswer.status, 400);

  const imported = await postJson('/api/word-order/import', {
    markdown: `| Українською | Nederlands | Правило |\n|---|---|---|\n| ${MARKT.uk} | ${MARKT.nl} | inversion |\n`,
  });
  assert.equal((await imported.json()).added.length, 1);

  const noTable = await postJson('/api/word-order/import', { markdown: 'just text' });
  assert.equal(noTable.status, 400);

  const deleted = await fetch(`${base}/api/word-order/sentences/${koffieId}`, { method: 'DELETE', headers: BEARER });
  assert.deepEqual(await deleted.json(), { ok: true });
  const deletedAgain = await fetch(`${base}/api/word-order/sentences/${koffieId}`, {
    method: 'DELETE',
    headers: BEARER,
  });
  assert.equal(deletedAgain.status, 404);
});

test('REST: generate without OpenRouter is a 400', async () => {
  const response = await postJson('/api/word-order/generate', {});
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'OpenRouter не налаштовано' });
});

async function connectMcp() {
  const client = new Client({ name: 'word-order-test', version: '1.0.0' });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${SECRET}`)));
  return client;
}

// Calls a tool and returns the parsed JSON of its text result.
async function callJson(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, `${name} failed: ${result.content?.[0]?.text}`);
  return JSON.parse(result.content[0].text);
}

test('MCP: the six word-order tools are listed with their annotations', async () => {
  const client = await connectMcp();
  const { tools } = await client.listTools();
  const names = tools.map(tool => tool.name);
  for (const name of [
    'add_sentences', 'list_sentences', 'delete_sentence', 'get_word_order_set', 'check_word_order', 'generate_sentences',
  ]) {
    assert.ok(names.includes(name), `${name} missing`);
  }
  assert.equal(tools.find(tool => tool.name === 'list_sentences').annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === 'get_word_order_set').annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === 'delete_sentence').annotations.destructiveHint, true);
});

test('MCP: add, set, check, list and delete sentences', async () => {
  const client = await connectMcp();
  const added = await callJson(client, 'add_sentences', { sentences: [RAAM, { nl: 'Ik.', uk: 'Я.' }] });
  assert.equal(added.added.length, 1);
  assert.equal(added.skipped.length, 1);
  const raamId = added.added[0].id;

  const set = await callJson(client, 'get_word_order_set');
  const raamInSet = set.sentences.find(sentence => sentence.id === raamId);
  assert.ok(raamInSet);
  assert.equal(raamInSet.nl, undefined);
  assert.equal(JSON.stringify(set).includes(RAAM.nl), false);

  const checked = await callJson(client, 'check_word_order', { id: raamId, tiles: sentenceTilesOf(RAAM.nl) });
  assert.equal(checked.is_correct, true);
  assert.equal(checked.correct_nl, RAAM.nl);

  const listed = await callJson(client, 'list_sentences', { limit: 500 });
  assert.equal(listed.find(sentence => sentence.id === raamId).times_answered, 1);

  assert.deepEqual(await callJson(client, 'delete_sentence', { id: raamId }), { ok: true });
});

test('MCP: generate_sentences reports that OpenRouter is not configured', async () => {
  const client = await connectMcp();
  const result = await client.callTool({ name: 'generate_sentences', arguments: { count: 10 } });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'OpenRouter не налаштовано');
});
