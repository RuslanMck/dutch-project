// Missing common words, pure: the frequency groups (the forms that share one rank, i.e. one lemma) the dictionary does
// not cover, and the check of the model's answer. A group is covered when one of its forms is a token of a dictionary
// word (de/het and punctuation ignored).
import { WORD_CATEGORY_IDS } from '../../contracts/category-contracts.js';
import { ARTICLE_VALUES } from '../../contracts/shared-contracts.js';
import { ValidationError } from '../../errors/domain-errors.js';

export const MAXIMUM_FREQUENCY_RANK = 4000;
export const GROUPS_PER_REQUEST = 120;

const NOT_JSON_MESSAGE = 'відповідь моделі не є JSON';
const NO_SUGGESTIONS_MESSAGE = 'у відповіді моделі немає масиву suggestions';
const LEADING_ARTICLE_PATTERN = /^(de|het)\s+/;
const CURLY_APOSTROPHE_PATTERN = /[‘’]/g;
const PUNCTUATION_PATTERN = /[?!.,;:()"…]/g;
const EDGE_APOSTROPHE_PATTERN = /^'+|'+$/g;

// The tokens of a Dutch text as the dictionary matches them: lowercase, no leading article, no punctuation. Each token
// also appears without its edge apostrophes ("'s" → "s").
export function tokenizeDutchText(dutchText) {
  const normalizedText = String(dutchText ?? '')
    .toLowerCase()
    .replace(CURLY_APOSTROPHE_PATTERN, "'")
    .trim()
    .replace(LEADING_ARTICLE_PATTERN, '')
    .replace(PUNCTUATION_PATTERN, ' ');
  const tokens = normalizedText.split(/\s+/).filter(token => token.length > 0);
  const trimmedTokens = tokens.map(token => token.replace(EDGE_APOSTROPHE_PATTERN, '')).filter(Boolean);
  return [...new Set([...tokens, ...trimmedTokens])];
}

// The groups for the prompt: each rank up to maximumRank whose forms no dictionary word covers, most frequent first, at
// most groupLimit. frequencyRows: [{ wordForm, frequencyRank }]; dictionaryTexts: the nl of every word.
// Returns [{ rank, forms }] (forms in the order of the rows).
export function findMissingFrequencyGroups({
  frequencyRows, dictionaryTexts, maximumRank = MAXIMUM_FREQUENCY_RANK, groupLimit = GROUPS_PER_REQUEST,
}) {
  const dictionaryTokens = new Set(dictionaryTexts.flatMap(tokenizeDutchText));
  const formsByRank = new Map();
  for (const { wordForm, frequencyRank } of frequencyRows) {
    if (frequencyRank > maximumRank) continue;
    if (!formsByRank.has(frequencyRank)) formsByRank.set(frequencyRank, []);
    formsByRank.get(frequencyRank).push(wordForm.toLowerCase());
  }
  const groups = [];
  for (const rank of [...formsByRank.keys()].sort((first, second) => first - second)) {
    const forms = formsByRank.get(rank);
    if (forms.some(form => dictionaryTokens.has(form))) continue;
    groups.push({ rank, forms });
    if (groups.length === groupLimit) break;
  }
  return groups;
}

// The model's answer, checked: { "suggestions": [{ rank, nl, article, uk, category }] }. A suggestion is kept when its
// rank is one of the groups sent, its nl and uk are text, its article and category are allowed, and its nl is not in
// the dictionary already (article ignored) nor a repeat. At most limit suggestions, in the model's order. Returns
// [{ nl, article, uk, category, frequency_rank }].
export function parseWordSuggestions(responseText, { groups, dictionaryTexts, limit }) {
  const parsedAnswer = parseJsonObject(responseText);
  if (!Array.isArray(parsedAnswer.suggestions)) throw new ValidationError(NO_SUGGESTIONS_MESSAGE);
  const rankSet = new Set(groups.map(group => group.rank));
  const takenNlSet = new Set(dictionaryTexts.map(text => normalizeNl(text)));
  const suggestions = [];
  for (const item of parsedAnswer.suggestions) {
    if (suggestions.length === limit) break;
    const suggestion = checkSuggestion(item, rankSet);
    if (!suggestion || takenNlSet.has(normalizeNl(suggestion.nl))) continue;
    takenNlSet.add(normalizeNl(suggestion.nl));
    suggestions.push(suggestion);
  }
  return suggestions;
}

function checkSuggestion(item, rankSet) {
  if (!item || typeof item !== 'object') return null;
  const nl = typeof item.nl === 'string' ? normalizeNl(item.nl) : '';
  const uk = typeof item.uk === 'string' ? item.uk.trim() : '';
  const article = item.article === undefined || item.article === null ? '' : String(item.article).trim().toLowerCase();
  const frequencyRank = Number.isInteger(item.rank) ? item.rank : null;
  if (!nl || !uk || !ARTICLE_VALUES.includes(article)) return null;
  if (frequencyRank === null || !rankSet.has(frequencyRank)) return null;
  if (!WORD_CATEGORY_IDS.includes(item.category)) return null;
  return { nl, article, uk, category: item.category, frequency_rank: frequencyRank };
}

// Lowercase, trimmed and without a leading article: the key the dictionary check compares.
function normalizeNl(text) {
  return String(text).trim().toLowerCase().replace(LEADING_ARTICLE_PATTERN, '');
}

// The answer is a JSON object, possibly inside a code fence or with a sentence around it.
function parseJsonObject(responseText) {
  const text = String(responseText);
  try {
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    throw new ValidationError(NOT_JSON_MESSAGE);
  }
}
