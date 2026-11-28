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
// too; "імʼя" and "ім'я" too. Dashes (– — ‑ −) -> -, so "klein - kleiner" typed on a phone matches "klein – kleiner".
export function normalizeAnswerText(value) {
  return normalise(value)
    .replace(/[’‘ʼ`]/g, "'")
    .replace(/[‐‑‒–—―−]/g, '-')
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
        message: `Слово правильне, але артикль: ✗ → ✓ (${typedArticle} → ${rightArticle})`,
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
// Returns { counted, grade, message }. grade is 'good' (the word with its de/het), 'hard' (one
// letter off) or 'again' (anything else, including "DNK"). counted=false means nothing is graded.
// The article is required: the right word with a missing or wrong de/het is 'again', and the message says which.
// A spelling slip counts as 'hard' only with the right article. Punctuation, typographic quotes and extra spaces are ignored on both sides (normalizeAnswerText).
// The meanings of a Ukrainian translation: split on , and ;, with notes in brackets left out. «брати, замовляти (розм.)»
// -> ['брати', 'замовляти'].
export function splitTranslationMeanings(uk) {
  return String(uk ?? '').replace(/\([^)]*\)/g, ' ').split(/[,;]/).map(normalizeAnswerText).filter(Boolean);
}

// UA -> NL: the learner typed another dictionary word that shares a meaning with the asked one («heerlijk» for lekker,
// both «смачний»). Returns { word, meaning } for that word, or null. The article is optional here: it is only a hint.
export function findSameMeaningWord(word, input, words = []) {
  const normalizedInput = normalizeAnswerText(input);
  if (!normalizedInput) return null;
  const askedMeanings = new Set(splitTranslationMeanings(word.uk));
  for (const other of words) {
    if (other.id === word.id) continue;
    const typedForms = [other.nl, formatDutchWithArticle(other)].map(normalizeAnswerText);
    if (!typedForms.includes(normalizedInput)) continue;
    const meaning = splitTranslationMeanings(other.uk).find(otherMeaning => askedMeanings.has(otherMeaning));
    if (meaning) return { word: other, meaning };
  }
  return null;
}

export function gradeTranslationAnswer(word, input, { words = [] } = {}) {
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

  // A word without an article typed with one is simply right; a de/het word needs its own article.
  const isArticleRight = article === '' || typedArticle === article;
  const articleMessage = typedArticle ? '✗ Не той артикль' : '✗ Потрібен артикль';
  if (rest === normalizedTarget) {
    if (isArticleRight) return { counted: true, grade: 'good', message: '✓ Правильно' };
    return { counted: true, grade: 'again', message: `${articleMessage}. Правильно: ${right}` };
  }

  // Another word with the same meaning is not a mistake: nothing is graded and the learner tries again.
  const sameMeaning = findSameMeaningWord(word, input, words);
  if (sameMeaning) {
    return {
      counted: false,
      grade: null,
      isSameMeaning: true,
      message: `«${formatDutchWithArticle(sameMeaning.word)}» теж «${sameMeaning.meaning}», але тут інше слово — спробуй ще`,
    };
  }

  // Both readings are compared, so an expression that starts with de or het is not cut before the comparison.
  const distance = Math.min(levenshtein(rest, normalizedTarget), levenshtein(normalizedInput, normalizedTarget));
  if (distance <= 1 && isArticleRight) {
    return { counted: true, grade: 'hard', message: `Майже, перевір літери. Правильно: ${right}` };
  }
  if (distance <= 1) return { counted: true, grade: 'again', message: `${articleMessage}, і перевір літери. Правильно: ${right}` };
  return { counted: true, grade: 'again', message: `✗ Правильно: ${right}` };
}

// The meanings of a translation may be typed in any order («що за, який» for «який, що за»), with or without the
// commas, but the words inside one meaning keep their order: «який, за що» is wrong. Every meaning must be there once.
const MAX_MEANINGS_TO_PERMUTE = 6;
export function hasSameMeaningsInAnyOrder(uk, input) {
  const meanings = splitTranslationMeanings(uk);
  const normalizedInput = normalizeAnswerText(input);
  if (meanings.length < 2 || !normalizedInput) return false;
  if (meanings.length > MAX_MEANINGS_TO_PERMUTE) {
    const typedMeanings = splitTranslationMeanings(input);
    return typedMeanings.length === meanings.length && [...typedMeanings].sort().join('|') === [...meanings].sort().join('|');
  }
  const matchesFrom = (rest, remaining) => {
    if (!remaining.length) return rest === '';
    return remaining.some((meaning, index) => {
      if (rest !== meaning && !rest.startsWith(`${meaning} `)) return false;
      return matchesFrom(rest.slice(meaning.length).trimStart(), remaining.filter((_, other) => other !== index));
    });
  };
  return matchesFrom(normalizedInput, meanings);
}

// «Не знаю» in the reverse round (the Dutch is shown, the Ukrainian is wanted): the right answer is shown, graded again.
export function revealReverseTranslationAnswer(word) {
  return { counted: true, grade: 'again', message: `✗ Правильно: ${word.uk}` };
}

// Reverse round (19.6): the learner types the Ukrainian for a Dutch word. Only the same text after normalizeAnswerText
// is right, with or without the notes in brackets; there is no fuzzy match. A wrong answer is 'again' with canOverride: the learner may still say it was right
// («Я мав рацію»), and the client holds the grade until then or until «Далі».
export function gradeReverseTranslationAnswer(word, input) {
  const normalizedInput = normalizeAnswerText(input);
  if (!normalizedInput) return { counted: false, grade: null, message: 'Напиши відповідь українською' };
  if (normalizedInput === 'dnk') return revealReverseTranslationAnswer(word);
  // Notes in brackets («смачний (звичайне слово)») only guide the learner; the answer may leave them out.
  const acceptedAnswers = [word.uk, String(word.uk ?? '').replace(/\([^)]*\)/g, ' ')].map(normalizeAnswerText);
  if (acceptedAnswers.includes(normalizedInput) || hasSameMeaningsInAnyOrder(word.uk, input)) {
    return { counted: true, grade: 'good', message: '✓ Правильно' };
  }
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

// ---------- form decks (ready-made decks of word forms, e.g. the personal pronouns) ----------
// A form deck pairs two forms of the same word (subject and object form). It is drilled as a custom drill: round 1
// shows the first form and wants the second, round 2 the other way round. The drill keeps its direction keys
// (uk_nl = first → second, nl_uk = second → first); the cards are not dictionary words, so nothing is logged.

export const FORM_DECKS = Object.freeze([
  Object.freeze({
    id: 'personal-pronouns',
    name: 'Займенники: підмет і додаток',
    description: 'ik → mij / me, потім навпаки. Особові займенники з таблиці підручника.',
    roundNames: Object.freeze({ uk_nl: 'підмет → додаток', nl_uk: 'додаток → підмет' }),
    cards: Object.freeze([
      { first: 'ik', second: 'mij / me', firstHint: 'я', secondHint: 'мене, мені' },
      { first: 'jij / je', second: 'jou / je', firstHint: 'ти', secondHint: 'тебе, тобі' },
      { first: 'u', second: 'u', firstHint: 'Ви (ввічливо)', secondHint: 'Вас, Вам (ввічливо)' },
      { first: 'hij', second: 'hem', firstHint: 'він', secondHint: 'його, йому' },
      { first: 'zij / ze', second: 'haar', firstHint: 'вона', secondHint: 'її, їй' },
      { first: 'het', second: 'het', firstHint: 'воно', secondHint: 'його, йому (воно)' },
      { first: 'wij / we', second: 'ons', firstHint: 'ми', secondHint: 'нас, нам' },
      { first: 'jullie', second: 'jullie', firstHint: 'ви', secondHint: 'вас, вам' },
      { first: 'zij / ze', second: 'hen / ze / hun', firstHint: 'вони', secondHint: 'їх, їм' },
    ]),
  }),
]);

// «9 пар форм» on the deck card.
export function formatFormDeckCount(count) {
  return `${count} ${pluralize(count, ['пара', 'пари', 'пар'])} форм`;
}

export function findFormDeck(id) {
  return FORM_DECKS.find(deck => deck.id === id) ?? null;
}

// The drill's cards: one per pair, with an id unique across the form decks.
export function buildFormDrillWords(deck) {
  return deck.cards.map((card, index) => ({ id: `${deck.id}:${index + 1}`, ...card }));
}

// The forms of one side: «mij / me» -> ['mij', 'me'].
export function splitForms(text) {
  return String(text ?? '').split('/').map(normalizeAnswerText).filter(Boolean);
}

function findFormSides(word, direction) {
  return direction === 'uk_nl'
    ? { asked: word.first, askedHint: word.firstHint, wanted: word.second }
    : { asked: word.second, askedHint: word.secondHint, wanted: word.first };
}

// The question: the asked form and its Ukrainian meaning, «ik — я», so the two «zij / ze» rows differ.
export function formatFormQuestion(word, direction) {
  const { asked, askedHint } = findFormSides(word, direction);
  return askedHint ? `${asked} — ${askedHint}` : asked;
}

export function revealFormAnswer(word, direction) {
  return { counted: true, grade: 'again', message: `✗ Правильно: ${findFormSides(word, direction).wanted}` };
}

// Every wanted form must be typed, in any order, split by /, comma, semicolon or a space («mij / me», «me mij»). One
// form missing is wrong too, and the message names it. No fuzzy match: the forms are short and one letter changes them.
export function gradeFormAnswer(word, direction, input) {
  const { wanted } = findFormSides(word, direction);
  const forms = splitForms(wanted);
  const typed = [...new Set(String(input ?? '').split(/[^\p{L}\p{N}']+/u).map(normalizeAnswerText).filter(Boolean))];
  if (!typed.length) return { counted: false, grade: null, message: 'Напиши форму нідерландською' };
  if (typed.length === 1 && typed[0] === 'dnk') return revealFormAnswer(word, direction);
  const isEveryTypedRight = typed.every(form => forms.includes(form));
  const missing = forms.filter(form => !typed.includes(form));
  if (isEveryTypedRight && !missing.length) return { counted: true, grade: 'good', message: '✓ Правильно' };
  if (isEveryTypedRight) {
    const missingText = missing.map(form => `«${form}»`).join(', ');
    return { counted: true, grade: 'again', message: `✗ Не всі форми, бракує ${missingText}. Правильно: ${wanted}` };
  }
  return { counted: true, grade: 'again', message: `✗ Правильно: ${wanted}` };
}

// The input's placeholder in a form drill: every form is wanted.
export const FORM_DRILL_PLACEHOLDER = 'усі форми через / або пробіл';

// "Займенники · Раунд 1 з 2 · підмет → додаток · Залишилось: 7"
export function formatFormDrillProgress({ title, deck, direction, queueLength }) {
  const roundNumber = ROUND_DIRECTIONS.indexOf(direction) + 1;
  return `${title} · Раунд ${roundNumber} з ${ROUND_DIRECTIONS.length} · ${deck.roundNames[direction]} · `
    + formatQueueProgress(queueLength);
}

export function formatFormRoundStart(deck, direction) {
  return `Раунд ${ROUND_DIRECTIONS.indexOf(direction) + 1}: ${deck.roundNames[direction]}`;
}

export function buildFormDrillEnd({ deck, firstTry, total }) {
  const { uk_nl: first, nl_uk: second } = deck.roundNames;
  return {
    resultText: `Готово! Правильно з першого разу: ${first} ${firstTry.uk_nl} з ${total} · `
      + `${second} ${firstTry.nl_uk} з ${total}.`,
    noteText: 'Тренування форм — розклад слів не змінюється.',
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

// The «Повторити ці слова» button under a Нові слова round: a drill of every word of the set, nothing graded. words: the
// set's words (round.words, or the words kept on the phone). Hidden when the set has no words.
export function buildRoundRepeatButton(words) {
  const wordIds = words.map(word => word.id);
  return {
    kind: 'all', title: 'Повторити ці слова', count: wordIds.length, wordIds, label: 'Повторити ці слова',
    hidden: wordIds.length === 0,
  };
}

// The round summary's next-set button: Нові слова asks for 10 more new words, Запам'ятовування for the next 10.
export function formatRoundNextLabel(kind) {
  return kind === 'review' ? 'Ще 10' : 'Ще 10 нових';
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
  // The list is folded by default; its summary line counts the words per difficulty («важко 1 · середньо 2 · легко 7»).
  const difficultyCounts = ['hard', 'medium', 'easy']
    .map(difficulty => [DIFFICULTY_LABELS[difficulty], words.filter(word => word.difficulty === difficulty).length])
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`);
  const wordsLabel = `Слова набору (${words.length})${difficultyCounts.length ? `: ${difficultyCounts.join(' · ')}` : ''}`;
  return { title: 'Вітаємо! Набір завершено 🎉', stats, hardestText, words, wordsLabel };
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
  'rule-quiz': 'Вправи з правил',
  table: 'Словник',
  rules: 'Правила',
  texts: 'Тексти',
  learn: 'Вчити',
  stats: 'Прогрес',
  week: 'Тиждень у підсумку',
  achievements: 'Досягнення',
  'known-check': 'Що я вже знаю',
  settings: 'Налаштування',
});

