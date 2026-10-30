// Pure rules of the word-order exercise: the tiles of a Dutch sentence, the key that compares orders, the check of an
// answer, the validation of a sentence, and the choice of distractor tiles and the shuffle. No I/O.
export const RULES = Object.freeze([
  'v2',
  'inversion',
  'question',
  'modal',
  'separable',
  'negation',
  'subordinate',
  'perfect',
]);

// The filter names of the set: the rules and 'none' (sentences without a rule).
export const RULE_FILTER_NAMES = Object.freeze([...RULES, 'none']);

// Roles of a sentence's segments (its schema). Another short role (up to MAXIMUM_ROLE_LENGTH characters) is accepted too.
export const STRUCTURE_ROLES = Object.freeze([
  'підмет',
  'дієслово',
  'модальне дієслово',
  'допоміжне дієслово',
  'інфінітив',
  'дієприкметник',
  'відокремлювана частина',
  'додаток',
  'прикметник',
  'час',
  'місце',
  'спосіб',
  'причина',
  'заперечення',
  'сполучник',
  'питальне слово',
  'частка',
]);

const EDGE_PUNCTUATION_PATTERN = /^[.,?!;:"«»“”„…]+|[.,?!;:"«»“”„…]+$/g;
// The apostrophe variants are read as the plain ' first, so ’s and 's are the same word; ' itself is kept.
const APOSTROPHE_VARIANTS_PATTERN = /[’ʼ‘`]/g;
const RULE_NOISE_PATTERN = /[`*_\s]/g;
const DISTRACTOR_WORD_PATTERN = /^[\p{L}'-]+$/u;
const LETTER_PATTERN = /\p{L}/u;
const DIGIT_PATTERN = /\d/;
const MINIMUM_SENTENCE_TILES = 3;
const MAXIMUM_SENTENCE_TILES = 12;
const MINIMUM_DISTRACTOR_LETTERS = 2;
const DISTRACTOR_COUNT_WITH_EXTRA = 3;
const DISTRACTOR_COUNT_WITHOUT_EXTRA = 2;
const MAXIMUM_SHUFFLE_ATTEMPTS = 10;
const MAXIMUM_STRUCTURE_SEGMENTS = 12;
const MAXIMUM_ROLE_LENGTH = 30;
const MAXIMUM_ALTERNATIVE_ORDERS = 5;
const ALTERNATIVE_NOT_LIST_REASON = 'має бути списком рядків';
const EMPTY_ORDER_REASON = 'порожній порядок';
const DIFFERENT_WORDS_REASON = 'інші слова, ніж у реченні';
const ALREADY_LISTED_REASON = 'такий порядок уже є';
const SCHEMA_MISMATCH_ORDER_REASON = 'не збігається зі схемою';
const TOO_MANY_ORDERS_REASON = 'забагато порядків';
const MAXIMUM_WRONG_FORMS = 5;
const WRONG_FORMS_NOT_LIST_REASON = 'має бути списком слів';
const NOT_ONE_WORD_REASON = 'має бути одним словом';
const IN_SENTENCE_REASON = 'це слово вже є в реченні';
const TWIN_REASON = 'з ним речення теж може бути правильним';
const ALREADY_LISTED_FORM_REASON = 'таке слово вже є';
const TOO_MANY_FORMS_REASON = 'забагато хибних форм';
// Words that are interchangeable in a sentence: a distractor is never taken from a group that shares a word with the
// sentence, so the learner could not tell which tile was meant.
const INTERCHANGEABLE_WORD_GROUPS = Object.freeze([
  ['je', 'jij', 'u'],
  ['jou', 'jouw', 'je', 'jullie'],
  ['ze', 'zij'],
  ['we', 'wij'],
  ['me', 'mij'],
  ['niet', 'geen'],
  ['de', 'het', 'een'],
  ['dit', 'dat', 'deze', 'die'],
  ['er', 'daar', 'hier'],
  ['ook', 'nog', 'al'],
].map(group => Object.freeze(group)));

// Words that can stand for each other in a sentence. A wrong form from a group that shares a word with the sentence is
// refused, since the sentence could then be right with it too ("wij" for "we", "een" for "het"). Unlike the distractor
// groups above, de / het and niet / geen are not twins: "het" next to a de-word is a real wrong form.
const WRONG_FORM_TWIN_GROUPS = Object.freeze([
  ['je', 'jij', 'jou', 'jouw', 'u'],
  ['ze', 'zij'],
  ['we', 'wij'],
  ['me', 'mij'],
  ['de', 'een'],
  ['het', 'een'],
  ['deze', 'die'],
  ['dit', 'dat'],
  ['er', 'daar', 'hier'],
  ['ook', 'nog', 'al'],
].map(group => Object.freeze(group)));

// Reads a rule name as the learner or a model wrote it: any case, with backticks, asterisks, underscores or spaces
// around it. Returns the rule in RULES, or null when it is none of them (or not text at all).
export function normalizeRule(value) {
  if (typeof value !== 'string') return null;
  const rule = value.replace(RULE_NOISE_PATTERN, '').toLowerCase();
  return RULES.includes(rule) ? rule : null;
}

// Reads rule filter names (from a query string or a list): commas split them, each is trimmed and lower-cased, and
// names that are not in RULE_FILTER_NAMES are dropped (duplicates too). Non-text values are dropped. An empty result
// means no filter (every rule), as the service applies it.
export function normalizeRuleNames(values) {
  const names = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    for (const part of value.split(',')) {
      const name = part.trim().toLowerCase();
      if (RULE_FILTER_NAMES.includes(name) && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

// Reads a sentence's schema as it was written: an array of { text, role }, each trimmed (the role lower-cased), with
// the texts joined by single spaces equal to the sentence after normalizeSentenceKey. Returns the cleaned segments, or
// null when the value is missing or invalid (not an array, 0 or more than 12 segments, a blank text or role, a role
// longer than 30 characters, a text with no word in it (punctuation only), or a text sequence that is not the
// sentence's words). A segment's text is kept as written.
export function normalizeStructure({ nl, structure } = {}) {
  if (!Array.isArray(structure) || structure.length === 0 || structure.length > MAXIMUM_STRUCTURE_SEGMENTS) return null;
  const segments = [];
  for (const segment of structure) {
    if (segment === null || typeof segment !== 'object') return null;
    const text = typeof segment.text === 'string' ? segment.text.trim() : '';
    const role = typeof segment.role === 'string' ? segment.role.trim().toLowerCase() : '';
    if (text === '' || role === '' || role.length > MAXIMUM_ROLE_LENGTH) return null;
    if (splitIntoTiles(text).length === 0) return null;
    segments.push(Object.freeze({ text, role }));
  }
  const segmentTextKey = normalizeSentenceKey(segments.map(segment => segment.text).join(' '));
  if (segmentTextKey !== normalizeSentenceKey(nl)) return null;
  return Object.freeze(segments);
}

// The schema as stored (JSON text, or NULL) read back as an array, or null.
export function parseStoredStructure(storedText) {
  if (typeof storedText !== 'string' || storedText === '') return null;
  try {
    const parsed = JSON.parse(storedText);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// The alternative orders stored as JSON text (a list of strings), read back as an array; anything else is [].
export function parseStoredAltOrders(storedText) {
  if (typeof storedText !== 'string' || storedText === '') return [];
  try {
    const parsed = JSON.parse(storedText);
    return Array.isArray(parsed) ? parsed.filter(order => typeof order === 'string') : [];
  } catch {
    return [];
  }
}

// Splits on whitespace and strips punctuation from both ends of each token; case is kept. The apostrophe variants
// (’ ‘ ʼ `) become ' before the stripping, so ’s avonds and 's avonds give the same tiles.
export function splitIntoTiles(dutchSentence) {
  return String(dutchSentence ?? '')
    .replace(APOSTROPHE_VARIANTS_PATTERN, "'")
    .split(/\s+/)
    .map(stripEdgePunctuation)
    .filter(tile => tile.length > 0);
}

export function normalizeSentenceKey(dutchSentence) {
  return splitIntoTiles(dutchSentence).map(normalizeTileForComparison).join(' ');
}

export function isCorrectOrder({ answerTiles, dutchSentence }) {
  return answerTiles.map(normalizeTileForComparison).join(' ') === normalizeSentenceKey(dutchSentence);
}

// Returns null when the sentence is fine, else the reason in Ukrainian.
export function validateSentence({ nl, uk } = {}) {
  if (isBlankText(nl)) return 'нідерландське речення порожнє';
  if (isBlankText(uk)) return 'українське речення порожнє';
  const tileCount = splitIntoTiles(nl).length;
  if (tileCount < MINIMUM_SENTENCE_TILES || tileCount > MAXIMUM_SENTENCE_TILES) {
    return `речення має бути від ${MINIMUM_SENTENCE_TILES} до ${MAXIMUM_SENTENCE_TILES} слів, а не ${tileCount}`;
  }
  if (DIGIT_PATTERN.test(nl)) return 'нідерландське речення не має містити цифр';
  return null;
}

// Two or three extra tiles (three when the first random number is below one half). The sentence's wrong forms come
// first, in a random order; random vocabulary words that are not in the sentence fill the rest. Returns fewer when there
// are too few candidates.
export function pickDistractors({ sentenceTiles, vocabulary, wrongForms = [], random = Math.random }) {
  const distractorCount = random() < 0.5 ? DISTRACTOR_COUNT_WITH_EXTRA : DISTRACTOR_COUNT_WITHOUT_EXTRA;
  const pickedForms = shuffleOnce(removeCaseInsensitiveRepeats(wrongForms), random).slice(0, distractorCount);
  if (pickedForms.length === distractorCount) return pickedForms;
  const sentenceTileKeys = new Set(sentenceTiles.map(normalizeTileForComparison));
  const excludedKeys = interchangeableWordKeys(sentenceTileKeys);
  for (const form of pickedForms) excludedKeys.add(normalizeTileForComparison(form));
  const candidates = vocabulary
    .map(word => (typeof word === 'string' ? word.trim() : ''))
    .filter(isDistractorCandidate)
    .filter(word => {
      const key = normalizeTileForComparison(word);
      return !sentenceTileKeys.has(key) && !excludedKeys.has(key);
    });
  const fillers = shuffleOnce(removeCaseInsensitiveRepeats(candidates), random);
  return [...pickedForms, ...fillers.slice(0, distractorCount - pickedForms.length)];
}

// Reads a sentence's wrong forms as they were written: single words that look like a word of the sentence but are
// wrong in it ("gaat" for "gaan", "mooie" for "mooi"). A single string is one form. Returns
// { wrongForms: [string], rejected: [{ form, reason }] }: a form is kept (trimmed, as written) when it is one word of
// letters, is not a word of the sentence (case ignored), is not a twin of a sentence word (WRONG_FORM_TWIN_GROUPS), was
// not listed before, and fewer than MAXIMUM_WRONG_FORMS are kept already. null or undefined is no forms; anything else
// that is not a list is rejected as a whole.
export function normalizeWrongForms({ nl, wrongForms } = {}) {
  if (wrongForms === undefined || wrongForms === null) {
    return Object.freeze({ wrongForms: Object.freeze([]), rejected: Object.freeze([]) });
  }
  const list = typeof wrongForms === 'string' ? [wrongForms] : wrongForms;
  if (!Array.isArray(list)) {
    return Object.freeze({
      wrongForms: Object.freeze([]),
      rejected: Object.freeze([Object.freeze({ form: '', reason: WRONG_FORMS_NOT_LIST_REASON })]),
    });
  }
  const sentenceKeys = new Set(splitIntoTiles(nl).map(normalizeTileForComparison));
  const twinKeys = wrongFormTwinKeys(sentenceKeys);
  const kept = [];
  const listedKeys = new Set();
  const rejected = [];
  for (const value of list) {
    const form = typeof value === 'string' ? stripEdgePunctuation(value.trim()) : '';
    const key = normalizeTileForComparison(form);
    let reason = null;
    if (!isDistractorCandidate(form)) reason = NOT_ONE_WORD_REASON;
    else if (sentenceKeys.has(key)) reason = IN_SENTENCE_REASON;
    else if (twinKeys.has(key)) reason = TWIN_REASON;
    else if (listedKeys.has(key)) reason = ALREADY_LISTED_FORM_REASON;
    else if (kept.length >= MAXIMUM_WRONG_FORMS) reason = TOO_MANY_FORMS_REASON;
    if (reason !== null) {
      rejected.push(Object.freeze({ form: typeof value === 'string' ? value.trim() : '', reason }));
      continue;
    }
    listedKeys.add(key);
    kept.push(form);
  }
  return Object.freeze({ wrongForms: Object.freeze(kept), rejected: Object.freeze(rejected) });
}

// The stored wrong forms: JSON text of a list of strings, read the same way as the alternative orders.
export function parseStoredWrongForms(storedText) {
  return parseStoredAltOrders(storedText);
}

// A new array in a random order. When the order comes out unchanged (with two or more distinct tiles), shuffles again,
// up to MAXIMUM_SHUFFLE_ATTEMPTS times.
export function shuffleTiles(tiles, random = Math.random) {
  const hasTwoDistinctTiles = new Set(tiles).size >= 2;
  let shuffled = shuffleOnce(tiles, random);
  for (
    let attempt = 1;
    hasTwoDistinctTiles && attempt < MAXIMUM_SHUFFLE_ATTEMPTS && isSameOrder(shuffled, tiles);
    attempt++
  ) {
    shuffled = shuffleOnce(tiles, random);
  }
  return shuffled;
}

// Every word of each group that has a word in the sentence.
function interchangeableWordKeys(sentenceTileKeys) {
  const excludedKeys = new Set();
  for (const group of INTERCHANGEABLE_WORD_GROUPS) {
    if (group.some(word => sentenceTileKeys.has(word))) group.forEach(word => excludedKeys.add(word));
  }
  return excludedKeys;
}

// Every word of each twin group that has a word in the sentence.
function wrongFormTwinKeys(sentenceKeys) {
  const twinKeys = new Set();
  for (const group of WRONG_FORM_TWIN_GROUPS) {
    if (group.some(word => sentenceKeys.has(word))) group.forEach(word => twinKeys.add(word));
  }
  return twinKeys;
}

// True when both lists hold the same words with the same counts, compared lower-case with apostrophes normalised.
// Case and punctuation do not make a word different.
export function isSameWordMultiset(tilesA, tilesB) {
  return isSameOrder(
    tilesA.map(normalizeTileForComparison).sort(),
    tilesB.map(normalizeTileForComparison).sort(),
  );
}

// The accepted orders of a sentence as tile lists: the canonical one (from nl) first, then the alternatives in order.
export function listAcceptedOrders({ nl, altOrders = [] }) {
  return [splitIntoTiles(nl), ...altOrders.map(order => splitIntoTiles(order))];
}

// The index of the first order that equals the answer (lower-case, apostrophes normalised), or -1.
export function findMatchingOrderIndex({ answerTiles, orders }) {
  const answerKey = answerTiles.map(normalizeTileForComparison).join(' ');
  return orders.findIndex(orderTiles => orderTiles.map(normalizeTileForComparison).join(' ') === answerKey);
}

// Reads a sentence's alternative word orders as they were written: each is a string (trimmed) or an array of tiles
// (joined by spaces). Returns { altOrders: [string], rejected: [{ order, reason }] }: an alternative is kept when it is
// not blank, has the same words as nl (case and punctuation ignored), is not the canonical order or an earlier one,
// and, when structure (the sentence's valid schema, else null) is given, is its segments one after another in some
// order. At most MAXIMUM_ALTERNATIVE_ORDERS are kept; the rest are rejected. A value that is not a list is rejected
// as a whole. null or undefined means no alternatives.
export function normalizeAltOrders({ nl, altOrders, structure = null } = {}) {
  if (altOrders === undefined || altOrders === null) return Object.freeze({ altOrders: Object.freeze([]), rejected: Object.freeze([]) });
  if (!Array.isArray(altOrders)) {
    return Object.freeze({ altOrders: Object.freeze([]), rejected: Object.freeze([Object.freeze({ order: '', reason: ALTERNATIVE_NOT_LIST_REASON })]) });
  }
  const nlTiles = splitIntoTiles(nl);
  const listedKeys = new Set([normalizeSentenceKey(nl)]);
  const segmentTiles = structure === null ? null : structure.map(segment => splitIntoTiles(segment.text));
  const kept = [];
  const rejected = [];
  for (const value of altOrders) {
    const order = orderText(value);
    const tiles = splitIntoTiles(order);
    const key = tiles.map(normalizeTileForComparison).join(' ');
    let reason = null;
    if (tiles.length === 0) reason = EMPTY_ORDER_REASON;
    else if (!isSameWordMultiset(tiles, nlTiles)) reason = DIFFERENT_WORDS_REASON;
    else if (listedKeys.has(key)) reason = ALREADY_LISTED_REASON;
    else if (segmentTiles !== null && !matchesSegments(tiles, segmentTiles)) reason = SCHEMA_MISMATCH_ORDER_REASON;
    else if (kept.length >= MAXIMUM_ALTERNATIVE_ORDERS) reason = TOO_MANY_ORDERS_REASON;
    if (reason !== null) {
      rejected.push(Object.freeze({ order, reason }));
      continue;
    }
    listedKeys.add(key);
    kept.push(order);
  }
  return Object.freeze({ altOrders: Object.freeze(kept), rejected: Object.freeze(rejected) });
}

// An alternative as text: a string as it is (trimmed), or the tiles of an array joined by spaces; anything else is ''.
function orderText(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.filter(tile => typeof tile === 'string').join(' ').trim();
  return '';
}

// True when the tiles are the segments' tiles one after another, each segment used exactly once, in some order.
// Segments may share words, so this backtracks. The used segments form a bit mask that fixes the position in the
// tiles, so a failed mask is never tried again: at most 2^12 states for the 12 segments allowed.
function matchesSegments(tiles, segmentTiles) {
  const tileKeys = tiles.map(normalizeTileForComparison);
  const segmentKeys = segmentTiles.map(segment => segment.map(normalizeTileForComparison));
  const allSegmentsUsed = (1 << segmentKeys.length) - 1;
  const failedMasks = new Set();
  const matchesFrom = (position, usedMask) => {
    if (usedMask === allSegmentsUsed) return position === tileKeys.length;
    if (failedMasks.has(usedMask)) return false;
    for (let index = 0; index < segmentKeys.length; index++) {
      const segmentBit = 1 << index;
      if (usedMask & segmentBit) continue;
      const segment = segmentKeys[index];
      const fits = segment.every((tile, offset) => tileKeys[position + offset] === tile);
      if (fits && matchesFrom(position + segment.length, usedMask | segmentBit)) return true;
    }
    failedMasks.add(usedMask);
    return false;
  };
  return matchesFrom(0, 0);
}

function stripEdgePunctuation(token) {
  return token.replace(EDGE_PUNCTUATION_PATTERN, '');
}

function normalizeTileForComparison(tile) {
  return lowerCase(tile).replace(APOSTROPHE_VARIANTS_PATTERN, "'");
}

function lowerCase(text) {
  return text.toLowerCase();
}

function isBlankText(value) {
  return typeof value !== 'string' || value.trim() === '';
}

function isDistractorCandidate(word) {
  return DISTRACTOR_WORD_PATTERN.test(word) && countLetters(word) >= MINIMUM_DISTRACTOR_LETTERS;
}

function countLetters(text) {
  return [...text].filter(character => LETTER_PATTERN.test(character)).length;
}

function removeCaseInsensitiveRepeats(words) {
  const seenKeys = new Set();
  return words.filter(word => {
    const key = normalizeTileForComparison(word);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

function shuffleOnce(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const otherIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

function isSameOrder(firstTiles, secondTiles) {
  return firstTiles.length === secondTiles.length && firstTiles.every((tile, index) => tile === secondTiles[index]);
}
