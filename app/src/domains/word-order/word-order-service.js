// Word-order business rules: adding sentences (by MCP, import or generation; invalid ones and repeats are skipped),
// listing, editing and deleting them, the set the page shows (tiles = the sentence's words plus distractors, shuffled,
// optionally only some rules), and the check of an answer. Answers are kept for choosing the next sentences; they
// never change the FSRS schedule. Publishes 'word-order' after each change.
import { NotFoundError, ValidationError } from '../../errors/domain-errors.js';
import {
  buildGenerationMessages,
  parseGeneratedSentences,
} from './sentence-generation-prompt.js';
import { parseSentenceMarkdown } from './sentence-markdown.js';
import {
  RULES,
  isCorrectOrder,
  normalizeRule,
  normalizeRuleNames,
  normalizeSentenceKey,
  normalizeStructure,
  parseStoredStructure,
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
const STRUCTURE_MISMATCH_REASON = 'схема не збігається з реченням';
const NOT_CONFIGURED_MESSAGE = 'OpenRouter не налаштовано';

export function createWordOrderService({
  wordOrderRepository,
  openRouterClient,
  runInTransaction,
  changeEventBus,
  clock,
  random = Math.random,
}) {
  // sentenceInputs: [{ nl, uk, rule?, structure? }]. Returns { added, updated, skipped: [{ nl, reason }],
  // warnings: [{ nl, reason }] }. A structure that does not read as a schema of the sentence is dropped with a warning;
  // the sentence is still added. A repeat is skipped, unless its stored schema is missing and this input brings a
  // valid one: then the schema (and the rule, when none is stored) is filled and the sentence is listed in updated.
  // A sentence added earlier in this same call is not listed in updated again: it stays in added, in its latest state.
  function addSentences(sentenceInputs, { source }) {
    const addedIds = [];
    const updatedIds = [];
    const skipped = [];
    const warnings = [];
    runInTransaction(() => {
      for (const sentenceInput of sentenceInputs) {
        const nl = String(sentenceInput.nl ?? '').trim();
        const uk = String(sentenceInput.uk ?? '').trim();
        const invalidReason = validateSentence({ nl, uk });
        if (invalidReason) {
          skipped.push({ nl, reason: invalidReason });
          continue;
        }
        const structure = normalizeStructure({ nl, structure: sentenceInput.structure });
        if (sentenceInput.structure !== undefined && sentenceInput.structure !== null && structure === null) {
          warnings.push({ nl, reason: STRUCTURE_MISMATCH_REASON });
        }
        const rule = normalizeRule(sentenceInput.rule);
        const nlKey = normalizeSentenceKey(nl);
        const sentenceId = wordOrderRepository.insertSentence({
          nl,
          uk,
          rule,
          source,
          nlKey,
          addedAt: clock.now(),
          structure: structureText(structure),
        });
        if (sentenceId !== null) {
          addedIds.push(sentenceId);
          continue;
        }
        const storedSentence = wordOrderRepository.findSentenceByNlKey(nlKey);
        if (structure !== null && storedSentence.structure === null) {
          wordOrderRepository.updateSentence({
            sentenceId: storedSentence.id,
            uk: storedSentence.uk,
            rule: storedSentence.rule ?? rule,
            structure: structureText(structure),
          });
          if (!addedIds.includes(storedSentence.id)) updatedIds.push(storedSentence.id);
        } else {
          skipped.push({ nl, reason: DUPLICATE_REASON });
        }
      }
    });
    if (addedIds.length || updatedIds.length) changeEventBus.publishChange(CHANGE_COLLECTION);
    return {
      added: addedIds.map(sentenceId => presentSentence(wordOrderRepository.findSentenceById(sentenceId))),
      updated: updatedIds.map(sentenceId => presentSentence(wordOrderRepository.findSentenceById(sentenceId))),
      skipped,
      warnings,
    };
  }

  // Reads the sentence table of a Markdown file. Throws ValidationError when it finds no sentence at all.
  function importMarkdown(markdownText) {
    const parsed = parseSentenceMarkdown(markdownText);
    if (parsed.sentences.length === 0) throw new ValidationError(parsed.errors.join('; '));
    const result = addSentences(parsed.sentences, { source: 'import' });
    return { ...result, errors: parsed.errors, warnings: [...parsed.warnings, ...result.warnings] };
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
    const sentences = wordOrderRepository.listSentencesNewestFirst().map(presentSentence);
    return limit ? sentences.slice(0, limit) : sentences;
  }

  // Changes what is given: uk (text), rule (a rule name, or null to clear it) and structure (segments, or null to
  // clear it). Undefined leaves a field as it is. Unlike addSentences this refuses a bad value (ValidationError).
  function updateSentence({ id, uk, rule, structure } = {}) {
    runInTransaction(() => {
      const sentence = wordOrderRepository.findSentenceById(id);
      if (!sentence) throw new NotFoundError(`sentence ${id} not found`);
      const nextUk = uk === undefined ? sentence.uk : String(uk).trim();
      if (nextUk === '') throw new ValidationError('українське речення порожнє');
      const nextRule = rule === undefined ? sentence.rule : strictRule(rule);
      const nextStructure = structure === undefined ? sentence.structure : structureText(strictStructure(sentence.nl, structure));
      wordOrderRepository.updateSentence({ sentenceId: id, uk: nextUk, rule: nextRule, structure: nextStructure });
    });
    changeEventBus.publishChange(CHANGE_COLLECTION);
    return presentSentence(wordOrderRepository.findSentenceById(id));
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

  // The next sentences to practise, each with its shuffled tiles. The Dutch text and the schema are not sent.
  // rules: an array of rule names ('none' = no rule) keeps only sentences whose rule is in it. Unknown names are
  // dropped; when no valid name is left (missing, empty or unknown only), every sentence is kept. total counts the
  // sentences that match, rule_counts all of them.
  function getSentenceSet({ size = DEFAULT_SET_SIZE, rules } = {}) {
    const ruleNames = rules === undefined || rules === null ? [] : normalizeRuleNames(rules);
    const ruleFilter = ruleNames.length === 0 ? null : ruleNames;
    const vocabulary = wordOrderRepository.listVocabulary().map(word => word.nl);
    const sentences = wordOrderRepository.listSentencesForSet({ limit: size, rules: ruleFilter }).map(sentence => {
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
      total: wordOrderRepository.countSentences({ rules: ruleFilter }),
      rule_counts: countRules(wordOrderRepository.countSentencesByRule()),
      can_generate: openRouterClient.isConfigured,
    };
  }

  // Records the answer and says whether the tiles were in the right order. The rule and schema are shown after it.
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
    const presented = presentSentence(sentence);
    return {
      is_correct: isCorrect,
      correct_nl: sentence.nl,
      correct_tiles: splitIntoTiles(sentence.nl),
      rule: presented.rule,
      structure: presented.structure,
    };
  }

  return Object.freeze({
    addSentences,
    importMarkdown,
    generateSentences,
    listSentences,
    updateSentence,
    deleteSentence,
    getSentenceSet,
    answerSentence,
  });
}

// A stored row with its schema read back as an array (or null).
function presentSentence(sentence) {
  return { ...sentence, structure: parseStoredStructure(sentence.structure) };
}

function structureText(structure) {
  return structure === null ? null : JSON.stringify(structure);
}

function countRules(ruleRows) {
  const counts = Object.fromEntries([...RULES, 'none'].map(ruleName => [ruleName, 0]));
  for (const row of ruleRows) counts[row.rule_name] = row.total;
  return counts;
}

function strictRule(rule) {
  if (rule === null) return null;
  const normalizedRule = normalizeRule(rule);
  if (normalizedRule === null) throw new ValidationError(`правило має бути одним із: ${RULES.join(', ')}, або null`);
  return normalizedRule;
}

function strictStructure(nl, structure) {
  if (structure === null) return null;
  const normalizedStructure = normalizeStructure({ nl, structure });
  if (normalizedStructure === null) throw new ValidationError(STRUCTURE_MISMATCH_REASON);
  return normalizedStructure;
}
