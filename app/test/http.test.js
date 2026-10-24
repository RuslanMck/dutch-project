import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';

import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';
import { createApplication } from '../src/server/create-application.js';
import { createTestContext } from './database-test-helpers.js';

const configuration = parseEnvironmentConfiguration({
  NODE_ENV: 'test',
  APP_PASSWORD: 'correct horse',
  SESSION_SECRET: 'test-session-secret',
  API_TOKEN: 'test-api-token',
});
const context = createTestContext();
const application = createApplication({
  configuration,
  services: context,
  changeEventBus: context.changeEventBus,
  clock: context.clock,
});

const server = application.listen(0, '127.0.0.1');
let base;
before(async () => {
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const BEARER = { Authorization: 'Bearer test-api-token' };
const noRedirect = { redirect: 'manual' };

function login(password) {
  const body = new URLSearchParams({ password });
  return fetch(`${base}/auth/login`, { method: 'POST', body, ...noRedirect });
}

function sessionCookie(res) {
  const raw = res.headers.getSetCookie().find(c => c.startsWith('dutch_session='));
  return raw?.split(';')[0];
}

let cookie;

test('health is public', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('unauthenticated API call gets 401 JSON, page requests redirect to /login', async () => {
  const api = await fetch(`${base}/api/words`);
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: 'unauthorized' });
  const page = await fetch(`${base}/index.html`, noRedirect);
  assert.equal(page.status, 303);
  assert.equal(page.headers.get('location'), '/login');
});

test('GET /login serves the login page', async () => {
  const r = await fetch(`${base}/login`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
});

test('wrong password redirects to /login?e=1 and sets no cookie', async () => {
  const r = await login('wrong');
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/login?e=1');
  assert.equal(sessionCookie(r), undefined);
});

test('right password sets a signed HttpOnly cookie and redirects to /', async () => {
  const r = await login('correct horse');
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/');
  const raw = r.headers.getSetCookie().find(c => c.startsWith('dutch_session='));
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /Secure/);
  assert.match(raw, /SameSite=Lax/);
  assert.match(raw, /Max-Age=15552000/);
  assert.match(raw, /Path=\//);
  cookie = sessionCookie(r);
});

test('session cookie authorises API calls', async () => {
  const r = await fetch(`${base}/api/words`, { headers: { Cookie: cookie } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), []);
});

test('tampered and expired cookies are rejected', async () => {
  const [exp, sig] = cookie.slice('dutch_session='.length).split('.');
  const tampered = `dutch_session=${exp}.${sig.replace(/.$/, sig.endsWith('0') ? '1' : '0')}`;
  assert.equal((await fetch(`${base}/api/words`, { headers: { Cookie: tampered } })).status, 401);

  const past = String(Date.now() - 1000);
  const mac = crypto.createHmac('sha256', 'test-session-secret').update(past).digest('hex');
  const expired = `dutch_session=${past}.${mac}`;
  assert.equal((await fetch(`${base}/api/words`, { headers: { Cookie: expired } })).status, 401);
});

test('bearer token authorises API calls; wrong token does not', async () => {
  assert.equal((await fetch(`${base}/api/words`, { headers: BEARER })).status, 200);
  assert.equal((await fetch(`${base}/api/words`, { headers: { Authorization: 'Bearer nope' } })).status, 401);
});

test('REST writes and errors use the JSON contract', async () => {
  const created = await fetch(`${base}/api/words`, {
    method: 'POST',
    headers: { ...BEARER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nl: 'bestellen', uk: 'замовляти', article: '', example_nl: 'Kan ik bestellen?', example_uk: 'Можна?' }),
  });
  assert.equal(created.status, 201);
  const word = await created.json();
  assert.equal(word.nl, 'bestellen');
  assert.equal(word.kind, 'word');

  const result = await fetch(`${base}/api/words/${word.id}/result`, {
    method: 'POST',
    headers: { ...BEARER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ correct: false, mode: 'translate', answer: 'bestelen' }),
  });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).status, 'new', 'a wrong answer adds an error and keeps the status');

  const bad = await fetch(`${base}/api/words/${word.id}/result`, {
    method: 'POST',
    headers: { ...BEARER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ correct: 'yes', mode: 'translate' }),
  });
  assert.equal(bad.status, 400);
  assert.ok((await bad.json()).error);

  const missing = await fetch(`${base}/api/words/999999`, { method: 'PATCH', headers: { ...BEARER, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(missing.status, 404);

  const unknown = await fetch(`${base}/api/nope`, { headers: BEARER });
  assert.equal(unknown.status, 404);
});

test('GET /api/events streams change events for repo writes', async () => {
  const ac = new AbortController();
  const stream = await fetch(`${base}/api/events`, { headers: BEARER, signal: ac.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type'), /^text\/event-stream/);
  assert.equal(stream.headers.get('cache-control'), 'no-cache');
  assert.equal(stream.headers.get('x-accel-buffering'), 'no');

  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  await fetch(`${base}/api/phrases`, {
    method: 'POST',
    headers: { ...BEARER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nl: 'Goedemorgen.', uk: 'Доброго ранку.' }),
  });
  let text = '';
  while (!text.includes('event: change')) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  assert.match(text, /event: change\ndata: \{"collection":"phrases","at":\d+\}\n\n/);
  ac.abort();
});

test('export is served as an attachment with the handoff shape', async () => {
  const r = await fetch(`${base}/api/export`, { headers: BEARER });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="?dutch-export-\d{4}-\d{2}-\d{2}\.json"?/);
  const body = await r.json();
  assert.ok(Array.isArray(body.collections.words));
});

test('GET /api/words takes the priority, state, due and sort filters and returns the schedule', async () => {
  const created = await fetch(`${base}/api/words`, {
    method: 'POST',
    headers: { ...BEARER, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nl: 'tafel', uk: 'стіл', article: 'de', section: '6.1' }),
  });
  const tafel = await created.json();
  assert.equal(tafel.priority, 1);
  assert.equal(tafel.state, 'new');
  assert.equal(tafel.next_due_on, null);
  assert.ok(Object.hasOwn(tafel, 'frequency_rank'));
  assert.ok(Object.hasOwn(tafel, 'due_at'));

  const filtered = await fetch(`${base}/api/words?priority=1&state=new&sort=due`, { headers: BEARER });
  assert.equal(filtered.status, 200);
  assert.deepEqual((await filtered.json()).map(word => word.id), [tafel.id]);
  assert.equal((await fetch(`${base}/api/words?sort=frequency`, { headers: BEARER })).status, 200);
  assert.equal((await fetch(`${base}/api/words?state=learning2`, { headers: BEARER })).status, 400);
  assert.equal((await fetch(`${base}/api/words?priority=4`, { headers: BEARER })).status, 400);
});

