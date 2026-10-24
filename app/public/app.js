// Dutch матеріали: UI controller. Static tab shells live in index.html; this file fills them
// and keeps user input (form text, card index, practice question, open rules) across re-renders.
import * as api from './api.js';
import { esc, normalise, checkAnswer, gradeTranslationAnswer, renderRuleBody } from './logic.js';

const TABS = ['table', 'cards', 'practice', 'rules', 'phrases', 'texts'];
const ALL_KEYS = ['words', 'topics', 'rules', 'patterns', 'phrases', 'texts'];
// SSE collection name -> state keys to refetch.
const KEYS_FOR = {
  words: ['words', 'topics'],
  mistakes: ['patterns', 'rules'],
  rules: ['rules'],
  phrases: ['phrases'],
  texts: ['texts'],
};
const LOADERS = {
  words: api.listWords,
  topics: api.listTopics,
  rules: api.listRules,
  patterns: api.listPatterns,
  phrases: api.listPhrases,
  texts: api.listTexts,
};
const STATUS_LABEL = { new: 'нове', learning: 'вчу', learned: 'знаю' };

// Practice session ({ sessionId, calendarDate }): kept in sessionStorage so a reload resumes the same day's session.
const PRACTICE_SESSION_KEY = 'practice-session-id';
// Statuses of the FSRS practice in which a visit to the practice tab fetches a new batch.
const FSRS_LOAD_STATUSES = ['idle', 'failed', 'unconfigured'];

const $ = id => document.getElementById(id);

const state = { words: [], topics: [], rules: [], patterns: [], phrases: [], texts: [], loaded: false };

const ui = {
  tab: 'table',
  armed: null,                       // { kind, id }: the one row waiting for a second click on delete
  table: { q: '', topic: '', sortErrors: false },
  cards: { idx: 0, flippedId: null },
  practice: { mode: 'fsrs', cur: null, lastId: null, feedback: null, score: { ok: 0, tot: 0 } },
  // FSRS translation practice. status: idle | loading | ready | done | unconfigured | failed.
  // queue: batch words still to answer (reviews, then new words; again/hard words go to the end).
  // answered: word ids whose first answer was posted; tally counts first answers by grade.
  fsrs: {
    status: 'idle',
    sessionId: '',
    queue: [],
    answered: new Set(),
    tally: { again: 0, hard: 0, good: 0 },
    introducedCount: 0,
    current: null,                   // { word, checked, grade }
    feedback: null,
    dueTomorrow: null,
  },
  rules: { q: '', open: new Set() },  // open rule keys; kept across re-renders
};
let memorySession = null;          // { sessionId, calendarDate } used when sessionStorage is blocked

// ---------- helpers ----------

