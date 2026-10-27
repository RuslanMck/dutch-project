import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { createApplication } from '../src/server/create-application.js';
import { createTestContext } from './database-test-helpers.js';
import { seed, SKIP } from './seed.js';

const SECRET = '0123456789abcdef'.repeat(4);   // 64 hex chars
const TOKEN = 'test-api-token-for-mcp';

const context = createTestContext();
// rules (5.5 among them), mistakes, words
if (seed) context.artifactImportService.importArtifactExport(structuredClone(seed));

const EXPECTED_TOOLS = [
  'stats', 'search_words', 'list_words', 'add_words', 'update_word', 'delete_word', 'set_word_status',
  'log_word_error', 'list_rules', 'get_rule', 'add_rule', 'update_rule', 'list_mistake_patterns', 'log_mistake',
  'add_phrases', 'list_phrases', 'delete_phrase', 'add_text', 'list_texts', 'get_text',
  'get_practice_batch', 'grade_word', 'set_current_chapter', 'set_word_priority', 'import_frequency_list',
  'preview_priorities', 'migrate_to_fsrs', 'practice_stats', 'get_phrase_batch', 'grade_phrase', 'add_extra_new_words',
  'reset_practice', 'get_struggling_words',
];

const application = createApplication({
  configuration: parseEnvironmentConfiguration({ NODE_ENV: 'test', MCP_SECRET: SECRET, API_TOKEN: TOKEN }),
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
  for (const c of clients) await c.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

async function connect(transport) {
  const client = new Client({ name: 'mcp-test', version: '1.0.0' });
  clients.push(client);
  await client.connect(transport);
  return client;
}

// Client against the secret-path route (claude.ai connector style).
const secretClient = () => connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${SECRET}`)));

// Calls a tool and returns the parsed JSON of its single text result.
async function call(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  assert.notEqual(res.isError, true, `${name} failed: ${res.content?.[0]?.text}`);
  return JSON.parse(res.content[0].text);
}

let client;

test('initialize result carries the instructions and all tools are listed', SKIP, async () => {
  client = await secretClient();
  const instructions = client.getInstructions();
  assert.ok(instructions, 'server sent no instructions');
  assert.match(instructions, /Dutch/);
  assert.match(instructions, /log_mistake/);
  assert.match(instructions, /search_words/);
  assert.equal(client.getServerVersion().name, 'dutch');

  const { tools } = await client.listTools();
  const names = tools.map(t => t.name).sort();
  assert.deepEqual(names, [...EXPECTED_TOOLS].sort());
  const reads = tools.filter(t => t.annotations?.readOnlyHint).map(t => t.name);
  assert.ok(reads.includes('search_words') && reads.includes('get_rule'));
  assert.equal(tools.find(t => t.name === 'delete_word').annotations.destructiveHint, true);
  assert.equal(tools.find(t => t.name === 'migrate_to_fsrs').annotations.destructiveHint, true);
  assert.equal(tools.find(t => t.name === 'practice_stats').annotations.readOnlyHint, true);
  assert.equal(tools.find(t => t.name === 'preview_priorities').annotations.readOnlyHint, true);
});

test('bearer route on /mcp works and returns the same tools', SKIP, async () => {
  const bearer = await connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  }));
  const { tools } = await bearer.listTools();
  assert.equal(tools.length, EXPECTED_TOOLS.length);
  const stats = await call(bearer, 'stats');
  assert.equal(typeof stats.words.total, 'number');
});

test('x-api-key header with the MCP secret works on /mcp (claude.ai connector headers)', SKIP, async () => {
  const apiKeyClient = await connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { 'x-api-key': SECRET } },
  }));
  const { tools } = await apiKeyClient.listTools();
  assert.equal(tools.length, EXPECTED_TOOLS.length);
});

test('x-api-key is refused when wrong, empty, or carrying the API token', SKIP, async () => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  for (const apiKey of ['nope', ' ', TOKEN]) {
    const response = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers, 'x-api-key': apiKey }, body });
    assert.equal(response.status, 401, `x-api-key ${JSON.stringify(apiKey)} must be refused`);
  }
  const getResponse = await fetch(`${base}/mcp`, { method: 'GET', headers: { 'x-api-key': SECRET } });
  assert.equal(getResponse.status, 405);
});

test('add_words then search_words finds the word; a repeat is reported as skipped', SKIP, async () => {
  const added = await call(client, 'add_words', {
    words: [{ nl: 'de fiets', uk: 'велосипед', article: 'de', section: '6.1', example_nl: 'Ik fiets naar school.', example_uk: 'Я їду до школи.' }],
  });
  assert.equal(added.added.length, 1);
  assert.equal(added.added[0].nl, 'de fiets');
  assert.equal(added.added[0].status, 'new');
  assert.equal(added.added[0].section, '6.1');

  const found = await call(client, 'search_words', { query: 'FIETS' });
  assert.ok(found.some(w => w.nl === 'de fiets' && w.uk === 'велосипед'));

  const again = await call(client, 'add_words', { words: [{ nl: 'de fiets', uk: 'велосипед', article: 'de' }] });
  assert.equal(again.added.length, 0);
  assert.deepEqual(again.skipped.map(s => s.nl), ['de fiets']);
  assert.equal(again.skipped[0].existing_id, added.added[0].id);
});

test('list_words filters by section and returns compact rows', SKIP, async () => {
  const rows = await call(client, 'list_words', { section: '6.1', limit: 5 });
  assert.ok(rows.length >= 1 && rows.length <= 5);
  assert.ok(rows.every(r => r.section === '6.1'));
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    'article', 'error_count', 'example_nl', 'example_uk', 'frequency_rank', 'id', 'kind', 'next_due_on', 'nl',
    'priority', 'priority_override', 'section', 'state', 'status', 'topic', 'uk',
  ]);
});

test('update_word on a missing id returns isError', SKIP, async () => {
  const res = await client.callTool({ name: 'update_word', arguments: { id: 999999, uk: 'x' } });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /not found/);
});

test('log_word_error on an unknown nl creates the word as new with one error', SKIP, async () => {
  const first = await call(client, 'log_word_error', { nl: 'de sleutel', uk: 'ключ', article: 'de', source: 'exercise', wrong_answer: 'het sleutel' });
  assert.equal(first.created, true);
  assert.equal(first.word.nl, 'de sleutel');
  assert.equal(first.word.status, 'new');
  assert.equal(first.word.error_count, 1);

  const second = await call(client, 'log_word_error', { nl: 'DE SLEUTEL' });
  assert.equal(second.created, false);
  assert.equal(second.word.id, first.word.id);
  assert.equal(second.word.error_count, 2);
});

test('log_word_error by id and by existing nl adds to the existing word', SKIP, async () => {
  const groot = context.wordService.searchWords({ query: 'groot', limit: 1 })[0];   // seeded word
  const before = groot.error_count;
  const byId = await call(client, 'log_word_error', { id: groot.id });
  assert.equal(byId.created, false);
  assert.equal(byId.word.id, groot.id);
  assert.equal(byId.word.error_count, before + 1);
  assert.equal(byId.word.status, groot.status, 'an error does not change the status');
  const byNl = await call(client, 'log_word_error', { nl: 'Groot' });
  assert.equal(byNl.created, false);
  assert.equal(byNl.word.id, groot.id);
  assert.equal(byNl.word.error_count, before + 2);
});

test('log_mistake twice with the same rule_code and title gives one pattern with count 2', SKIP, async () => {
  const title = 'Тестова помилка для MCP';
  const a = await call(client, 'log_mistake', {
    rule_code: '5.5', title, fix: 'без -e після het', wrong: 'een kleine kind', right: 'een klein kind', date: '2026-10-20',
  });
  assert.equal(a.count, 1);
  assert.equal(a.rule_code, '5.5');
  const b = await call(client, 'log_mistake', {
    rule_code: '5.5', title: title.toUpperCase(), wrong: 'een mooie huis', right: 'een mooi huis', source: 'lesson',
  });
  assert.equal(b.id, a.id);
  assert.equal(b.count, 2);
  assert.equal(b.cases.length, 2);

  const listed = await call(client, 'list_mistake_patterns', { rule_code: '5.5' });
  assert.equal(listed.filter(p => p.title === title).length, 1);
});

test('log_mistake with rule_code null creates a pattern with no rule', SKIP, async () => {
  const p = await call(client, 'log_mistake', {
    rule_code: null, title: 'Порядок слів, без правила', fix: 'перевірити порядок', wrong: 'a b', right: 'b a',
  });
  assert.equal(p.rule_id, null);
  assert.equal(p.rule_code, null);

  const other = await call(client, 'list_mistake_patterns', { rule_code: 'other' });
  assert.ok(other.some(x => x.id === p.id));
});

test('log_mistake with pattern_id adds a case to that pattern', SKIP, async () => {
  const existing = await call(client, 'list_mistake_patterns', { rule_code: '5.5' });
  const target = existing[0];
  const p = await call(client, 'log_mistake', { rule_code: '5.5', pattern_id: target.id, wrong: 'x1', right: 'x2' });
  assert.equal(p.id, target.id);
  assert.equal(p.count, target.count + 1);
});

test('add_phrases adds several phrases; list_phrases shows them newest first', SKIP, async () => {
  const res = await call(client, 'add_phrases', {
    phrases: [
      { nl: 'Mag het iets minder?', uk: 'Може трохи менше?', context: 'Тест: магазин' },
      { nl: 'Dat is alles.', uk: 'Це все.', context: 'Тест: магазин', section: '6.1' },
    ],
  });
  assert.equal(res.added.length, 2);
  const listed = await call(client, 'list_phrases', { limit: 2 });
  assert.equal(listed.length, 2);
  assert.ok(listed.some(p => p.nl === 'Mag het iets minder?' && p.context === 'Тест: магазин'));
  await call(client, 'delete_phrase', { id: res.added[0].id });
});

test('get_rule by code returns the full rule with its patterns', SKIP, async () => {
  const rule = await call(client, 'get_rule', { id_or_code: '5.5' });
  assert.equal(rule.code, '5.5');
  assert.equal(typeof rule.body, 'string');
  assert.ok(rule.body.length > 0);
  assert.ok(Array.isArray(rule.patterns));
  assert.ok(rule.patterns.every(p => p.rule_id === rule.id));
});

test('list_rules is compact (no body)', SKIP, async () => {
  const rules = await call(client, 'list_rules');
  assert.ok(rules.length >= 7);
  assert.ok(!('body' in rules[0]));
  assert.ok('code' in rules[0] && 'error_count' in rules[0]);
});

test('add_text then list_texts and get_text', SKIP, async () => {
  const t = await call(client, 'add_text', {
    title: 'Тестовий діалог', body: 'Jasper: Hallo!\nЯспер: Привіт!\n\nAnna: Dank je.\nАнна: Дякую.', section: '6.1',
  });
  const list = await call(client, 'list_texts');
  const row = list.find(x => x.id === t.id);
  assert.ok(row);
  assert.ok(!('body' in row));
  const full = await call(client, 'get_text', { id: t.id });
  assert.match(full.body, /Dank je/);
});

test('bad input from the client is rejected, not silently stored', SKIP, async () => {
  const res = await client.callTool({ name: 'add_rule', arguments: { code: '9.9', title: '' , body: 'x' } });
  assert.equal(res.isError, true);
});

test('unknown secret on the path gets 401 JSON', SKIP, async () => {
  const r = await fetch(`${base}/mcp/${'f'.repeat(64)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: 'unauthorized' });
});

