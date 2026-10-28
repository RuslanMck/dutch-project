// Word-order business rules: adding sentences (by MCP, import or generation; invalid ones and repeats are skipped),
// listing and deleting them, the set the page shows (tiles = the sentence's words plus distractors, shuffled), and
// the check of an answer. Answers are kept for choosing the next sentences; they never change the FSRS schedule.
// Publishes 'word-order' after each change.
import { NotFoundError, ValidationError } from '../../errors/domain-errors.js';
import {
  buildGenerationMessages,
  parseGeneratedSentences,
} from './sentence-generation-prompt.js';
import { parseSentenceMarkdown } from './sentence-markdown.js';
import {
  isCorrectOrder,
  normalizeRule,
  normalizeSentenceKey,
  pickDistractors,
  shuffleTiles,
  splitIntoTiles,
  validateSentence,
} from './word-order-tiles.js';

const CHANGE_COLLECTION = 'word-order';
const DEFAULT_SET_SIZE = 10;
const DEFAULT_GENERATE_COUNT = 20;
const MAXIMUM_VOCABULARY_PER_PROMPT = 300;
const LEARNING_STATUSES = Object.freeze(['learning', 'learned']);
const DUPLICATE_REASON = 'вже є';
const NOT_CONFIGURED_MESSAGE = 'OpenRouter не налаштовано';

export function createWordOrderService({
  wordOrderRepository,
  openRouterClient,
  runInTransaction,
  changeEventBus,
  clock,
  random = Math.random,
}) {
  // sentenceInputs: [{ nl, uk, rule? }]. Returns { added: [sentence], skipped: [{ nl, reason }] }.
  function addSentences(sentenceInputs, { source }) {
    const addedIds = [];
    const skipped = [];
    runInTransaction(() => {
      for (const sentenceInput of sentenceInputs) {
        const nl = String(sentenceInput.nl ?? '').trim();
        const uk = String(sentenceInput.uk ?? '').trim();
        const invalidReason = validateSentence({ nl, uk });
        if (invalidReason) {
          skipped.push({ nl, reason: invalidReason });
          continue;
        }
        const sentenceId = wordOrderRepository.insertSentence({
          nl,
          uk,
          rule: normalizeRule(sentenceInput.rule),
          source,
          nlKey: normalizeSentenceKey(nl),
          addedAt: clock.now(),
        });
        if (sentenceId === null) skipped.push({ nl, reason: DUPLICATE_REASON });
        else addedIds.push(sentenceId);
      }
    });
    if (addedIds.length) changeEventBus.publishChange(CHANGE_COLLECTION);
    return { added: addedIds.map(sentenceId => wordOrderRepository.findSentenceById(sentenceId)), skipped };
  }

  // Reads the sentence table of a Markdown file. Throws ValidationError when it finds no sentence at all.
  function importMarkdown(markdownText) {
    const { sentences, errors } = parseSentenceMarkdown(markdownText);
    if (sentences.length === 0) throw new ValidationError(errors.join('; '));
    return { ...addSentences(sentences, { source: 'import' }), errors };
  }

  // Asks the LLM for new sentences: they draw on the learner's vocabulary and avoid the saved ones.
  async function generateSentences({ count = DEFAULT_GENERATE_COUNT } = {}) {
    if (!openRouterClient.isConfigured) throw new ValidationError(NOT_CONFIGURED_MESSAGE);
    const vocabulary = wordOrderRepository.listVocabulary();
    const knownWords = vocabulary.filter(word => LEARNING_STATUSES.includes(word.status)).map(word => word.nl);
    // Every learning or learned word is sent; the other words are a random sample, so the prompt does not always
    // hold the alphabetically first ones.
    const otherWords = shuffleTiles(
      vocabulary.filter(word => !LEARNING_STATUSES.includes(word.status)).map(word => word.nl),
      random,
    );
    const messages = buildGenerationMessages({
      knownWords,
      otherWords: otherWords.slice(0, MAXIMUM_VOCABULARY_PER_PROMPT),
      existingSentences: wordOrderRepository.listSentencesNewestFirst(),
      count,
    });
    const responseText = await openRouterClient.completeChat(messages);
    return addSentences(parseGeneratedSentences(responseText, { count }), { source: 'openrouter' });
  }

  // Newest first; limit is optional.
  function listSentences({ limit } = {}) {
    const sentences = wordOrderRepository.listSentencesNewestFirst();
    return limit ? sentences.slice(0, limit) : sentences;
  }

  function deleteSentence(sentenceId) {
    runInTransaction(() => {
      if (!wordOrderRepository.findSentenceById(sentenceId)) {
        throw new NotFoundError(`sentence ${sentenceId} not found`);
      }
      wordOrderRepository.deleteSentence(sentenceId);
    });
    changeEventBus.publishChange(CHANGE_COLLECTION);
  }

  // The next sentences to practise, each with its shuffled tiles. The Dutch text is not sent.
  function getSentenceSet({ size = DEFAULT_SET_SIZE } = {}) {
    const vocabulary = wordOrderRepository.listVocabulary().map(word => word.nl);
    const sentences = wordOrderRepository.listSentencesForSet(size).map(sentence => {
      const sentenceTiles = splitIntoTiles(sentence.nl);
      const distractors = pickDistractors({ sentenceTiles, vocabulary, random });
      return {
        id: sentence.id,
        uk: sentence.uk,
        rule: sentence.rule,
        tiles: shuffleTiles([...sentenceTiles, ...distractors], random),
      };
    });
    return {
      sentences,
      total: wordOrderRepository.countSentences(),
      can_generate: openRouterClient.isConfigured,
    };
  }

  // Records the answer and says whether the tiles were in the right order.
  function answerSentence({ id, tiles }) {
    const sentence = wordOrderRepository.findSentenceById(id);
    if (!sentence) throw new NotFoundError(`sentence ${id} not found`);
    const isCorrect = isCorrectOrder({ answerTiles: tiles, dutchSentence: sentence.nl });
    wordOrderRepository.createAnswer({
      sentenceId: id,
      answeredAt: clock.now(),
      isCorrect,
      answer: tiles.join(' '),
    });
    changeEventBus.publishChange(CHANGE_COLLECTION);
    return {
      is_correct: isCorrect,
      correct_nl: sentence.nl,
      correct_tiles: splitIntoTiles(sentence.nl),
    };
  }

  return Object.freeze({
    addSentences,
    importMarkdown,
    generateSentences,
    listSentences,
    deleteSentence,
    getSentenceSet,
    answerSentence,
  });
}
