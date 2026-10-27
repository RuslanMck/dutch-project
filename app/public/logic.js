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

// Form of an answer used for comparison: normalise, typographic quotes -> ', punctuation dropped, spaces collapsed.
// "hoe gaat het?" and "hoe gaat het" compare equal; "'s ochtends" and "’s ochtends" too.
export function normalizeAnswerText(value) {
  return normalise(value)
    .replace(/[’‘]/g, "'")
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

// The "Хочете ще 10 нових слів?" button of the practice summary: only while the gate is open and New words remain
// today.
export function canOfferExtraNewWords({ newWordsBlocked, newRemainingByPriority }) {
  const newRemainingCount = Object.values(newRemainingByPriority ?? {}).reduce((total, count) => total + count, 0);
  return newWordsBlocked !== true && newRemainingCount > 0;
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

// The struggling-words drill ("Важкі слова"): the front word leaves the queue when it is typed right (grade good);
// any other answer sends it back into the active window (advanceWindowedQueue, same options).
export function advanceDrillQueue(queue, grade, options) {
  return advanceWindowedQueue(queue, grade === 'good', options);
}

// The button under the FSRS summary that starts the drill with this many words.
export function formatStrugglingDrillButton(wordCount) {
  return `Потренувати важкі слова (${wordCount})`;
}

// The end of the struggling-words drill: how many of the words it started with were right at the first check.
export function buildStrugglingDrillEnd({ correctFirstTimeCount, totalCount }) {
  return {
    resultText: `Тренування завершено: правильно з першого разу ${correctFirstTimeCount} з ${totalCount}.`,
    noteText: 'Це тренування не змінює розклад слів.',
  };
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

// The line under the practice message, from a grade_word result: the right answers the word still needs in this
// session, the word learned just now (0 left), or a review answered right (it leaves the session).
export function buildDeckLine({ deck, intervalDays }) {
  if (deck?.has_learned) return `Вивчено ✓ — наступне повторення: ${formatDaysAway(intervalDays)}`;
  if (deck?.in_deck) return `Повторень до вивчення: ${deck.times_left}`;
  return `Повторено ✓ — наступне повторення: ${formatDaysAway(intervalDays)}`;
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
    detail: `відповідей: ${word.answer_count} · ${word.mistake_count} ${pluralize(word.mistake_count, MISTAKE_WORDS)}`,
  }));
  return { title: 'Вітаємо! Усі нові слова вивчено 🎉', stats, hardestText, words };
}

function formatDutch(word) {
  return word.article ? `${word.article} ${word.nl}` : word.nl;
}

// ---------- statistics page ----------

export const TAB_TITLES = Object.freeze({
  practice: 'Практика',
  cards: 'Картки',
  phrases: 'Фрази',
  table: 'Таблиця',
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
      detail: `${name}: ${bucket.answers} ${pluralize(bucket.answers, ANSWER_WORDS)} · ${bucket.mistakes} `
        + `${pluralize(bucket.mistakes, ['помилка', 'помилки', 'помилок'])} · ${formatDuration(bucket.active_seconds)}`,
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