// The line under the page title in the gold header (Головна has its own greeting).
export const TAB_SUBTITLES = Object.freeze({
  home: 'Що вчимо сьогодні?',
  profile: 'Слова, правила і тексти',
  practice: 'Переклад слів за розкладом',
  decks: 'Свої набори слів',
  cards: 'Гортай і згадуй',
  phrases: 'Фрази з діалогів',
  'word-order': 'Склади речення',
  'rule-quiz': 'Граматика в реченнях',
  table: 'Усі твої слова',
  rules: 'Граматика з номерами правил',
  texts: 'Тексти для читання',
  learn: 'Усі вправи в одному місці',
  stats: 'Як іде навчання',
  week: 'Твій тиждень коротко',
  achievements: 'Твої відзнаки',
  'known-check': 'Швидка перевірка слів',
  settings: 'Тема й кольори',
});

const PERIOD_RANGE_PREFIX = Object.freeze({
  day: 'Сьогодні',
  week: 'Цей тиждень',
  month: 'Останні 30 днів',
  year: 'Останні 12 місяців',
  all: 'Увесь час',
});
const PREVIOUS_PERIOD_NAME = Object.freeze({
  day: 'учора',
  week: 'минулий тиждень',
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

// "+10 · учора: 30", "−5 п.п. · минулий тиждень: 85%", "= · учора: 30"; null when there is nothing to compare with.
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

// The chapter of a catalog word's section, as the server reads it: the integer before the first dot ('8.2' → 8,
// '8' → 8); null for a word with no section or a section that is not a chapter ('Д1').
export function parseCatalogChapter(section) {
  const match = /^(\d+)(?:\.|$)/.exec(String(section ?? '').trim());
  return match ? Number(match[1]) : null;
}

// The picker's chapter choices for these words: the chapters they have, lowest first, then 'none' when some words
// have no chapter. Each choice is the select's value as text.
export function listCatalogChapters(words) {
  const chapters = new Set(words.map(word => parseCatalogChapter(word.section)));
  const numbers = [...chapters].filter(chapter => chapter !== null).sort((a, b) => a - b).map(String);
  return chapters.has(null) && numbers.length ? [...numbers, 'none'] : numbers;
}

// Whether a word belongs to the chosen chapter: 'all', a chapter number as text, or 'none' (words with no chapter).
function isInCatalogChapter(word, chapter) {
  if (chapter === 'all') return true;
  const wordChapter = parseCatalogChapter(word.section);
  return chapter === 'none' ? wordChapter === null : wordChapter === Number(chapter);
}

// The picker's filter: the chosen bucket (all | hard | medium | easy | new | selected), the chapter (see
// isInCatalogChapter) and the search text, matched against the article, the Dutch word and the Ukrainian translation.
// selectedIds: a Set or an array of ids. Returns the matching words in their given order; the words are not changed.
export function filterCatalog({ words, query = '', filter = 'all', chapter = 'all', selectedIds = [] }) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  const needle = foldSearchText(query);
  return words.filter(word => {
    if (!isInCatalogChapter(word, chapter)) return false;
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

// The bottom-bar section each tab belongs to (§1 of the navigation spec): the Словник, Вчити, Прогрес and Профіль
// sections group their own tabs; a tab that is not listed here lights Головна.
export const NAVIGATION_SECTION_FOR_TAB = Object.freeze({
  home: 'home',
  table: 'dictionary',
  rules: 'dictionary',
  texts: 'dictionary',
  learn: 'learn',
  practice: 'learn',
  cards: 'learn',
  decks: 'learn',
  phrases: 'learn',
  'word-order': 'learn',
  'rule-quiz': 'learn',
  'known-check': 'learn',
  stats: 'progress',
  week: 'progress',
  achievements: 'progress',
  profile: 'profile',
  settings: 'profile',
});

export function findNavigationSection(tab) {
  return NAVIGATION_SECTION_FOR_TAB[tab] ?? 'home';
}

// The exercise tabs run full screen: no bottom bar and no gold header, the ✕ bar at the top instead (§5).
export const EXERCISE_TABS = Object.freeze(['practice', 'cards', 'phrases', 'word-order', 'rule-quiz', 'known-check']);

export function isExerciseTab(tab) {
  return EXERCISE_TABS.includes(tab);
}

// The name of each practice mode: the exercise bar shows it while the Практика tab runs that mode.
export const PRACTICE_MODE_TITLES = Object.freeze({
  fsrs: 'Нові слова',
  review: 'Запам\'ятовування',
  art: 'Артикль',
  struggling: 'Важкі слова',
  custom: 'Тренування',
});

// The title of an exercise bar: the mode's name on the Практика tab, the tab's own title elsewhere.
export function formatExerciseTitle(tab, mode) {
  if (tab === 'practice') return PRACTICE_MODE_TITLES[mode] ?? 'Практика';
  return TAB_TITLES[tab] ?? '';
}

export function formatWordTotal(count) {
  return `${count} ${pluralize(count, ['слово', 'слова', 'слів'])}`;
}

// ---------- Вчити: the hub's cards and the resume strip ----------

// A daily set is 10 new words; the review time assumes 15 seconds per word.
export const LEARN_SET_SIZE = 10;
export const REVIEW_SECONDS_PER_WORD = 15;

// The minutes a review set takes: at least one minute, rounded to whole minutes. Zero when nothing is owed.
export function estimateReviewMinutes(count) {
  if (!(count > 0)) return 0;
  return Math.max(1, Math.round((count * REVIEW_SECONDS_PER_WORD) / 60));
}

// The daily set's size: the server's set_size when it came, else the 10 of the plan.
export function dailySetSize(setSize) {
  return Number.isFinite(setSize) && setSize > 0 ? setSize : LEARN_SET_SIZE;
}

// «Сьогодні 3 з 10 · 42 слова чекають». Unknown counts (not read yet, or the read failed) give «…».
export function formatLearnNewLine(introducedToday, newLeft, setSize = LEARN_SET_SIZE) {
  if (!Number.isFinite(introducedToday) || !Number.isFinite(newLeft)) return '…';
  const size = dailySetSize(setSize);
  return `Сьогодні ${Math.min(introducedToday, size)} з ${size} · ${formatWaitingWords(newLeft)}`;
}

// «42 слова чекають», «1 слово чекає», «5 слів чекають»; no new word left gives «нових слів не лишилось».
export function formatWaitingWords(count) {
  if (count <= 0) return 'нових слів не залишилося';
  return `${count} ${pluralize(count, ['слово', 'слова', 'слів'])} ${pluralize(count, ['чекає', 'чекають', 'чекають'])}`;
}

// The thin bar of the Нові слова card: today's words out of the set, never past full.
export function computeLearnNewPercent(introducedToday, setSize = LEARN_SET_SIZE) {
  if (!Number.isFinite(introducedToday)) return 0;
  return Math.min(100, Math.round((introducedToday / dailySetSize(setSize)) * 100));
}

// The pill of the Нові слова card: «Ще N» once today's set is full (N = the set size), «Почати» before.
export function formatLearnNewPill(introducedToday, setSize = LEARN_SET_SIZE) {
  const size = dailySetSize(setSize);
  return Number.isFinite(introducedToday) && introducedToday >= size ? `Ще ${size}` : 'Почати';
}

// True when today's daily set is full (the card shows «Зроблено»).
export function isLearnNewDone(introducedToday, setSize = LEARN_SET_SIZE) {
  return Number.isFinite(introducedToday) && introducedToday >= dailySetSize(setSize);
}

// «N слів на сьогодні · близько M хв», or «На сьогодні все повторено» when nothing is owed. Unknown gives «…».
export function formatLearnReviewLine(owed) {
  if (!Number.isFinite(owed)) return '…';
  if (owed <= 0) return 'На сьогодні все повторено';
  const minutes = estimateReviewMinutes(owed);
  return `${formatWordTotal(owed)} на сьогодні · близько ${minutes} хв`;
}

// The Важкі слова tile of Вчити: null (not read yet) gives «…».
export function formatLearnStrugglingLine(count) {
  if (!Number.isFinite(count)) return '…';
  return count > 0 ? formatWordTotal(count) : 'Немає важких слів';
}

// The Фрази tile: the phrases of today's set, or the plain name when the set is empty.
export function formatLearnPhrasesLine(setLeft) {
  return Number.isFinite(setLeft) && setLeft > 0 ? `${setLeft} на сьогодні` : 'Фрази з діалогів';
}

// The resume strip. custom: the running drill { left } or null; fsrs: the daily set on screen
// { kind, answered, left } (answered: at least one answer given). Returns null when nothing is open.
// The custom drill wins: it is the exercise on screen when both are open.
export function buildResumeView({ custom = null, fsrs = null } = {}) {
  if (custom && custom.left > 0) {
    return { mode: 'custom', title: 'Продовжити: тренування', line: formatResumeLeft(custom.left) };
  }
  if (fsrs && fsrs.answered && fsrs.left > 0) {
    const mode = fsrsModeForKind(fsrs.kind);
    const title = mode === 'review' ? 'Продовжити: Запам\'ятовування' : 'Продовжити: Нові слова';
    return { mode, title, line: formatResumeLeft(fsrs.left) };
  }
  return null;
}

// «Залишилось 7»; an unknown count gives no line.
export function formatResumeLeft(left) {
  return Number.isFinite(left) ? `Залишилось ${left}` : '';
}

// ---------- Нові слова and Запам'ятовування: two FSRS practices (docs/NEW_AND_REVIEW_PRACTICE.md §2) ----------

// The FSRS practices: Нові слова (the new set) and Запам'ятовування (the review set). Both run on the same session.
export function isFsrsMode(mode) {
  return mode === 'fsrs' || mode === 'review';
}

// The set kind a mode asks for: 'review' for Запам'ятовування, 'new' for Нові слова.
export function fsrsKindForMode(mode) {
  return mode === 'review' ? 'review' : 'new';
}

// The mode a set kind is shown in: Нові слова ('fsrs') or Запам'ятовування ('review').
export function fsrsModeForKind(kind) {
  return kind === 'review' ? 'review' : 'fsrs';
}

// The offline snapshots are kept per kind: the set on screen and the spare words for the next set.
export function practiceSnapshotKey(kind) {
  return `practice-${kind}`;
}

export function spareSnapshotKey(kind) {
  return `spare-${kind}`;
}

// How many days the phone's spare words may still start an offline set. A word due then is still due (a little late), and
// the server takes answers up to 7 days old. The app refreshes them on every online start, so they are rarely this old.
export const SPARE_WORDS_MAX_AGE_DAYS = 3;

// The words of a stored spare snapshot that may still start an offline set: saved today or up to SPARE_WORDS_MAX_AGE_DAYS
// days before (calendar dates, YYYY-MM-DD); [] for none, an older one, or one from a later day (the phone's clock moved).
export function readUsableSpareWords({ snapshot, calendarDate }) {
  if (!snapshot || !Array.isArray(snapshot.words) || typeof snapshot.calendarDate !== 'string') return [];
  const ageInDays = (Date.parse(calendarDate) - Date.parse(snapshot.calendarDate)) / 86_400_000;
  return ageInDays >= 0 && ageInDays <= SPARE_WORDS_MAX_AGE_DAYS ? snapshot.words : [];
}

// The line under the mode select. counts: { introducedToday, reviewOwed } of the batch on screen, or null when unknown.
// Нові слова shows today's new words, Запам'ятовування the reviews still to do.
export function formatPracticeKindLine(kind, counts) {
  if (!counts) return '';
  if (kind === 'review') return Number.isFinite(counts.reviewOwed) ? `Залишилось на сьогодні: ${counts.reviewOwed}` : '';
  return Number.isFinite(counts.introducedToday) ? `Сьогодні нових: ${counts.introducedToday}` : '';
}

// The note under the Запам'ятовування screen when nothing is owed today: when the next words are due.
export function formatReviewDoneNote(dueTomorrow) {
  return Number.isFinite(dueTomorrow) ? `Наступні слова чекають на завтра: ${dueTomorrow}.` : '';
}

// The screen of a finished FSRS practice: { question, note, action }. action is the button ({ label, mode } where mode is
// the mode it opens) or null. kind: 'new' | 'review'. An empty batch ends the practice: Нові слова has no New word left,
// Запам'ятовування has nothing owed today.
export function buildFsrsDoneScreen({ kind, dueTomorrow = null }) {
  if (kind !== 'review') {
    return {
      question: 'Нових слів більше немає. Усі слова вже в повторенні.',
      note: '',
      action: { label: 'Перейти до запам\'ятовування', mode: 'review' },
    };
  }
  return {
    question: 'На сьогодні все повторено',
    note: formatReviewDoneNote(dueTomorrow),
    action: { label: 'Важкі слова', mode: 'struggling' },
  };
}

// The word sheet on Словник: what its details show. word: one word of the list.
export function buildWordDetailView(word) {
  const details = [
    ['Статус', formatLearningStatus(word.status)],
    ['Наступне повторення', formatShortDate(word.next_due_on) || '—'],
    ['Помилок', String(word.error_count ?? 0)],
  ];
  if (word.section) details.push(['Глава', word.section]);
  const theme = categoryName(word.category) || word.topic;
  if (theme) details.push(['Тема', theme]);
  return {
    article: word.article || '',
    dutch: word.nl,
    translation: word.uk,
    exampleDutch: word.example_nl || '',
    exampleUkrainian: word.example_uk || '',
    details,
  };
}

// The PATCH body of the word edit form: only the fields that changed, texts trimmed. Dutch and Ukrainian may not be
// empty (null is returned with the field to fix); a cleared example or chapter is sent as ''.
export function buildWordEditPatch(word, values) {
  const nl = String(values.nl ?? '').trim();
  const uk = String(values.uk ?? '').trim();
  if (!nl) return { error: 'nl' };
  if (!uk) return { error: 'uk' };
  const next = {
    nl,
    uk,
    article: values.article || '',
    section: String(values.section ?? '').trim(),
    example_nl: String(values.example_nl ?? '').trim(),
    example_uk: String(values.example_uk ?? '').trim(),
  };
  const patch = {};
  for (const [field, value] of Object.entries(next)) {
    if (value !== String(word[field] ?? '')) patch[field] = value;
  }
  // Тема: '' («—», визначить автоматично) is sent as null, which clears the category.
  const category = values.category || null;
  if (category !== (word.category || null)) patch.category = category;
  return { patch };
}

// ---------- Словник (docs/WORD_PRIORITY_AND_DICTIONARY.md §3) ----------

// Client copy of src/contracts/category-contracts.js: the same ids and names, in the same order.
export const WORD_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'food', name: 'Їжа й напої' }),
  Object.freeze({ id: 'home', name: 'Дім і побут' }),
  Object.freeze({ id: 'clothes', name: 'Одяг' }),
  Object.freeze({ id: 'colours', name: 'Кольори' }),
  Object.freeze({ id: 'numbers', name: 'Числа й час' }),
  Object.freeze({ id: 'people', name: 'Люди й родина' }),
  Object.freeze({ id: 'body', name: 'Тіло й здоров\'я' }),
  Object.freeze({ id: 'city', name: 'Місто й транспорт' }),
  Object.freeze({ id: 'work', name: 'Робота й навчання' }),
  Object.freeze({ id: 'nature', name: 'Природа й погода' }),
  Object.freeze({ id: 'leisure', name: 'Відпочинок і хобі' }),
  Object.freeze({ id: 'feelings', name: 'Почуття й характер' }),
  Object.freeze({ id: 'actions', name: 'Дії' }),
  Object.freeze({ id: 'talk', name: 'Розмова й фрази' }),
  Object.freeze({ id: 'other', name: 'Інше' }),
]);

