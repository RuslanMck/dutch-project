// Builds the chat messages that ask the LLM for missing common Dutch words, for the learner's dictionary. Pure.
import { WORD_CATEGORIES } from '../../contracts/category-contracts.js';

const SYSTEM_PROMPT = [
  'You choose Dutch words that a Ukrainian-speaking learner at level A1-A2 most needs and that are missing from the',
  'learner\'s dictionary. Each input line is one group: "rank N: forms", the forms of one Dutch word separated',
  'by commas (e.g. "rank 412: gaat, ging, gaan"). The forms are inflected forms of the same word.',
  '',
  'For each useful word give one suggestion:',
  '- rank: the rank N of the group the word comes from.',
  '- nl: the dictionary form: the infinitive of a verb, the singular of a noun, the base form of an adjective.',
  '  Lowercase, without the article.',
  '- article: "de" or "het" for a noun (the article Dutch uses with it), "" for every other word.',
  '- uk: the Ukrainian translation, one or two words. The Ukrainian must be correct literary Ukrainian,',
  '  no russianisms, no surzhyk, no Russian words. Use the standard Ukrainian word for the meaning.',
  '- category: exactly one of these ids (the name in brackets is its meaning):',
  `  ${WORD_CATEGORIES.map(category => `${category.id} (${category.name})`).join(', ')}.`,
  '',
  'Skip pronouns, articles, determiners, names, numbers written as words, and any word the forms do not clearly',
  'identify.',
  'Put the most useful words first. Never repeat a word.',
  '',
  'Answer with a JSON object only, no text before or after it:',
  '{"suggestions":[{"rank":412,"nl":"...","article":"","uk":"...","category":"..."}]}',
].join('\n');

// groups: [{ rank, forms }] from findMissingFrequencyGroups; limit: the most suggestions to return.
export function buildSuggestionMessages({ groups, limit }) {
  const content = [
    `Pick at most ${limit} words from these ${groups.length} groups. Format of each line: rank N: forms.`,
    ...groups.map(group => `rank ${group.rank}: ${group.forms.join(', ')}`),
  ].join('\n');
  return Object.freeze([
    Object.freeze({ role: 'system', content: SYSTEM_PROMPT }),
    Object.freeze({ role: 'user', content }),
  ]);
}
