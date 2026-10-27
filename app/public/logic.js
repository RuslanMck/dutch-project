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

// The struggling-words drill ("Важкі слова"): the front word leaves the queue when it is typed right (grade good);
// any other answer sends it to the end. Returns a new queue; the one passed in is not changed.
export function advanceDrillQueue(queue, grade) {
  if (!queue.length) return [];
  const [answeredWord, ...restOfQueue] = queue;
  return grade === 'good' ? restOfQueue : [...restOfQueue, answeredWord];
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