// The Ukrainian name of a category id, or '' when there is none.
export function categoryName(categoryId) {
  return WORD_CATEGORIES.find(category => category.id === categoryId)?.name ?? '';
}

// The filter chips: «Усі», the three statuses, then the two priority tags (one is chosen at a time).
export const DICTIONARY_FILTERS = Object.freeze(['all', 'new', 'learning', 'learned', 'first', 'later']);

// The priority segmented control: value is the button's name, tag the server's tag (null = auto).
export const PRIORITY_TAG_CHOICES = Object.freeze([
  Object.freeze({ value: 'auto', tag: null, label: 'Авто' }),
  Object.freeze({ value: 'first', tag: 'first', label: 'Вчити першим' }),
  Object.freeze({ value: 'later', tag: 'later', label: 'Пізніше' }),
]);

const WORD_STATUS_CHIP_LABEL = Object.freeze({ new: 'нове', learning: 'вчу', learned: 'вивчене' });

// One word prepared for the list, built once per data change: the folded search text and the fields the filters read.
export function buildDictionaryEntry(word) {
  return {
    id: word.id,
    search: foldSearchText(`${word.nl ?? ''} ${word.uk ?? ''}`),
    status: word.status ?? 'new',
    tag: word.priority_tag ?? null,
    category: word.category || null,
  };
}

