// The answer posts of public/api.js on a weak signal: a post that hangs past ANSWER_POST_TIMEOUT_MS is cut off and throws
// the offline error, so the practice queues the answer instead of waiting for the server forever.
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import * as api from '../public/api.js';

const realFetch = globalThis.fetch;

// A fetch that never answers, until its signal aborts it (as a browser fetch does). Records each call's init.
function installHangingFetch() {
  const calls = [];
  globalThis.fetch = (url, init = {}) => {
    calls.push({ url, init });
    return new Promise((resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  };
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
});

for (const [name, post] of [
  ['gradePracticeWord', () => api.gradePracticeWord({ word_id: 'w1' })],
  ['postDrillAnswer', () => api.postDrillAnswer({ word_id: 'w1' })],
  ['postWithoutRedirect (the outbox)', () => api.postWithoutRedirect('/api/practice/grades', { word_id: 'w1' })],
]) {
  test(`${name}: a post that hangs past the time limit throws the offline error`, async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const calls = installHangingFetch();
    const result = post().then(() => 'answered', error => error);
    mock.timers.tick(api.ANSWER_POST_TIMEOUT_MS - 1);
    await Promise.resolve();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.signal.aborted, false);
    mock.timers.tick(1);
    const error = await result;
    assert.equal(error.offline, true);
    assert.equal(error.status, 0);
    assert.equal(error.message, api.OFFLINE_MESSAGE);
    assert.equal(api.isNetworkDown(), true);
  });
}

test('a post that answers in time is read as usual and leaves no timer behind', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async () => new Response(JSON.stringify({ deck: {} }), { status: 200 });
  assert.deepEqual(await api.gradePracticeWord({ word_id: 'w1' }), { deck: {} });
  assert.equal(api.isNetworkDown(), false);
});

test('other requests have no time limit (a slow generation must not count as offline)', async () => {
  const calls = installHangingFetch();
  api.generateOrderSentences(5).catch(() => {});
  await Promise.resolve();
  assert.equal(calls[0].init.signal, undefined);
});
