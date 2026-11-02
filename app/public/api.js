// REST + live-update client. Same-origin cookie auth; a 401 sends the page to /login.
// A network failure throws an Error with offline: true and status: 0 (message «Немає зв'язку»).

// The message of every error that means "the network is down" (a fetch failure, or the service worker's 503).
export const OFFLINE_MESSAGE = "Немає зв'язку";

// An Error that means the network is down: offline: true, status: 0.
export function createOfflineError() {
  return Object.assign(new Error(OFFLINE_MESSAGE), { offline: true, status: 0 });
}

// When the service worker last answered from its stored copy (ms since epoch, from X-Offline-Cache), or null.
let lastOfflineCacheTime = null;
// True after a request failed for lack of network or came from the stored copy; false after the next live answer.
let isNetworkDownNow = false;

export const getLastOfflineCacheTime = () => lastOfflineCacheTime;
export const isNetworkDown = () => isNetworkDownNow;

// Reads the response: JSON data, or an Error with status (and offline: true for the service worker's offline 503).
// Notes a stored-copy answer (X-Offline-Cache). rejectOfflineCache: a stored copy is refused as if the network was down
// (answers that must be live, such as the practice set).
async function readResponse(res, { rejectOfflineCache = false } = {}) {
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (res.status === 503 && data && data.offline === true) {
    isNetworkDownNow = true;
    throw createOfflineError();
  }
  const storedAt = res.headers.get('X-Offline-Cache');
  if (storedAt !== null) {
    isNetworkDownNow = true;
    const storedTime = Number(storedAt);
    if (Number.isFinite(storedTime) && storedTime > 0) lastOfflineCacheTime = storedTime;
    if (rejectOfflineCache) throw createOfflineError();
  } else {
    isNetworkDownNow = false;
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Помилка ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// A fetch that rejects means the network is down.
async function fetchOrThrowOffline(url, init) {
  try {
    return await fetch(url, init);
  } catch {
    isNetworkDownNow = true;
    throw createOfflineError();
  }
}

function buildInit(method, body) {
  const headers = { Accept: 'application/json' };
  const init = { method, credentials: 'same-origin', headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  return init;
}

async function request(method, url, body, options) {
  const res = await fetchOrThrowOffline(url, buildInit(method, body));
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Потрібен вхід');
  }
  return readResponse(res, options);
}

// For the outbox: a POST whose 401 does not leave the page; it throws an Error with status 401 instead.
export async function postWithoutRedirect(url, body) {
  const res = await fetchOrThrowOffline(url, buildInit('POST', body));
  if (res.status === 401) {
    const err = new Error('Потрібен вхід');
    err.status = 401;
    throw err;
  }
  return readResponse(res);
}

const enc = encodeURIComponent;

export const listWords = () => request('GET', '/api/words');
export const addWord = body => request('POST', '/api/words', body);
export const updateWord = (id, patch) => request('PATCH', `/api/words/${enc(id)}`, patch);
export const deleteWord = id => request('DELETE', `/api/words/${enc(id)}`);
export const recordResult = (id, body) => request('POST', `/api/words/${enc(id)}/result`, body);
export const listTopics = () => request('GET', '/api/topics');

export const listRules = () => request('GET', '/api/rules');
export const listPatterns = () => request('GET', '/api/mistake-patterns');

export const listPhrases = () => request('GET', '/api/phrases');
export const addPhrase = body => request('POST', '/api/phrases', body);
export const deletePhrase = id => request('DELETE', `/api/phrases/${enc(id)}`);

export const listTexts = () => request('GET', '/api/texts');

// rules: the rules query value ("v2,inversion"); '' or missing asks for all rules.
export const getWordOrderSet = rules => request('GET', rules ? `/api/word-order/set?rules=${enc(rules)}` : '/api/word-order/set');
export const answerWordOrder = (id, tiles) => request('POST', `/api/word-order/sentences/${enc(id)}/answer`, { tiles });
export const listOrderSentences = () => request('GET', '/api/word-order/sentences');
export const deleteOrderSentence = id => request('DELETE', `/api/word-order/sentences/${enc(id)}`);
export const importOrderSentences = markdown => request('POST', '/api/word-order/import', { markdown });
export const generateOrderSentences = count => request('POST', '/api/word-order/generate', { count });

// The practice set must be live: a stored copy counts as offline unless allowOfflineCache is set (the read-only cards).
export const getPracticeBatch = (sessionId, { allowOfflineCache = false } = {}) =>
  request('GET', `/api/practice/batch?session_id=${enc(sessionId)}`, undefined, { rejectOfflineCache: !allowOfflineCache });
// The words the next set will probably draw from, kept on the phone for an offline next set. Always live.
export const getSpareWords = sessionId =>
  request('GET', `/api/practice/spare-words?session_id=${enc(sessionId)}`, undefined, { rejectOfflineCache: true });
export const getAppVersion = () => request('GET', '/api/version');
// body: word_id, grade, answer, session_id, direction, and optionally client_answer_id, answered_at, set_word_ids.
export const gradePracticeWord = body => request('POST', '/api/practice/grades', body);
export const getPracticeStats = () => request('GET', '/api/practice/stats');
export const getPhraseBatch = sessionId => request('GET', `/api/practice/phrases/batch?session_id=${enc(sessionId)}`);
export const gradePracticePhrase = body => request('POST', '/api/practice/phrases/grades', body);
export const getStrugglingWords = () => request('GET', '/api/practice/struggling-words');
// Practice words for the custom drill, in the given order (unknown ids are skipped by the server). Read-only.
export const getDrillWords = ids => (ids.length
  ? request('GET', `/api/practice/drill-words?ids=${ids.map(enc).join(',')}`)
  : Promise.resolve({ words: [] }));
// One checked answer of a custom drill, logged for the statistics only (the schedule never reads it). The body may carry
// client_answer_id and answered_at (a retried post is counted once, with the time of the answer).
export const postDrillAnswer = body => request('POST', '/api/practice/drill-answers', body);
export const getRoundSummary = () => request('GET', '/api/practice/round-summary', undefined, { rejectOfflineCache: true });
export const getStats = () => request('GET', '/api/stats');
export const getActivity = period => request('GET', `/api/stats/activity?period=${enc(period)}`);

// Calls onChange(collection) for every live change. 'all' means refetch everything.
// Uses SSE; while the stream is down (error or not yet open) it polls every 5 s.
// Returns an unsubscribe function.
export function subscribe(onChange) {
  const POLL_MS = 5000;
  let es = null;
  let timer = null;

  // No polling while the phone is offline: it would only fail every 5 s.
  const startPolling = () => {
    if (!timer) timer = setInterval(() => { if (navigator.onLine !== false) onChange('all'); }, POLL_MS);
  };
  const stopPolling = () => {
    if (timer) { clearInterval(timer); timer = null; }
  };

  if (typeof EventSource === 'undefined') {
    startPolling();
  } else {
    es = new EventSource('/api/events');
    es.addEventListener('open', stopPolling);
    es.addEventListener('change', e => {
      let collection = 'all';
      try { collection = JSON.parse(e.data).collection || 'all'; } catch { /* keep 'all' */ }
      onChange(collection);
    });
    // EventSource reconnects by itself; poll meanwhile so nothing goes stale.
    es.addEventListener('error', startPolling);
  }

  // Coming back to the tab (phone wake-up) can miss events: refetch everything.
  const onVisible = () => { if (!document.hidden) onChange('all'); };
  document.addEventListener('visibilitychange', onVisible);
  // The connection is back: one refetch of everything.
  const onOnline = () => onChange('all');
  window.addEventListener('online', onOnline);

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    if (es) es.close();
    stopPolling();
  };
}

// Decks («Колоди»): named word lists for extra drilling. The catalog feeds the picker.
export const listDecks = () => request('GET', '/api/decks');
export const getDeck = id => request('GET', `/api/decks/${enc(id)}`);
export const createDeck = body => request('POST', '/api/decks', body);
export const updateDeck = (id, patch) => request('PATCH', `/api/decks/${enc(id)}`, patch);
export const deleteDeck = id => request('DELETE', `/api/decks/${enc(id)}`);
export const getDeckWordCatalog = () => request('GET', '/api/decks/word-catalog');