// True when the entry passes the search, the filter chip and the category ('' = every category). query is already
// folded (foldSearchText), so a keystroke folds it once, not once per word.
export function matchesDictionaryFilter(entry, { query = '', filter = 'all', category = '' } = {}) {
  if (query && !entry.search.includes(query)) return false;
  if (filter === 'new' || filter === 'learning' || filter === 'learned') {
    if (entry.status !== filter) return false;
  } else if (filter === 'first' || filter === 'later') {
    if (entry.tag !== filter) return false;
  }
  return !category || entry.category === category;
}

// The chips under a word's row, in order: category, status, priority tag, next review. Empty ones are left out.
export function buildWordChips(word) {
  const chips = [];
  const category = categoryName(word.category);
  if (category) chips.push({ tone: 'category', text: category });
  if (Object.hasOwn(WORD_STATUS_CHIP_LABEL, word.status)) chips.push({ tone: word.status, text: WORD_STATUS_CHIP_LABEL[word.status] });
  if (word.priority_tag === 'first') chips.push({ tone: 'first', text: '★ першим' });
  else if (word.priority_tag === 'later') chips.push({ tone: 'later', text: 'пізніше' });
  const nextDate = formatShortDate(word.next_due_on);
  if (nextDate) chips.push({ tone: 'due', text: `повтор ${nextDate}` });
  return chips;
}

// One suggested word as the checklist shows it: "de fiets — велосипед · Місто й транспорт".
export function formatSuggestionLine(suggestion) {
  const dutch = [suggestion.article, suggestion.nl].filter(Boolean).join(' ');
  const category = categoryName(suggestion.category);
  return `${dutch} — ${suggestion.uk}${category ? ` · ${category}` : ''}`;
}

// The POST body that adds a suggested word (the add form's fields; the category is kept).
export function buildSuggestionWordBody(suggestion) {
  const body = { nl: suggestion.nl, uk: suggestion.uk, article: suggestion.article || '' };
  if (suggestion.category) body.category = suggestion.category;
  return body;
}

// «Додано 3 слова», «Додано 1 слово», «Додано 5 слів».
export function formatAddedWords(count) {
  return `Додано ${formatWordTotal(count)}`;
}

