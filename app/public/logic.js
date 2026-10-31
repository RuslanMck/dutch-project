// Pure helpers shared by the UI and the Node tests (no DOM access in this file).

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escape user data before putting it into HTML.
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
}

// Lowercase, trim, collapse whitespace.
export function normalise(value) {
  return String(value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Form of an answer used for comparison: normalise, typographic quotes and the Ukrainian apostrophe (ʼ, backtick) -> ',
// punctuation dropped, spaces collapsed. "hoe gaat het?" and "hoe gaat het" compare equal; "'s ochtends" and "’s ochtends"
// too; "імʼя" and "ім'я" too.
export function normalizeAnswerText(value) {
  return normalise(value)
    .replace(/[’‘ʼ`]/g, "'")
    .replace(/[?!.,;:…"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Classic Levenshtein distance (two-row DP).
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// Practice answer check (handoff section 2, tab 3).
// mode 'all'  = Dutch word typed from the translation, optional leading de/het.
// mode 'art'  = only 'de' or 'het' accepted, compared with the word's article.
// Returns { counted, correct, message }. counted=false means the answer is not recorded.
export function checkAnswer(word, input, mode) {
  const norm = normalise(input);
  const target = normalise(word.nl);
  const article = word.article || '';
  const right = article ? `${article} ${word.nl}` : word.nl;

  if (mode === 'art') {
    if (norm !== 'de' && norm !== 'het') {
      return { counted: false, correct: false, message: 'Напиши лише de або het' };
    }
    if (norm === article) return { counted: true, correct: true, message: '✓ Правильно' };
    return { counted: true, correct: false, message: `✗ Правильно: ${right}` };
  }

  // Exact match without any article handling first, so expressions starting with de/het still work.
  if (norm === target) return { counted: true, correct: true, message: '✓ Правильно' };

  // Optional leading article in the typed answer.
  const m = norm.match(/^(de|het) (.+)$/);
  const typedArticle = m ? m[1] : '';
  const rest = m ? m[2] : norm;

  if (rest === target) {
    if (typedArticle && typedArticle !== article) {
      const rightArticle = article || 'без артикля';
      return {
        counted: true,
        correct: false,
        message: `Слово вірно, але артикль: ✗ → ✓ (${typedArticle} → ${rightArticle})`,
      };
    }
    return { counted: true, correct: true, message: '✓ Правильно' };
  }

  if (levenshtein(rest, target) <= 1) {
    return { counted: true, correct: false, message: `Майже, перевір літери. Правильно: ${right}` };
  }
  return { counted: true, correct: false, message: `✗ Правильно: ${right}` };
}

// The Dutch word as the learner sees it after a reveal: with its article when it has one ("het huis", "appel").
export function formatDutchWithArticle(word) {
  return word.article ? `${word.article} ${word.nl}` : word.nl;
}

// "Не знаю" and "DNK" in the translation practice: the answer is shown and the word is graded again.
export function revealTranslationAnswer(word) {
  return { counted: true, grade: 'again', message: `✗ Правильно: ${formatDutchWithArticle(word)}` };
}

// FSRS translation check: the learner types the Dutch for a Ukrainian word.
// Returns { counted, grade, message }. grade is 'good' (the word is right; the article is optional), 'hard' (one
// letter off) or 'again' (anything else, including "DNK"). counted=false means nothing is graded.
// The article never changes the grade: a missing or wrong de/het with the right word is 'good', and the message names
// the right article. Punctuation, typographic quotes and extra spaces are ignored on both sides (normalizeAnswerText).
export function gradeTranslationAnswer(word, input) {
  const normalizedInput = normalizeAnswerText(input);
  const normalizedTarget = normalizeAnswerText(word.nl);
  const article = word.article || '';
  const right = formatDutchWithArticle(word);

  if (!normalizedInput) return { counted: false, grade: null, message: 'Напиши відповідь нідерландською' };
  // Checked before the fuzzy match: "dnk" is three letters and would otherwise be one letter off some words.
  if (normalizedInput === 'dnk') return revealTranslationAnswer(word);
  // The full text comes first: an expression whose own text starts with de or het has no article field.
  if (normalizedInput === normalizeAnswerText(right)) return { counted: true, grade: 'good', message: '✓ Правильно' };

  const articleMatch = normalizedInput.match(/^(de|het) (.+)$/);
  const typedArticle = articleMatch ? articleMatch[1] : '';
  const rest = articleMatch ? articleMatch[2] : normalizedInput;

  if (rest === normalizedTarget) {
    // A word without an article typed with one is simply right; a missing or wrong article is named.
    const isArticleMissingOrWrong = article !== '' && typedArticle !== article;
    if (!isArticleMissingOrWrong) return { counted: true, grade: 'good', message: '✓ Правильно' };
    return { counted: true, grade: 'good', message: `✓ Правильно (артикль: ${article})` };
  }

  // Both readings are compared, so an expression that starts with de or het is not cut before the comparison.
  const distance = Math.min(levenshtein(rest, normalizedTarget), levenshtein(normalizedInput, normalizedTarget));
  if (distance <= 1) {
    return { counted: true, grade: 'hard', message: `Майже, перевір літери. Правильно: ${right}` };
  }
  return { counted: true, grade: 'again', message: `✗ Правильно: ${right}` };
}

// «Не знаю» in the reverse round (the Dutch is shown, the Ukrainian is wanted): the right answer is shown, graded again.
export function revealReverseTranslationAnswer(word) {
  return { counted: true, grade: 'again', message: `✗ Правильно: ${word.uk}` };
}

// Reverse round (19.6): the learner types the Ukrainian for a Dutch word. Only the same text after normalizeAnswerText
// is right; there is no fuzzy match. A wrong answer is 'again' with canOverride: the learner may still say it was right
// («Я мав рацію»), and the client holds the grade until then or until «Далі».
export function gradeReverseTranslationAnswer(word, input) {
  const normalizedInput = normalizeAnswerText(input);
  if (!normalizedInput) return { counted: false, grade: null, message: 'Напиши відповідь українською' };
  if (normalizedInput === 'dnk') return revealReverseTranslationAnswer(word);
  if (normalizedInput === normalizeAnswerText(word.uk)) return { counted: true, grade: 'good', message: '✓ Правильно' };
  return { counted: true, grade: 'again', message: `✗ Правильно: ${word.uk}`, canOverride: true };
}

// Practice rotates among the first ACTIVE_WINDOW_SIZE words of the queue only; the rest wait their turn.
export const ACTIVE_WINDOW_SIZE = 5;

// The front word leaves the queue when isDone; otherwise it goes back into the active window, and a waiting word
// takes a learned word's place. In shuffle mode it goes to a random place after at least one other active word; without
// it, to the back of the window. Returns a new queue; the one passed in is not changed.
export function advanceWindowedQueue(queue, isDone,
  { isShuffled = true, windowSize = ACTIVE_WINDOW_SIZE, random = Math.random } = {}) {
  if (!queue.length) return [];
  const [answeredWord, ...restOfQueue] = queue;
  if (isDone) return restOfQueue;
  const lastInsertAt = Math.min(windowSize - 1, restOfQueue.length);
  const firstInsertAt = isShuffled ? Math.min(1, lastInsertAt) : lastInsertAt;
  const insertAt = firstInsertAt + Math.floor(random() * (lastInsertAt - firstInsertAt + 1));
  return [...restOfQueue.slice(0, insertAt), answeredWord, ...restOfQueue.slice(insertAt)];
}

// Fisher–Yates: a new array in random order; the one passed in is not changed.
export function shuffle(items, random = Math.random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

// The progress line of a windowed queue: how many words are left, and how many of them rotate now when some wait.
export function formatQueueProgress(queueLength, windowSize = ACTIVE_WINDOW_SIZE) {
  const leftText = `Залишилось: ${queueLength}`;
  return queueLength > windowSize ? `${leftText} · вчимо ${windowSize}` : leftText;
}

// A set is practised in two rounds (19.6): round 1 shows the Ukrainian, round 2 the Dutch.
export const ROUND_DIRECTIONS = Object.freeze(['uk_nl', 'nl_uk']);
const ROUND_NAMES = Object.freeze({ uk_nl: 'UA → NL', nl_uk: 'NL → UA' });

// The key of one answer: a card is answered once in each direction.
export function answerKey(direction, id) {
  return `${direction}:${id}`;
}

// The progress line of a round: "Раунд 1 з 2 · UA → NL · Залишилось: 7 · вчимо 5". A queue that does not rotate
// (phrases) passes windowSize Infinity, so no "вчимо" part.
export function formatRoundProgress({ direction, queueLength, windowSize = ACTIVE_WINDOW_SIZE }) {
  const roundNumber = ROUND_DIRECTIONS.indexOf(direction) + 1;
  return `Раунд ${roundNumber} з ${ROUND_DIRECTIONS.length} · ${ROUND_NAMES[direction]} · `
    + formatQueueProgress(queueLength, windowSize);
}

// The message when a round starts: "Раунд 2: NL → UA".
export function formatRoundStart(direction) {
  const roundNumber = ROUND_DIRECTIONS.indexOf(direction) + 1;
  return `Раунд ${roundNumber}: ${ROUND_NAMES[direction]}`;
}

// The cards of a set waiting in each round. A card waits in every direction it has left (directions_left) and is not
// answered in that direction in this session. Reviews stay before new cards; order shuffles each part (orderWords).
export function splitIntoRounds({ reviews, newCards, answered, order = cards => cards }) {
  const rounds = {};
  for (const direction of ROUND_DIRECTIONS) {
    const isWaiting = card => card.directions_left.includes(direction) && !answered.has(answerKey(direction, card.id));
    rounds[direction] = [...order(reviews.filter(isWaiting)), ...order(newCards.filter(isWaiting))];
  }
  return rounds;
}

// The round that starts when the current queue is empty: the first direction in ROUND_DIRECTIONS with waiting cards.
// Round 2 after round 1 is ordered by orderNextRound. Returns { direction, queue, waiting } or null when no round is left.
export function planNextRound({ direction, waiting }, lastAnsweredId, random = Math.random) {
  const nextDirection = ROUND_DIRECTIONS.find(candidate => waiting[candidate].length);
  if (!nextDirection) return null;
  const isAfterFirstRound = direction === 'uk_nl' && nextDirection === 'nl_uk';
  const cards = waiting[nextDirection];
  return {
    direction: nextDirection,
    queue: isAfterFirstRound ? orderNextRound(cards, lastAnsweredId, random) : [...cards],
    waiting: { ...waiting, [nextDirection]: [] },
  };
}

// Round 2 order: a shuffled copy in which the first card is never lastWordId (when there are 2+ cards), so a word
// answered last in round 1 never comes straight back in the other direction. The one passed in is not changed.
export function orderNextRound(words, lastWordId, random = Math.random) {
  const shuffled = shuffle(words, random);
  if (shuffled.length < 2 || shuffled[0].id !== lastWordId) return shuffled;
  const swapIndex = 1 + Math.floor(random() * (shuffled.length - 1));
  [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
  return shuffled;
}

// A word leaves a drill's queue when it is typed right (grade good); any other answer sends it back into the active
// window (advanceWindowedQueue, same options).
export function advanceDrillQueue(queue, grade, options) {
  return advanceWindowedQueue(queue, grade === 'good', options);
}

// The button under the FSRS summary that starts the struggling-words drill with this many words.
export function formatStrugglingDrillButton(wordCount) {
  return `Потренувати важкі слова (${wordCount})`;
}

// ---------- custom drill (Важкі слова, round-summary drills, decks) ----------
// PURE: these helpers take plain values and return new values. They never call the API and never grade anything: a
// custom drill is extra practice and does not change any word's schedule (docs/CUSTOM_PRACTICE_ARCHITECTURE.md §1).
// The page's drill code (app.js, section 3b) grades only with gradeTranslationAnswer / gradeReverseTranslationAnswer
// and posts nothing; a test checks that section for grading calls.

export const CUSTOM_DRILL_NOTE = 'Тренування — розклад слів не змінюється.';

// The two rounds of a custom drill, in the holder shape planNextRound reads: round 1 (UA → NL) starts with the words in
// the given order (order is the caller's shuffle, or the identity); round 2 (NL → UA) waits with all of them, and
// planNextRound puts them in a new order that never starts with the last word of round 1. The words passed in are not
// changed.
export function planCustomDrill(words, order = list => list) {
  return {
    direction: 'uk_nl',
    queue: order([...words]),
    waiting: { uk_nl: [], nl_uk: [...words] },
    lastAnsweredId: null,
  };
}

// The progress line of a custom drill: "Важкі слова · Раунд 1 з 2 · UA → NL · Залишилось: 7".
export function formatCustomDrillProgress({ title, direction, queueLength }) {
  return `${title} · ${formatRoundProgress({ direction, queueLength })}`;
}

// The end of a custom drill: how many words were right at their first check in each direction, out of all the words.
// firstTry holds { uk_nl, nl_uk } counts.
export function buildCustomDrillEnd({ firstTry, total }) {
  return {
    resultText: `Готово! Правильно з першого разу: UA → NL ${firstTry.uk_nl} з ${total} · NL → UA ${firstTry.nl_uk} з ${total}.`,
    noteText: CUSTOM_DRILL_NOTE,
  };
}

// The drill buttons under a round summary. words are the round's words (round.words: id, difficulty), hardest first, so
// each button's wordIds keep that order. A button with no words is hidden (hidden: true) with count 0.
export function buildRoundDrillButtons(words) {
  const build = (kind, title, difficulties) => {
    const matching = words.filter(word => difficulties.includes(word.difficulty));
    const count = matching.length;
    return {
      kind, title, count, wordIds: matching.map(word => word.id), label: `${title} (${count})`, hidden: count === 0,
    };
  };
  return [
    build('hard', 'Повторити важкі', ['hard']),
    build('hard-medium', 'Важкі й середні', ['hard', 'medium']),
  ];
}

// Ukrainian plural of "день" for a count of days: 1 день, 3 дні, 5 днів, 11 днів, 21 день.
export function pluralizeDays(dayCount) {
  const lastTwoDigits = dayCount % 100;
  const lastDigit = dayCount % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'днів';
  if (lastDigit === 1) return 'день';
  if (lastDigit >= 2 && lastDigit <= 4) return 'дні';
  return 'днів';
}

// "через 3 дні": when a word or phrase comes back for review.
export function formatDaysAway(dayCount) {
  return `через ${dayCount} ${pluralizeDays(dayCount)}`;
}

const LEARNING_STATUS_LABEL = { new: 'нове', learning: 'вивчається', learned: 'вивчено' };

// Status of a word or phrase in Ukrainian; a value that is not known is shown as it is.
export function formatLearningStatus(status) {
  return Object.hasOwn(LEARNING_STATUS_LABEL, status) ? LEARNING_STATUS_LABEL[status] : String(status ?? '');
}

// The line under the practice message after a checked answer, built from the grade response.
export function buildNextReviewLine({ intervalDays, status, errorCount }) {
  const reviewText = `Наступне повторення: ${formatDaysAway(intervalDays)}`;
  return `${reviewText} · ${formatLearningStatus(status)} · помилок: ${errorCount ?? 0}`;
}

// The line under the practice message, from a grade_word result. deck is the response's deck: uk_nl and nl_uk (each with
// in_deck and times_left), has_learned and has_learned_direction. direction is the round just answered.
// The word learned: its next review. The answered direction learned, the other still in the deck: "UA → NL вивчено ✓ —
// далі NL → UA". The answered direction still in the deck: the right answers left. Answered right while the other
// direction is still in the deck, or its round still to come in this set (isOtherRoundLeft): "Правильно ✓ — далі …",
// with no review date. Both directions out: "Повторено ✓".
export function buildDeckLine({ direction, deck, intervalDays, isOtherRoundLeft = false }) {
  const otherDirection = findOtherDirection(direction);
  if (deck?.has_learned) return `Вивчено ✓ — наступне повторення: ${formatDaysAway(intervalDays)}`;
  if (deck?.has_learned_direction) return `${ROUND_NAMES[direction]} вивчено ✓ — далі ${ROUND_NAMES[otherDirection]}`;
  if (deck?.[direction]?.in_deck) return `Повторень до вивчення: ${deck[direction].times_left}`;
  if (deck?.[otherDirection]?.in_deck || isOtherRoundLeft) return `Правильно ✓ — далі ${ROUND_NAMES[otherDirection]}`;
  return `Повторено ✓ — наступне повторення: ${formatDaysAway(intervalDays)}`;
}

// The other round of a word: nl_uk for uk_nl and the reverse.
function findOtherDirection(direction) {
  return ROUND_DIRECTIONS.find(candidate => candidate !== direction);
}

// "2026-10-25" -> "25.10" for the words table. Empty when there is no date (a new word has no next review).
export function formatShortDate(isoDate) {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? ''));
  if (!dateParts) return '';
  return `${dateParts[3]}.${dateParts[2]}`;
}

// Inline rule: escape first, then **x** -> <b>x</b>. Nothing else.
function inline(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

// Table row: "| a | b |" -> ['a', 'b'] (leading and trailing empty cell dropped).
function splitRow(line) {
  const inner = line.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map(cell => cell.trim());
}

function renderTable(lines) {
  const rows = lines
    .map(splitRow)
    .filter(cells => !cells.every(c => /^:?-+:?$/.test(c)));   // drop |---|---| separator rows
  if (!rows.length) return '';
  const [head, ...body] = rows;
  const thead = `<thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="scroll"><table>${thead}${tbody}</table></div>`;
}

function renderBlock(lines) {
  if (lines.every(l => l.startsWith('|'))) return renderTable(lines);
  if (lines.every(l => l.startsWith('- '))) {
    return `<ul>${lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
  }
  if (lines.every(l => l.startsWith('>'))) {
    return `<div class="ex">${lines.map(l => inline(l.slice(1).replace(/^ /, ''))).join('<br>')}</div>`;
  }
  return `<p>${lines.map(inline).join('<br>')}</p>`;
}

// Rule body mini-markdown -> HTML (handoff section 1.4).
export function renderRuleBody(body) {
  return String(body ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\n+|\n+$/g, '')
    .split(/\n\s*\n/)
    .filter(block => block.trim() !== '')
    .map(block => renderBlock(block.split('\n')))
    .join('');
}

// Ukrainian plural by count: pluralize(3, ['помилка', 'помилки', 'помилок']) is 'помилки'.
export function pluralize(count, [one, few, many]) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return many;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
}

// "45 с", "12 хв 30 с", "1 год 5 хв".
export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const restSeconds = seconds % 60;
  if (hours) return minutes ? `${hours} год ${minutes} хв` : `${hours} год`;
  if (minutes) return restSeconds ? `${minutes} хв ${restSeconds} с` : `${minutes} хв`;
  return `${restSeconds} с`;
}

const DIFFICULTY_LABELS = Object.freeze({ easy: 'легко', medium: 'середньо', hard: 'важко' });
const MISTAKE_WORDS = ['помилка', 'помилки', 'помилок'];
const PAUSED_SPAN_MINIMUM_SECONDS = 5 * 60;

// The congratulation screen after a round of new words: the totals, the hardest word and a row per word, hardest
// first (the server's order). round is the round-summary response's round.
export function buildRoundSummaryView(round) {
  const spanSeconds = (round.finished_at - round.started_at) / 1000;
  const stats = [
    ['Вивчено слів', `${round.learned_count} з ${round.total_count}`],
    ['Час навчання', formatDuration(round.active_seconds)],
  ];
  if (spanSeconds - round.active_seconds >= PAUSED_SPAN_MINIMUM_SECONDS) {
    stats.push(['Від початку до кінця, з перервами', formatDuration(spanSeconds)]);
  }
  stats.push(['Відповідей', String(round.answer_count)], ['Помилок', String(round.mistake_count)]);
  const hardestWord = round.words.find(word => word.id === round.hardest_word_id);
  const hardestText = hardestWord
    ? `Найважче слово: ${formatDutch(hardestWord)} — ${hardestWord.uk} (${hardestWord.mistake_count} ${
      pluralize(hardestWord.mistake_count, MISTAKE_WORDS)})`
    : 'Жодної помилки — чудово!';
  const words = round.words.map(word => ({
    dutch: formatDutch(word),
    ukrainian: word.uk,
    difficulty: word.difficulty,
    difficultyLabel: DIFFICULTY_LABELS[word.difficulty],
    detail: `відповідей: ${word.answer_count} · UA→NL: ${word.mistakes?.uk_nl ?? 0} · NL→UA: ${word.mistakes?.nl_uk ?? 0}`,
  }));
  return { title: 'Вітаємо! Набір завершено 🎉', stats, hardestText, words };
}

function formatDutch(word) {
  return word.article ? `${word.article} ${word.nl}` : word.nl;
}

// ---------- statistics page ----------

export const TAB_TITLES = Object.freeze({
  home: 'Головна',
  profile: 'Профіль',
  practice: 'Практика',
  decks: 'Колоди',
  cards: 'Картки',
  phrases: 'Фрази',
  'word-order': 'Порядок слів',
  table: 'Слова',
  rules: 'Правила',
  texts: 'Тексти',
  stats: 'Статистика',
});

const PERIOD_RANGE_PREFIX = Object.freeze({
  day: 'Сьогодні',
  week: 'Останні 7 днів',
  month: 'Останні 30 днів',
  year: 'Останні 12 місяців',
  all: 'Увесь час',
});
const PREVIOUS_PERIOD_NAME = Object.freeze({
  day: 'учора',
  week: 'попередні 7 днів',
  month: 'попередні 30 днів',
  year: 'попередні 12 місяців',
});
const MONTH_SHORT_NAMES = ['січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.', 'лип.', 'серп.', 'вер.', 'жовт.', 'лист.',
  'груд.'];
const WEEKDAY_SHORT_NAMES = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const DAY_WORDS = ['день', 'дні', 'днів'];
const ANSWER_WORDS = ['відповідь', 'відповіді', 'відповідей'];

// '27.10.2026' from '2026-10-27'.
export function formatCalendarDate(calendarDate) {
  const [year, month, day] = calendarDate.split('-');
  return `${day}.${month}.${year}`;
}

export function formatPercent(share) {
  return share === null ? '—' : `${Math.round(share * 100)}%`;
}

// The line under the period buttons: what the numbers cover.
export function formatActivityRange(activity) {
  const prefix = PERIOD_RANGE_PREFIX[activity.period];
  if (activity.from_date === activity.to_date) return `${prefix}: ${formatCalendarDate(activity.to_date)}`;
  return `${prefix}: ${formatCalendarDate(activity.from_date)} – ${formatCalendarDate(activity.to_date)}`;
}

// "+10 · учора: 30", "−5 п.п. · попередні 7 днів: 85%", "= · учора: 30"; null when there is nothing to compare with.
// formatDifference formats the difference, formatPrevious the earlier value.
function formatDelta(current, previous, period, { formatDifference = String, formatPrevious = String } = {}) {
  if (previous === null || previous === undefined || current === null) return null;
  const difference = current - previous;
  const changeText = difference === 0 ? '=' : `${difference > 0 ? '+' : '−'}${formatDifference(Math.abs(difference))}`;
  return `${changeText} · ${PREVIOUS_PERIOD_NAME[period]}: ${formatPrevious(previous)}`;
}

// The tiles of the period: value, label and the comparison with the period before (none for all time).
export function buildActivityTiles(activity) {
  const { totals, period } = activity;
  const previous = activity.previous_totals;
  const accuracyPoints = share => (share === null ? null : Math.round(share * 100));
  const tiles = [
    {
      label: 'Відповідей',
      value: String(totals.answers),
      delta: formatDelta(totals.answers, previous?.answers, period),
    },
    {
      label: 'Правильно',
      value: formatPercent(totals.accuracy),
      delta: formatDelta(accuracyPoints(totals.accuracy), accuracyPoints(previous?.accuracy ?? null), period, {
        formatDifference: points => `${points} п.п.`,
        formatPrevious: points => `${points}%`,
      }),
    },
    {
      label: 'Час навчання',
      value: formatDuration(totals.active_seconds),
      delta: formatDelta(totals.active_seconds, previous?.active_seconds, period, {
        formatDifference: formatDuration,
        formatPrevious: formatDuration,
      }),
    },
    {
      label: 'Нових слів почато',
      value: String(totals.new_words),
      delta: formatDelta(totals.new_words, previous?.new_words, period),
    },
    {
      label: 'Слів вивчено',
      value: String(totals.learned_words),
      delta: formatDelta(totals.learned_words, previous?.learned_words, period),
    },
    {
      label: 'Помилок',
      value: String(totals.mistakes),
      delta: formatDelta(totals.mistakes, previous?.mistakes, period),
    },
    {
      label: 'Фраз повторено',
      value: String(totals.phrase_answers),
      delta: formatDelta(totals.phrase_answers, previous?.phrase_answers, period),
    },
    {
      label: 'Тренування',
      value: String(totals.drill_answers ?? 0),
      delta: formatDelta(totals.drill_answers ?? 0, previous ? previous.drill_answers ?? 0 : null, period),
    },
  ];
  // A single day is practised or not, so its count of days says nothing.
  if (period !== 'day') {
    tiles.splice(3, 0, {
      label: 'Днів з практикою',
      value: String(totals.days_practised),
      delta: formatDelta(totals.days_practised, previous?.days_practised, period),
    });
  }
  return tiles;
}

const CHART_TITLES = Object.freeze({
  hour: 'Відповіді за годинами',
  day: 'Відповіді за днями',
  month: 'Відповіді за місяцями',
});

// The bars of the chart: height as a share of the tallest bar, a sparse axis label (so labels never collide), and the
// detail line a tap shows.
export function buildChartView(chart, period) {
  const maximum = Math.max(1, ...chart.buckets.map(bucket => bucket.answers));
  const labelEvery = chooseLabelStep(chart.unit, chart.buckets.length);
  const bars = chart.buckets.map((bucket, index) => {
    const name = formatBucketName(bucket.key, chart.unit);
    const isLabelled = index % labelEvery === 0;
    return {
      key: bucket.key,
      heightPercent: Math.round((bucket.answers / maximum) * 100),
      label: isLabelled ? formatBucketLabel(bucket.key, chart.unit, period) : '',
      detail: `${name}: ${bucket.answers} ${pluralize(bucket.answers, ANSWER_WORDS)}`
        + (bucket.drill_answers ? ` (тренування: ${bucket.drill_answers})` : '')
        + ` · ${bucket.mistakes} ${pluralize(bucket.mistakes, ['помилка', 'помилки', 'помилок'])}`
        + ` · ${formatDuration(bucket.active_seconds)}`,
    };
  });
  return { title: CHART_TITLES[chart.unit], bars, isEmpty: chart.buckets.every(bucket => bucket.answers === 0) };
}

function chooseLabelStep(unit, count) {
  if (unit === 'hour') return 6;
  if (unit === 'day') return count <= 7 ? 1 : 7;
  return count <= 12 ? (count <= 6 ? 1 : 3) : Math.ceil(count / 4);
}

// Week bars are named by weekday; month-long ones by date; hours and months as they are.
function formatBucketLabel(key, unit, period) {
  if (unit === 'hour') return `${key}:00`;
  if (unit === 'month') return MONTH_SHORT_NAMES[Number(key.split('-')[1]) - 1];
  const [year, month, day] = key.split('-').map(Number);
  if (period === 'week') return WEEKDAY_SHORT_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${day}.${String(month).padStart(2, '0')}`;
}

function formatBucketName(key, unit) {
  if (unit === 'hour') return `${key}:00–${key}:59`;
  if (unit === 'day') return formatCalendarDate(key);
  const [year, month] = key.split('-').map(Number);
  return `${MONTH_SHORT_NAMES[month - 1]} ${year}`;
}

export function buildStreakTiles(streak) {
  return [
    {
      label: 'Зараз',
      value: `${streak.current} ${pluralize(streak.current, DAY_WORDS)}`,
      delta: streak.is_today_practised ? 'сьогодні вже є ✓' : 'сьогодні ще ні',
    },
    { label: 'Найдовша', value: `${streak.longest} ${pluralize(streak.longest, DAY_WORDS)}`, delta: null },
  ];
}

export function formatHardestWord(word) {
  const dutch = word.article ? `${word.article} ${word.nl}` : word.nl;
  return `${dutch} — ${word.uk}: ${word.mistakes} ${pluralize(word.mistakes, ['помилка', 'помилки', 'помилок'])} `
    + `з ${word.answers}`;
}

// The vocabulary right now, from GET /api/stats. A word counts as learned for good once its next review is 21+ days
// away (learned_threshold_days), so a word learned in a session today is still being repeated.
export function buildOverviewTiles(stats) {
  return [
    { label: 'Усього слів', value: String(stats.words.total), delta: null },
    { label: 'Запам’ятовано надовго', value: String(stats.words.learned), delta: 'повтор через 21+ днів' },
    { label: 'Ще повторюю', value: String(stats.words.learning), delta: null },
    { label: 'Ще не почато', value: String(stats.words.new), delta: null },
    { label: 'Фраз', value: String(stats.phrases), delta: null },
    { label: 'Повторити сьогодні', value: String(stats.fsrs.due_today), delta: null },
  ];
}

// ---------- word-order exercise («Порядок слів») ----------

// The pile holds the shuffled tiles; a tile keeps its place in the pile while it is used. answer lists pile indexes in
// the order the learner tapped them. Every function returns a new state; the old one is not changed.
export function createWordOrderState(tiles) {
  return {
    pile: tiles.map((text, index) => ({ index, text, used: false })),
    answer: [],
  };
}

// Tapping a pile tile moves it to the end of the answer line. A used or unknown tile changes nothing.
export function placeTile(state, index) {
  const tile = state.pile[index];
  if (!tile || tile.used) return state;
  return {
    pile: state.pile.map(item => (item.index === index ? { ...item, used: true } : item)),
    answer: [...state.answer, index],
  };
}

// Tapping a tile in the answer line sends it back to its place in the pile. A bad position changes nothing.
export function returnTile(state, answerPosition) {
  if (!Number.isInteger(answerPosition) || answerPosition < 0 || answerPosition >= state.answer.length) return state;
  const pileIndex = state.answer[answerPosition];
  return {
    pile: state.pile.map(item => (item.index === pileIndex ? { ...item, used: false } : item)),
    answer: state.answer.filter((_, position) => position !== answerPosition),
  };
}

// The Dutch words of the answer line, left to right (what the server checks).
export function readAnswerTiles(state) {
  return state.answer.map(pileIndex => state.pile[pileIndex].text);
}

// "Речення 3 з 10" (position is 1-based).
export function formatWordOrderProgress(position, total) {
  return `Речення ${position} з ${total}`;
}

// "Готово: 8 з 10 правильно".
export function formatWordOrderSummary(correctCount, total) {
  return `Готово: ${correctCount} з ${total} правильно`;
}

// The line under the Ukrainian sentence: the word order the sentence expects, e.g. «Форма: Інверсія». Empty for a
// sentence without a rule.
export function formatExpectedFormLabel(rule) {
  return rule ? `Форма: ${ruleLabel(rule)}` : '';
}

// The feedback after «Перевірити» (spec §9.4). message and tone (ok | bad) are the line under the answer.
// mainOrderLine: «Основний варіант: …» when the learner found another accepted order (matched_order > 0), else null.
// otherOrders: the accepted orders after the canonical one, shown when the answer is wrong and has_other_orders is
// set (otherOrdersTitle names them); empty otherwise. orders are tile strings from the server, canonical first.
export function buildWordOrderCheckView({
  is_correct: isCorrect,
  correct_nl: correctNl,
  matched_order: matchedOrder,
  orders = [],
  has_other_orders: hasOtherOrders = false,
}) {
  const list = Array.isArray(orders) ? orders : [];
  if (isCorrect) {
    const isAlternative = Number.isInteger(matchedOrder) && matchedOrder > 0 && list.length > 0;
    return {
      message: 'Правильно ✓',
      tone: 'ok',
      // correct_nl is the canonical sentence with its punctuation; orders are bare tile strings.
      mainOrderLine: isAlternative ? `Основний варіант: ${correctNl}` : null,
      otherOrdersTitle: null,
      otherOrders: [],
    };
  }
  const others = hasOtherOrders ? list.slice(1) : [];
  return {
    message: `Правильно: ${correctNl}`,
    tone: 'bad',
    mainOrderLine: null,
    otherOrdersTitle: others.length ? 'Є й інші правильні варіанти:' : null,
    otherOrders: others,
  };
}

// The muted «також: …» lines under a sentence in the list, one per alternative order (spec §9.4).
export function buildAlsoOrderLines(altOrders) {
  if (!Array.isArray(altOrders)) return [];
  return altOrders.filter(order => typeof order === 'string' && order.trim()).map(order => `також: ${order}`);
}

// The muted «хибні форми: gaat, ga» line under a sentence in the list, or null when it has none.
export function formatWrongFormsLine(wrongForms) {
  if (!Array.isArray(wrongForms)) return null;
  const forms = wrongForms.filter(form => typeof form === 'string' && form.trim()).map(form => form.trim());
  return forms.length ? `хибні форми: ${forms.join(', ')}` : null;
}

// "✓ 3 / 4" for a sentence answered four times, three of them right; "ще не відповідали" before the first answer.
export function formatSentenceStats({ times_answered: answered = 0, times_correct: correct = 0 }) {
  if (!answered) return 'ще не відповідали';
  return `✓ ${correct} / ${answered}`;
}

// "Додано 3, пропущено 1" and, when the table had bad rows, "; рядків з помилками: 2".
// The result of an import or of generation: { added, updated, skipped, warnings, errors? }. The updated and the
// warned counts appear only when there are some.
export function formatImportResult({ added = [], updated = [], skipped = [], warnings = [], errors = [] }) {
  const parts = [`Додано ${added.length}, пропущено ${skipped.length}`];
  if (updated.length) parts.push(`оновлено ${updated.length}`);
  if (warnings.length) parts.push(`схем відкинуто ${warnings.length}`);
  if (errors.length) parts.push(`рядків з помилками: ${errors.length}`);
  return parts.join('; ');
}

// The keyboard focus after a pile tile is placed: the pile tile at the same pile index if it is still free, else the
// next free one after it, else «Перевірити».
export function chooseFocusAfterPlace(state, pileIndex) {
  const free = state.pile.find(tile => !tile.used && tile.index >= pileIndex);
  return free ? { kind: 'pile', index: free.index } : { kind: 'check' };
}

// The keyboard focus after an answer tile goes back to the pile: the answer tile now at its position, else the last
// one, else the first free pile tile (null when there is none).
export function chooseFocusAfterReturn(state, position) {
  if (position < state.answer.length) return { kind: 'answer', position };
  if (state.answer.length) return { kind: 'answer', position: state.answer.length - 1 };
  return chooseFirstPileFocus(state);
}

// The first free pile tile: where the focus goes at the start of a sentence (null when there is none).
export function chooseFirstPileFocus(state) {
  const free = state.pile.find(tile => !tile.used);
  return free ? { kind: 'pile', index: free.index } : null;
}

// A sentence skipped (or deleted meanwhile) leaves the set; index keeps pointing at the next one, past the end when
// none is left. Nothing is counted for it.
export function skipSentenceInSet({ sentences, index }) {
  const rest = sentences.filter((_, position) => position !== index);
  return { sentences: rest, index: Math.min(index, rest.length) };
}

// ---------- word-order rule filter and sentence schema (spec §8) ----------

// The rules of the filter in dropdown order; «none» is the sentences without a rule.
export const WORD_ORDER_RULES = Object.freeze(['v2', 'inversion', 'question', 'modal', 'separable', 'negation', 'subordinate', 'perfect', 'none']);

// The Ukrainian names of the rules (§8.2).
export const RULE_LABELS = Object.freeze({
  v2: 'Дієслово на 2-му місці',
  inversion: 'Інверсія',
  question: 'Питання',
  modal: 'Модальне дієслово + інфінітив',
  separable: 'Відокремлювані дієслова',
  negation: 'niet / geen',
  subordinate: 'Підрядне речення',
  perfect: 'Минулий час (perfectum)',
  none: 'Без правила',
});

// The name of a rule as shown on the page; null means no rule. An unknown name is shown as it is.
export function ruleLabel(rule) {
  const key = rule ?? 'none';
  return Object.hasOwn(RULE_LABELS, key) ? RULE_LABELS[key] : String(rule);
}

// The summary of the dropdown: «Правила: усі» when every rule is chosen, else «Правила: 3 з 9».
export function formatRuleFilterSummary(selected, all = WORD_ORDER_RULES) {
  const chosen = all.filter(rule => selected.includes(rule));
  if (chosen.length === all.length) return 'Правила: усі';
  return `Правила: ${chosen.length} з ${all.length}`;
}

// The value of the rules parameter of GET /word-order/set: the chosen rules in the order of all, comma-separated.
// '' when every rule is chosen (the parameter is then left out) and when none is (the caller makes no request then).
export function buildRulesQuery(selected, all = WORD_ORDER_RULES) {
  const chosen = all.filter(rule => selected.includes(rule));
  if (!chosen.length || chosen.length === all.length) return '';
  return chosen.join(',');
}

// Whether a fetched word-order result is applied. A replace (rule change, «Ще 10») applies unless a newer replace is
// already applied, so a live refresh that resolved first does not drop it. A live refresh applies only when it is newer
// than everything applied and than the latest requested replace (its rules may be the old ones).
export function shouldApplyFetch({ fetchNo, replace, appliedFetch, appliedReplace, pendingReplace }) {
  if (replace) return fetchNo > appliedReplace;
  return fetchNo > appliedFetch && fetchNo > pendingReplace;
}

// The rules kept in localStorage, read back. Missing or unreadable text means all rules; unknown names are dropped.
export function parseStoredRules(text, all = WORD_ORDER_RULES) {
  if (typeof text !== 'string') return [...all];
  let parsed;
  try { parsed = JSON.parse(text); } catch { return [...all]; }
  if (!Array.isArray(parsed)) return [...all];
  return all.filter(rule => parsed.includes(rule));
}

// The schema as text: "час > дієслово > підмет > прикметник"; '' when there is no schema.
export function formatStructureLine(structure) {
  if (!Array.isArray(structure)) return '';
  return structure.map(segment => segment.role).join(' > ');
}

// The colour group of a schema role (the roles of §8.1 and «частка», which shares the adverbial colour; any other
// role is «other»).
const ROLE_COLOUR_GROUPS = Object.freeze({
  subject: ['підмет'],
  verb: ['дієслово', 'модальне дієслово', 'допоміжне дієслово', 'інфінітив', 'дієприкметник', 'відокремлювана частина'],
  object: ['додаток'],
  adverbial: ['час', 'місце', 'спосіб', 'причина', 'частка'],
  negation: ['заперечення'],
  connector: ['сполучник', 'питальне слово'],
  adjective: ['прикметник'],
});

// The CSS class of a role's colour: role-subject, role-verb, …, role-other.
export function roleColourClass(role) {
  const name = String(role ?? '').trim().toLowerCase();
  for (const [group, roles] of Object.entries(ROLE_COLOUR_GROUPS)) {
    if (roles.includes(name)) return `role-${group}`;
  }
  return 'role-other';
}

// ---------- decks («Колоди») ----------

// The picker's search form of a text: accents removed from Latin letters only, lower case, typographic apostrophes as ',
// spaces collapsed. "Café" and "cafe" compare equal; Ukrainian й and ї stay distinct from и and і (NFD would split them
// into и + breve and і + diaeresis, so Cyrillic is never decomposed).
export function foldSearchText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\p{Script=Latin}/gu, letter => letter.normalize('NFD').replace(/\p{M}/gu, ''))
    .toLowerCase()
    .replace(/[’‘ʼ`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// The difficulty bucket of a catalog word: its difficulty, or 'new' when it was never answered.
function catalogBucket(word) {
  return word.difficulty ?? 'new';
}

// The picker's filter: the chosen bucket (all | hard | medium | easy | new | selected) and the search text, matched
// against the article, the Dutch word and the Ukrainian translation. selectedIds: a Set or an array of ids.
// Returns the matching words in their given order; the words are not changed.
export function filterCatalog({ words, query = '', filter = 'all', selectedIds = [] }) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const needle = foldSearchText(query);
  return words.filter(word => {
    if (filter === 'selected') {
      if (!selected.has(word.id)) return false;
    } else if (filter !== 'all' && catalogBucket(word) !== filter) {
      return false;
    }
    if (!needle) return true;
    return foldSearchText(`${word.article ?? ''} ${word.nl} ${word.uk}`).includes(needle);
  });
}

const DIFFICULTY_RANK = Object.freeze({ hard: 3, medium: 2, easy: 1 });

// The picker's order, as a new array. alpha: by the Dutch word. hardest: hard, medium, easy, then new words; within a
// bucket the most mistakes first. stale: the longest without practice first (never practised first), then by the word.
export function sortCatalog(words, sort = 'alpha') {
  // The folded Dutch word is computed once per word, not once per comparison.
  const entries = words.map(word => ({ word, nl: foldSearchText(word.nl) }));
  const byWord = (a, b) => a.nl.localeCompare(b.nl) || (a.word.id - b.word.id);
  const compare = {
    hardest: (a, b) => (DIFFICULTY_RANK[b.word.difficulty] ?? 0) - (DIFFICULTY_RANK[a.word.difficulty] ?? 0)
      || (b.word.mistake_count ?? 0) - (a.word.mistake_count ?? 0)
      || byWord(a, b),
    stale: (a, b) => {
      const aDate = a.word.last_practiced_on ?? '';
      const bDate = b.word.last_practiced_on ?? '';
      if (aDate !== bDate) return aDate < bDate ? -1 : 1;   // '' (never) sorts first
      return byWord(a, b);
    },
  }[sort] ?? byWord;
  return entries.sort(compare).map(entry => entry.word);
}

// "востаннє: 28.10" for a date this year, "востаннє: 28.10.2025" for an earlier year, "ще не практиковано" for none.
// date and today are 'YYYY-MM-DD' (today is the practice calendar date).
export function formatLastPracticed(date, today) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  if (!match) return 'ще не практиковано';
  const todayYear = /^(\d{4})-/.exec(String(today ?? ''))?.[1];
  const day = `${match[3]}.${match[2]}`;
  return `востаннє: ${match[1] === todayYear ? day : `${day}.${match[1]}`}`;
}

// "1 слово", "2 слова", "5 слів", "11 слів", "21 слово".
export function formatDeckWordCount(count) {
  return `${count} ${pluralize(count, ['слово', 'слова', 'слів'])}`;
}

// "de huis — будинок" (the article first when the word has one).
export function formatDeckWordLabel(word) {
  const dutch = word.article ? `${word.article} ${word.nl}` : word.nl;
  return `${dutch} — ${word.uk}`;
}

// The badge text of a catalog word: легко | середньо | важко, «нове» when it was never answered.
export function formatDifficultyLabel(difficulty) {
  return difficulty ? DIFFICULTY_LABELS[difficulty] : 'нове';
}

// The selection model: each function returns a new Set and leaves the given one unchanged.
export function toggleSelected(selected, id) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function selectVisible(selected, visibleIds) {
  const next = new Set(selected);
  for (const id of visibleIds) next.add(id);
  return next;
}

export function clearSelected() {
  return new Set();
}

// The sticky bar's count: "Обрано: 3".
export function formatSelectedCount(count) {
  return `Обрано: ${count}`;
}

// ---------- Сад layout: bottom navigation and home (docs/GARDEN_LAYOUT.md) ----------

// The bottom-bar item each tab belongs to: home tiles under Головна, the Профіль links under Профіль.
export const NAVIGATION_SECTION_FOR_TAB = Object.freeze({
  home: 'home',
  cards: 'home',
  'word-order': 'home',
  phrases: 'home',
  decks: 'decks',
  practice: 'practice',
  stats: 'stats',
  profile: 'profile',
  table: 'profile',
  rules: 'profile',
  texts: 'profile',
});

export function findNavigationSection(tab) {
  return NAVIGATION_SECTION_FOR_TAB[tab] ?? 'home';
}

// The home screen's numbers. words: the word list (status, due_at); now: milliseconds. The bar shows started words.
export function buildHomeSummary({ words = [], phraseCount = 0, now }) {
  const dueCount = words.filter(word => word.due_at != null && word.due_at <= now && word.status !== 'new').length;
  const learningCount = words.filter(word => word.status === 'learning').length;
  // Started = left the «new» status. (Статистика's «Слів вивчено» counts finished learning decks, a different measure.)
  const startedCount = words.filter(word => word.status !== 'new').length;
  const startedPercent = words.length ? Math.round((startedCount / words.length) * 100) : 0;
  return {
    line: `До повторення: ${dueCount} · вчу: ${learningCount}`,
    startedPercent,
    progressLabel: `Почато ${startedCount} з ${words.length} слів · ${startedPercent}%`,
    cardsLine: formatWordTotal(words.length),
    phrasesLine: `${phraseCount} ${pluralize(phraseCount, ['фраза', 'фрази', 'фраз'])}`,
  };
}

export function formatWordTotal(count) {
  return `${count} ${pluralize(count, ['слово', 'слова', 'слів'])}`;
}

// The Важкі слова tile: null while the count is unknown (not read yet, or the read failed).
export function formatStrugglingTileLine(count) {
  if (count == null) return 'Тренування без оцінок';
  return count ? formatWordTotal(count) : 'Немає важких слів';
}

// The word sheet on Слова: what each row shows. word: one word of the list.
export function buildWordDetailView(word) {
  const details = [
    ['Статус', formatLearningStatus(word.status)],
    ['Наступне повторення', formatShortDate(word.next_due_on) || '—'],
    ['Помилок', String(word.error_count ?? 0)],
  ];
  if (word.section) details.push(['Глава', word.section]);
  if (word.topic) details.push(['Тема', word.topic]);
  return {
    article: word.article || '',
    dutch: word.nl,
    translation: word.uk,
    exampleDutch: word.example_nl || '',
    exampleUkrainian: word.example_uk || '',
    details,
  };
}

// The practice progress bar: share of the set already done, from the words still queued and the most queued so far.
export function computeQueueProgressPercent(queueLength, peakQueueLength) {
  if (!peakQueueLength) return 0;
  return Math.round(((peakQueueLength - queueLength) / peakQueueLength) * 100);
}
