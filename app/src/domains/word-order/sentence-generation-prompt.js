// Builds the chat messages that ask an LLM for new word-order sentences, and reads its JSON answer. The rules follow
// docs/SENTENCE_GENERATION_PROMPT.md. Pure.
import { ValidationError } from '../../errors/domain-errors.js';
import { RULES, STRUCTURE_ROLES, normalizeRule } from './word-order-tiles.js';

const DEFAULT_SENTENCE_COUNT = 20;
const MAXIMUM_EXISTING_SENTENCES = 200;
const GRAMMAR_WORDS = [
  'ik', 'jij', 'je', 'hij', 'zij', 'we', 'de', 'het', 'een', 'is', 'zijn', 'heb', 'niet', 'geen', 'en', 'maar', 'ook',
  'nog', 'er', 'al', 'om', 'in', 'op', 'met', 'voor', 'naar', 'van', 'dat', 'omdat', 'als', 'wat', 'waar', 'hoe',
];
const JSON_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;

const SYSTEM_PROMPT = [
  'You write Dutch sentences for a word-order exercise for a learner at level A1-A2. The learner sees the Ukrainian',
  'sentence and puts the shuffled Dutch words in the right order.',
  '',
  'Rules for each sentence:',
  '- 4 to 9 words. One clause, or a main clause plus one short subordinate clause.',
  '- Use at least one of the learner\'s known words in every sentence. Other words may come from the other words list',
  `  or from these grammar words: ${GRAMMAR_WORDS.join(', ')}.`,
  `- Spread the sentences over these rules, each rule at least twice: ${RULES.join(', ')}.`,
  '  The rule field is one of these names.',
  '- alt_orders: every other natural word order of the sentence, as a list of strings (empty when there is none). Each',
  '  one uses exactly the same words (each word as often as in the sentence) and the same structure segments, which may',
  '  come in another order. Do not list an order that differs only in capitals or punctuation. The sentence itself is',
  '  the most neutral order. Example: nl "Ik neem een drankje omdat ik dorst heb." with alt_orders',
  '  ["Omdat ik dorst heb, neem ik een drankje."].',
  '- wrong_forms: 2 or 3 single words (at most 5) that look like a word of the sentence but are wrong in it; they are',
  '  shown as extra tiles. Use another form of a sentence word: the verb in another person or tense (gaat or ging for',
  '  gaan), an adjective with or without -e (mooie for mooi), singular or plural (huizen for huis), het for a de-word',
  '  or de for a het-word. Each must make the sentence wrong wherever it is put, so never a word that could stand in',
  '  a correct sentence (not wij for we, not een for het, not a synonym). Never a word of the sentence itself.',
  '  Example: "Wij gaan morgen naar de markt." with wrong_forms ["gaat", "ga", "het"].',
  '- No commas in the sentence itself (nl); an alternative order may have a comma after a fronted clause.',
  '  No quotation marks, digits or names. End with "." or "?".',
  '- The Ukrainian field is a natural translation, not word by word. Use the informal "ти" unless the sentence is',
  '  clearly polite.',
  '- Do not repeat or copy any sentence that is already saved.',
  '- structure: the sentence split into ordered segments, each with a role (the Ukrainian name of its part). The texts',
  '  of the segments, joined by single spaces, are exactly the words of the sentence in the same order.',
  `  Roles: ${STRUCTURE_ROLES.join(', ')}. Example: "Deze week ben ik jarig." has the segments`,
  '  "Deze week" (час), "ben" (дієслово), "ik" (підмет), "jarig" (прикметник).',
  '',
  'Answer with a JSON object only, no text before or after it:',
  '{"sentences":[{"nl":"...","uk":"...","rule":"...","structure":[{"text":"...","role":"..."}],"alt_orders":["..."],"wrong_forms":["..."]}]}',
  'The array has exactly the number of items the user asks for.',
].join('\n');

// knownWords: the learner's words being learned or learned; otherWords: more vocabulary that may be used;
// existingSentences: saved sentences (strings, or objects with nl) that must not be repeated.
export function buildGenerationMessages({
  knownWords = [],
  otherWords = [],
  existingSentences = [],
  count = DEFAULT_SENTENCE_COUNT,
}) {
  return Object.freeze([
    Object.freeze({ role: 'system', content: SYSTEM_PROMPT }),
    Object.freeze({
      role: 'user',
      content: buildUserContent({ knownWords, otherWords, existingSentences, count }),
    }),
  ]);
}

// Returns the sentences with a string nl and uk (rule null when unknown; structure the array of segments as the model
// wrote it, or null; alt_orders and wrong_forms the lists as the model wrote them, or []), at most count of them when count is given.
// Throws ValidationError when the answer holds no JSON object or has no sentences array.
export function parseGeneratedSentences(responseText, { count } = {}) {
  const parsedAnswer = parseJsonObject(responseText);
  if (!Array.isArray(parsedAnswer.sentences)) {
    throw new ValidationError('у відповіді моделі немає масиву sentences');
  }
  const sentences = parsedAnswer.sentences.filter(isSentenceCandidate).map(toGeneratedSentence);
  return Object.freeze(count === undefined ? sentences : sentences.slice(0, count));
}

function buildUserContent({ knownWords, otherWords, existingSentences, count }) {
  const existingNlTexts = existingSentences
    .slice(0, MAXIMUM_EXISTING_SENTENCES)
    .map(sentence => (typeof sentence === 'string' ? sentence : sentence.nl));
  return [
    `Make ${count} new sentences.`,
    '',
    'Words the learner knows or is learning (use at least one in each sentence):',
    listOrNone(knownWords),
    '',
    'Other words the learner has (may be used):',
    listOrNone(otherWords),
    '',
    'Sentences already saved (do not repeat them):',
    existingNlTexts.length ? existingNlTexts.map(text => `- ${text}`).join('\n') : '(none)',
  ].join('\n');
}

function listOrNone(words) {
  return words.length ? words.join(', ') : '(none)';
}

// Tries the fenced body (or the whole text), then the text from its first { to its last }, since a model may add words
// around the JSON.
function parseJsonObject(responseText) {
  const text = String(responseText ?? '');
  const parsed = parseObjectText(extractFencedBody(text).trim()) ?? parseObjectText(extractBraceSpan(text));
  if (!parsed) throw new ValidationError('відповідь моделі не JSON');
  return parsed;
}

function parseObjectText(bodyText) {
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

function extractFencedBody(text) {
  const fenceMatch = text.match(JSON_FENCE_PATTERN);
  return fenceMatch ? fenceMatch[1] : text;
}

function extractBraceSpan(text) {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  return firstBrace !== -1 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : '';
}

function isSentenceCandidate(item) {
  return item !== null && typeof item === 'object' && typeof item.nl === 'string' && typeof item.uk === 'string';
}

function toGeneratedSentence(item) {
  return Object.freeze({
    nl: item.nl.trim(),
    uk: item.uk.trim(),
    rule: normalizeRule(item.rule),
    structure: Array.isArray(item.structure) ? item.structure : null,
    alt_orders: Array.isArray(item.alt_orders) ? item.alt_orders : [],
    wrong_forms: Array.isArray(item.wrong_forms) ? item.wrong_forms : [],
  });
}