// The add sheet's form values → the POST body, and the priority tag to set after the add (null = auto). Dutch and
// Ukrainian are required (error names the field to fix).
export function buildNewWordBody(values) {
  const nl = String(values.nl ?? '').trim();
  const uk = String(values.uk ?? '').trim();
  if (!nl) return { error: 'nl' };
  if (!uk) return { error: 'uk' };
  const body = { nl, uk, article: values.article || '' };
  if (values.category) body.category = values.category;
  for (const field of ['section', 'example_nl', 'example_uk']) {
    const text = String(values[field] ?? '').trim();
    if (text) body[field] = text;
  }
  const choice = PRIORITY_TAG_CHOICES.find(option => option.value === (values.priority || 'auto'));
  return { body, priorityTag: choice?.tag ?? null };
}

// ---------- set progress: the two-layer bar above the practice question ----------

// The words of a set and how many rounds each is asked in: one per list (the queue, each round's waiting list) that
// holds it. Read once when the set (or drill) starts; buildSetProgress counts the rounds finished against it.
export function countWordRounds({ queue = [], waiting = {} }) {
  const rounds = new Map();
  for (const list of [queue, ...ROUND_DIRECTIONS.map(direction => waiting[direction] ?? [])]) {
    for (const id of new Set(list.map(word => word.id))) rounds.set(id, (rounds.get(id) ?? 0) + 1);
  }
  return Object.freeze([...rounds].map(([id, count]) => Object.freeze({ id, rounds: count })));
}

// The share of the current round a queued word has done: its right answers out of those its deck needs in this
// direction (FSRS words); 0 without a deck (drills, a word not answered yet).
function readRoundShare(word, direction) {
  const position = word.deck?.[direction];
  if (!position?.in_deck || !position.required_correct) return 0;
  return Math.min(1, position.correct_count / position.required_correct);
}

// The two-layer bar of a set: learned words (no round left), words in progress (in the active window or with some
// rounds or answers done) and waiting words (not started). learnedPercent is the learned words' share of the set;
// learningPercent the progress made by the words in progress, so the two never pass 100 together. A deleted word
// is left out of wordRounds by the caller.
export function buildSetProgress({ wordRounds, direction, queue, waiting, windowSize = ACTIVE_WINDOW_SIZE }) {
  const queued = new Map(queue.map(word => [word.id, word]));
  const activeIds = new Set(queue.slice(0, windowSize).map(word => word.id));
  const waitingIds = ROUND_DIRECTIONS.map(round => new Set((waiting[round] ?? []).map(word => word.id)));
  let learned = 0;
  let learning = 0;
  let learningShare = 0;
  for (const { id, rounds } of wordRounds) {
    const roundsLeft = (queued.has(id) ? 1 : 0) + waitingIds.filter(ids => ids.has(id)).length;
    if (!roundsLeft || !rounds) {
      learned += 1;
      continue;
    }
    const roundShare = queued.has(id) ? readRoundShare(queued.get(id), direction) : 0;
    const share = (rounds - roundsLeft + roundShare) / rounds;
    if (activeIds.has(id) || share > 0) {
      learning += 1;
      learningShare += share;
    }
  }
  const total = wordRounds.length;
  const learnedPercent = total ? Math.round((learned / total) * 100) : 0;
  const learningPercent = total ? Math.min(100 - learnedPercent, Math.round((learningShare / total) * 100)) : 0;
  return Object.freeze({ total, learned, learning, waiting: total - learned - learning, learnedPercent, learningPercent });
}

// The bar's text for screen readers: "Вивчено 3 з 10, вчимо 4, чекають 3".
export function formatSetProgressLabel({ total, learned, learning, waiting }) {
  return `Вивчено ${learned} з ${total}, вчимо ${learning}, чекають ${waiting}`;
}

// ---------- offline practice ----------

const BOTH_DIRECTIONS = Object.freeze(['uk_nl', 'nl_uk']);
const MAX_SET_WORD_IDS = 20;

// The set practised offline: the words of the finished set that are still learning (graded again or hard in it) come
// first, then spare words that are not already in it, up to setSize. Each word is asked in both directions again.
// A word appears once. Inputs are not changed.
export function buildOfflineSet({ stillLearning = [], spare = [], setSize = 10 }) {
  const chosen = [];
  const seenIds = new Set();
  for (const word of [...stillLearning, ...spare]) {
    if (chosen.length >= setSize) break;
    if (seenIds.has(word.id)) continue;
    seenIds.add(word.id);
    chosen.push({ ...word, directions_left: [...BOTH_DIRECTIONS] });
  }
  return chosen;
}

// The ids sent as set_word_ids with a grade: the set's words in order, at most 20.
export function buildSetWordIds(words) {
  return words.slice(0, MAX_SET_WORD_IDS).map(word => word.id);
}

// The body of a grade post. answered_at (the phone's clock) goes only with an answer that is queued: an answer posted
// directly gets the server's own time. set_word_ids and set_opened_at go only when the set on screen was built on the phone
// (offlineSet), never for an ordinary online set. client_answer_id is always there.
export function buildGradePostBody({
  wordId, grade, answer, sessionId, direction, clientAnswerId, answeredAt, setWordIds, setOpenedAt, isQueued, offlineSet,
}) {
  return {
    word_id: wordId,
    grade,
    answer,
    session_id: sessionId,
    direction,
    client_answer_id: clientAnswerId,
    ...(isQueued ? { answered_at: answeredAt } : {}),
    ...(offlineSet && setWordIds?.length ? { set_word_ids: setWordIds } : {}),
    ...(offlineSet && setWordIds?.length && setOpenedAt ? { set_opened_at: setOpenedAt } : {}),
  };
}

// The set kept on the phone, ready to continue, or null when it is not usable (none stored, or from another day).
// Words answered in every direction they had left are left out. reviews / newWords split the words by their state, as
// the server's batch does; allWords keeps the whole set (the words answered already still count as learning).
export function restorePracticeSnapshot({ snapshot, calendarDate }) {
  if (!snapshot || !Array.isArray(snapshot.words) || typeof snapshot.sessionId !== 'string') return null;
  if (snapshot.calendarDate !== calendarDate) return null;
  const answered = new Set(snapshot.answeredKeys || []);
  const isFinished = word => (word.directions_left || []).every(direction => answered.has(answerKey(direction, word.id)));
  const words = snapshot.words.filter(word => !isFinished(word));
  return {
    sessionId: snapshot.sessionId,
    words,
    allWords: snapshot.words,
    setSize: snapshot.setSize || 10,
    reviews: words.filter(word => word.state !== 'new'),
    newWords: words.filter(word => word.state === 'new'),
    answered,
    tally: { again: 0, hard: 0, good: 0, ...(snapshot.tally || {}) },
    introducedCount: snapshot.introducedCount || 0,
    hardWordIds: new Set(snapshot.hardWordIds || []),
    isOfflineSet: snapshot.offlineSet === true,
    setOpenedAt: Number.isFinite(snapshot.setOpenedAt) ? snapshot.setOpenedAt : null,
  };
}

