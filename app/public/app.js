// Dutch матеріали: UI controller. Static tab shells live in index.html; this file fills them
// and keeps user input (form text, card index, practice question, open rules) across re-renders.
import * as api from './api.js';
import {
  advanceDrillQueue,
  advanceWindowedQueue,
  formatQueueProgress,
  shuffle,
  buildDeckLine,
  buildStrugglingDrillEnd,
  canOfferExtraNewWords,
  checkAnswer,
  esc,
  formatDutchWithArticle,
  formatShortDate,
  formatStrugglingDrillButton,
  gradeTranslationAnswer,
  normalise,
  renderRuleBody,
  revealTranslationAnswer,
} from './logic.js';

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
// Short status labels of the words table badges.
const STATUS_LABEL = { new: 'нове', learning: 'вчу', learned: 'знаю' };
const GRADE_LABEL = { again: 'Знову', hard: 'Важко', good: 'Добре' };

// Practice session ({ sessionId, calendarDate }): kept in sessionStorage so a reload resumes the same day's session.
const PRACTICE_SESSION_KEY = 'practice-session-id';
// Statuses of the FSRS practice in which a visit to the practice tab fetches a new batch.
const FSRS_LOAD_STATUSES = ['idle', 'failed', 'unconfigured'];
// The summary's "Хочете ще 10 нових слів?" asks for this many extra New words.
const EXTRA_NEW_WORD_COUNT = 10;
// Shown when the queue ran out and the batch, asked again, brought New words.
const QUEUE_REFILLED_MESSAGE = 'Усі слова сесії вивчено — далі нові слова.';
// Shown when the server refuses extra New words and the batch brings none.
const EXTRA_NEW_WORDS_REFUSED_MESSAGE = 'Зараз додати нові слова не можна.';

const $ = id => document.getElementById(id);

const state = { words: [], topics: [], rules: [], patterns: [], phrases: [], texts: [], loaded: false };

const ui = {
  tab: 'table',
  armed: null,                       // { kind: 'phrase', id }: the phrase row waiting for a second click on delete
  table: { q: '', topic: '' },
  // Cards: 'words' shows today's practice batch without grades; 'phrases' grades like the practice does.
  cards: {
    mode: 'words',
    front: 'nl',                     // language on the front side: nl | uk
    flipped: false,                  // words: the back side is showing
    // words.index is the card on screen; past the last card the batch is finished.
    words: { status: 'idle', deck: [], index: 0 },
    // queue: phrases still to show; answered: ids whose first grade was posted; tally counts first grades by grade.
    // pendingGradePosts: grade posts still in flight; the next batch request waits for them.
    // calendarDate: the Amsterdam day the batch was loaded for. revealed / grade / repeat / message describe the card.
    phrases: {
      status: 'idle',
      sessionId: '',
      calendarDate: '',
      queue: [],
      answered: new Set(),
      pendingGradePosts: new Set(),
      tally: { again: 0, hard: 0, good: 0 },
      revealed: false,
      grade: null,
      repeat: false,
      message: '',
    },
  },
  practice: { mode: 'fsrs', current: null, lastWordId: null, feedback: null, score: { correct: 0, total: 0 } },
  // FSRS translation practice. status: idle | loading | ready | done | unconfigured | failed.
  // queue: batch words still to answer (reviews, then new words; again/hard words go to the end).
  // answered: word ids whose first answer was posted; tally counts first answers by grade.
  // pendingGradePosts: answer posts still in flight; the next batch request waits for them.
  fsrs: {
    status: 'idle',
    sessionId: '',
    queue: [],
    answered: new Set(),
    pendingGradePosts: new Set(),
    tally: { again: 0, hard: 0, good: 0 },
    introducedCount: 0,
    current: null,                   // { word, checked, grade, repeat, schedule }
    feedback: null,
    dueTomorrow: null,
    newWordsBlocked: false,          // the latest batch held New words back for overdue reviews
    newRemainingByPriority: {},      // the latest batch: New words left after this batch, by priority
    strugglingCount: null,           // words the struggling drill would ask, read when the summary shows
  },
  // Struggling-words drill (mode 'struggling'). One object per run, see createStrugglingDrill. status: idle | loading |
  // ready | done | empty | unconfigured | failed. Nothing about the drill is posted.
  struggling: createStrugglingDrill('idle'),
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
  } catch (error) {
    notice(error.message || 'Помилка');
  }
}

// A grade post stays in its pending set until it settles, so the next batch request can wait for it.
function trackPendingPost(pendingPosts, post) {
  const settle = () => pendingPosts.delete(post);
  pendingPosts.add(post);
  post.then(settle, settle);
}

// "i" buttons: aria-expanded says whether the text block named by aria-controls is open.
function setHintOpen(button, isOpen) {
  button.setAttribute('aria-expanded', String(isOpen));
  $(button.getAttribute('aria-controls')).hidden = !isOpen;
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
  ui.armed = null;                   // switching tabs disarms the phrase delete
  try { localStorage.setItem('tab', ui.tab); } catch { /* storage unavailable */ }
  for (const t of TABS) {
    $(`tab-${t}`).hidden = t !== ui.tab;
    document.querySelector(`.tabs [data-tab="${t}"]`).setAttribute('aria-selected', String(t === ui.tab));
  }
  if (ui.tab === 'practice') ensureFsrsSession();
  if (ui.tab === 'cards') ensureCardsBatch();
  render();
}

// ---------- delete confirmation (one dialog for every word) ----------

// onConfirm runs only after the learner presses "Видалити" in the dialog.
let pendingWordDelete = null;

