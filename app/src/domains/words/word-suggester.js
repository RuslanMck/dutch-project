// Suggests common Dutch words the dictionary lacks: the frequency groups without a dictionary word, sent to OpenRouter
// (WORD_CATEGORY_MODEL) with the injected client, and the answer checked. Nothing is saved: the learner picks the words
// and adds them with the usual add. Throws when OpenRouter has no key or a request fails.
import { ValidationError } from '../../errors/domain-errors.js';
import { buildSuggestionMessages } from './word-suggestion-prompt.js';
import {
  MAXIMUM_FREQUENCY_RANK,
  findMissingFrequencyGroups,
  parseWordSuggestions,
} from './word-suggestion-planning.js';

const NOT_CONFIGURED_MESSAGE = 'Модель не налаштована';
const DEFAULT_LIMIT = 30;

export function createWordSuggester({ wordRepository, frequencyRepository, openRouterClient, model }) {
  // Returns { suggestions: [{ nl, article, uk, category, frequency_rank }] }, at most limit of them.
  async function suggestWords({ limit = DEFAULT_LIMIT } = {}) {
    if (!openRouterClient.isConfigured) throw new ValidationError(NOT_CONFIGURED_MESSAGE);
    const dictionaryTexts = wordRepository.listWordTextsAndArticles().map(word => word.nl);
    const groups = findMissingFrequencyGroups({
      frequencyRows: frequencyRepository.listFrequencyRowsUpToRank(MAXIMUM_FREQUENCY_RANK),
      dictionaryTexts,
    });
    if (groups.length === 0) return { suggestions: [] };
    const responseText = await openRouterClient.completeChat(buildSuggestionMessages({ groups, limit }), { model });
    return { suggestions: parseWordSuggestions(responseText, { groups, dictionaryTexts, limit }) };
  }

  return Object.freeze({ suggestWords });
}