// «14:32» from a time in ms (the phone's own time zone).
function formatClockTime(timeMs) {
  const date = new Date(timeMs);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// The line under the header and what goes with it, or null when nothing is to be said (online, nothing unsent).
// Returns { text, showSendButton, showLoginLink }.
export function formatOfflineBanner({ isOnline, pendingCount = 0, cacheTime = null, needsLogin = false }) {
  if (needsLogin && pendingCount > 0 && isOnline) {
    return { text: `Увійди, щоб надіслати відповіді (${pendingCount})`, showSendButton: false, showLoginLink: true };
  }
  if (!isOnline) {
    const updated = cacheTime ? ` · оновлено ${formatClockTime(cacheTime)}` : '';
    const waiting = pendingCount > 0 ? ` · не надіслано: ${pendingCount}` : '';
    return { text: `Офлайн · показано збережене${updated}${waiting}`, showSendButton: false, showLoginLink: false };
  }
  if (pendingCount > 0) {
    return { text: `Не надіслано відповідей: ${pendingCount}`, showSendButton: true, showLoginLink: false };
  }
  return null;
}

// After a flush: «2 відповіді не зараховано: пізніші вже були».
export function formatDroppedNotice(count) {
  return `${count} ${pluralize(count, ANSWER_WORDS)} не зараховано: пізніші вже були`;
}

// The question before logging out with answers still on the phone.
export function formatUnsentLogoutText(count) {
  return `${count} ${pluralize(count, ANSWER_WORDS)} ще не надіслано. Вийти й видалити їх?`;
}

// The summary of a set finished offline, from the local tally only: { title, stats, words } where words are the set's
// words answered again or hard (marked difficulty 'hard', so the round's drill button counts them).
export function buildLocalRoundSummary({ tally, introducedCount, hardWords }) {
  const answerCount = tally.again + tally.hard + tally.good;
  return {
    isLocal: true,
    title: 'Набір завершено 🎉',
    stats: [
      ['Відповідей', String(answerCount)],
      ['Знову', String(tally.again)],
      ['Важко', String(tally.hard)],
      ['Добре', String(tally.good)],
      ['Нових слів', String(introducedCount)],
    ],
    words: hardWords.map(word => ({ ...word, difficulty: 'hard' })),
  };
}

// ---------- Вправи з правил ----------

// The sentence around its gap: { before, after } (the gap is ___), or null when the exercise has no sentence.
export function splitRuleQuizSentence(sentence) {
  if (!sentence) return null;
  const gapIndex = sentence.indexOf('___');
  if (gapIndex === -1) return { before: sentence, after: '' };
  return { before: sentence.slice(0, gapIndex), after: sentence.slice(gapIndex + 3) };
}

// The line under a rule in the list: "12 відповідей · правильно 75%", or "ще не тренувалось".
export function formatRuleQuizRuleStats(rule) {
  if (!rule.answer_count) return 'ще не тренувалось';
  const percent = Math.round((rule.correct_count / rule.answer_count) * 100);
  return `${rule.answer_count} ${pluralize(rule.answer_count, ['відповідь', 'відповіді', 'відповідей'])} · правильно ${percent}%`;
}

// "Правила: усі" / "Правила: 3 з 11" / "Правила: жодного".
export function formatRuleQuizSelection(selectedCount, totalCount) {
  if (selectedCount === 0) return 'Правила: жодного';
  return selectedCount === totalCount ? 'Правила: усі' : `Правила: ${selectedCount} з ${totalCount}`;
}

// "Питання 3 з 10".
export function formatRuleQuizProgress(index, total) {
  return `Питання ${index + 1} з ${total}`;
}

// The end of a set: "Правильно 7 з 10 🎉" (all right) or "Правильно 7 з 10".
export function formatRuleQuizResult(results) {
  const correctCount = results.filter(result => result.is_correct).length;
  const text = `Правильно ${correctCount} з ${results.length}`;
  return correctCount === results.length && results.length ? `${text} 🎉` : text;
}

// ---------- motion (docs/MOTION.md) ----------

// How many petals fall on a finish screen: a strong result gets more, a weak one none, so it never feels fake.
export function choosePetalCount(correctCount, total) {
  if (!total) return 0;
  const share = correctCount / total;
  if (share >= 0.9) return 36;
  if (share >= 0.7) return 20;
  return 0;
}

// The captions under the growing sprout while the model writes the rule exercises, shown in turn.
export const RULE_QUIZ_LOADING_PHRASES = Object.freeze([
  'Підбираю речення з твоїми словами…',
  'Перевіряю артиклі й форми…',
  'Складаю варіанти відповідей…',
  'Пишу пояснення українською…',
  'Ще трохи…',
]);

// The caption for the nth turn: the last one stays once the list is through.
export function pickLoadingPhrase(turn) {
  return RULE_QUIZ_LOADING_PHRASES[Math.min(Math.max(0, turn), RULE_QUIZ_LOADING_PHRASES.length - 1)];
}

// The streak value to roll from: the value seen last time when the streak grew since, else null (no roll).
export function chooseStreakRollStart(seenValue, currentValue) {
  const seen = Number.parseInt(seenValue, 10);
  return Number.isInteger(seen) && seen >= 0 && seen < currentValue ? seen : null;
}

// Where a typed word differs from the right one, letter by letter (plan 3.1). Levenshtein with a backtrace; letters
// compare case-insensitively. Each entry: { kind: 'same' | 'wrong' | 'extra' | 'missing', typed?, right? }:
// wrong = a substituted letter, extra = a typed letter the word does not have, missing = a letter the word has and
// the answer leaves out. Null when either side is empty or the words are too far apart to be useful.
export function buildLetterDiff(typed, right) {
  const typedLetters = [...String(typed ?? '')];
  const rightLetters = [...String(right ?? '')];
  if (!typedLetters.length || !rightLetters.length) return null;
  const n = typedLetters.length;
  const m = rightLetters.length;
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  const dist = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dist[i][0] = i;
  for (let j = 0; j <= m; j++) dist[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = same(typedLetters[i - 1], rightLetters[j - 1]) ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j - 1] + cost, dist[i - 1][j] + 1, dist[i][j - 1] + 1);
    }
  }
  if (dist[n][m] > Math.max(2, Math.floor(m / 3))) return null;
  const diff = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dist[i][j] === dist[i - 1][j - 1] + (same(typedLetters[i - 1], rightLetters[j - 1]) ? 0 : 1)) {
      const kind = same(typedLetters[i - 1], rightLetters[j - 1]) ? 'same' : 'wrong';
      diff.push({ kind, typed: typedLetters[i - 1], right: rightLetters[j - 1] });
      i -= 1;
      j -= 1;
    } else if (i > 0 && dist[i][j] === dist[i - 1][j] + 1) {
      diff.push({ kind: 'extra', typed: typedLetters[i - 1] });
      i -= 1;
    } else {
      diff.push({ kind: 'missing', right: rightLetters[j - 1] });
      j -= 1;
    }
  }
  return diff.reverse();
}

// The letter diff of a typed translation (UA → NL) for the practice message. The article is left out on both sides
// (the article is compared on its own). Null for «dnk», for an empty answer, and when nothing differs in the letters
// (only the article was wrong).
export function buildAnswerLetterDiff(word, input) {
  const typed = normalizeAnswerText(input);
  if (!typed || typed === 'dnk') return null;
  const typedWord = typed.replace(/^(de|het) (?=.)/, '');
  const diff = buildLetterDiff(typedWord, normalizeAnswerText(word.nl));
  return diff?.some(entry => entry.kind !== 'same') ? diff : null;
}

// The basket under a point (plan 3.2): rects is { de: DOMRect-like, het: … }; returns the key, or null.
export function findBasketAt(point, rects) {
  if (!point || !rects) return null;
  for (const [id, rect] of Object.entries(rects)) {
    if (rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) return id;
  }
  return null;
}

// ---------- Головна: daily goal, week recap, calendar (docs/WEEK_GOAL_CALENDAR_ACHIEVEMENTS.md §4) ----------

const WEEKDAY_NAMES = Object.freeze(['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота']);
export const GOAL_REACHED_TEXT = 'Ціль виконано! Можна ще, але вже без поспіху.';

// The daily goal card (§4.1): the ring's percent, the number in the ring, and the line under it.
// goal: the day's goal (5–500); answers: the activity answers today.
export function buildGoalView({ goal, answers }) {
  const count = Math.max(0, answers ?? 0);
  const target = Math.max(1, goal);
  const remaining = target - count;
  const reached = remaining <= 0;
  return {
    reached,
    percent: Math.min(100, Math.round((count / target) * 100)),
    number: String(count),
    ofText: `з ${target}`,
    line: reached ? GOAL_REACHED_TEXT : `Ще ${remaining} ${pluralize(remaining, ANSWER_WORDS)} до цілі`,
  };
}

// The weekday of a «2026-11-14» date, in Ukrainian lower case. The date is a calendar day, so UTC is used.
export function weekdayName(isoDate) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function accuracySuffix(accuracy) {
  return accuracy == null ? '' : `, ${accuracy} % правильно`;
}

