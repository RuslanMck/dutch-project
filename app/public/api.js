// REST + live-update client. Same-origin cookie auth; a 401 sends the page to /login.

async function request(method, url, body) {
  const headers = { Accept: 'application/json' };
  const init = { method, credentials: 'same-origin', headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Потрібен вхід');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Помилка ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
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

export const getWordOrderSet = () => request('GET', '/api/word-order/set');
export const answerWordOrder = (id, tiles) => request('POST', `/api/word-order/sentences/${enc(id)}/answer`, { tiles });
export const listOrderSentences = () => request('GET', '/api/word-order/sentences');
export const deleteOrderSentence = id => request('DELETE', `/api/word-order/sentences/${enc(id)}`);
export const importOrderSentences = markdown => request('POST', '/api/word-order/import', { markdown });
export const generateOrderSentences = count => request('POST', '/api/word-order/generate', { count });

export const getPracticeBatch = sessionId => request('GET', `/api/practice/batch?session_id=${enc(sessionId)}`);
export const gradePracticeWord = body => request('POST', '/api/practice/grades', body);
export const getPracticeStats = () => request('GET', '/api/practice/stats');
export const getPhraseBatch = sessionId => request('GET', `/api/practice/phrases/batch?session_id=${enc(sessionId)}`);
export const gradePracticePhrase = body => request('POST', '/api/practice/phrases/grades', body);
export const getStrugglingWords = () => request('GET', '/api/practice/struggling-words');
export const getRoundSummary = () => request('GET', '/api/practice/round-summary');
export const getStats = () => request('GET', '/api/stats');
export const getActivity = period => request('GET', `/api/stats/activity?period=${enc(period)}`);

// Calls onChange(collection) for every live change. 'all' means refetch everything.
// Uses SSE; while the stream is down (error or not yet open) it polls every 5 s.
// Returns an unsubscribe function.
export function subscribe(onChange) {
  const POLL_MS = 5000;
  let es = null;
  let timer = null;

  const startPolling = () => {
    if (!timer) timer = setInterval(() => onChange('all'), POLL_MS);
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

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    if (es) es.close();
    stopPolling();
  };
}