function askDeleteWord(word, onConfirm) {
  pendingWordDelete = { onConfirm };
  $('delete-dialog-text').textContent = `Ви впевнені, що хочете видалити слово "${word.nl}"? ` +
    'Історію повторень і лічильник помилок цього слова теж буде видалено.';
  $('delete-dialog').showModal();
  $('delete-dialog-cancel').focus();
}

// The word leaves the practice queue at once, then the server delete runs and the words list is refetched.
function deleteWordEverywhere(wordId) {
  forgetDeletedWord(wordId);
  act(() => api.deleteWord(wordId), ['words', 'topics']);
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
  const { q, topic } = ui.table;
  syncTopicOptions();
  const nq = normalise(q);
  const rows = state.words
    .filter(word => (!topic || word.topic === topic) &&
      (!nq || normalise(word.nl).includes(nq) || normalise(word.uk).includes(nq)))
    .sort((a, b) => a.added_at - b.added_at);

  const body = $('words-body');
  if (!rows.length) {
    const emptyMessage = state.words.length ? 'Нічого не знайдено.' : 'Слів поки немає.';
    body.innerHTML = `<tr><td colspan="6" class="empty">${emptyMessage}</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(word => {
    const nextDate = formatShortDate(word.next_due_on);
    const nextDateCell = nextDate ? `<time datetime="${esc(word.next_due_on)}">${esc(nextDate)}</time>` : '';
    return `<tr>
      <td class="w">${word.article ? `<span class="art">${esc(word.article)}</span> ` : ''}${esc(word.nl)}</td>
      <td>${esc(word.section || '')}</td>
      <td>${esc(word.uk)}</td>
      <td>${nextDateCell}</td>
      <td>${word.priority ? `P${esc(word.priority)}` : ''}</td>
      <td><button class="del" type="button" data-act="wdel" data-id="${word.id}" aria-label="Видалити слово ${esc(word.nl)}">×</button></td>
    </tr>`;
  }).join('');
}

// ---------- 2 · Картки ----------

// Text in place of a card while the deck has no card to show.
function formatDeckMessage(status, failedText, emptyText) {
  if (status === 'unconfigured') return 'Практика FSRS ще не налаштована';
  if (status === 'failed') return failedText;
  if (status === 'ready') return emptyText;
  return 'Завантаження…';
}

// Words: today's practice batch (reviews, then new words). Read-only: nothing is graded here.
async function loadCardWords(sessionId) {
  const words = ui.cards.words;
  Object.assign(words, { status: 'loading', deck: [], index: 0 });
  ui.cards.flipped = false;
  renderCards();
  try {
    const batch = await api.getPracticeBatch(sessionId);
    words.deck = [...shuffle(batch.reviews), ...shuffle(batch.new_words)];
    words.status = 'ready';
  } catch (error) {
    if (error.status === 409) {
      words.status = 'unconfigured';
    } else {
      words.status = 'failed';
      notice(error.message || 'Помилка');
    }
  }
  renderCards();
}

// Phrases: today's phrase batch, the same session as the practice; grades are posted once per phrase.
async function loadCardPhrases(sessionId) {
  const phrases = ui.cards.phrases;
  Object.assign(phrases, {
    status: 'loading',
    sessionId,
    calendarDate: formatTodayInAmsterdam(),
    queue: [],
    answered: new Set(),
    pendingGradePosts: new Set(),
    tally: { again: 0, hard: 0, good: 0 },
    revealed: false,
    grade: null,
    repeat: false,
    message: '',
  });
  renderCards();
  try {
    const batch = await api.getPhraseBatch(sessionId);
    phrases.queue = [...shuffle(batch.reviews), ...shuffle(batch.new_phrases)];
    phrases.status = 'ready';
  } catch (error) {
    if (error.status === 409) {
      phrases.status = 'unconfigured';
    } else {
      phrases.status = 'failed';
      notice(error.message || 'Помилка');
    }
  }
  renderCards();
}

// Words are reloaded on every visit, because Practice grading shrinks today's batch. Phrases load once per Amsterdam
// day, and again on a visit when the last load failed or was not configured.
function ensureCardsBatch() {
  const cards = ui.cards;
  if (cards.mode === 'words') {
    loadCardWords(readSessionId());
    return;
  }
  const isBatchFromEarlierDay = cards.phrases.calendarDate !== formatTodayInAmsterdam();
  if (FSRS_LOAD_STATUSES.includes(cards.phrases.status) || isBatchFromEarlierDay) {
    loadCardPhrases(readSessionId());
  }
}

// One side of a card: the front shows the language chosen in ui.cards.front, the back shows the other one.
function renderCardSide(card, isBackShowing) {
  const dutchSide = `<span class="card-nl">${card.dutchHtml}</span>`;
  const ukrainianSide = `<span class="card-uk">${esc(card.ukrainianText)}</span>`;
  const exampleLine = card.exampleText ? `<span class="card-ex">${esc(card.exampleText)}</span>` : '';
  const isDutchFront = ui.cards.front === 'nl';
  if (!isBackShowing) return isDutchFront ? dutchSide : ukrainianSide;
  return isDutchFront ? ukrainianSide + exampleLine : dutchSide + exampleLine;
}

function renderCards() {
  const cards = ui.cards;
  $('cards-mode').value = cards.mode;
  $('cards-direction').value = cards.front;
  $('cards-note').hidden = cards.mode !== 'words';
  if (cards.mode === 'words') renderWordCards();
  else renderPhraseCards();
}

// Words: the batch is finished once «Далі» has passed its last card.
function isWordDeckFinished() {
  const words = ui.cards.words;
  return words.status === 'ready' && words.deck.length > 0 && words.index >= words.deck.length;
}

function renderWordCards() {
  const cards = ui.cards;
  const words = cards.words;
  const isFinished = isWordDeckFinished();
  const word = isFinished ? null : words.deck[words.index];
  const isShowing = words.status === 'ready' && !!word;
  const body = $('card-body');
  $('card-skip-button').hidden = !isShowing || cards.flipped;
  $('card-next').hidden = !isShowing;
  $('card-grades').hidden = true;
  $('card-msg').textContent = '';
  const hasDeck = words.status === 'ready' && words.deck.length > 0;
  $('card-count').textContent = hasDeck ? `Залишилось: ${words.deck.length - words.index}` : '';
  if (!isShowing) {
    const doneText = isFinished ? 'На сьогодні все'
      : formatDeckMessage(words.status, 'Не вдалося завантажити слова', 'На сьогодні слів немає');
    body.innerHTML = `<span class="done">${esc(doneText)}</span>`;
    return;
  }
  // The batch has no examples; they come from the word list when it is loaded.
  const known = state.words.find(stored => stored.id === word.id);
  const exampleText = [known?.example_nl, known?.example_uk].filter(Boolean).join(' — ');
  body.innerHTML = renderCardSide({
    dutchHtml: `${word.article ? `<span class="art">${esc(word.article)}</span> ` : ''}${esc(word.nl)}`,
    ukrainianText: word.uk,
    exampleText,
  }, cards.flipped);
}

function renderPhraseCards() {
  const phrases = ui.cards.phrases;
  const phrase = phrases.queue[0];
  const isShowing = phrases.status === 'ready' && !!phrase;
  const isGraded = phrases.grade !== null;
  const body = $('card-body');
  $('card-skip-button').hidden = !isShowing || phrases.revealed;
  $('card-grades').hidden = !isShowing || !phrases.revealed || isGraded;
  $('card-next').hidden = !isShowing || !isGraded;
  $('card-msg').textContent = isShowing ? phrases.message : '';
  if (isShowing) {
    $('card-count').textContent = `Залишилось: ${phrases.queue.length}`;
  } else if (phrases.answered.size) {
    const { again, hard, good } = phrases.tally;
    $('card-count').textContent = `Знову: ${again} · Важко: ${hard} · Добре: ${good}`;
  } else {
    $('card-count').textContent = '';
  }
  if (!isShowing) {
    const emptyText = phrases.answered.size ? 'Фрази на сьогодні пройдено' : 'На сьогодні фраз немає';
    body.innerHTML = `<span class="done">${esc(formatDeckMessage(phrases.status, 'Не вдалося завантажити фрази',
      emptyText))}</span>`;
    return;
  }
  body.innerHTML = renderCardSide({
    dutchHtml: esc(phrase.nl),
    ukrainianText: phrase.uk,
    exampleText: phrase.context || '',
  }, phrases.revealed);
}

// Words: «Далі» moves to the next card; a word never changes a grade here. Past the last card the batch is finished.
function showNextWordCard() {
  const words = ui.cards.words;
  if (words.index >= words.deck.length) return;
  words.index += 1;
  ui.cards.flipped = false;
  renderCards();
}

// Phrases: the card turns over only when it is not turned yet; grading is done with the buttons.
function handleCardClick() {
  const cards = ui.cards;
  if (cards.mode === 'words') {
    if (!cards.words.deck.length || isWordDeckFinished()) return;
    cards.flipped = !cards.flipped;
  } else {
    if (!cards.phrases.queue.length || cards.phrases.revealed) return;
    cards.phrases.revealed = true;
  }
  renderCards();
}

// A phrase grade from a button, or from «Не знаю» (which grades again). Only the first grade in a session is posted.
function gradeCardPhrase(grade, isSkip) {
  const phrases = ui.cards.phrases;
  const phrase = phrases.queue[0];
  if (!phrase || phrases.grade !== null) return;
  phrases.revealed = true;
  phrases.grade = grade;
  phrases.repeat = phrases.answered.has(phrase.id);
  if (phrases.repeat) {
    phrases.message = 'Повтор: оцінка не зараховується';
  } else {
    phrases.answered.add(phrase.id);
    phrases.tally[grade] += 1;
    phrases.message = `${isSkip ? 'Не знаю. ' : ''}Записано: ${GRADE_LABEL[grade]}`;
    trackPendingPost(phrases.pendingGradePosts, postPhraseGrade(phrase, grade));
  }
  renderCards();
  // The grade buttons are hidden now; «Далі» is the next action.
  $('card-next').focus();
}

// A 409 means the phrase was already graded in this session, which is not an error for the learner: the card on
// screen reads as a repeat. Any other failure undoes the local count of this first grade, so the next first grade
// of the phrase posts again.
async function postPhraseGrade(phrase, grade) {
  const phrases = ui.cards.phrases;
  const { sessionId, answered } = phrases;
  try {
    await api.gradePracticePhrase({ phrase_id: phrase.id, grade, session_id: sessionId });
  } catch (error) {
    if (error.status === 409) {
      const isStillOnScreen = phrases.sessionId === sessionId && phrases.grade === grade
        && phrases.queue[0]?.id === phrase.id;
      if (isStillOnScreen) {
        phrases.repeat = true;
        phrases.message = 'Повтор: оцінка не зараховується';
        renderCards();
      }
      return;
    }
    if (phrases.answered === answered) {
      answered.delete(phrase.id);
      phrases.tally[grade] -= 1;
      renderCards();
    }
    notice(error.message || 'Помилка');
  }
}

// "Далі" after a grade: a phrase graded good leaves the queue; any other phrase comes back at the end.
// When the deck runs out, the phrase batch is asked again.
function advanceCardPhrase() {
  const phrases = ui.cards.phrases;
  if (!phrases.queue.length || phrases.grade === null) return;
  const phrase = phrases.queue.shift();
  if (phrases.grade !== 'good') phrases.queue.push(phrase);
  Object.assign(phrases, { revealed: false, grade: null, repeat: false, message: '' });
  if (!phrases.queue.length) {
    refillCardPhrases();
    return;
  }
  renderCards();
}

// The end of the phrase deck: the batch is asked again with the same session. New phrases that were unlocked continue
// the deck; without them the end message stays.
async function refillCardPhrases() {
  const phrases = ui.cards.phrases;
  const sessionId = phrases.sessionId;
  phrases.status = 'loading';
  renderCards();
  // The last grade must be stored first: the batch leaves out phrases graded today, and the gate reads the store.
  await Promise.allSettled([...phrases.pendingGradePosts]);
  if (ui.cards.phrases.sessionId !== sessionId) return;
  let batch;
  try {
    batch = await api.getPhraseBatch(sessionId);
  } catch (error) {
    if (ui.cards.phrases.sessionId === sessionId) {
      phrases.status = 'ready';
      notice(error.message || 'Помилка');
      renderCards();
    }
    return;
  }
  if (ui.cards.phrases.sessionId !== sessionId) return;
  phrases.queue = batch.new_phrases.filter(phrase => !phrases.answered.has(phrase.id));
  phrases.status = 'ready';
  renderCards();
}

// ---------- 3 · Практика ----------

// Article drill: a random word in rotation (learning or learned) with de or het, never the same word twice in a row.
function listArticleDrillWords() {
  return state.words.filter(word => (word.status === 'learning' || word.status === 'learned') &&
    (word.article === 'de' || word.article === 'het'));
}

// excludedWordId is a word that was just deleted and must not come back in the same question.
function pickArticleQuestion(excludedWordId = null) {
  const practice = ui.practice;
  const pool = listArticleDrillWords().filter(word => word.id !== excludedWordId);
  practice.feedback = null;
  if (!pool.length) {
    practice.current = null;
    return;
  }
  const choices = pool.length > 1 ? pool.filter(word => word.id !== practice.lastWordId) : pool;
  const word = choices[Math.floor(Math.random() * choices.length)];
  practice.current = { word, checked: false };
  practice.lastWordId = word.id;
}

// The word the Practice tab is asking about, or null when there is none (the trash button needs it).
// The struggling-words drill has none: it is not a word the schedule is about.
function findCurrentPracticeWord() {
  if (ui.practice.mode === 'art') return ui.practice.current?.word ?? null;
  if (ui.practice.mode !== 'fsrs' || ui.fsrs.status !== 'ready' || !ui.fsrs.current) return null;
  return ui.fsrs.current.word;
}

// A practice session is stored as { sessionId, calendarDate } in sessionStorage. The server hides every word graded
// in a session, so a session only lasts for one Amsterdam calendar day. When storage is blocked the same pair
// lives in memory.
function formatTodayInAmsterdam() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

function createSessionId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function saveSession(sessionId) {
  memorySession = { sessionId, calendarDate: formatTodayInAmsterdam() };
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
  if (current?.calendarDate === formatTodayInAmsterdam()) return current.sessionId;
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
    pendingGradePosts: new Set(),
    introducedCount: 0,
    current: null,
    feedback: null,
    dueTomorrow: null,
    newWordsBlocked: false,
    newRemainingByPriority: {},
    strugglingCount: null,
  });
  renderPractice();
  try {
    const batch = await api.getPracticeBatch(sessionId);
    session.queue = [...shuffle(batch.reviews), ...shuffle(batch.new_words)];
    session.status = 'ready';
    rememberFsrsBatchCounts(batch);
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

// The gate line and the summary button read these from the latest batch.
function rememberFsrsBatchCounts(batch) {
  ui.fsrs.newWordsBlocked = batch.counts?.new_words_blocked === true;
  ui.fsrs.newRemainingByPriority = batch.counts?.new_remaining_by_priority ?? {};
}

// Shows the first word of the queue. An empty queue asks the batch again with the same session id: the gate may have
// opened, or extra New words may have been added. The session ends only when that brings no New words.
function showNextFsrsWord() {
  const session = ui.fsrs;
  session.feedback = null;
  if (session.queue.length) {
    session.current = { word: session.queue[0], checked: false, grade: null, repeat: false, schedule: null };
    return;
  }
  session.current = null;
  refillFsrsQueue(QUEUE_REFILLED_MESSAGE);
}

// Asks the batch again with the same session id. New words that came back continue the session, with continueMessage
// when given; without them the session ends and the summary shows. Resolves to true when the session continued.
async function refillFsrsQueue(continueMessage = '') {
  const session = ui.fsrs;
  const sessionId = session.sessionId;
  session.current = null;
  session.status = 'loading';
  renderPractice();
  // The last answer must be stored first: the batch leaves out words graded today, and the gate reads the store.
  await Promise.allSettled([...session.pendingGradePosts]);
  if (ui.fsrs.sessionId !== sessionId) return false;
  let batch;
  try {
    batch = await api.getPracticeBatch(sessionId);
  } catch (error) {
    if (ui.fsrs.sessionId !== sessionId) return false;
    if (error.status === 409) {
      session.status = 'unconfigured';
    } else {
      session.status = 'failed';
      notice(error.message || 'Помилка');
    }
    renderPractice();
    return false;
  }
  if (ui.fsrs.sessionId !== sessionId) return false;
  rememberFsrsBatchCounts(batch);
  // A word answered in this session never comes back as a question, even if the batch still lists it.
  const newWords = batch.new_words.filter(word => !session.answered.has(word.id));
  if (!newWords.length) {
    finishFsrsSession();
    return false;
  }
  session.queue.push(...shuffle(newWords));
  session.status = 'ready';
  // The session continues, so its id stays the stored one (finishing replaced it).
  saveSession(sessionId);
  showNextFsrsWord();
  session.feedback = continueMessage ? { text: continueMessage, ok: true } : null;
  renderPractice();
  return true;
}

// Nothing is left to answer: the summary shows. The stored session id is replaced, so the next visit gets a fresh
// batch.
function finishFsrsSession() {
  const session = ui.fsrs;
  session.current = null;
  session.status = 'done';
  saveSession(createSessionId());
  loadDueTomorrow();
  loadStrugglingCount();
  renderPractice();
}

// The summary's "Хочете ще 10 нових слів?": the server raises today's quota, then the batch is asked again. A refused
// request (409) is not shown as an error: whatever is available continues, and only when nothing comes back does the
// summary stay with a notice.
async function handleExtraNewWordsClick() {
  const button = $('practice-extra-words-button');
  button.disabled = true;
  let refused = false;
  try {
    await api.addExtraNewWords({ count: EXTRA_NEW_WORD_COUNT });
  } catch (error) {
    if (error.status !== 409) {
      notice(error.message || 'Помилка');
      return;
    }
    refused = true;
  } finally {
    button.disabled = false;
  }
  const isContinued = await refillFsrsQueue(refused ? QUEUE_REFILLED_MESSAGE : '');
  if (refused && !isContinued && ui.fsrs.status === 'done') notice(EXTRA_NEW_WORDS_REFUSED_MESSAGE);
}

// A deleted word leaves the practice at once, so no session or drill asks for it again. When it is the question on
// screen (the FSRS session, the article drill or the struggling-words drill), the answer typed for it is cleared: Enter
// must not grade the word that replaces it.
function forgetDeletedWord(wordId) {
  const session = ui.fsrs;
  const drill = ui.struggling;
  const practice = ui.practice;
  const wasOnScreen = findCurrentPracticeWord()?.id === wordId || drill.current?.word.id === wordId;
  session.queue = session.queue.filter(word => word.id !== wordId);
  if (session.current?.word.id === wordId) showNextFsrsWord();
  drill.queue = drill.queue.filter(word => word.id !== wordId);
  if (drill.current?.word.id === wordId) showNextStrugglingWord();
  if (practice.mode === 'art' && practice.current?.word.id === wordId) pickArticleQuestion(wordId);
  if (wasOnScreen) $('practice-input').value = '';
  renderPractice();
  if (ui.tab === 'practice') $('practice-input').focus();
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
  else if (ui.practice.mode === 'struggling') submitStrugglingAnswer();
  else submitArticleAnswer();
}

// «Не знаю» is shown in the FSRS mode and in the drill; each one reveals the answer its own way.
function handlePracticeSkipClick() {
  if (ui.practice.mode === 'struggling') revealStrugglingAnswer();
  else revealFsrsAnswer();
}

function submitFsrsAnswer() {
  const session = ui.fsrs;
  const input = $('practice-input');
  if (session.current?.checked) {
    advanceFsrsWord();
    return;
  }
  if (!session.current) return;
  const result = gradeTranslationAnswer(session.current.word, input.value);
  if (!result.counted) {
    input.focus();
    return;
  }
  answerFsrsWord(result, normalise(input.value));
}

// «Не знаю»: the right answer is shown and the word is graded again. The answer is left out of the request.
function revealFsrsAnswer() {
  const session = ui.fsrs;
  if (!session.current || session.current.checked) return;
  answerFsrsWord(revealTranslationAnswer(session.current.word), undefined);
  // «Не знаю» is hidden once the answer is shown; «Далі» takes the focus.
  $('practice-btn').focus();
}

// Checks the current word and posts the answer: every answer counts in the learning deck, repeats too. The tally
// counts only the first answer to each word, the one FSRS grades.
function answerFsrsWord(result, answer) {
  const session = ui.fsrs;
  const current = session.current;
  const { word } = current;
  current.checked = true;
  current.grade = result.grade;
  current.repeat = session.answered.has(word.id);
  session.feedback = { text: result.message, ok: result.grade === 'good' };
  if (!current.repeat) {
    session.answered.add(word.id);
    session.tally[result.grade] += 1;
    if (word.state === 'new') session.introducedCount += 1;
  }
  current.post = postFsrsGrade(current, answer);
  trackPendingPost(session.pendingGradePosts, current.post);
  renderPractice();
}

// The response carries the deck position, which the line under the message shows. A failed first answer undoes its
// local count, so the next first answer to the word posts again; a failed repeat only shows the notice.
async function postFsrsGrade(current, answer) {
  const session = ui.fsrs;
  const { sessionId, answered } = session;
  const { word, grade } = current;
  try {
    const schedule = await api.gradePracticeWord({ word_id: word.id, grade, answer, session_id: sessionId });
    current.schedule = schedule;
    word.deck = schedule.deck;
    if (session.current === current) renderPractice();
  } catch (error) {
    // A new batch replaces the answered set and the tally, so only the batch that posted is rolled back.
    if (!current.repeat && session.answered === answered) {
      answered.delete(word.id);
      session.tally[grade] -= 1;
      if (word.state === 'new') session.introducedCount -= 1;
      renderPractice();
    }
    notice(error.message || 'Помилка');
  }
}

// "Далі": a word still in the learning deck comes back later among the active words (advanceWindowedQueue); a word learned, or a review answered
// right, leaves the session. The server's answer decides, so the grade is awaited first.
async function advanceFsrsWord() {
  const session = ui.fsrs;
  const current = session.current;
  if (current.isAdvancing) return;
  current.isAdvancing = true;
  await current.post;
  if (session.current !== current) return;
  const isStillInSession = current.schedule ? current.schedule.deck.in_deck : current.grade !== 'good';
  session.queue = advanceWindowedQueue(session.queue, !isStillInSession);
  $('practice-input').value = '';
  showNextFsrsWord();
  renderPractice();
  $('practice-input').focus();
}

function submitArticleAnswer() {
  const practice = ui.practice;
  const input = $('practice-input');
  if (practice.current?.checked) {
    pickArticleQuestion();
    input.value = '';
    renderPractice();
    input.focus();
    return;
  }
  if (!practice.current || !input.value.trim()) {
    input.focus();
    return;
  }
  const { word } = practice.current;
  const result = checkAnswer(word, input.value, 'art');
  if (!result.counted) {
    practice.feedback = { text: result.message, ok: false };
    renderPractice();
    return;
  }
  practice.current.checked = true;
  practice.feedback = { text: result.message, ok: result.correct };
  practice.score.total += 1;
  if (result.correct) practice.score.correct += 1;
  renderPractice();
  act(() => api.recordResult(word.id, {
    correct: result.correct,
    mode: 'article',
    answer: normalise(input.value),
  }), ['words']);
}

function renderPractice() {
  const mode = ui.practice.mode;
  const isFsrs = mode === 'fsrs';
  $('practice-mode').value = mode;
  $('practice-progress-hint-button').hidden = !isFsrs;
  if (!isFsrs) setHintOpen($('practice-progress-hint-button'), false);
  $('practice-delete-button').hidden = !findCurrentPracticeWord();
  $('practice-drill-summary').hidden = mode !== 'struggling' || ui.struggling.status !== 'done';
  if (isFsrs) renderFsrsPractice();
  else if (mode === 'struggling') renderStrugglingPractice();
  else renderArticlePractice();
}

function setPracticeMessage(feedback) {
  const messageElement = $('practice-msg');
  messageElement.textContent = feedback ? feedback.text : '';
  messageElement.className = 'msg' + (feedback ? (feedback.ok ? ' ok' : ' bad') : '');
}

function renderArticlePractice() {
  const practice = ui.practice;
  if (!practice.current || !state.words.some(word => word.id === practice.current.word.id)) pickArticleQuestion();

  const hasQuestion = !!practice.current;
  $('practice-q').textContent = hasQuestion ? practice.current.word.nl : 'Немає слів для цього режиму';
  $('practice-form').hidden = !hasQuestion;
  if (hasQuestion) {
    $('practice-btn').textContent = practice.current.checked ? 'Далі' : 'Перевірити';
    $('practice-input').placeholder = 'de або het';
  }
  $('practice-skip-button').hidden = true;
  $('practice-schedule').textContent = '';
  $('practice-progress').textContent = '';
  $('practice-gate').hidden = true;
  $('practice-summary').hidden = true;
  $('practice-restart-button').hidden = true;
  setPracticeMessage(practice.feedback);
  $('practice-score').textContent = `Вірно: ${practice.score.correct} з ${practice.score.total}`;
}

// The line under the practice message, from the grade response: the right answers still needed in the session, the
// word learned, or a review answered right.
function formatScheduleLine(current) {
  if (!current?.checked || !current.schedule) return '';
  const { schedule } = current;
  return buildDeckLine({ deck: schedule.deck, intervalDays: schedule.interval_days });
}

function renderFsrsPractice() {
  const session = ui.fsrs;
  const current = session.current;
  const isReady = session.status === 'ready' && !!current;
  const answeredCount = session.tally.again + session.tally.hard + session.tally.good;
  const questionByStatus = {
    idle: '',
    loading: 'Завантаження…',
    ready: isReady ? current.word.uk : '',
    done: answeredCount ? 'Сесію завершено' : 'На сьогодні слів немає',
    unconfigured: 'Практика FSRS ще не налаштована',
    failed: 'Не вдалося завантажити слова',
  };
  $('practice-q').textContent = questionByStatus[session.status];
  $('practice-form').hidden = !isReady;
  $('practice-skip-button').hidden = !isReady || current.checked;
  if (isReady) {
    $('practice-btn').textContent = current.checked ? 'Далі' : 'Перевірити';
    $('practice-input').placeholder = 'нідерландською';
  }
  $('practice-progress').textContent = isReady ? formatQueueProgress(session.queue.length) : '';
  const isGateShown = session.newWordsBlocked && (isReady || session.status === 'done');
  $('practice-gate').hidden = !isGateShown;
  $('practice-schedule').textContent = formatScheduleLine(current);
  $('practice-score').textContent = '';
  $('practice-summary').hidden = session.status !== 'done';
  $('practice-extra-words-button').hidden = session.status !== 'done' || !canOfferExtraNewWords({
    newWordsBlocked: session.newWordsBlocked,
    newRemainingByPriority: session.newRemainingByPriority,
  });
  $('practice-restart-button').hidden = session.status !== 'done' && session.status !== 'failed';
  const strugglingButton = $('practice-struggling-button');
  strugglingButton.hidden = session.status !== 'done' || !session.strugglingCount;
  if (session.strugglingCount) strugglingButton.textContent = formatStrugglingDrillButton(session.strugglingCount);
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

// The FSRS summary's count of the drill's words, read fresh each time the summary shows. A failed read leaves the
// button hidden; the drill reports its own errors.
async function loadStrugglingCount() {
  const sessionId = ui.fsrs.sessionId;
  ui.fsrs.strugglingCount = null;
  try {
    const listing = await api.getStrugglingWords();
    if (ui.fsrs.sessionId === sessionId) ui.fsrs.strugglingCount = listing.count;
  } catch { /* the button stays hidden */ }
  renderPractice();
}

// The FSRS summary's button: the mode select moves to the drill and the drill starts.
function handleStrugglingButtonClick() {
  ui.practice.mode = 'struggling';
  startStrugglingDrill();
}

// ---------- 3b · Важкі слова (struggling-words drill) ----------

// One drill run. Each run has its own object, so a list that arrives late cannot change a newer run.
function createStrugglingDrill(status) {
  return {
    status,
    queue: [],                       // words still to answer; the front one is on screen
    total: 0,                        // words the drill started with
    correctFirstTimeCount: 0,        // words typed right at their first check
    answeredWordIds: new Set(),      // words whose first check is done
    current: null,                   // { word, checked, grade }
    feedback: null,
  };
}

// Reads the words whose latest graded answer was wrong or hard. Nothing is posted: the schedule does not change.
async function startStrugglingDrill() {
  const drill = createStrugglingDrill('loading');
  ui.struggling = drill;
  $('practice-input').value = '';
  renderPractice();
  let listing;
  try {
    listing = await api.getStrugglingWords();
  } catch (error) {
    if (ui.struggling !== drill) return;
    if (error.status === 409) {
      drill.status = 'unconfigured';
    } else {
      drill.status = 'failed';
      notice(error.message || 'Помилка');
    }
    renderPractice();
    return;
  }
  if (ui.struggling !== drill) return;
  drill.queue = shuffle(listing.words);
  drill.total = listing.words.length;
  if (drill.queue.length) {
    drill.status = 'ready';
    showNextStrugglingWord();
  } else {
    drill.status = 'empty';
  }
  renderPractice();
}

// Shows the front word of the queue; an empty queue ends the drill.
function showNextStrugglingWord() {
  const drill = ui.struggling;
  drill.feedback = null;
  if (drill.queue.length) {
    drill.current = { word: drill.queue[0], checked: false, grade: null };
    return;
  }
  drill.current = null;
  drill.status = 'done';
}

// Enter or the button: check the typed answer; once checked the button reads "Далі" and moves on.
function submitStrugglingAnswer() {
  const drill = ui.struggling;
  const input = $('practice-input');
  if (drill.current?.checked) {
    advanceStrugglingWord();
    return;
  }
  if (!drill.current) return;
  const result = gradeTranslationAnswer(drill.current.word, input.value);
  if (!result.counted) {
    input.focus();
    return;
  }
  answerStrugglingWord(result);
}

// «Не знаю»: the right answer is shown; the word goes back to the end like a wrong answer. Nothing is posted.
function revealStrugglingAnswer() {
  const drill = ui.struggling;
  if (!drill.current || drill.current.checked) return;
  answerStrugglingWord(revealTranslationAnswer(drill.current.word));
  $('practice-btn').focus();
}

// Checks the word on screen. Only its first check counts toward "правильно з першого разу".
function answerStrugglingWord(result) {
  const drill = ui.struggling;
  const { word } = drill.current;
  if (!drill.answeredWordIds.has(word.id)) {
    drill.answeredWordIds.add(word.id);
    if (result.grade === 'good') drill.correctFirstTimeCount += 1;
  }
  drill.current.checked = true;
  drill.current.grade = result.grade;
  drill.feedback = { text: result.message, ok: result.grade === 'good' };
  renderPractice();
}

// "Далі": a word typed right leaves the queue; any other word comes back later among the active words, until it is
// typed right.
function advanceStrugglingWord() {
  const drill = ui.struggling;
  drill.queue = advanceDrillQueue(drill.queue, drill.current.grade);
  $('practice-input').value = '';
  showNextStrugglingWord();
  renderPractice();
  $('practice-input').focus();
}

function renderStrugglingPractice() {
  const drill = ui.struggling;
  const current = drill.current;
  const isReady = drill.status === 'ready' && !!current;
  const questionByStatus = {
    idle: '',
    loading: 'Завантаження…',
    ready: isReady ? current.word.uk : '',
    done: '',
    empty: 'Важких слів немає.',
    unconfigured: 'Практика FSRS ще не налаштована',
    failed: 'Не вдалося завантажити слова',
  };
  $('practice-q').textContent = questionByStatus[drill.status];
  $('practice-form').hidden = !isReady;
  $('practice-skip-button').hidden = !isReady || current.checked;
  if (isReady) {
    $('practice-btn').textContent = current.checked ? 'Далі' : 'Перевірити';
    $('practice-input').placeholder = 'нідерландською';
  }
  $('practice-progress').textContent = isReady ? formatQueueProgress(drill.queue.length) : '';
  $('practice-schedule').textContent = '';
  $('practice-score').textContent = '';
  $('practice-gate').hidden = true;
  $('practice-summary').hidden = true;
  $('practice-restart-button').hidden = true;
  setPracticeMessage(drill.feedback);
  if (drill.status === 'done') renderStrugglingEnd();
}

// The end of the drill: the first-check count and the note that the schedule did not change.
function renderStrugglingEnd() {
  const drill = ui.struggling;
  const end = buildStrugglingDrillEnd({ correctFirstTimeCount: drill.correctFirstTimeCount, totalCount: drill.total });
  $('practice-drill-result').textContent = end.resultText;
  $('practice-drill-note').textContent = end.noteText;
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
  list.innerHTML = items.map(phrase => {
    const armed = isArmed('phrase', phrase.id);
    const status = phrase.status || 'new';
    return `<li class="item">
      <div class="item-main">
        <div><b>${esc(phrase.nl)}</b> <span class="status st-${esc(status)}">${esc(STATUS_LABEL[status] ?? status)}</span></div>
        <div>${esc(phrase.uk)}</div>
        ${phrase.context ? `<div class="muted">${esc(phrase.context)}</div>` : ''}
      </div>
      <button class="del${armed ? ' armed' : ''}" type="button" data-act="pdel" data-id="${phrase.id}" aria-label="${armed ? 'Підтвердити видалення' : 'Видалити фразу'}">${armed ? 'видалити?' : '×'}</button>
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
  document.querySelector('.tabs').addEventListener('click', event => {
    const button = event.target.closest('button[data-tab]');
    if (button) showTab(button.dataset.tab);
  });

  // "i" buttons open and close the text block they control.
  document.querySelectorAll('[data-hint-button]').forEach(button => {
    button.addEventListener('click', () => setHintOpen(button, button.getAttribute('aria-expanded') !== 'true'));
  });

  // Delete confirmation: Cancel and Escape close it; only "Видалити" runs the delete.
  const deleteDialog = $('delete-dialog');
  $('delete-dialog-cancel').addEventListener('click', () => deleteDialog.close());
  $('delete-dialog-confirm').addEventListener('click', () => {
    const pending = pendingWordDelete;
    pendingWordDelete = null;
    deleteDialog.close();
    pending?.onConfirm();
  });
  deleteDialog.addEventListener('close', () => { pendingWordDelete = null; });

  // Таблиця
  $('word-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const nl = form.elements.nl.value.trim();
    const uk = form.elements.uk.value.trim();
    if (!nl || !uk) {
      (nl ? form.elements.uk : form.elements.nl).focus();
      return;
    }
    const body = { nl, uk, article: form.elements.article.value };
    const section = form.elements.section.value.trim();
    if (section) body.section = section;
    const exampleDutchText = form.elements.example_nl.value.trim();
    const exampleUkrainianText = form.elements.example_uk.value.trim();
    if (exampleDutchText) body.example_nl = exampleDutchText;
    if (exampleUkrainianText) body.example_uk = exampleUkrainianText;
    act(async () => {
      await api.addWord(body);
      form.reset();
      form.elements.nl.focus();
    }, ['words', 'topics']);
  });
  $('table-q').addEventListener('input', event => {
    ui.table.q = event.target.value;
    renderTable();
  });
  $('table-topic').addEventListener('change', event => {
    ui.table.topic = event.target.value;
    renderTable();
  });
  $('words-body').addEventListener('click', event => {
    const button = event.target.closest('button[data-act="wdel"]');
    if (!button) return;
    const word = state.words.find(stored => stored.id === Number(button.dataset.id));
    if (word) {
      askDeleteWord(word, () => {
        deleteWordEverywhere(word.id);
        // The deleted row's button is gone; the search field is the next stop.
        $('table-q').focus();
      });
    }
  });

  // Картки
  $('cards-mode').addEventListener('change', event => {
    ui.cards.mode = event.target.value;
    ui.cards.flipped = false;
    ensureCardsBatch();
    renderCards();
  });
  $('cards-direction').addEventListener('change', event => {
    ui.cards.front = event.target.value;
    renderCards();
  });
  $('card').addEventListener('click', handleCardClick);
  $('card-skip-button').addEventListener('click', () => {
    if (ui.cards.mode === 'words') {
      ui.cards.flipped = true;
      renderCards();
      // «Не знаю» is hidden once the card is turned; «Далі» takes the focus.
      $('card-next').focus();
    } else {
      gradeCardPhrase('again', true);
    }
  });
  $('card-next').addEventListener('click', () => {
    if (ui.cards.mode === 'words') showNextWordCard();
    else advanceCardPhrase();
  });
  $('card-grades').addEventListener('click', event => {
    const button = event.target.closest('button[data-card-grade]');
    if (button) gradeCardPhrase(button.dataset.cardGrade, false);
  });

  // Практика
  $('practice-mode').addEventListener('change', event => {
    ui.practice.mode = event.target.value;
    if (ui.practice.mode === 'art') pickArticleQuestion();
    $('practice-input').value = '';
    if (ui.practice.mode === 'struggling') startStrugglingDrill();
    else ensureFsrsSession();
    renderPractice();
  });
  $('practice-form').addEventListener('submit', event => {
    event.preventDefault();
    submitPractice();
  });
  $('practice-skip-button').addEventListener('click', handlePracticeSkipClick);
  $('practice-struggling-button').addEventListener('click', handleStrugglingButtonClick);
  $('practice-drill-again-button').addEventListener('click', () => startStrugglingDrill());
  $('practice-delete-button').addEventListener('click', () => {
    const word = findCurrentPracticeWord();
    if (word) askDeleteWord(word, () => deleteWordEverywhere(word.id));
  });
  $('practice-restart-button').addEventListener('click', restartFsrsSession);
  $('practice-extra-words-button').addEventListener('click', handleExtraNewWordsClick);

  // Правила
  $('rules-q').addEventListener('input', event => {
    ui.rules.q = event.target.value;
    renderRules();
  });
  // toggle does not bubble; the capture listener on the list sees every <details>.
  $('rules-list').addEventListener('toggle', event => {
    const detailsElement = event.target;
    if (!(detailsElement instanceof HTMLDetailsElement) || normalise(ui.rules.q)) return;   // while searching, all are forced open
    if (detailsElement.open) ui.rules.open.add(detailsElement.dataset.key);
    else ui.rules.open.delete(detailsElement.dataset.key);
  }, true);

  // Фрази
  $('phrase-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const nl = form.elements.nl.value.trim();
    const uk = form.elements.uk.value.trim();
    if (!nl || !uk) {
      (nl ? form.elements.uk : form.elements.nl).focus();
      return;
    }
    const body = { nl, uk };
    const context = form.elements.context.value.trim();
    if (context) body.context = context;
    act(async () => {
      await api.addPhrase(body);
      form.reset();
      form.elements.nl.focus();
    }, ['phrases']);
  });
  $('phrases-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-act="pdel"]');
    if (!button) return;
    const id = Number(button.dataset.id);
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
  refresh(ALL_KEYS).catch(error => notice(error.message || 'Не вдалося завантажити дані'));
  api.subscribe(collection => {
    refresh(KEYS_FOR[collection] || ALL_KEYS).catch(error => notice(error.message || 'Помилка оновлення'));
  });
}

init();