// The story slides of the week recap (§4.2). A slide whose data is null or 0 is left out. An empty week has one slide.
// countUp: the big value starts with a number that counts up when the slide shows.
export function buildWeekSlides(week, period = 'current') {
  const isPrevious = period === 'previous';
  if (!week || !week.answers) {
    return [isPrevious
      ? { id: 'empty', title: '', big: 'Минулого тижня не було відповідей', text: 'Подивись цей тиждень', countUp: false }
      : { id: 'empty', title: '', big: 'Цього тижня ще немає відповідей', text: "Почни практику, і тут з'явиться підсумок", countUp: false }];
  }
  const slides = [{
    id: 'answers',
    title: isPrevious ? 'Минулого тижня' : 'Цього тижня',
    big: String(week.answers),
    text: `${pluralize(week.answers, ANSWER_WORDS)}${accuracySuffix(week.accuracy)}`,
    countUp: true,
  }];
  if (week.started_count) {
    slides.push({
      id: 'started',
      title: 'Нових слів',
      big: String(week.started_count),
      text: `почато, ${week.learned_count ?? 0} вивчено`,
      countUp: true,
    });
  }
  if (week.best_day) {
    const { date, answers, accuracy } = week.best_day;
    slides.push({
      id: 'best-day',
      title: 'Найкращий день',
      big: weekdayName(date),
      text: `${answers} ${pluralize(answers, ANSWER_WORDS)}${accuracySuffix(accuracy)}`,
      countUp: false,
    });
  }
  if (week.hardest_word && week.hardest_word.mistakes) {
    const { nl, article, mistakes } = week.hardest_word;
    slides.push({
      id: 'hardest',
      title: 'Найважче слово',
      big: article ? `${article} ${nl}` : nl,
      text: `${mistakes} ${pluralize(mistakes, MISTAKE_WORDS)} — воно буде частіше`,
      countUp: false,
    });
  }
  if (week.streak?.current) {
    const { current, longest } = week.streak;
    slides.push({
      id: 'streak',
      title: 'Серія',
      big: `${current} ${pluralizeDays(current)}`,
      text: `найдовша — ${longest} ${pluralizeDays(longest)}`,
      countUp: true,
    });
  }
  if (week.active_seconds) {
    const days = week.days_practised ?? 0;
    slides.push({
      id: 'time',
      title: 'Час навчання',
      big: formatDuration(week.active_seconds),
      text: `за ${days} ${pluralizeDays(days)} практики`,
      countUp: false,
    });
  }
  return slides;
}

// The shade of a calendar day (§4.3): 0 none, 1 to 14 answers, 2 to 34, 3 to 59, 4 from 60.
export function calendarLevel(answers) {
  if (answers <= 0) return 0;
  if (answers <= 14) return 1;
  if (answers <= 34) return 2;
  if (answers <= 59) return 3;
  return 4;
}

// Monday = 0 … Sunday = 6, for an ISO date.
function mondayFirstIndex(isoDate) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

function calendarCell(day) {
  const answers = day.answers ?? 0;
  const correct = day.correct ?? 0;
  const accuracy = answers ? Math.round((correct / answers) * 100) : null;
  const [, month, dayOfMonth] = String(day.date).split('-');
  const dayText = `${dayOfMonth}.${month}`;
  const label = answers
    ? `${dayText}: ${answers} ${pluralize(answers, ANSWER_WORDS)}, ${accuracy} % правильно`
    : `${dayText}: без практики`;
  return { date: day.date, answers, correct, accuracy, level: calendarLevel(answers), label };
}

