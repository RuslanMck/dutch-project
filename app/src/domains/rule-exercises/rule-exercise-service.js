// Rule exercises: sets of questions on the chosen grammar rules. A set takes exercises never answered first, plus up
// to two whose last answer was wrong; when the stock runs short it asks the LLM for new ones (and refills the stock in
// the background after a set), so the questions keep changing. Answers are checked here and stored.
import { NotFoundError, ValidationError } from '../../errors/domain-errors.js';
import {
  buildRuleExerciseMessages, parseGeneratedRuleExercises, pickSituations,
} from './rule-exercise-prompt.js';

const NOT_CONFIGURED_MESSAGE = 'OpenRouter не налаштовано: нових вправ не буде';
const NO_RULES_MESSAGE = 'Обери хоча б одне правило';
const NO_EXERCISES_MESSAGE = 'Вправ для цих правил поки немає, а згенерувати нові не вдалося';
const DEFAULT_SET_SIZE = 10;
const MAXIMUM_GENERATED_PER_REQUEST = 15;
const MAXIMUM_RETRIES_PER_SET = 2;
const RETRY_AFTER_MILLISECONDS = 30 * 60_000;
const MAXIMUM_EXISTING_SENTENCES = 150;
const MAXIMUM_OTHER_WORDS = 200;
const LEARNING_STATUSES = Object.freeze(['learning', 'learned']);