// FSRS practice over REST: refused with 409 until the migration, then the batch, grades, statistics and preview work.
const JSON_BEARER = { ...BEARER, 'Content-Type': 'application/json' };
let practiceWordId;
let phrasePracticeId;

function postPracticeGrade(body) {
  return fetch(`${base}/api/practice/grades`, { method: 'POST', headers: JSON_BEARER, body: JSON.stringify(body) });
}

test('practice REST refuses the batch and grades with 409 before the FSRS migration', async () => {
  const created = await fetch(`${base}/api/words`, {
    method: 'POST',
    headers: JSON_BEARER,
    body: JSON.stringify({ nl: 'fiets', uk: 'велосипед', article: 'de', section: '6.1' }),
  });
  practiceWordId = (await created.json()).id;

  const batch = await fetch(`${base}/api/practice/batch?session_id=http-before`, { headers: BEARER });
  assert.equal(batch.status, 409);
  assert.match((await batch.json()).error, /not set up yet/);
  const grade = await postPracticeGrade({ word_id: practiceWordId, grade: 'good', session_id: 'http-before' });
  assert.equal(grade.status, 409);

  const phrase = await fetch(`${base}/api/phrases`, {
    method: 'POST',
    headers: JSON_BEARER,
    body: JSON.stringify({ nl: 'Hoe gaat het?', uk: 'Як справи?' }),
  });
  phrasePracticeId = (await phrase.json()).id;
  const phraseBatch = await fetch(`${base}/api/practice/phrases/batch?session_id=http-before`, { headers: BEARER });
  assert.equal(phraseBatch.status, 409);
  const phraseGrade = await fetch(`${base}/api/practice/phrases/grades`, {
    method: 'POST',
    headers: JSON_BEARER,
    body: JSON.stringify({ phrase_id: phrasePracticeId, grade: 'good', session_id: 'http-before' }),
  });
  assert.equal(phraseGrade.status, 409);
});

