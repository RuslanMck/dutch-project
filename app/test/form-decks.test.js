// Tests for the ready-made form decks (public/logic.js): the pronoun deck drilled subject → object, then back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORM_DECKS,
  buildFormDrillEnd,
  buildFormDrillWords,
  findFormDeck,
  formatFormDeckCount,
  formatFormDrillProgress,
  formatFormQuestion,
  gradeFormAnswer,
  planCustomDrill,
  revealFormAnswer,
  splitForms,
} from '../public/logic.js';

const deck = findFormDeck('personal-pronouns');
const words = buildFormDrillWords(deck);
const byFirst = (first, hint) => words.find(word => word.first === first && (!hint || word.firstHint === hint));

test('the pronoun deck holds the 9 rows of the table, with unique ids', () => {
  assert.equal(deck.cards.length, 9);
  assert.equal(new Set(words.map(word => word.id)).size, 9);
  assert.equal(new Set(FORM_DECKS.map(item => item.id)).size, FORM_DECKS.length);
  assert.equal(formatFormDeckCount(9), '9 пар форм');
  assert.equal(formatFormDeckCount(2), '2 пари форм');
});

test('the two zij / ze rows are told apart by their meaning', () => {
  assert.equal(formatFormQuestion(byFirst('zij / ze', 'вона'), 'uk_nl'), 'zij / ze — вона');
  assert.equal(formatFormQuestion(byFirst('zij / ze', 'вони'), 'uk_nl'), 'zij / ze — вони');
  assert.equal(formatFormQuestion(byFirst('ik'), 'nl_uk'), 'mij / me — мене, мені');
});

test('every wanted form must be typed, in any order; a missing one is named', () => {
  const ik = byFirst('ik');
  assert.deepEqual(splitForms('mij / me'), ['mij', 'me']);
  assert.deepEqual(gradeFormAnswer(ik, 'uk_nl', 'mij / me'), { counted: true, grade: 'good', message: '✓ Правильно' });
  for (const typed of ['me/mij', 'Mij, me', ' me  mij ', 'mij; me', 'mij me mij']) {
    assert.equal(gradeFormAnswer(ik, 'uk_nl', typed).grade, 'good', typed);
  }
  assert.deepEqual(gradeFormAnswer(ik, 'uk_nl', 'mij'),
    { counted: true, grade: 'again', message: '✗ Не всі форми, бракує «me». Правильно: mij / me' });
  assert.equal(gradeFormAnswer(ik, 'uk_nl', 'mij / ik').message, '✗ Правильно: mij / me');
  assert.equal(gradeFormAnswer(ik, 'uk_nl', 'mijn').grade, 'again');
  assert.equal(gradeFormAnswer(ik, 'nl_uk', 'ik').grade, 'good');
  const they = byFirst('zij / ze', 'вони');
  assert.equal(gradeFormAnswer(they, 'uk_nl', 'hun / hen').message,
    '✗ Не всі форми, бракує «ze». Правильно: hen / ze / hun');
  assert.equal(gradeFormAnswer(they, 'uk_nl', 'hen ze hun').grade, 'good');
  assert.equal(gradeFormAnswer(they, 'nl_uk', 'ze').grade, 'again');
  assert.equal(gradeFormAnswer(they, 'nl_uk', 'zij/ze').grade, 'good');
});

test('an empty answer is not counted; dnk and «Не знаю» show the answer', () => {
  const hij = byFirst('hij');
  assert.equal(gradeFormAnswer(hij, 'uk_nl', '  ').counted, false);
  assert.deepEqual(gradeFormAnswer(hij, 'uk_nl', 'dnk'), revealFormAnswer(hij, 'uk_nl'));
  assert.equal(revealFormAnswer(hij, 'nl_uk').message, '✗ Правильно: hij');
});

test('progress and end name the form rounds', () => {
  assert.equal(
    formatFormDrillProgress({ title: deck.name, deck, direction: 'nl_uk', queueLength: 3 }),
    'Займенники: підмет і додаток · Раунд 2 з 2 · додаток → підмет · Залишилось: 3',
  );
  assert.equal(
    buildFormDrillEnd({ deck, firstTry: { uk_nl: 7, nl_uk: 9 }, total: 9 }).resultText,
    'Готово! Правильно з першого разу: підмет → додаток 7 з 9 · додаток → підмет 9 з 9.',
  );
  const plan = planCustomDrill(words);
  assert.equal(plan.queue.length, 9);
  assert.equal(plan.waiting.nl_uk.length, 9);
});