export function createRuleExerciseService({
  ruleExerciseRepository, ruleService, openRouterClient, model, runInTransaction, clock, random = Math.random,
  logger = console,
}) {
  let generationInProgress = null;

  // The rules with their numbers for the setup list.
  function listRuleOverview() {
    const totalsByRuleId = new Map(ruleExerciseRepository.listRuleTotals().map(row => [row.rule_id, row]));
    const rules = ruleService.listRules().map(rule => {
      const totals = totalsByRuleId.get(rule.id);
      return {
        id: rule.id,
        code: rule.code,
        title: rule.title,
        exercise_count: totals?.exercise_count ?? 0,
        unanswered_count: totals?.unanswered_count ?? 0,
        answer_count: totals?.answer_count ?? 0,
        correct_count: totals?.correct_count ?? 0,
      };
    });
    return { rules, can_generate: openRouterClient.isConfigured };
  }

  // ruleIds: the chosen rule ids (all rules when left out). Returns { exercises, generated_count }.
  async function startSet({ ruleIds, count = DEFAULT_SET_SIZE } = {}) {
    const rules = resolveRules(ruleIds);
    const chosenIds = rules.map(rule => rule.id);
    const retries = ruleExerciseRepository.listLastWrong({
      ruleIds: chosenIds, answeredBefore: clock.now() - RETRY_AFTER_MILLISECONDS, limit: MAXIMUM_RETRIES_PER_SET,
    });
    const freshNeeded = count - retries.length;
    let generatedCount = 0;
    if (ruleExerciseRepository.listUnanswered(chosenIds).length < freshNeeded) {
      if (generationInProgress) await generationInProgress.catch(() => {});
      const stockCount = ruleExerciseRepository.listUnanswered(chosenIds).length;
      if (stockCount < freshNeeded && openRouterClient.isConfigured) {
        generatedCount = await generateExercises({ rules, count: Math.min(MAXIMUM_GENERATED_PER_REQUEST,
          Math.max(freshNeeded - stockCount, DEFAULT_SET_SIZE)) });
      }
    }
    const fresh = spreadOverRules(ruleExerciseRepository.listUnanswered(chosenIds), freshNeeded);
    const exercises = shuffle([...fresh, ...retries]);
    if (exercises.length === 0) {
      throw new ValidationError(openRouterClient.isConfigured ? NO_EXERCISES_MESSAGE : NOT_CONFIGURED_MESSAGE);
    }
    refillInBackground(rules, count, exercises.length);
    return { exercises: exercises.map(toQuestion), generated_count: generatedCount };
  }

  // After a set, the next one should be ready without waiting: refill when fewer than a set are left unanswered.
  function refillInBackground(rules, count, takenCount) {
    if (!openRouterClient.isConfigured || generationInProgress) return;
    const leftCount = ruleExerciseRepository.listUnanswered(rules.map(rule => rule.id)).length - takenCount;
    if (leftCount >= count) return;
    generateExercises({ rules, count: Math.min(MAXIMUM_GENERATED_PER_REQUEST, Math.max(count, DEFAULT_SET_SIZE)) })
      .catch(error => logger.error('rule exercises: background generation failed:', error.message));
  }

  // Asks the LLM for count exercises spread over rules and saves the valid new ones. Returns how many were saved.
  function generateExercises({ rules, count }) {
    if (!openRouterClient.isConfigured) return Promise.reject(new ValidationError(NOT_CONFIGURED_MESSAGE));
    const run = async () => {
      const vocabulary = ruleExerciseRepository.listVocabulary();
      const knownWords = vocabulary.filter(word => LEARNING_STATUSES.includes(word.status)).map(word => word.nl);
      const otherWords = shuffle(vocabulary.filter(word => !LEARNING_STATUSES.includes(word.status)).map(word => word.nl))
        .slice(0, MAXIMUM_OTHER_WORDS);
      const ruleIds = rules.map(rule => rule.id);
      const countsByRuleCode = spreadCount(shuffle(rules).map(rule => rule.code), count);
      const chosenRules = rules.filter(rule => countsByRuleCode[rule.code] > 0);
      const messages = buildRuleExerciseMessages({
        rules: chosenRules,
        countsByRuleCode,
        knownWords,
        otherWords,
        existingSentences: ruleExerciseRepository.listExistingSentences({ ruleIds, limit: MAXIMUM_EXISTING_SENTENCES }),
        situations: pickSituations(random),
      });
      const responseText = await openRouterClient.completeChat(messages, { model });
      const { exercises } = parseGeneratedRuleExercises(responseText, { ruleCodes: chosenRules.map(rule => rule.code) });
      const ruleIdByCode = new Map(chosenRules.map(rule => [rule.code, rule.id]));
      const createdAt = clock.now();
      return runInTransaction(() => exercises.filter(exercise => ruleExerciseRepository.insertExercise({
        ruleId: ruleIdByCode.get(exercise.rule_code),
        kind: exercise.kind,
        question: exercise.question,
        sentence: exercise.sentence,
        hint: exercise.hint,
        translation: exercise.translation,
        answer: exercise.answer,
        acceptedAnswers: JSON.stringify(exercise.accepted_answers),
        options: exercise.options ? JSON.stringify(exercise.options) : null,
        explanation: exercise.explanation,
        sentenceKey: normalizeAnswer(`${exercise.sentence} | ${exercise.answer}`),
        source: 'openrouter',
        createdAt,
      })).length);
    };
    generationInProgress = run().finally(() => { generationInProgress = null; });
    return generationInProgress;
  }

  // Checks and stores one answer. skipped («Не знаю») counts as wrong.
  function answerExercise({ id, answer = '', skipped = false }) {
    const exercise = ruleExerciseRepository.findExerciseById(id);
    if (!exercise) throw new NotFoundError(`rule exercise ${id} not found`);
    const acceptedAnswers = [exercise.answer, ...JSON.parse(exercise.accepted_answers)];
    const isCorrect = !skipped && acceptedAnswers.some(right => normalizeAnswer(right) === normalizeAnswer(answer));
    if (!skipped && !normalizeAnswer(answer)) throw new ValidationError('Напиши відповідь');
    ruleExerciseRepository.createAnswer({ exerciseId: id, answer: skipped ? '' : answer, isCorrect, answeredAt: clock.now() });
    return {
      is_correct: isCorrect,
      answer: exercise.answer,
      accepted_answers: acceptedAnswers.slice(1),
      explanation: exercise.explanation,
      translation: exercise.translation,
    };
  }

  function resolveRules(ruleIds) {
    const allRules = ruleService.listRules();
    if (ruleIds === undefined) return allRules;
    const rules = allRules.filter(rule => ruleIds.includes(rule.id));
    if (rules.length === 0) throw new ValidationError(NO_RULES_MESSAGE);
    return rules;
  }

  // Takes up to count exercises, one rule after another, so a set is not all one rule.
  function spreadOverRules(exercises, count) {
    const queues = new Map();
    for (const exercise of exercises) {
      if (!queues.has(exercise.rule_id)) queues.set(exercise.rule_id, []);
      queues.get(exercise.rule_id).push(exercise);
    }
    const ruleOrder = shuffle([...queues.keys()]);
    const picked = [];
    while (picked.length < count && ruleOrder.some(ruleId => queues.get(ruleId).length)) {
      for (const ruleId of ruleOrder) {
        if (picked.length < count && queues.get(ruleId).length) picked.push(queues.get(ruleId).shift());
      }
    }
    return picked;
  }

  function shuffle(items) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  return Object.freeze({ listRuleOverview, startSet, generateExercises, answerExercise });
}

// What the page shows before the answer: no answer, no explanation.
function toQuestion(exercise) {
  return {
    id: exercise.id,
    rule_code: exercise.rule_code,
    rule_title: exercise.rule_title,
    kind: exercise.kind,
    question: exercise.question,
    sentence: exercise.sentence,
    hint: exercise.hint,
    options: exercise.options ? JSON.parse(exercise.options) : null,
  };
}

// count spread over the codes in the given order: 10 over 3 → 4, 3, 3.
export function spreadCount(codes, count) {
  return Object.fromEntries(codes.map((code, index) => [
    code, Math.floor(count / codes.length) + (index < count % codes.length ? 1 : 0),
  ]));
}

// Lowercase, trimmed, one space, typographic quotes and dashes unified, final punctuation dropped.
export function normalizeAnswer(text) {
  return String(text ?? '').toLowerCase().normalize('NFC')
    .replace(/[’‘ʼ`]/g, "'").replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '').trim();
}