test('practice REST after the migration: batch, grade, repeat, unknown field, stats and preview', async () => {
  context.practiceService.migrateToFsrs({ isDryRun: false });

  const batch = await fetch(`${base}/api/practice/batch?session_id=http-after&max_reviews=1`, { headers: BEARER });
  assert.equal(batch.status, 200);
  const batchBody = await batch.json();
  assert.equal(batchBody.session_id, 'http-after');
  assert.ok(batchBody.reviews.length <= 1);
  assert.ok(batchBody.new_words.some(word => word.id === practiceWordId));
  const zeroReviewsUrl = `${base}/api/practice/batch?session_id=http-after&max_reviews=0`;
  assert.equal((await fetch(zeroReviewsUrl, { headers: BEARER })).status, 400);

  const gradeBody = { word_id: practiceWordId, grade: 'good', answer: 'fiets', session_id: 'http-after' };
  const graded = await postPracticeGrade(gradeBody);
  assert.equal(graded.status, 200);
  assert.equal((await graded.json()).grade, 'good');
  const repeated = await postPracticeGrade(gradeBody);
  assert.equal(repeated.status, 409, 'a second grade of the word in the same session is refused');
  const unknownField = await postPracticeGrade({ ...gradeBody, session_id: 'http-after-2', extra: true });
  assert.equal(unknownField.status, 400);

  const stats = await fetch(`${base}/api/practice/stats`, { headers: BEARER });
  assert.equal(stats.status, 200);
  assert.equal(typeof (await stats.json()).due_today, 'number');

  const preview = await fetch(`${base}/api/practice/priorities/preview?chapter=5`, { headers: BEARER });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).chapter, 5);

  const [listedWord] = await (await fetch(`${base}/api/words?priority=1`, { headers: BEARER })).json();
  assert.equal(Object.hasOwn(listedWord, 'fsrs_card'), false, 'the card JSON is internal');
  assert.equal(typeof listedWord.state, 'string');
});

test('phrase practice REST: batch, grade, repeat, unknown field, phrase list and stats', async () => {
  const batch = await fetch(`${base}/api/practice/phrases/batch?session_id=http-phrases`, { headers: BEARER });
  assert.equal(batch.status, 200);
  const batchBody = await batch.json();
  assert.equal(batchBody.session_id, 'http-phrases');
  assert.ok(batchBody.new_phrases.some(phrase => phrase.id === phrasePracticeId));
  assert.equal(batchBody.counts.new_today_remaining, 5);
  assert.equal((await fetch(`${base}/api/practice/phrases/batch?session_id=x&max_reviews=0`, { headers: BEARER }))
    .status, 400);

  const gradeBody = { phrase_id: phrasePracticeId, grade: 'good', session_id: 'http-phrases' };
  const graded = await fetch(`${base}/api/practice/phrases/grades`, {
    method: 'POST',
    headers: JSON_BEARER,
    body: JSON.stringify(gradeBody),
  });
  assert.equal(graded.status, 200);
  const gradedBody = await graded.json();
  assert.equal(gradedBody.grade, 'good');
  assert.equal(gradedBody.phrase.id, phrasePracticeId);
  assert.match(gradedBody.next_due_on, /^\d{4}-\d{2}-\d{2}$/);
  const repeated = await fetch(`${base}/api/practice/phrases/grades`, {
    method: 'POST',
    headers: JSON_BEARER,
    body: JSON.stringify(gradeBody),
  });
  assert.equal(repeated.status, 409, 'a second grade of the phrase in the same session is refused');
  const withAnswer = await fetch(`${base}/api/practice/phrases/grades`, {
    method: 'POST',
    headers: JSON_BEARER,
    body: JSON.stringify({ ...gradeBody, session_id: 'http-phrases-2', answer: 'x' }),
  });
  assert.equal(withAnswer.status, 400, 'phrases take no answer field');

  const phrases = await (await fetch(`${base}/api/phrases`, { headers: BEARER })).json();
  const gradedPhrase = phrases.find(phrase => phrase.id === phrasePracticeId);
  assert.equal(gradedPhrase.status, 'learning');
  assert.equal(gradedPhrase.next_due_on, gradedBody.next_due_on);
  assert.equal(Object.hasOwn(gradedPhrase, 'due_at'), false);

  const stats = await (await fetch(`${base}/api/practice/stats`, { headers: BEARER })).json();
  assert.equal(typeof stats.phrases.due_today, 'number');
  assert.equal(stats.phrases.introduced_today, 1);
});

test('a wrong word grade returns the word with its error count, read after the error is logged', async () => {
  const created = await fetch(`${base}/api/words`, {
    method: 'POST',
    headers: JSON_BEARER,
    body: JSON.stringify({ nl: 'kat', uk: 'кіт', article: 'de', section: '6.1' }),
  });
  const wordId = (await created.json()).id;
  const graded = await postPracticeGrade({
    word_id: wordId,
    grade: 'again',
    answer: 'hond',
    session_id: 'http-errors',
  });
  assert.equal(graded.status, 200);
  const gradedBody = await graded.json();
  assert.equal(gradedBody.word.id, wordId);
  assert.equal(gradedBody.word.error_count, 1);
});

test('logout clears the cookie', async () => {
  const r = await fetch(`${base}/auth/logout`, { method: 'POST', ...noRedirect });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/login');
  const raw = r.headers.getSetCookie().find(c => c.startsWith('dutch_session='));
  assert.match(raw, /Max-Age=0/);
});

// Keep last: it leaves the per-IP failure counter full.
test('10 failed logins in 15 minutes give 429, even with the right password', async () => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await login('wrong')).status, 303);
  }
  const blocked = await login('correct horse');
  assert.equal(blocked.status, 429);
});