let noticeTimer = 0;
function notice(text) {
  const el = $('notice');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

function isArmed(kind, id) {
  return !!ui.armed && ui.armed.kind === kind && ui.armed.id === id;
}

const errs = w => w.error_count || 0;

// Refetch the given state keys; re-render the active tab only if something actually changed.
async function refresh(keys) {
  let changed = false;
  await Promise.all(keys.map(async key => {
    const next = await LOADERS[key]();
    if (JSON.stringify(next) !== JSON.stringify(state[key])) {
      state[key] = next;
      changed = true;
    }
  }));
  if (changed || !state.loaded) {
    state.loaded = true;
    render();
  }
}

// Run a write, then refetch the affected collections. Errors go to the notice line.
async function act(fn, keys = []) {
  try {
    const result = await fn();
    if (keys.length) await refresh(keys);
    return result;
  } catch (e) {
    notice(e.message || 'Помилка');
  }
}

function splitExample(text) {
  const t = text.trim();
  const i = t.indexOf(' — ');
  if (i < 0) return { nl: t, uk: '' };
  return { nl: t.slice(0, i).trim(), uk: t.slice(i + 3).trim() };
}

// ---------- tabs ----------

const RENDER = {
  table: renderTable,
  cards: renderCards,
  practice: renderPractice,
  rules: renderRules,
  phrases: renderPhrases,
  texts: renderTexts,
};

function render() {
  if (state.loaded) RENDER[ui.tab]();
}

function showTab(name) {
  ui.tab = TABS.includes(name) ? name : 'table';
  ui.armed = null;                   // switching tabs disarms two-click deletes
  try { localStorage.setItem('tab', ui.tab); } catch { /* storage unavailable */ }
  for (const t of TABS) {
    $(`tab-${t}`).hidden = t !== ui.tab;
    document.querySelector(`.tabs [data-tab="${t}"]`).setAttribute('aria-selected', String(t === ui.tab));
  }
  if (ui.tab === 'practice') ensureFsrsSession();
  render();
}

// ---------- 1 · Таблиця ----------

function syncTopicOptions() {
  const sel = $('table-topic');
  const names = state.topics.map(t => t.name);
  const key = names.join('\u0001');
  if (sel.dataset.key === key) return;
  sel.dataset.key = key;
  if (ui.table.topic && !names.includes(ui.table.topic)) ui.table.topic = '';
  sel.innerHTML = '<option value="">усі теми</option>' +
    names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  sel.value = ui.table.topic;
}

function renderTable() {
  const { q, topic, sortErrors } = ui.table;
  syncTopicOptions();
  const nq = normalise(q);
  const rows = state.words
    .filter(w => (!topic || w.topic === topic) &&
      (!nq || normalise(w.nl).includes(nq) || normalise(w.uk).includes(nq)))
    .sort((a, b) => (sortErrors ? errs(b) - errs(a) : 0) || a.added_at - b.added_at);

  $('sort-errors').setAttribute('aria-pressed', String(sortErrors));
  $('sort-errors').classList.toggle('on', sortErrors);

  const body = $('words-body');
  if (!rows.length) {
    const msg = state.words.length ? 'Нічого не знайдено.' : 'Слів поки немає.';
    body.innerHTML = `<tr><td colspan="6" class="empty">${msg}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(w => {
    const armed = isArmed('word', w.id);
    return `<tr>
      <td class="w">${w.article ? `<span class="art">${esc(w.article)}</span> ` : ''}${esc(w.nl)}</td>
      <td>${esc(w.section || '')}</td>
      <td>${esc(w.uk)}</td>
      <td class="num">${errs(w) || ''}</td>
      <td><span class="status st-${esc(w.status)}">${esc(STATUS_LABEL[w.status] || w.status)}</span></td>
      <td><button class="del${armed ? ' armed' : ''}" type="button" data-act="wdel" data-id="${w.id}" aria-label="${armed ? 'Підтвердити видалення' : 'Видалити слово'}">${armed ? 'видалити?' : '×'}</button></td>
    </tr>`;
  }).join('');
}

// ---------- 2 · Картки ----------

function cardPool() {
  return state.words
    .filter(w => w.status !== 'learned')
    .sort((a, b) => a.added_at - b.added_at);
}

function renderCards() {
  const c = ui.cards;
  const pool = cardPool();
  const body = $('card-body');
  if (!pool.length) {
    body.innerHTML = '<span class="done">Усе вивчено</span>';
    $('card-actions').hidden = true;
    $('card-count').textContent = '';
    return;
  }
  $('card-actions').hidden = false;
  c.idx %= pool.length;
  const w = pool[c.idx];
  if (c.flippedId === w.id) {
    const ex = w.example_nl
      ? `<span class="card-ex">${esc(w.example_nl)}${w.example_uk ? ` — ${esc(w.example_uk)}` : ''}</span>`
      : '';
    body.innerHTML = `<span class="card-uk">${esc(w.uk)}</span>${ex}`;
  } else {
    body.innerHTML = `<span class="card-nl">${w.article ? `<span class="art">${esc(w.article)}</span> ` : ''}${esc(w.nl)}</span>`;
  }
  $('card-count').textContent = `Залишилось: ${pool.length}`;
}

// "Далі" only moves to the next card: statuses now follow the FSRS schedule, not the flashcards.
function showNextCard() {
  const pool = cardPool();
  if (!pool.length) return;
  ui.cards.idx = (ui.cards.idx + 1) % pool.length;
  renderCards();
}

// ---------- 3 · Практика ----------

// Article drill (mode 'art'): a random word with de or het, never the same as the previous question.
function articlePool() {
  return state.words.filter(w => w.status !== 'learned' && (w.article === 'de' || w.article === 'het'));
}

function pickQuestion() {
  const p = ui.practice;
  const pool = articlePool();
  p.feedback = null;
  if (!pool.length) {
    p.cur = null;
    return;
  }
  const choices = pool.length > 1 ? pool.filter(w => w.id !== p.lastId) : pool;
  const word = choices[Math.floor(Math.random() * choices.length)];
  p.cur = { word, checked: false };
  p.lastId = word.id;
}

// A practice session is stored as { sessionId, calendarDate } in sessionStorage. The server hides every word graded
// in a session, so a session only lasts for one Amsterdam calendar day. When storage is blocked the same pair
// lives in memory.
function todayInAmsterdam() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

function createSessionId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function saveSession(sessionId) {
  memorySession = { sessionId, calendarDate: todayInAmsterdam() };
  try { sessionStorage.setItem(PRACTICE_SESSION_KEY, JSON.stringify(memorySession)); } catch { /* storage unavailable */ }
}

// The stored pair, or null when nothing usable is stored (absent, blocked, or an older plain id).
function readStoredSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PRACTICE_SESSION_KEY) || 'null');
    if (typeof parsed?.sessionId === 'string' && typeof parsed?.calendarDate === 'string') return parsed;
  } catch { /* storage unavailable or not JSON: use the in-memory pair */ }
  return null;
}

// The session id for this visit: the stored one while it belongs to today, otherwise a new session.
function readSessionId() {
  const current = readStoredSession() ?? memorySession;
  if (current?.calendarDate === todayInAmsterdam()) return current.sessionId;
  const sessionId = createSessionId();
  saveSession(sessionId);
  return sessionId;
}

// Opens the FSRS practice on the first visit; a failed or not yet configured practice is tried again on a visit.
function ensureFsrsSession() {
  if (ui.practice.mode === 'fsrs' && FSRS_LOAD_STATUSES.includes(ui.fsrs.status)) {
    loadFsrsBatch(readSessionId());
  }
}

// "Почати знову": a fresh batch under a new session id.
function restartFsrsSession() {
  const sessionId = createSessionId();
  saveSession(sessionId);
  loadFsrsBatch(sessionId);
}

async function loadFsrsBatch(sessionId) {
  const session = ui.fsrs;
  Object.assign(session, {
    status: 'loading',
    sessionId,
    queue: [],
    answered: new Set(),
    tally: { again: 0, hard: 0, good: 0 },
    introducedCount: 0,
    current: null,
    feedback: null,
    dueTomorrow: null,
  });
  renderPractice();
  try {
    const batch = await api.getPracticeBatch(sessionId);
    session.queue = [...batch.reviews, ...batch.new_words];
    session.status = 'ready';
    showNextFsrsWord();
  } catch (error) {
    if (error.status === 409) {
      session.status = 'unconfigured';
    } else {
      session.status = 'failed';
      notice(error.message || 'Помилка');
    }
  }
  renderPractice();
}

// Shows the first word of the queue, or ends the session when the queue is empty.
function showNextFsrsWord() {
  const session = ui.fsrs;
  session.feedback = null;
  if (!session.queue.length) {
    session.current = null;
    session.status = 'done';
    // The finished session stays on screen; the next visit gets a fresh session id.
    saveSession(createSessionId());
    loadDueTomorrow();
    return;
  }
  session.current = { word: session.queue[0], checked: false, grade: null };
}

async function loadDueTomorrow() {
  const sessionId = ui.fsrs.sessionId;
  try {
    const stats = await api.getPracticeStats();
    if (ui.fsrs.sessionId === sessionId) ui.fsrs.dueTomorrow = stats.due_tomorrow;
  } catch (error) {
    notice(error.message || 'Помилка');
  }
  renderPractice();
}

// Enter or the button: check the answer; once checked the button reads "Далі" and moves on.
function submitPractice() {
  if (ui.practice.mode === 'fsrs') submitFsrsAnswer();
  else submitArticleAnswer();
}

function submitFsrsAnswer() {
  const session = ui.fsrs;
  const input = $('practice-input');
  if (session.current?.checked) {
    advanceFsrsWord();
    return;
  }
  if (!session.current) return;
  const { word } = session.current;
  const result = gradeTranslationAnswer(word, input.value);
  if (!result.counted) {
    input.focus();
    return;
  }
  session.current.checked = true;
  session.current.grade = result.grade;
  session.feedback = { text: result.message, ok: result.grade === 'good' };
  // Only the first answer to a word is graded; repeats of again/hard words are not posted.
  if (!session.answered.has(word.id)) {
    session.answered.add(word.id);
    session.tally[result.grade] += 1;
    if (word.state === 'new') session.introducedCount += 1;
    postFsrsGrade(word, result.grade, normalise(input.value));
  }
  renderPractice();
}

// A 409 means this word was already graded in the session, which is not an error for the learner. Any other failure
// undoes the local count of this first answer, so the next first answer to the word posts again.
async function postFsrsGrade(word, grade, answer) {
  const session = ui.fsrs;
  const { sessionId, answered } = session;
  try {
    await api.gradePracticeWord({ word_id: word.id, grade, answer, session_id: sessionId });
  } catch (error) {
    if (error.status === 409) return;
    // A new batch replaces the answered set and the tally, so only the batch that posted is rolled back.
    if (session.answered === answered) {
      answered.delete(word.id);
      session.tally[grade] -= 1;
      if (word.state === 'new') session.introducedCount -= 1;
      renderPractice();
    }
    notice(error.message || 'Помилка');
  }
}

// "Далі": a word answered 'good' leaves the queue; any other word comes back at the end, until it is right.
function advanceFsrsWord() {
  const session = ui.fsrs;
  const { word, grade } = session.current;
  session.queue.shift();
  if (grade !== 'good') session.queue.push(word);
  $('practice-input').value = '';
  showNextFsrsWord();
  renderPractice();
  $('practice-input').focus();
}

function submitArticleAnswer() {
  const practice = ui.practice;
  const input = $('practice-input');
  if (practice.cur && practice.cur.checked) {
    pickQuestion();
    input.value = '';
    renderPractice();
    input.focus();
    return;
  }
  if (!practice.cur || !input.value.trim()) {
    input.focus();
    return;
  }
  const { word } = practice.cur;
  const result = checkAnswer(word, input.value, 'art');
  if (!result.counted) {
    practice.feedback = { text: result.message, ok: false };
    renderPractice();
    return;
  }
  practice.cur.checked = true;
  practice.feedback = { text: result.message, ok: result.correct };
  practice.score.tot += 1;
  if (result.correct) practice.score.ok += 1;
  renderPractice();
  act(() => api.recordResult(word.id, {
    correct: result.correct,
    mode: 'article',
    answer: normalise(input.value),
  }), ['words']);
}

function renderPractice() {
  $('practice-mode').value = ui.practice.mode;
  if (ui.practice.mode === 'fsrs') renderFsrsPractice();
  else renderArticlePractice();
}

function setPracticeMessage(feedback) {
  const messageElement = $('practice-msg');
  messageElement.textContent = feedback ? feedback.text : '';
  messageElement.className = 'msg' + (feedback ? (feedback.ok ? ' ok' : ' bad') : '');
}

function renderArticlePractice() {
  const p = ui.practice;
  if (!p.cur || !state.words.some(w => w.id === p.cur.word.id)) pickQuestion();

  const hasQuestion = !!p.cur;
  $('practice-q').textContent = hasQuestion ? p.cur.word.nl : 'Немає слів для цього режиму';
  $('practice-form').hidden = !hasQuestion;
  if (hasQuestion) {
    $('practice-btn').textContent = p.cur.checked ? 'Далі' : 'Перевірити';
    $('practice-input').placeholder = 'de або het';
  }
  $('practice-progress').textContent = '';
  $('practice-summary').hidden = true;
  $('practice-restart-button').hidden = true;
  setPracticeMessage(p.feedback);
  $('practice-score').textContent = `Вірно: ${p.score.ok} з ${p.score.tot}`;
}

function renderFsrsPractice() {
  const session = ui.fsrs;
  const isReady = session.status === 'ready' && !!session.current;
  const answeredCount = session.tally.again + session.tally.hard + session.tally.good;
  const questionByStatus = {
    idle: '',
    loading: 'Завантаження…',
    ready: isReady ? session.current.word.uk : '',
    done: answeredCount ? 'Сесію завершено' : 'На сьогодні слів немає',
    unconfigured: 'Практика FSRS ще не налаштована',
    failed: 'Не вдалося завантажити слова',
  };
  $('practice-q').textContent = questionByStatus[session.status];
  $('practice-form').hidden = !isReady;
  if (isReady) {
    $('practice-btn').textContent = session.current.checked ? 'Далі' : 'Перевірити';
    $('practice-input').placeholder = 'нідерландською';
  }
  $('practice-progress').textContent = isReady ? `Залишилось: ${session.queue.length}` : '';
  $('practice-score').textContent = '';
  $('practice-summary').hidden = session.status !== 'done';
  $('practice-restart-button').hidden = session.status !== 'done' && session.status !== 'failed';
  setPracticeMessage(session.feedback);
  if (session.status === 'done') renderPracticeSummary();
}

function renderPracticeSummary() {
  const session = ui.fsrs;
  const items = [
    ['Знову', session.tally.again],
    ['Важко', session.tally.hard],
    ['Добре', session.tally.good],
    ['Нових слів', session.introducedCount],
    ['Завтра повторити', session.dueTomorrow ?? '…'],
  ];
  $('practice-summary-list').innerHTML = items.map(([label, value]) =>
    `<li class="practice-summary__item">${esc(label)}: <strong>${esc(value)}</strong></li>`).join('');
}

// ---------- 4 · Правила ----------

const patternText = p => [p.title, ...(p.cases || []).flatMap(c => [c.wrong_text, c.right_text])].join(' ');

function sortedPatterns(list) {
  return [...list].sort((a, b) =>
    (b.count - a.count) || String(b.last_on || '').localeCompare(String(a.last_on || '')));
}

function renderPattern(p) {
  const cases = (p.cases || []).slice(0, 3);
  return `<div class="pat">
    <div class="pat-head"><span class="pat-title">${esc(p.title)}</span><span class="pat-count">×${esc(p.count)}</span></div>
    ${p.fix ? `<div class="pat-fix">${esc(p.fix)}</div>` : ''}
    ${cases.length ? `<ul class="cases">${cases.map(c => `<li><s>${esc(c.wrong_text)}</s> → ${esc(c.right_text)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

function ruleGroups() {
  const groups = state.rules.map(r => {
    const patterns = state.patterns.filter(p => p.rule_id === r.id);
    return {
      key: String(r.id),
      title: r.title,
      tag: [r.code, r.category].filter(Boolean).join(' · '),
      errors: errs(r),
      body: r.body || '',
      patterns,
      search: [r.title, r.code, r.body || '', ...patterns.map(patternText)].join(' '),
    };
  });
  const others = state.patterns.filter(p => p.rule_id == null);
  if (others.length) {
    groups.push({
      key: 'other',
      title: 'Інші помилки',
      tag: 'поза правилами',
      errors: others.reduce((n, p) => n + (p.count || 0), 0),
      body: '',
      patterns: others,
      search: others.map(patternText).join(' '),
    });
  }
  return groups;
}

function renderRules() {
  const q = normalise(ui.rules.q);
  const searching = q !== '';
  const groups = ruleGroups();
  const list = $('rules-list');
  if (!groups.length) {
    list.innerHTML = `<p class="empty">Тут з'являться граматичні правила: артиклі, дієслова, порядок слів.</p>`;
    return;
  }
  const visible = searching ? groups.filter(g => normalise(g.search).includes(q)) : groups;
  if (!visible.length) {
    list.innerHTML = '<p class="empty">Нічого не знайдено.</p>';
    return;
  }
  list.innerHTML = visible.map(g => {
    const open = searching || ui.rules.open.has(g.key);
    const pats = sortedPatterns(g.patterns);
    return `<details class="rule" data-key="${esc(g.key)}"${open ? ' open' : ''}>
      <summary><span class="rule-title">${esc(g.title)}</span>${g.errors ? `<span class="badge">${esc(g.errors)}</span>` : ''}<span class="tag">${esc(g.tag)}</span></summary>
      <div class="rule-body">${renderRuleBody(g.body)}${pats.length ? `<h3 class="mh">Мої помилки</h3>${pats.map(renderPattern).join('')}` : ''}</div>
    </details>`;
  }).join('');
}

// ---------- 5 · Фрази ----------

function renderPhrases() {
  const list = $('phrases-list');
  if (!state.phrases.length) {
    list.innerHTML = '<li class="empty">Фраз поки немає.</li>';
    return;
  }
  const items = [...state.phrases].sort((a, b) => b.added_at - a.added_at);
  list.innerHTML = items.map(p => {
    const armed = isArmed('phrase', p.id);
    return `<li class="item">
      <div class="item-main">
        <div><b>${esc(p.nl)}</b></div>
        <div>${esc(p.uk)}</div>
        ${p.context ? `<div class="muted">${esc(p.context)}</div>` : ''}
      </div>
      <button class="del${armed ? ' armed' : ''}" type="button" data-act="pdel" data-id="${p.id}" aria-label="${armed ? 'Підтвердити видалення' : 'Видалити фразу'}">${armed ? 'видалити?' : '×'}</button>
    </li>`;
  }).join('');
}

// ---------- 6 · Тексти ----------

function renderTexts() {
  const box = $('texts-list');
  if (!state.texts.length) {
    box.innerHTML = '<p class="empty">Текстів поки немає.</p>';
    return;
  }
  box.innerHTML = state.texts.map(t => `<article class="text-card">
    <h2 class="text-title">${esc(t.title)}</h2>
    ${t.section ? `<div class="muted">Глава ${esc(t.section)}</div>` : ''}
    <div class="pre-wrap">${esc(t.body)}</div>
  </article>`).join('');
}

// ---------- wiring ----------

function bindEvents() {
  document.querySelector('.tabs').addEventListener('click', e => {
    const btn = e.target.closest('button[data-tab]');
    if (btn) showTab(btn.dataset.tab);
  });

  // Таблиця
  $('word-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget;
    const nl = f.elements.nl.value.trim();
    const uk = f.elements.uk.value.trim();
    if (!nl || !uk) {
      (nl ? f.elements.uk : f.elements.nl).focus();
      return;
    }
    const body = { nl, uk, article: f.elements.article.value };
    const section = f.elements.section.value.trim();
    if (section) body.section = section;
    const ex = splitExample(f.elements.example.value);
    if (ex.nl) body.example_nl = ex.nl;
    if (ex.uk) body.example_uk = ex.uk;
    act(async () => {
      await api.addWord(body);
      f.reset();
      f.elements.nl.focus();
    }, ['words', 'topics']);
  });
  $('table-q').addEventListener('input', e => {
    ui.table.q = e.target.value;
    renderTable();
  });
  $('table-topic').addEventListener('change', e => {
    ui.table.topic = e.target.value;
    renderTable();
  });
  $('sort-errors').addEventListener('click', () => {
    ui.table.sortErrors = !ui.table.sortErrors;
    renderTable();
  });
  $('words-body').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act="wdel"]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (isArmed('word', id)) {
      ui.armed = null;
      renderTable();
      act(() => api.deleteWord(id), ['words']);
    } else {
      ui.armed = { kind: 'word', id };
      renderTable();
    }
  });

  // Картки
  $('card').addEventListener('click', () => {
    const w = cardPool()[ui.cards.idx];
    if (!w) return;
    ui.cards.flippedId = ui.cards.flippedId === w.id ? null : w.id;
    renderCards();
  });
  $('card-next').addEventListener('click', showNextCard);

  // Практика
  $('practice-mode').addEventListener('change', e => {
    ui.practice.mode = e.target.value;
    if (ui.practice.mode === 'art') pickQuestion();
    $('practice-input').value = '';
    ensureFsrsSession();
    renderPractice();
  });
  $('practice-form').addEventListener('submit', e => {
    e.preventDefault();
    submitPractice();
  });
  $('practice-restart-button').addEventListener('click', restartFsrsSession);

  // Правила
  $('rules-q').addEventListener('input', e => {
    ui.rules.q = e.target.value;
    renderRules();
  });
  // toggle does not bubble; the capture listener on the list sees every <details>.
  $('rules-list').addEventListener('toggle', e => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || normalise(ui.rules.q)) return;   // while searching, all are forced open
    if (d.open) ui.rules.open.add(d.dataset.key);
    else ui.rules.open.delete(d.dataset.key);
  }, true);

  // Фрази
  $('phrase-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.currentTarget;
    const nl = f.elements.nl.value.trim();
    const uk = f.elements.uk.value.trim();
    if (!nl || !uk) {
      (nl ? f.elements.uk : f.elements.nl).focus();
      return;
    }
    const body = { nl, uk };
    const context = f.elements.context.value.trim();
    if (context) body.context = context;
    act(async () => {
      await api.addPhrase(body);
      f.reset();
      f.elements.nl.focus();
    }, ['phrases']);
  });
  $('phrases-list').addEventListener('click', e => {
    const btn = e.target.closest('button[data-act="pdel"]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (isArmed('phrase', id)) {
      ui.armed = null;
      renderPhrases();
      act(() => api.deletePhrase(id), ['phrases']);
    } else {
      ui.armed = { kind: 'phrase', id };
      renderPhrases();
    }
  });
}

// ---------- start ----------

function init() {
  bindEvents();
  let saved = 'table';
  try { saved = localStorage.getItem('tab') || 'table'; } catch { /* storage unavailable */ }
  showTab(saved);
  refresh(ALL_KEYS).catch(e => notice(e.message || 'Не вдалося завантажити дані'));
  api.subscribe(collection => {
    refresh(KEYS_FOR[collection] || ALL_KEYS).catch(e => notice(e.message || 'Помилка оновлення'));
  });
}

init();