test('POST /mcp without a bearer gets 401, and so does a wrong bearer', SKIP, async () => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const none = await fetch(`${base}/mcp`, { method: 'POST', headers, body });
  assert.equal(none.status, 401);
  assert.deepEqual(await none.json(), { error: 'unauthorized' });

  const wrong = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers, Authorization: 'Bearer nope' }, body });
  assert.equal(wrong.status, 401);
  assert.deepEqual(await wrong.json(), { error: 'unauthorized' });
});

test('the secret is not accepted as a bearer token on /mcp, nor the token as a path secret', SKIP, async () => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const a = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${SECRET}` }, body });
  assert.equal(a.status, 401);
  const b = await fetch(`${base}/mcp/${TOKEN}`, { method: 'POST', headers, body });
  assert.equal(b.status, 401);
});

test('GET with the good secret gets 405 JSON-RPC error', SKIP, async () => {
  const r = await fetch(`${base}/mcp/${SECRET}`, { method: 'GET' });
  assert.equal(r.status, 405);
  assert.deepEqual(await r.json(), {
    jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null,
  });
});

test('GET and DELETE with a bad credential get 401, not 405', SKIP, async () => {
  const get = await fetch(`${base}/mcp/${'0'.repeat(64)}`, { method: 'GET' });
  assert.equal(get.status, 401);
  const del = await fetch(`${base}/mcp`, { method: 'DELETE', headers: { Authorization: 'Bearer nope' } });
  assert.equal(del.status, 401);
});

test('GET and DELETE with the bearer token get 405', SKIP, async () => {
  const get = await fetch(`${base}/mcp`, { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.equal(get.status, 405);
  const del = await fetch(`${base}/mcp`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.equal(del.status, 405);
});

// Its own application and database, so the seeded words are not changed by the migration.
test('grade_word round trip over HTTP: refused before the migration, graded once, a repeat moves only the deck', async () => {
  const practiceContext = createTestContext();
  const practiceApplication = createApplication({
    configuration: parseEnvironmentConfiguration({ NODE_ENV: 'test', MCP_SECRET: SECRET, API_TOKEN: TOKEN }),
    services: practiceContext,
    changeEventBus: practiceContext.changeEventBus,
    clock: practiceContext.clock,
  });
  const practiceServer = practiceApplication.listen(0, '127.0.0.1');
  await once(practiceServer, 'listening');
  try {
    const practiceBase = `http://127.0.0.1:${practiceServer.address().port}`;
    const practiceClient = await connect(new StreamableHTTPClientTransport(new URL(`${practiceBase}/mcp/${SECRET}`)));
    await call(practiceClient, 'add_words', { words: [{ nl: 'de tafel', uk: 'стіл', article: 'de', section: '6.1' }] });

    const beforeMigration = await practiceClient.callTool({
      name: 'get_practice_batch',
      arguments: { session_id: 'mcp-session' },
    });
    assert.equal(beforeMigration.isError, true);
    assert.match(beforeMigration.content[0].text, /not set up yet/);

    const dryRun = await call(practiceClient, 'migrate_to_fsrs');
    assert.equal(dryRun.dry_run, true);
    assert.equal(dryRun.new, 1);
    assert.equal((await call(practiceClient, 'migrate_to_fsrs', { dry_run: false })).dry_run, false);

    const batch = await call(practiceClient, 'get_practice_batch', { session_id: 'mcp-session' });
    assert.equal(batch.new_words.length, 1);
    const gradeArguments = { id: batch.new_words[0].id, grade: 'good', session_id: 'mcp-session' };
    const graded = await call(practiceClient, 'grade_word', gradeArguments);
    assert.equal(graded.grade, 'good');
    assert.equal(graded.word.id, gradeArguments.id);
    assert.equal(graded.state, 'review');
    assert.match(graded.next_due_on, /^\d{4}-\d{2}-\d{2}$/);

    assert.deepEqual(graded.deck, { in_deck: true, required_correct: 2, correct_streak: 1, times_left: 1, has_learned: false });
    const repeat = await call(practiceClient, 'grade_word', { ...gradeArguments, grade: 'again' });
    assert.equal(repeat.is_repeat, true);
    assert.deepEqual(repeat.deck, { in_deck: true, required_correct: 3, correct_streak: 0, times_left: 3, has_learned: false });

    const stats = await call(practiceClient, 'practice_stats');
    assert.equal(stats.introduced_today, 1);
  } finally {
    practiceServer.closeAllConnections();
    await new Promise(resolve => practiceServer.close(resolve));
  }
});

