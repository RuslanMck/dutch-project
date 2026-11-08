// Rule exercises: the prompt, reading the model's answer, sets (fresh first, a couple of retries, generation when the
// stock runs short), answer checking and the per-rule numbers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTransactionRunner } from '../src/database/run-in-transaction.js';
import { createRuleExerciseRepository } from '../src/domains/rule-exercises/rule-exercise-repository.js';
import {
  buildRuleExerciseMessages, parseGeneratedRuleExercises,
} from '../src/domains/rule-exercises/rule-exercise-prompt.js';
import {
  createRuleExerciseService, normalizeAnswer, spreadCount,
} from '../src/domains/rule-exercises/rule-exercise-service.js';
import { createOpenRouterClient } from '../src/integrations/openrouter-client.js';
import { createTestContext, mulberry32 } from './database-test-helpers.js';

const adjectiveExercise = {
  rule_code: '5.5', kind: 'gap', question: 'Встав прикметник у правильній формі', sentence: 'Ik heb een ____ fiets.',
  hint: 'nieuw', answer: 'nieuwe', accepted_answers: [], options: null, translation: 'У мене новий велосипед.',
  explanation: 'de-слово після een — прикметник з -e (5.5).',
};
const articleExercise = {
  rule_code: '3.6', kind: 'choice', question: 'Обери артикль', sentence: 'Ik zie ___ hond.', hint: null,
  answer: 'een', accepted_answers: [], options: ['een', 'het', 'de'], translation: 'Я бачу собаку.',
  explanation: 'Якась собака, не конкретна — een (3.6).',
};

