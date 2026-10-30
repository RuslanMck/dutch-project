// Word-order business rules: adding sentences (by MCP, import or generation; invalid ones and repeats are skipped),
// listing, editing and deleting them, the set the page shows (tiles = the sentence's words plus distractors, shuffled,
// optionally only some rules), and the check of an answer against every accepted order (the canonical one and the
// alternatives). Answers are kept for choosing the next sentences; they never change the FSRS schedule. Publishes
// 'word-order' after each change.
import { NotFoundError, ValidationError } from '../../errors/domain-errors.js';
import {
  buildGenerationMessages,
  parseGeneratedSentences,
} from './sentence-generation-prompt.js';
import { parseSentenceMarkdown } from './sentence-markdown.js';
import {
  RULES,
  findMatchingOrderIndex,
  listAcceptedOrders,
  normalizeAltOrders,
  normalizeRule,
  normalizeRuleNames,
  normalizeSentenceKey,
  normalizeStructure,
  normalizeWrongForms,
  parseStoredAltOrders,
  parseStoredStructure,
  parseStoredWrongForms,
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
const IGNORED_ALTERNATIVES_REASON = 'інші порядки проігноровано, бо вони вже збережені; '
  + 'змінити їх можна через update_sentence';
const IGNORED_WRONG_FORMS_REASON = 'хибні форми проігноровано, бо вони вже збережені; '
  + 'змінити їх можна через update_sentence';
const GENERATED_SOURCE = 'openrouter';
const NOT_CONFIGURED_MESSAGE = 'OpenRouter не налаштовано';

export function createWordOrderService({
  wordOrderRepository,
  openRouterClient,
  runInTransaction,
  changeEventBus,
  clock,
  random = Math.random,
}) {
  // sentenceInputs: [{ nl, uk, rule?, structure?, alt_orders?, wrong_forms?, row? }]. Returns { added, updated,
  // skipped: [{ nl, reason }], warnings: [{ nl, reason }] }. A structure that does not read as a schema of the sentence is
  // dropped with a warning; the sentence is still added. A single string alt_orders is one alternative. A new sentence
  // whose alternative orders are not all valid is skipped (its first rejected order is the reason; row, when the input
  // has one, comes first), except for source 'openrouter': there a rejected alternative is dropped with a warning.
  // A repeat is skipped, unless it fills something: its stored schema is missing and this input brings a valid one, and
  // the stored alternatives still fit that schema (otherwise the schema is not filled and a warning names the
  // alternative); or its stored alternatives are empty and this input's are usable. A filled repeat is listed in
  // updated. Alternatives that differ from the stored non-empty ones are ignored, with a warning. A sentence added
  // earlier in this same call stays in added only, in its latest state.
  // wrong_forms (single words, the sentence's extra tiles) never skip a sentence: a bad one is dropped with a warning.
  // A repeat with no stored wrong forms gets this input's (updated); ones that differ from stored ones are ignored with
  // a warning.
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
        const hasBadStructure = sentenceInput.structure !== undefined && sentenceInput.structure !== null
          && structure === null;
        const rule = normalizeRule(sentenceInput.rule);
        const wrongForms = normalizeWrongForms({ nl, wrongForms: sentenceInput.wrong_forms });
        addRejectedFormWarnings(warnings, { nl, wrongForms, row: sentenceInput.row });
        const nlKey = normalizeSentenceKey(nl);
        const storedSentence = wordOrderRepository.findSentenceByNlKey(nlKey);
        if (storedSentence) {
          const storedAltOrders = parseStoredAltOrders(storedSentence.alt_orders);
          const hasStoredAltOrders = storedAltOrders.length > 0;
          const givenAltOrders = altOrdersInput(sentenceInput.alt_orders);
          const storedStructure = storedSentence.structure === null
            ? structure
            : parseStoredStructure(storedSentence.structure);
          const wantsStructure = storedSentence.structure === null && structure !== null;
          // The saved alternatives must still hold with the schema this repeat brings, or the schema is not filled.
          const schemaCheck = wantsStructure && hasStoredAltOrders
            ? normalizeAltOrders({ nl, altOrders: storedAltOrders, structure })
            : null;
          const schemaBlocked = schemaCheck !== null && schemaCheck.rejected.length > 0;
          if (schemaBlocked) {
            warnings.push({ nl, reason: withRow(alternativeReason(schemaCheck.rejected[0]), sentenceInput.row) });
          }
          const fillsStructure = wantsStructure && !schemaBlocked;
          const alternatives = hasStoredAltOrders
            ? null
            : normalizeAltOrders({ nl, altOrders: givenAltOrders, structure: storedStructure });
          const fillableAltOrders = alternatives === null ? null : usableAltOrders(alternatives, source);
          const fillsAltOrders = fillableAltOrders !== null && fillableAltOrders.length > 0;
          if (alternatives !== null) addRejectedWarnings(warnings, { nl, alternatives, row: sentenceInput.row });
          if (hasStoredAltOrders && Array.isArray(givenAltOrders) && givenAltOrders.length > 0
            && !sameOrders(storedAltOrders, givenAltOrders)) {
            warnings.push({ nl, reason: withRow(IGNORED_ALTERNATIVES_REASON, sentenceInput.row) });
          }
          if (hasBadStructure) warnings.push({ nl, reason: STRUCTURE_MISMATCH_REASON });
          const storedWrongForms = parseStoredWrongForms(storedSentence.wrong_forms);
          const fillsWrongForms = storedWrongForms.length === 0 && wrongForms.wrongForms.length > 0;
          if (storedWrongForms.length > 0 && wrongForms.wrongForms.length > 0
            && !sameWords(storedWrongForms, wrongForms.wrongForms)) {
            warnings.push({ nl, reason: withRow(IGNORED_WRONG_FORMS_REASON, sentenceInput.row) });
          }
          if (fillsStructure || fillsAltOrders || fillsWrongForms) {
            wordOrderRepository.updateSentence({
              sentenceId: storedSentence.id,
              uk: storedSentence.uk,
              rule: fillsStructure ? (storedSentence.rule ?? rule) : storedSentence.rule,
              structure: fillsStructure ? structureText(structure) : storedSentence.structure,
              altOrders: fillsAltOrders ? JSON.stringify(fillableAltOrders) : storedSentence.alt_orders,
              wrongForms: fillsWrongForms ? JSON.stringify(wrongForms.wrongForms) : storedSentence.wrong_forms,
            });
            if (!addedIds.includes(storedSentence.id) && !updatedIds.includes(storedSentence.id)) {
              updatedIds.push(storedSentence.id);
            }
          } else {
            skipped.push({ nl, reason: DUPLICATE_REASON });
          }
          continue;
        }
        const alternatives = normalizeAltOrders({ nl, altOrders: altOrdersInput(sentenceInput.alt_orders), structure });
        const keptAltOrders = usableAltOrders(alternatives, source);
        if (keptAltOrders === null) {
          skipped.push({ nl, reason: withRow(alternativeReason(alternatives.rejected[0]), sentenceInput.row) });
          continue;
        }
        addRejectedWarnings(warnings, { nl, alternatives, row: sentenceInput.row });
        if (hasBadStructure) warnings.push({ nl, reason: STRUCTURE_MISMATCH_REASON });
        const sentenceId = wordOrderRepository.insertSentence({
          nl,
          uk,
          rule,
          source,
          nlKey,
          addedAt: clock.now(),
          structure: structureText(structure),
          altOrders: JSON.stringify(keptAltOrders),
          wrongForms: JSON.stringify(wrongForms.wrongForms),
        });
        addedIds.push(sentenceId);
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

  // Changes what is given: uk (text), rule (a rule name, or null to clear it), structure (segments, or null to clear
  // it), alt_orders (the alternative orders, [] to clear them) and wrong_forms (the wrong forms, [] to clear them).
  // Undefined leaves a field as it is. Unlike addSentences
  // this refuses a bad value (ValidationError). The alternatives are checked against the sentence's schema after the
  // update, so a schema change re-checks the stored alternatives too.
  function updateSentence({ id, uk, rule, structure, alt_orders: altOrders, wrong_forms: wrongForms } = {}) {
    runInTransaction(() => {
      const sentence = wordOrderRepository.findSentenceById(id);
      if (!sentence) throw new NotFoundError(`sentence ${id} not found`);
      const nextUk = uk === undefined ? sentence.uk : String(uk).trim();
      if (nextUk === '') throw new ValidationError('українське речення порожнє');
      const nextRule = rule === undefined ? sentence.rule : strictRule(rule);
      const nextSegments = structure === undefined
        ? parseStoredStructure(sentence.structure)
        : strictStructure(sentence.nl, structure);
      const nextStructure = structure === undefined ? sentence.structure : structureText(nextSegments);
      let nextAltOrders = parseStoredAltOrders(sentence.alt_orders);
      if (altOrders !== undefined || structure !== undefined) {
        nextAltOrders = strictAltOrders({
          nl: sentence.nl,
          altOrders: altOrders === undefined ? nextAltOrders : altOrders,
          structure: nextSegments,
        });
      }
      const nextWrongForms = wrongForms === undefined
        ? parseStoredWrongForms(sentence.wrong_forms)
        : strictWrongForms({ nl: sentence.nl, wrongForms });
      wordOrderRepository.updateSentence({
        sentenceId: id,
        uk: nextUk,
        rule: nextRule,
        structure: nextStructure,
        altOrders: JSON.stringify(nextAltOrders),
        wrongForms: JSON.stringify(nextWrongForms),
      });
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

  // The next sentences to practise, each with its shuffled tiles and order_count (how many orders are accepted). The
  // extra tiles are the sentence's wrong forms, topped up with random vocabulary words. The Dutch text, the schema, the
  // orders and which tiles are extra are not sent.
  // rules: an array of rule names ('none' = no rule) keeps only sentences whose rule is in it. Unknown names are
  // dropped; when no valid name is left (missing, empty or unknown only), every sentence is kept. total counts the
  // sentences that match, rule_counts all of them.
  function getSentenceSet({ size = DEFAULT_SET_SIZE, rules } = {}) {
    const ruleNames = rules === undefined || rules === null ? [] : normalizeRuleNames(rules);
    const ruleFilter = ruleNames.length === 0 ? null : ruleNames;
    const vocabulary = wordOrderRepository.listVocabulary().map(word => word.nl);
    const sentences = wordOrderRepository.listSentencesForSet({ limit: size, rules: ruleFilter }).map(sentence => {
      const sentenceTiles = splitIntoTiles(sentence.nl);
      const wrongForms = parseStoredWrongForms(sentence.wrong_forms);
      const distractors = pickDistractors({ sentenceTiles, vocabulary, wrongForms, random });
      return {
        id: sentence.id,
        uk: sentence.uk,
        rule: sentence.rule,
        tiles: shuffleTiles([...sentenceTiles, ...distractors], random),
        order_count: 1 + parseStoredAltOrders(sentence.alt_orders).length,
      };
    });
    return {
      sentences,
      total: wordOrderRepository.countSentences({ rules: ruleFilter }),
      rule_counts: countRules(wordOrderRepository.countSentencesByRule()),
      can_generate: openRouterClient.isConfigured,
    };
  }

  // Records the answer and checks it against every accepted order. The rule and schema are shown after it.
  // matched_order is the index of the order the answer equals (0 = the canonical one), or -1; orders lists the accepted
  // orders as tiles joined by spaces, canonical first.
  function answerSentence({ id, tiles }) {
    const sentence = wordOrderRepository.findSentenceById(id);
    if (!sentence) throw new NotFoundError(`sentence ${id} not found`);
    const orders = listAcceptedOrders({ nl: sentence.nl, altOrders: parseStoredAltOrders(sentence.alt_orders) });
    const matchedOrder = findMatchingOrderIndex({ answerTiles: tiles, orders });
    const isCorrect = matchedOrder >= 0;
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
      matched_order: matchedOrder,
      orders: orders.map(orderTiles => orderTiles.join(' ')),
      has_other_orders: orders.length > 1,
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

// A stored row with its schema read back as an array (or null), its alternative orders and wrong forms as arrays of
// strings and order_count (1 + the alternatives).
function presentSentence(sentence) {
  const altOrders = parseStoredAltOrders(sentence.alt_orders);
  return {
    ...sentence,
    structure: parseStoredStructure(sentence.structure),
    alt_orders: altOrders,
    wrong_forms: parseStoredWrongForms(sentence.wrong_forms),
    order_count: 1 + altOrders.length,
  };
}

// Why a wrong form is refused: the reason and, when there is one, the form.
function wrongFormReason({ form, reason }) {
  return form === '' ? `хибна форма: ${reason}` : `хибна форма: ${reason} («${form}»)`;
}

function addRejectedFormWarnings(warnings, { nl, wrongForms, row }) {
  for (const rejected of wrongForms.rejected) warnings.push({ nl, reason: withRow(wrongFormReason(rejected), row) });
}

// True when both lists hold the same words, case and list order ignored.
function sameWords(firstWords, secondWords) {
  const keysOf = words => words.map(word => word.toLowerCase()).sort().join('\n');
  return keysOf(firstWords) === keysOf(secondWords);
}

// The wrong forms as they are stored, or the first rejected one as the error (the whole change is refused).
function strictWrongForms({ nl, wrongForms }) {
  const normalized = normalizeWrongForms({ nl, wrongForms });
  if (normalized.rejected.length > 0) throw new ValidationError(wrongFormReason(normalized.rejected[0]));
  return normalized.wrongForms;
}

// Why an alternative order is refused, as the authoring reports it: the reason and, when there is one, the order.
function alternativeReason({ order, reason }) {
  return order === '' ? `альтернативний порядок: ${reason}` : `альтернативний порядок: ${reason} («${order}»)`;
}

// A single string is one alternative order; a list (or anything else) is read by normalizeAltOrders as it is.
function altOrdersInput(value) {
  return typeof value === 'string' ? [value] : value;
}

// The alternatives to keep. A generated sentence (source openrouter) keeps the valid ones and drops the rest (they are
// warned about); any other source keeps all or none, so null when one is rejected.
function usableAltOrders(alternatives, source) {
  if (source === GENERATED_SOURCE || alternatives.rejected.length === 0) return alternatives.altOrders;
  return null;
}

function addRejectedWarnings(warnings, { nl, alternatives, row }) {
  for (const rejected of alternatives.rejected) {
    warnings.push({ nl, reason: withRow(alternativeReason(rejected), row) });
  }
}

// True when the stored and the given alternatives are the same orders (case, punctuation and apostrophes ignored, the
// order of the list ignored too).
function sameOrders(storedAltOrders, givenAltOrders) {
  const keysOf = orders => orders
    .map(order => normalizeSentenceKey(Array.isArray(order) ? order.join(' ') : String(order ?? '')))
    .sort();
  return keysOf(storedAltOrders).join('\n') === keysOf(givenAltOrders).join('\n');
}

// The row number of a Markdown table row (from the import) in front of a reason; no row, no prefix.
function withRow(reason, row) {
  return row === undefined ? reason : `рядок ${row}: ${reason}`;
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

// The alternatives as they are stored, or the first rejected one as the error (the whole change is refused).
function strictAltOrders({ nl, altOrders, structure }) {
  const alternatives = normalizeAltOrders({ nl, altOrders, structure });
  if (alternatives.rejected.length > 0) throw new ValidationError(alternativeReason(alternatives.rejected[0]));
  return alternatives.altOrders;
}

function strictStructure(nl, structure) {
  if (structure === null) return null;
  const normalizedStructure = normalizeStructure({ nl, structure });
  if (normalizedStructure === null) throw new ValidationError(STRUCTURE_MISMATCH_REASON);
  return normalizedStructure;
}
