// Sorts the words without a category into the word categories with the LLM (through OpenRouter), 60 words per request.
// It runs in the background after words are added (one run at a time; a run asked for meanwhile runs once more) and on
// demand (POST /api/words/categorize). The answer is checked here: unknown word ids and category ids are ignored, and a
// word the model left out stays uncategorized for the next run.
import { WORD_CATEGORIES, WORD_CATEGORY_IDS } from '../../contracts/category-contracts.js';
import { ValidationError } from '../../errors/domain-errors.js';

const NOT_CONFIGURED_MESSAGE = 'Модель не налаштована';
const NO_CATEGORIES_MESSAGE = 'у відповіді моделі немає об\'єкта categories';
const NOT_JSON_MESSAGE = 'відповідь моделі не є JSON';
const WORDS_PER_REQUEST = 60;
const DEFAULT_LIMIT = 300;

const CATEGORY_MEANINGS = Object.freeze({
  food: 'food, drinks, cooking, meals, groceries',
  home: 'the house, rooms, furniture, household things, housework, housing',
  clothes: 'clothes, shoes, fabrics, accessories',
  colours: 'colour words',
  numbers: 'numbers, clock time, dates, days, months, years',
  people: 'people, family members, relatives, relationships, social roles',
  body: 'body parts, health, illness, medicine, going to the doctor, hygiene',
  city: 'the city, streets, buildings, shops, public transport, travel, directions',
  work: 'work, jobs, the office, school, studying, courses, exams',
  nature: 'nature, animals, plants, weather, seasons, landscapes',
  leisure: 'hobbies, sports, free time, holidays, music, films, games',
  feelings: 'emotions, moods, character traits, opinions',
  actions: 'verbs of everyday actions (verbs go here unless another category fits better)',
  talk: 'expressions, phrases, greetings, questions, small talk',
  other: 'anything that fits none of the other categories',
});

const SYSTEM_PROMPT = [
  'You sort Dutch words and expressions of a learner into topic categories. Each word gets exactly one category id',
  'from this list (the answer uses the ids only, in English, not the names):',
  ...WORD_CATEGORIES.map(category => `- ${category.id}: ${CATEGORY_MEANINGS[category.id]}`),
  '',
  'Rules:',
  '- Verbs go to "actions" unless another category fits better (koken goes to "food").',
  '- Expressions and phrases go to "talk" unless they are clearly about another topic.',
  '- Each input line is: word id | Dutch | Ukrainian translation. The Ukrainian only shows the meaning.',
  '- Use only the ids above. Give every word id of the input one category.',
  '',
  'Answer with a JSON object only, no text before or after it:',
  '{"categories": {"<word id>": "<category id>"}}',
].join('\n');

export function createWordCategorizer({ wordRepository, openRouterClient, model, changeEventBus, logger = console }) {
  let runningRun = null;
  let isRunRequested = false;

  // Sorts up to limit uncategorized words, batch by batch. Returns { categorized, remaining }. Throws when OpenRouter
  // has no key or a request fails.
  async function categorizeUncategorizedWords({ limit = DEFAULT_LIMIT } = {}) {
    if (!openRouterClient.isConfigured) throw new ValidationError(NOT_CONFIGURED_MESSAGE);
    const words = wordRepository.listUncategorizedWords(limit);
    let categorized = 0;
    for (const batch of splitIntoBatches(words, WORDS_PER_REQUEST)) {
      const responseText = await openRouterClient.completeChat(buildMessages(batch), { model });
      const categoryByWordId = parseWordCategories(responseText, batch);
      for (const [wordId, category] of categoryByWordId) {
        wordRepository.updateWord(wordId, { category });
        categorized += 1;
      }
      if (categoryByWordId.size) changeEventBus.publishChange('words');
    }
    return { categorized, remaining: wordRepository.countUncategorizedWords() };
  }

  // Starts a background run unless there is no key. A run asked for while one is going runs once more after it. Returns
  // the promise of the run (it never rejects: errors are logged), or null when nothing starts.
  function categorizeInBackground() {
    if (!openRouterClient.isConfigured) return null;
    if (runningRun) {
      isRunRequested = true;
      return runningRun;
    }
    runningRun = runUntilNoRequest().finally(() => { runningRun = null; });
    return runningRun;
  }

  async function runUntilNoRequest() {
    do {
      isRunRequested = false;
      try {
        await categorizeUncategorizedWords();
      } catch (error) {
        logger.error('word categories: background run failed:', error.message);
        return;
      }
    } while (isRunRequested);
  }

  return Object.freeze({ categorizeUncategorizedWords, categorizeInBackground });
}

// The messages for one batch: the system prompt, then the words one per line.
function buildMessages(words) {
  const content = [
    `Sort these ${words.length} words. Format: word id | Dutch | Ukrainian translation.`,
    ...words.map(word => `${word.id} | ${word.nl} | ${word.uk}`),
  ].join('\n');
  return Object.freeze([
    Object.freeze({ role: 'system', content: SYSTEM_PROMPT }),
    Object.freeze({ role: 'user', content }),
  ]);
}

// Returns a Map of word id → category id for the words of the batch, leaving out unknown ids and categories.
function parseWordCategories(responseText, words) {
  const parsedAnswer = parseJsonObject(responseText);
  const categories = parsedAnswer.categories;
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
    throw new ValidationError(NO_CATEGORIES_MESSAGE);
  }
  const batchWordIds = new Set(words.map(word => String(word.id)));
  const categoryByWordId = new Map();
  for (const [wordId, category] of Object.entries(categories)) {
    if (!batchWordIds.has(wordId) || !WORD_CATEGORY_IDS.includes(category)) continue;
    categoryByWordId.set(Number(wordId), category);
  }
  return categoryByWordId;
}

// The answer is a JSON object, possibly inside a code fence or with a sentence around it.
function parseJsonObject(responseText) {
  const start = String(responseText).indexOf('{');
  const end = String(responseText).lastIndexOf('}');
  try {
    return JSON.parse(String(responseText).slice(start, end + 1));
  } catch {
    throw new ValidationError(NOT_JSON_MESSAGE);
  }
}

function splitIntoBatches(items, batchSize) {
  const batches = [];
  for (let index = 0; index < items.length; index += batchSize) batches.push(items.slice(index, index + batchSize));
  return batches;
}