// The calendar of the days, oldest first (§4.3): weeks are columns of seven cells, Monday on top. Cells before the
// first day and after the last one are null, so every column has seven entries.
export function buildCalendarGrid(days) {
  if (!days?.length) return { weeks: [] };
  const cells = [
    ...Array.from({ length: mondayFirstIndex(days[0].date) }, () => null),
    ...days.map(calendarCell),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return { weeks };
}

// ---------- achievements (docs/WEEK_GOAL_CALENDAR_ACHIEVEMENTS.md §5) ----------

// The achievements of each group, in the server's group order; groups without achievements are left out.
export function groupAchievements(groups = [], achievements = []) {
  return groups
    .map(group => ({ id: group.id, title: group.title, items: achievements.filter(a => a.group === group.id) }))
    .filter(group => group.items.length > 0);
}

// The bar's fill in percent: full when unlocked, otherwise current / target.
export function achievementProgressPercent(achievement) {
  if (achievement.unlocked) return 100;
  const { current = 0, target = 0 } = achievement.progress ?? {};
  if (!(target > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
}

// «7 / 10» (the current never shows above the target).
export function formatAchievementProgress(achievement) {
  const { current = 0, target = 0 } = achievement.progress ?? {};
  return `${Math.min(current, target)} / ${target}`;
}

// «Отримано» when unlocked, otherwise «Ще 3 до відзнаки».
export function formatAchievementLeft(achievement) {
  if (achievement.unlocked) return 'Отримано';
  const { current = 0, target = 0 } = achievement.progress ?? {};
  return `Ще ${Math.max(0, target - current)} до відзнаки`;
}

// The unlocked achievements the learner has not seen yet, in list order. isFirstLoad (nothing saved yet): no
// toasts, every current unlock counts as seen.
export function findNewUnlocks(achievements = [], seenIds = [], isFirstLoad = false) {
  if (isFirstLoad) return [];
  const seen = new Set(seenIds);
  return achievements.filter(achievement => achievement.unlocked && !seen.has(achievement.id));
}

// The seen ids with every unlocked achievement of the list added (in their order, no repeats).
export function markUnlockedSeen(achievements = [], seenIds = []) {
  const seen = [...new Set(seenIds)];
  for (const achievement of achievements) {
    if (achievement.unlocked && !seen.includes(achievement.id)) seen.push(achievement.id);
  }
  return seen;
}

export function formatAchievementToast(achievement) {
  return `Нове досягнення: ${achievement.title}`;
}

// ---------- Що я вже знаю (plan §4) ----------

// One chip of the known check: «de huis · будинок».
export function formatKnownCheckChip(word) {
  return `${formatDutchWithArticle(word)} · ${word.uk}`;
}

// A tap on a chip: the word joins or leaves the chosen («знаю») words; a new array, the order kept.
export function toggleKnownCheckChoice(knownIds, wordId) {
  return knownIds.includes(wordId) ? knownIds.filter(id => id !== wordId) : [...knownIds, wordId];
}

// «Готово»: the chosen words of the batch are known, the rest of the batch are unknown.
export function buildKnownCheckPayload(batchIds, knownIds) {
  return {
    known_ids: batchIds.filter(id => knownIds.includes(id)),
    unknown_ids: batchIds.filter(id => !knownIds.includes(id)),
  };
}

// The text after «Готово»: the count of known words, the next batch's button («Далі (ще N)») or the end line.
// remaining: the new words still waiting after this batch (the POST answer).
export function buildKnownCheckResult({ known, remaining }) {
  const hasMore = remaining > 0;
  return {
    line: `Позначено як знайомі: ${known}. Ці слова прийдуть на повторення пізніше.`,
    nextLabel: hasMore ? `Далі (ще ${remaining})` : '',
    endLine: hasMore ? '' : 'Нових слів більше немає',
  };
}

// The chapter field (Профіль): an integer from 1 to 99, or null when the text is not one.
export function parseChapterInput(value) {
  const chapter = Number(value);
  return Number.isInteger(chapter) && chapter >= 1 && chapter <= 99 ? chapter : null;
}

// ---------- Налаштування ----------

export const DEFAULT_THEME = 'sad';

// The saved colour theme when it is one of the app's themes; otherwise (none saved, an old or broken name) Сад.
export function pickTheme(saved, themeNames) {
  return themeNames.includes(saved) ? saved : DEFAULT_THEME;
}

// ---------- Головна (docs/NAVIGATION_REDESIGN.md §7) ----------

const HOME_WEEKDAYS = Object.freeze(['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота', 'Неділя']);
const HOME_WEEKDAYS_SHORT = Object.freeze(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']);
const MONTHS_GENITIVE = Object.freeze(['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня',
  'вересня', 'жовтня', 'листопада', 'грудня']);
const WORD_COUNT_FORMS = ['слово', 'слова', 'слів'];
const NEW_WORD_FORMS = ['нове', 'нові', 'нових'];

// The Dutch greeting by the hour of the day: Goedemorgen from 5:00, Goedemiddag from 12:00, Goedenavond from 18:00.
export function greetingForHour(hour) {
  if (!Number.isFinite(hour)) return 'Hoi!';
  if (hour >= 5 && hour < 12) return 'Goedemorgen!';
  if (hour >= 12 && hour < 18) return 'Goedemiddag!';
  return 'Goedenavond!';
}

// «Вівторок, 17 листопада»: the weekday capitalised, the day and the month in the genitive. Local date.
export function formatHomeDate(date) {
  const weekday = HOME_WEEKDAYS[(date.getDay() + 6) % 7];
  return `${weekday}, ${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;
}

// The streak chip: «12 днів»; no streak (0, or unknown) gives '' and the chip stays hidden.
export function formatStreakChip(days) {
  if (!Number.isFinite(days) || days <= 0) return '';
  return `${days} ${pluralizeDays(days)}`;
}

// The local calendar day as «2026-11-17», the form the calendar days use.
export function localIsoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export const NEXT_STEP_SUBTITLES = Object.freeze({
  review: 'Почнімо з повторення',
  new: 'Час для нових слів',
  done: 'На сьогодні все зроблено',
  open: 'Що вчимо сьогодні?',
});

// The Далі card. counts: { reviewOwed, introducedToday, strugglingCount, setSize }; null or undefined means unknown, and
// an unknown count never makes a suggestion. The suggestions keep this order: Запам'ятовування (words owed), Нові слова
// (the daily set not full: only when introducedToday is known), Важкі слова (words to drill), Артикль (always). The
// first is the main one, the next one the small «або …» link. With both the owed and the introduced counts unknown
// the card is neutral: «Вчити», «Обери вправу», no link.
export function pickNextStep({ reviewOwed, introducedToday, strugglingCount, setSize = LEARN_SET_SIZE } = {}) {
  const owedKnown = Number.isFinite(reviewOwed);
  const introducedKnown = Number.isFinite(introducedToday);
  if (!owedKnown && !introducedKnown) {
    return {
      subtitle: NEXT_STEP_SUBTITLES.open,
      main: { id: 'learn', title: 'Вчити', line: 'Обери вправу' },
      second: null,
    };
  }
  const size = dailySetSize(setSize);
  const steps = [];
  if (owedKnown && reviewOwed > 0) {
    steps.push({ id: 'review', title: "Запам'ятовування", line: formatLearnReviewLine(reviewOwed), hint: formatWordTotal(reviewOwed) });
  }
  if (introducedKnown && introducedToday < size) {
    const done = Math.min(introducedToday, size);
    steps.push({ id: 'new', title: 'Нові слова', line: `Сьогодні ${done} з ${size}`, hint: `${done} з ${size}` });
  }
  if (Number.isFinite(strugglingCount) && strugglingCount > 0) {
    steps.push({ id: 'struggling', title: 'Важкі слова', line: `${formatWordTotal(strugglingCount)} для тренування`, hint: formatWordTotal(strugglingCount) });
  }
  steps.push({ id: 'article', title: 'Артикль', line: 'de чи het', hint: 'de чи het' });
  const [main, second = null] = steps;
  // «All done» is said only when both counts are known to be finished; an unknown count is never called done.
  const allDone = owedKnown && reviewOwed === 0 && introducedKnown && introducedToday >= size;
  const subtitle = main.id === 'review' ? NEXT_STEP_SUBTITLES.review
    : main.id === 'new' ? NEXT_STEP_SUBTITLES.new
      : allDone ? NEXT_STEP_SUBTITLES.done : NEXT_STEP_SUBTITLES.open;
  return {
    subtitle,
    main: { id: main.id, title: main.title, line: main.line },
    second: second ? { id: second.id, title: second.title, label: `або ${second.title} · ${second.hint}` } : null,
  };
}

// The week strip of Головна: the seven days of the current Monday-to-Sunday week, Monday first. days: the calendar
// days { date, answers } (null when the read failed). Future days have no answers; a past day missing from the
// list has none either. Also the line about last week, '' when the calendar is unknown.
export function buildHomeWeek({ days = null, todayIso }) {
  const todayIndex = isoDayNumber(todayIso);
  const mondayNumber = todayIndex - ((new Date(todayIndex * 86400000).getUTCDay() + 6) % 7);
  const byDate = new Map((days ?? []).map(day => [day.date, day.answers ?? 0]));
  const cells = HOME_WEEKDAYS.map((name, index) => {
    const dayNumber = mondayNumber + index;
    const date = isoFromDayNumber(dayNumber);
    const isFuture = dayNumber > todayIndex;
    let answers = null;
    if (days && !isFuture) answers = byDate.get(date) ?? 0;
    const label = answers == null
      ? `${name}: ${isFuture ? 'ще попереду' : 'немає даних'}`
      : answers === 0 ? `${name}: без практики` : `${name}: ${answers} ${pluralize(answers, ANSWER_WORDS)}`;
    return {
      date,
      name,
      short: HOME_WEEKDAYS_SHORT[index],
      answers,
      level: answers == null ? 0 : calendarLevel(answers),
      isToday: dayNumber === todayIndex,
      isFuture,
      label,
    };
  });
  let previousLine = '';
  if (days) {
    const previous = days.filter(day => {
      const number = isoDayNumber(day.date);
      return number >= mondayNumber - 7 && number < mondayNumber;
    });
    const practisedDays = previous.filter(day => (day.answers ?? 0) > 0).length;
    const total = previous.reduce((sum, day) => sum + (day.answers ?? 0), 0);
    previousLine = `Минулого тижня: ${practisedDays} ${pluralizeDays(practisedDays)}, ${total} ${pluralize(total, ANSWER_WORDS)}`;
  }
  return { cells, previousLine };
}

// Days since the epoch for an ISO date, and back: the calendar arithmetic is done in UTC.
function isoDayNumber(isoDate) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86400000);
}

function isoFromDayNumber(dayNumber) {
  return new Date(dayNumber * 86400000).toISOString().slice(0, 10);
}

// The three numbers of Головна: the words with status learning («слів учу»), new words today, and the share of right
// answers over 7 days. Unknown values show «—».
export function buildHomeNumbers({ learning = null, introducedToday = null, goodShare7Days = null } = {}) {
  const inProgress = Number.isFinite(learning) ? learning : null;
  const shown = inProgress ?? 0;
  const newToday = Number.isFinite(introducedToday) ? introducedToday : null;
  return [
    {
      key: 'learning',
      value: inProgress == null ? '—' : String(inProgress),
      // «у» after a consonant, «в» after a vowel: «слів учу», but «слово вчу», «слова вчу».
      label: /[аеєиіїоуюя]$/.test(pluralize(shown, WORD_COUNT_FORMS)) ? `${pluralize(shown, WORD_COUNT_FORMS)} вчу` : `${pluralize(shown, WORD_COUNT_FORMS)} учу`,
    },
    {
      key: 'new-today',
      value: newToday == null ? '—' : String(newToday),
      label: `${pluralize(newToday ?? 0, NEW_WORD_FORMS)} сьогодні`,
    },
    {
      key: 'accuracy',
      value: Number.isFinite(goodShare7Days) ? `${Math.round(goodShare7Days * 100)}%` : '—',
      label: 'правильно за 7 днів',
    },
  ];
}

// «Ще 2 дні серії», «Ще 7 слів», «Ще 5 відповідей»; a group without its own wording gives «Ще N».
export function formatNextAchievementLine(group, left) {
  if (group === 'streak') return `Ще ${left} ${pluralizeDays(left)} серії`;
  if (group === 'words') return `Ще ${left} ${pluralize(left, WORD_COUNT_FORMS)}`;
  if (group === 'answers') return `Ще ${left} ${pluralize(left, ANSWER_WORDS)}`;
  if (group === 'days') return `Ще ${left} ${pluralizeDays(left)} практики`;
  return `Ще ${left}`;
}

// The medal Головна shows: the locked one with the highest share of its target reached (started, not finished).
// Null when no locked medal has progress.
export function pickNextAchievement(achievements = []) {
  let best = null;
  let bestShare = -1;
  for (const achievement of achievements) {
    if (achievement.unlocked) continue;
    const { current = 0, target = 0 } = achievement.progress ?? {};
    if (!(target > 0) || !(current > 0) || current >= target) continue;
    const share = current / target;
    if (share > bestShare) {
      best = achievement;
      bestShare = share;
    }
  }
  if (!best) return null;
  const { current, target } = best.progress;
  const left = target - current;
  return { id: best.id, title: best.title, line: formatNextAchievementLine(best.group, left) };
}
