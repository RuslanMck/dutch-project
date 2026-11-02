// Tests for public/offline-store.js: the in-memory store (Node has no IndexedDB) and flushOutbox with fake posts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ATTEMPTS, createMemoryStore, flushOutbox, getStore, offlineStore } from '../public/offline-store.js';

const statusError = status => Object.assign(new Error(`status ${status}`), { status });

// A store holding entries for the urls /a, /b, /c ...
async function createFilledStore(count = 3) {
  const store = createMemoryStore();
  for (let index = 0; index < count; index += 1) {
    await store.enqueue({ kind: 'grade', url: `/${String.fromCharCode(97 + index)}`, body: { n: index }, created_at: index });
  }
  return store;
}

test('the memory store keeps entries in seq order, removes one and counts', async () => {
  const store = await createFilledStore(3);
  assert.equal(await store.count(), 3);
  assert.deepEqual((await store.listAll()).map(entry => entry.seq), [1, 2, 3]);
  await store.remove(2);
  assert.deepEqual((await store.listAll()).map(entry => entry.url), ['/a', '/c']);
  await store.clear();
  assert.equal(await store.count(), 0);
});

test('the memory store keeps one snapshot per key', async () => {
  const store = createMemoryStore();
  assert.equal(await store.loadSnapshot('practice'), null);
  await store.saveSnapshot('practice', { a: 1 });
  await store.saveSnapshot('spare', { b: 2 });
  await store.saveSnapshot('practice', { a: 3 });
  assert.deepEqual(await store.loadSnapshot('practice'), { a: 3 });
  await store.deleteSnapshot('practice');
  assert.equal(await store.loadSnapshot('practice'), null);
  await store.clearSnapshots();
  assert.equal(await store.loadSnapshot('spare'), null);
});

test('the shared store falls back to memory without IndexedDB and works through offlineStore', async () => {
  assert.equal((await getStore()).kind, 'memory');
  await offlineStore.clear();
  await offlineStore.enqueue({ kind: 'drill', url: '/x', body: {}, created_at: 1 });
  assert.equal(await offlineStore.count(), 1);
  await offlineStore.clear();
});

test('flushOutbox posts in seq order, removes what was sent and reports progress', async () => {
  const store = await createFilledStore(3);
  const posted = [];
  const progress = [];
  const result = await flushOutbox({
    store,
    post: async (url, body) => { posted.push([url, body.n]); },
    onProgress: entry => progress.push(entry.remaining),
  });
  assert.deepEqual(posted, [['/a', 0], ['/b', 1], ['/c', 2]]);
  assert.deepEqual(result, { sent: 3, dropped: 0, remaining: 0, needsLogin: false });
  assert.deepEqual(progress, [2, 1, 0]);
  assert.equal(await store.count(), 0);
});

test('flushOutbox stops at a network error and keeps that entry and the ones behind it', async () => {
  const store = await createFilledStore(3);
  const posted = [];
  const result = await flushOutbox({
    store,
    post: async url => {
      if (url === '/b') throw Object.assign(new Error('offline'), { offline: true, status: 0 });
      posted.push(url);
    },
  });
  assert.deepEqual(posted, ['/a']);
  assert.deepEqual(result, { sent: 1, dropped: 0, remaining: 2, needsLogin: false });
  assert.deepEqual((await store.listAll()).map(entry => entry.url), ['/b', '/c']);
});

test('flushOutbox stops at a server error too (5xx is tried again later)', async () => {
  const store = await createFilledStore(2);
  const result = await flushOutbox({ store, post: async () => { throw statusError(500); } });
  assert.equal(result.remaining, 2);
  assert.equal(result.sent, 0);
});

test('flushOutbox drops an answer the server refuses for good (409, 400) and goes on', async () => {
  const store = await createFilledStore(4);
  const statuses = { '/a': 409, '/b': 400 };
  const posted = [];
  const result = await flushOutbox({
    store,
    post: async url => {
      if (statuses[url]) throw statusError(statuses[url]);
      posted.push(url);
    },
  });
  assert.deepEqual(posted, ['/c', '/d']);
  assert.deepEqual(result, { sent: 2, dropped: 2, remaining: 0, needsLogin: false });
  assert.equal(await store.count(), 0);
});

