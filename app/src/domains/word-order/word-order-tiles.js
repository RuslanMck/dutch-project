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

// Two or three words from the vocabulary that are not in the sentence (three when the first random number is below
// one half). Returns fewer when the vocabulary has too few candidates.
export function pickDistractors({ sentenceTiles, vocabulary, random = Math.random }) {
  const distractorCount = random() < 0.5 ? DISTRACTOR_COUNT_WITH_EXTRA : DISTRACTOR_COUNT_WITHOUT_EXTRA;
  const sentenceTileKeys = new Set(sentenceTiles.map(normalizeTileForComparison));
  const excludedKeys = interchangeableWordKeys(sentenceTileKeys);
  const candidates = vocabulary
    .map(word => (typeof word === 'string' ? word.trim() : ''))
    .filter(isDistractorCandidate)
    .filter(word => {
      const key = normalizeTileForComparison(word);
      return !sentenceTileKeys.has(key) && !excludedKeys.has(key);
    });
  return shuffleOnce(removeCaseInsensitiveRepeats(candidates), random).slice(0, distractorCount);
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