function createFixture({ answers = [] } = {}) {
  let time = Date.parse('2026-11-08T10:00:00Z');
  const clock = { now: () => time, advance: milliseconds => { time += milliseconds; } };
  const context = createTestContext({ clock });
  const adjectiveRule = context.ruleService.createRule({ code: '5.5', title: 'Прикметник', body: 'Головне: -e.' });
  const articleRule = context.ruleService.createRule({ code: '3.6', title: 'Артикль', body: 'Головне: de, het, een.' });
  const requests = [];
  const fetchFunction = async (url, init) => {
    requests.push(JSON.parse(init.body));
    const content = JSON.stringify({ exercises: answers.shift() ?? [] });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  const service = createRuleExerciseService({
    ruleExerciseRepository: createRuleExerciseRepository({ database: context.database }),
    ruleService: context.ruleService,
    openRouterClient: createOpenRouterClient({ apiKey: 'test-key', model: 'test/model', fetchFunction }),
    runInTransaction: createTransactionRunner({ database: context.database }),
    clock,
    random: mulberry32(7),
    logger: { error() {} },
  });
  return { context, service, requests, clock, adjectiveRule, articleRule };
}

test('the prompt holds the rules, the counts, the situations, the words and the used sentences', () => {
  const [system, user] = buildRuleExerciseMessages({
    rules: [{ code: '5.5', title: 'Прикметник', body: 'Головне: -e.' }],
    countsByRuleCode: { '5.5': 4 },
    knownWords: ['fiets'],
    otherWords: ['huis'],
    existingSentences: [{ rule_code: '5.5', sentence: 'Een ___ huis.', answer: 'groot' }],
    situations: ['у кафе'],
  });
  assert.match(system.content, /literary Ukrainian/);
  assert.match(user.content, /Rule 5\.5: Прикметник — write 4 exercise/);
  assert.match(user.content, /у кафе/);
  assert.match(user.content, /fiets/);
  assert.match(user.content, /\[5\.5\] Een ___ huis\. → groot/);
});

test('parseGeneratedRuleExercises keeps valid exercises and drops broken ones', () => {
  const responseText = JSON.stringify({
    exercises: [
      adjectiveExercise,
      articleExercise,
      { ...adjectiveExercise, rule_code: '9.9' },                     // unknown rule
      { ...adjectiveExercise, sentence: 'Geen gat hier.' },            // gap without ___
      { ...articleExercise, options: ['het', 'de'] },                  // answer not among the options
      { ...articleExercise, sentence: '', options: ['Ik ben thuis.', 'Ben ik thuis.'], answer: 'Ik ben thuis.' },
    ],
  });
  const { exercises, skipped } = parseGeneratedRuleExercises(responseText, { ruleCodes: ['5.5', '3.6'] });
  assert.equal(exercises.length, 3);
  assert.equal(skipped, 3);
  assert.equal(exercises[0].sentence, 'Ik heb een ___ fiets.');
  assert.equal(exercises[1].hint, null);
  assert.equal(exercises[2].sentence, '');
  assert.throws(() => parseGeneratedRuleExercises('no json', { ruleCodes: [] }), { name: 'ValidationError' });
});

test('a set is generated when there is no stock, and the answers are checked and counted', async () => {
  const { service, requests } = createFixture({ answers: [[adjectiveExercise, articleExercise]] });
  const set = await service.startSet({ count: 2 });
  assert.equal(set.generated_count, 2);
  assert.equal(set.exercises.length, 2);
  assert.ok(set.exercises.every(exercise => exercise.answer === undefined && exercise.explanation === undefined));
  assert.equal(requests.length, 2);   // the set, then a background refill (the stock is empty again)

  const gap = set.exercises.find(exercise => exercise.kind === 'gap');
  const wrong = service.answerExercise({ id: gap.id, answer: 'nieuw' });
  assert.deepEqual([wrong.is_correct, wrong.answer], [false, 'nieuwe']);
  assert.match(wrong.explanation, /5\.5/);
  assert.equal(service.answerExercise({ id: gap.id, answer: ' Nieuwe. ' }).is_correct, true);
  const choice = set.exercises.find(exercise => exercise.kind === 'choice');
  assert.deepEqual(choice.options, ['een', 'het', 'de']);
  assert.equal(service.answerExercise({ id: choice.id, skipped: true }).is_correct, false);
  assert.throws(() => service.answerExercise({ id: gap.id, answer: '  ' }), { name: 'ValidationError' });

  const adjective = service.listRuleOverview().rules.find(rule => rule.code === '5.5');
  assert.deepEqual([adjective.exercise_count, adjective.unanswered_count, adjective.answer_count, adjective.correct_count],
    [1, 0, 2, 1]);
});

test('fresh exercises come first; a wrong one comes back after half an hour; a repeat is not saved', async () => {
  const second = { ...adjectiveExercise, sentence: 'Wij wonen in een ___ huis.', hint: 'groot', answer: 'groot' };
  const { service, clock, adjectiveRule } = createFixture({
    answers: [[adjectiveExercise], [adjectiveExercise, second], []],
  });
  const first = await service.startSet({ ruleIds: [adjectiveRule.id], count: 1 });
  service.answerExercise({ id: first.exercises[0].id, answer: 'fout' });
  await new Promise(resolve => setImmediate(resolve));   // the background refill
  const next = await service.startSet({ ruleIds: [adjectiveRule.id], count: 1 });
  assert.equal(next.exercises[0].sentence, 'Wij wonen in een ___ huis.');   // the repeat of the first was skipped
  service.answerExercise({ id: next.exercises[0].id, answer: 'groot' });
  clock.advance(31 * 60_000);
  const retry = await service.startSet({ ruleIds: [adjectiveRule.id], count: 1 });
  assert.equal(retry.exercises[0].id, first.exercises[0].id);
});

test('no rules chosen, or nothing to ask without OpenRouter, is a clear error', async () => {
  const { service } = createFixture();
  await assert.rejects(service.startSet({ ruleIds: [999] }), { message: 'Обери хоча б одне правило' });
  const plain = createTestContext();
  plain.ruleService.createRule({ code: '5.5', title: 'Прикметник', body: '…' });
  await assert.rejects(plain.ruleExerciseService.startSet(), { message: /OpenRouter не налаштовано/ });
  assert.equal(plain.ruleExerciseService.listRuleOverview().can_generate, false);
});

test('helpers: the count spread over rules and the answer normalisation', () => {
  assert.deepEqual(spreadCount(['a', 'b', 'c'], 10), { a: 4, b: 3, c: 3 });
  assert.equal(normalizeAnswer('  Het ’s  ochtends! '), "het 's ochtends");
});
