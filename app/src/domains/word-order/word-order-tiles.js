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

const EDGE_PUNCTUATION_PATTERN = /^[.,?!;:"«»“”„‘’…]+|[.,?!;:"«»“”„‘’…]+$/g;
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

// Splits on whitespace and strips punctuation from both ends of each token; case is kept.
export function splitIntoTiles(dutchSentence) {
  return String(dutchSentence ?? '')
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