test('flushOutbox reports needsLogin on a 401 and keeps every entry', async () => {
  const store = await createFilledStore(3);
  const result = await flushOutbox({
    store,
    post: async url => { if (url === '/b') throw statusError(401); },
  });
  assert.deepEqual(result, { sent: 1, dropped: 0, remaining: 2, needsLogin: true });
  assert.deepEqual((await store.listAll()).map(entry => entry.url), ['/b', '/c']);
});

test('flushOutbox runs one at a time: a second call gets the running one', async () => {
  const store = await createFilledStore(2);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let postCount = 0;
  const post = async () => { postCount += 1; await gate; };
  const first = flushOutbox({ store, post });
  const second = flushOutbox({ store, post });
  assert.equal(first, second);
  release();
  const result = await first;
  assert.equal(postCount, 2, 'each entry is posted once');
  assert.equal(result.sent, 2);
  // After it finished, a new flush starts again.
  await store.enqueue({ kind: 'grade', url: '/z', body: {}, created_at: 9 });
  assert.equal((await flushOutbox({ store, post: async () => {} })).sent, 1);
});

test('flushOutbox with an empty outbox does nothing', async () => {
  const result = await flushOutbox({ store: createMemoryStore(), post: async () => { throw new Error('no post expected'); } });
  assert.deepEqual(result, { sent: 0, dropped: 0, remaining: 0, needsLogin: false });
});

test('flushOutbox picks up entries enqueued during the flush', async () => {
  const store = await createFilledStore(1);
  const posted = [];
  const result = await flushOutbox({
    store,
    post: async url => {
      posted.push(url);
      if (url === '/a') await store.enqueue({ kind: 'grade', url: '/late', body: {}, created_at: 50 });
    },
  });
  assert.deepEqual(posted, ['/a', '/late']);
  assert.deepEqual(result, { sent: 2, dropped: 0, remaining: 0, needsLogin: false });
});

test('flushOutbox counts the remaining entries from the store, entries added meanwhile included', async () => {
  const store = await createFilledStore(2);
  const progress = [];
  await flushOutbox({
    store,
    post: async url => { if (url === '/a') await store.enqueue({ kind: 'grade', url: '/late', body: {}, created_at: 50 }); },
    onProgress: entry => progress.push(entry.remaining),
  });
  assert.deepEqual(progress, [2, 1, 0]);
});

test('an entry failing with a 5xx is kept with its attempts and dropped after the fifth', async () => {
  const store = await createFilledStore(2);
  const failing = async url => { if (url === '/a') throw statusError(500); };
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
    const result = await flushOutbox({ store, post: failing });
    assert.equal(result.remaining, 2);
    assert.equal((await store.listAll())[0].attempts, attempt);
  }
  const result = await flushOutbox({ store, post: failing });
  assert.deepEqual(result, { sent: 1, dropped: 1, remaining: 0, needsLogin: false });
});

test('a network error is not an attempt', async () => {
  const store = await createFilledStore(1);
  for (let index = 0; index < 8; index += 1) {
    await flushOutbox({ store, post: async () => { throw Object.assign(new Error('offline'), { offline: true, status: 0 }); } });
  }
  const [entry] = await store.listAll();
  assert.ok(!entry.attempts);
});

test('listAll orders by body.answered_at (created_at when missing), then seq', async () => {
  const store = createMemoryStore();
  await store.enqueue({ kind: 'grade', url: '/late-answer', body: { answered_at: 300 }, created_at: 310 });
  await store.enqueue({ kind: 'grade', url: '/slow-post', body: { answered_at: 100 }, created_at: 400 });
  await store.enqueue({ kind: 'drill', url: '/no-time', body: {}, created_at: 200 });
  await store.enqueue({ kind: 'drill', url: '/tie', body: {}, created_at: 200 });
  assert.deepEqual((await store.listAll()).map(entry => entry.url), ['/slow-post', '/no-time', '/tie', '/late-answer']);
});