test('set_word_priority returns the compact word of the word tools, with priority_override', async () => {
  const priorityClient = await secretClient();
  const added = await call(priorityClient, 'add_words', {
    words: [{ nl: 'prioriteitstest', uk: 'тест', section: '5.1' }],
  });
  const [addedWord] = added.added;
  assert.equal(addedWord.priority_override, null);

  const updated = await call(priorityClient, 'set_word_priority', { id: addedWord.id, priority: 2 });
  assert.equal(updated.id, addedWord.id);
  assert.equal(updated.priority, 2);
  assert.equal(updated.priority_override, 2);
  assert.deepEqual(Object.keys(updated).sort(), Object.keys(addedWord).sort());
  assert.equal(Object.hasOwn(updated, 'fsrs_card'), false);
});

test('add_words gives priorities; list_words filters by state, priority and due day (YYYY-MM-DD)', async () => {
  const filterContext = createTestContext();
  const filterApplication = createApplication({
    configuration: parseEnvironmentConfiguration({ NODE_ENV: 'test', MCP_SECRET: SECRET, API_TOKEN: TOKEN }),
    services: filterContext,
    changeEventBus: filterContext.changeEventBus,
    clock: filterContext.clock,
  });
  const filterServer = filterApplication.listen(0, '127.0.0.1');
  await once(filterServer, 'listening');
  try {
    const filterBase = `http://127.0.0.1:${filterServer.address().port}`;
    const filterClient = await connect(new StreamableHTTPClientTransport(new URL(`${filterBase}/mcp/${SECRET}`)));
    const added = await call(filterClient, 'add_words', { words: [
      { nl: 'huis', uk: 'дім', section: '6.1' },
      { nl: 'raam', uk: 'вікно', section: '3.2' },
    ] });
    assert.deepEqual(added.added.map(word => word.priority), [1, 3]);
    assert.deepEqual(added.added.map(word => word.state), ['new', 'new']);
    assert.equal(added.added[0].next_due_on, null);
    assert.equal(Object.hasOwn(added.added[0], 'fsrs_card'), false);

    await call(filterClient, 'migrate_to_fsrs', { dry_run: false });
    const [huis] = added.added;
    await call(filterClient, 'grade_word', { id: huis.id, grade: 'good', session_id: 'mcp-filter' });

    const reviewed = await call(filterClient, 'list_words', { state: 'review' });
    assert.deepEqual(reviewed.map(word => word.id), [huis.id]);
    assert.match(reviewed[0].next_due_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual((await call(filterClient, 'list_words', { state: 'review', due_before: '2999-01-01' }))
      .map(word => word.id), [huis.id]);
    assert.deepEqual(await call(filterClient, 'list_words', { due_before: '2000-01-01' }), []);
    assert.deepEqual((await call(filterClient, 'list_words', { priority: 3 })).map(word => word.nl), ['raam']);
    assert.deepEqual((await call(filterClient, 'list_words', { sort: 'due' })).map(word => word.nl), ['huis', 'raam']);
  } finally {
    filterServer.closeAllConnections();
    await new Promise(resolve => filterServer.close(resolve));
  }
});

// Runs one test against an MCP client on its own in-memory database, so each test starts from an empty schedule.
async function withFreshMcpClient(runTest) {
  const freshContext = createTestContext();
  const freshApplication = createApplication({
    configuration: parseEnvironmentConfiguration({ NODE_ENV: 'test', MCP_SECRET: SECRET, API_TOKEN: TOKEN }),
    services: freshContext,
    changeEventBus: freshContext.changeEventBus,
    clock: freshContext.clock,
  });
  const freshServer = freshApplication.listen(0, '127.0.0.1');
  await once(freshServer, 'listening');
  try {
    const freshBase = `http://127.0.0.1:${freshServer.address().port}`;
    const freshClient = await connect(new StreamableHTTPClientTransport(new URL(`${freshBase}/mcp/${SECRET}`)));
    await runTest(freshClient);
  } finally {
    freshServer.closeAllConnections();
    await new Promise(resolve => freshServer.close(resolve));
  }
}

test('the phrase practice tools are listed, and get_phrase_batch is read-only', async () => {
  await withFreshMcpClient(async freshClient => {
    const { tools } = await freshClient.listTools();
    const toolByName = Object.fromEntries(tools.map(tool => [tool.name, tool]));
    assert.ok(toolByName.grade_phrase, 'grade_phrase is listed');
    assert.equal(toolByName.get_phrase_batch.annotations.readOnlyHint, true);
    assert.deepEqual(Object.keys(toolByName.grade_phrase.inputSchema.properties).sort(), ['grade', 'id', 'session_id']);
  });
});

test('grade_phrase round trip: refused before the migration, graded once, repeat refused, status listed', async () => {
  await withFreshMcpClient(async freshClient => {
    await call(freshClient, 'add_phrases', { phrases: [{ nl: 'Hoe gaat het?', uk: 'Як справи?' }] });

    const beforeMigration = await freshClient.callTool({
      name: 'get_phrase_batch',
      arguments: { session_id: 'mcp-phrases' },
    });
    assert.equal(beforeMigration.isError, true);
    assert.match(beforeMigration.content[0].text, /not set up yet/);

    await call(freshClient, 'migrate_to_fsrs', { dry_run: false });
    const batch = await call(freshClient, 'get_phrase_batch', { session_id: 'mcp-phrases' });
    assert.equal(batch.new_phrases.length, 1);
    const gradeArguments = { id: batch.new_phrases[0].id, grade: 'again', session_id: 'mcp-phrases' };
    const graded = await call(freshClient, 'grade_phrase', gradeArguments);
    assert.equal(graded.grade, 'again');
    assert.equal(graded.phrase.id, gradeArguments.id);
    assert.equal(graded.state, 'review');
    assert.equal(graded.interval_days, 1);

    const repeat = await freshClient.callTool({ name: 'grade_phrase', arguments: gradeArguments });
    assert.equal(repeat.isError, true);
    assert.match(repeat.content[0].text, /already graded/);

    const listed = await call(freshClient, 'list_phrases');
    assert.equal(listed[0].status, 'learning');
    assert.equal(listed[0].next_due_on, graded.next_due_on);
  });
});

test('grade_word returns the word with its error count, read after the error is logged', async () => {
  await withFreshMcpClient(async freshClient => {
    const added = await call(freshClient, 'add_words', {
      words: [{ nl: 'de tafel', uk: 'стіл', article: 'de', section: '6.1' }],
    });
    await call(freshClient, 'migrate_to_fsrs', { dry_run: false });

    const graded = await call(freshClient, 'grade_word', {
      id: added.added[0].id,
      grade: 'hard',
      answer: 'het tafel',
      session_id: 'mcp-errors',
    });

    assert.equal(graded.word.id, added.added[0].id);
    assert.equal(graded.word.error_count, 1);
  });
});

test('add_extra_new_words: listed, refused until the regular words are used up, then adds; 10 by default', async () => {
  await withFreshMcpClient(async freshClient => {
    const { tools } = await freshClient.listTools();
    const extraTool = tools.find(tool => tool.name === 'add_extra_new_words');
    assert.deepEqual(Object.keys(extraTool.inputSchema.properties), ['count']);

    const words = Array.from({ length: 12 }, (_, index) => ({
      nl: `woord ${index + 1}`,
      uk: `слово ${index + 1}`,
      section: '6.1',
    }));
    await call(freshClient, 'add_words', { words });
    await call(freshClient, 'migrate_to_fsrs', { dry_run: false });
    const refused = await freshClient.callTool({ name: 'add_extra_new_words', arguments: {} });
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /not used up yet/);

    const batch = await call(freshClient, 'get_practice_batch', { session_id: 'mcp-extra' });
    for (const word of batch.new_words) {
      await call(freshClient, 'grade_word', { id: word.id, grade: 'good', session_id: 'mcp-extra' });
    }
    const added = await call(freshClient, 'add_extra_new_words', { count: 2 });
    assert.deepEqual(added, { extra_new_words_today: 2, new_today_remaining: 2 });
    const nextBatch = await call(freshClient, 'get_practice_batch', { session_id: 'mcp-extra' });
    assert.equal(nextBatch.new_words.length, 2);

    // Without any arguments the SDK applies the contract's default: 10 more, so 12 extra for today. Ten more New words
    // are added first, because extra words are only the New words that exist.
    for (const word of nextBatch.new_words) {
      await call(freshClient, 'grade_word', { id: word.id, grade: 'good', session_id: 'mcp-extra' });
    }
    await call(freshClient, 'add_words', {
      words: Array.from({ length: 10 }, (_, index) => ({
        nl: `extra woord ${index + 1}`,
        uk: 'додаткове',
        section: '6.1',
      })),
    });
    const defaulted = await freshClient.callTool({ name: 'add_extra_new_words' });
    assert.notEqual(defaulted.isError, true, defaulted.content?.[0]?.text);
    assert.deepEqual(JSON.parse(defaulted.content[0].text), { extra_new_words_today: 12, new_today_remaining: 10 });
  });
});

test('get_struggling_words is read-only, lists the words to drill and changes no schedule or review log', async () => {
  await withFreshMcpClient(async freshClient => {
    const { tools } = await freshClient.listTools();
    assert.equal(tools.find(tool => tool.name === 'get_struggling_words').annotations.readOnlyHint, true);

    const added = await call(freshClient, 'add_words', {
      words: [{ nl: 'kat', uk: 'кіт', section: '6.1' }, { nl: 'hond', uk: 'собака', section: '6.1' }],
    });
    const [kat, hond] = added.added.map(word => word.id);
    await call(freshClient, 'migrate_to_fsrs', { dry_run: false });
    await call(freshClient, 'grade_word', { id: kat, grade: 'again', answer: 'x', session_id: 'mcp-drill' });
    await call(freshClient, 'grade_word', { id: hond, grade: 'good', session_id: 'mcp-drill' });
    const statsBefore = await call(freshClient, 'practice_stats');

    const drill = await call(freshClient, 'get_struggling_words');

    assert.deepEqual(drill.words.map(word => word.id), [kat]);
    assert.equal(drill.words[0].last_grade, 'again');
    assert.equal(drill.count, 1);
    assert.deepEqual(await call(freshClient, 'practice_stats'), statsBefore);
  });
});
