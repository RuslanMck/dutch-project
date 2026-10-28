// Behaviour of the domain services against the seed export.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { ZodError } from 'zod';

import { addMistakeCaseInputSchema } from '../src/contracts/mistake-contracts.js';
import { createWordInputSchema, wordPathParametersSchema } from '../src/contracts/word-contracts.js';
import { findStartOfDay } from '../src/domains/practice/practice-calendar.js';
import { NotFoundError, ValidationError } from '../src/errors/domain-errors.js';
import { createTestContext } from './database-test-helpers.js';
import { seed, SKIP } from './seed.js';

const ADJ_HET_EEN = 'Додав -e до прикметника з het-словом (een / без артикля)';
const MORNING_IN_AMSTERDAM = '2026-10-24T12:00:00+02:00';
const TIME_ZONE = 'Europe/Amsterdam';

let context;

beforeEach(() => {
  context = createTestContext();
  if (seed) context.artifactImportService.importArtifactExport(structuredClone(seed));
});

const findWordId = dutchText => context.wordService.searchWords({ query: dutchText, limit: 1 })[0].id;

test('practice: correct on a new word keeps it new', SKIP, () => {
  const id = findWordId('bestellen');
  const w = context.wordService.recordPracticeResult(id, { correct: true, mode: 'translate', answer: 'bestellen' });
  assert.equal(w.status, 'new');
  assert.equal(w.error_count, 0);
  assert.equal(context.database.prepare('SELECT COUNT(*) FROM practice_attempts WHERE word_id = ?').pluck().get(id), 1);
});

test('practice: a correct answer never changes the status', SKIP, () => {
  const id = findWordId('bestellen');
  context.wordService.updateWordStatus(id, 'learning');
  const result = context.wordService.recordPracticeResult(id, { correct: true, mode: 'article', answer: 'de' });
  assert.equal(result.status, 'learning');
});

test('practice: wrong answer adds one error and keeps the status', SKIP, () => {
  const id = findWordId('bestellen');
  context.wordService.updateWordStatus(id, 'learned');
  const w = context.wordService.recordPracticeResult(id, { correct: false, mode: 'translate', answer: 'bestelen' });
  assert.equal(w.status, 'learned');
  assert.equal(w.error_count, 1);
  const row = context.database.prepare("SELECT source, mode, wrong_answer FROM word_errors WHERE word_id = ?").get(id);
  assert.deepEqual({ ...row }, { source: 'practice', mode: 'translate', wrong_answer: 'bestelen' });
});

test('practice: wrong answer on groot goes 4 -> 5', SKIP, () => {
  const id = findWordId('groot');
  assert.equal(context.wordService.getWord(id).error_count, 4);
  assert.equal(context.wordService.recordPracticeResult(id, { correct: false, mode: 'translate', answer: 'x' }).error_count, 5);
});

test('logMistake adds a case to an existing pattern (case-insensitive title match)', SKIP, () => {
  const before = context.mistakeService.listPatterns({ rule_code: '5.5' }).find(p => p.title === ADJ_HET_EEN);
  assert.equal(before.count, 3);
  const after = context.mistakeService.logMistake({
    rule_code: '5.5',
    title: ADJ_HET_EEN.toUpperCase(),
    wrong: 'een kleine kind',
    right: 'een klein kind',
    date: '2026-10-20',
    source: 'exercise',
  });
  assert.equal(after.id, before.id);
  assert.equal(after.count, 4);
  assert.equal(after.last_on, '2026-10-20');
  assert.equal(after.cases[0].wrong_text, 'een kleine kind');
  assert.equal(after.cases[0].source, 'exercise');
});

test('logMistake with no rule creates a pattern with rule null, then reuses it', SKIP, () => {
  const first = context.mistakeService.logMistake({ rule_code: null, title: 'Нова помилка', wrong: 'a b', right: 'b a' });
  assert.equal(first.rule_id, null);
  assert.equal(first.rule_code, null);
  assert.equal(first.count, 1);
  const second = context.mistakeService.logMistake({ rule_code: 'other', title: 'нова помилка', wrong: 'c', right: 'd' });
  assert.equal(second.id, first.id);
  assert.equal(second.count, 2);
});

test('logMistake rejects an unknown rule code as a validation error', SKIP, () => {
  assert.throws(() => context.mistakeService.logMistake({ rule_code: '99.9', title: 'x', wrong: 'a', right: 'b' }),
    ValidationError);
});

test('addWords skips existing entries (case-insensitive nl, same article)', SKIP, () => {
  const groot = findWordId('groot');
  const { added, skipped } = context.wordService.createWords([
    { nl: 'GROOT', uk: 'великий' },
    { nl: 'nieuwwoord', uk: 'нове слово' },
    { nl: 'groot', uk: 'велика', article: 'het' },
  ]);
  assert.deepEqual(skipped, [{ nl: 'GROOT', existing_id: groot }]);
  assert.deepEqual(added.map(w => w.nl), ['nieuwwoord', 'groot']);
});

test('listWords sort=errors puts groot first', SKIP, () => {
  const rows = context.wordService.listWords({ sort: 'errors' });
  assert.equal(rows[0].nl, 'groot');
  assert.equal(rows[0].error_count, 4);
});

test('listWords filters by status and text, and returns topic names', SKIP, () => {
  assert.equal(context.wordService.listWords({ status: 'learned' }).length, 3);
  const cafe = context.wordService.listWords({ topic: 'У кафе' });
  assert.ok(cafe.length > 0);
  assert.ok(cafe.every(w => w.topic === 'У кафе'));
});

test('addWord detects expressions and creates a word with lesson errors', SKIP, () => {
  const expr = context.wordService.createWord({ nl: 'hoe gaat het?', uk: 'як справи?', err: 2 });
  assert.equal(expr.kind, 'expression');
  assert.equal(expr.error_count, 2);
  assert.equal(context.wordService.createWord({ nl: 'huis', uk: 'дім', article: 'het' }).kind, 'word');
});

test('updateWord moves a word to another topic and clears it with null', SKIP, () => {
  const id = findWordId('bestellen');
  assert.equal(context.wordService.updateWord(id, { topic: 'Нова тема' }).topic, 'Нова тема');
  assert.equal(context.wordService.updateWord(id, { topic: null }).topic, null);
});

test('deleteRule moves its patterns to "other"', SKIP, () => {
  const adj = context.ruleService.getRule('5.5');
  context.ruleService.deleteRule(adj.id);
  const moved = context.mistakeService.listPatterns({ rule_id: 'null' }).map(p => p.title);
  assert.ok(moved.includes(ADJ_HET_EEN));
  assert.equal(context.mistakeService.listPatterns({ rule_code: '5.5' }).length, 0);
});

test('getRule accepts an id or a code', SKIP, () => {
  const byCode = context.ruleService.getRule('5.5');
  assert.equal(context.ruleService.getRule(byCode.id).code, '5.5');
  assert.equal(byCode.error_count, 10);
  assert.equal(context.ruleService.getRule('Д1').category, 'дієслово');
});

test('contracts reject bad input, and services give a not-found error for missing rows', SKIP, () => {
  assert.throws(() => createWordInputSchema.parse({ nl: '', uk: 'x' }), ZodError);
  assert.throws(() => context.wordService.getWord(999999), NotFoundError);
  assert.throws(() => wordPathParametersSchema.parse({ id: 'abc' }), ZodError);
  assert.throws(() => context.mistakeService.addMistakeCase(999999, { wrong: 'a', right: 'b' }), NotFoundError);
  assert.throws(() => addMistakeCaseInputSchema.parse({ wrong: 'a', right: 'b', date: '2026-02-30' }), ZodError);
});

test('stats and exportAll report the imported data', SKIP, () => {
  const s = context.statisticsService.calculateStatistics();
  assert.equal(s.words.total, 586);
  assert.equal(s.words.learned, 3);
  assert.equal(s.words.expressions, 137);
  assert.equal(s.cases, 22);
  assert.ok(s.sections.includes('Д1'));
  const out = context.artifactExportService.exportCollections();
  assert.equal(out.collections.words.length, 586);
  assert.equal(out.collections.mistakes.find(m => m.id === 'hoeveelheid').rule, 'other');
});

// A clock that the test moves by hand. The practice rules run on it, so due dates are exact.
function createFixedClock(isoText) {
  let currentTime = Date.parse(isoText);
  return {
    now() {
      return currentTime;
    },
    moveTo(nextIsoText) {
      currentTime = Date.parse(nextIsoText);
    },
  };
}

function createWordIds(wordContext, wordInputs) {
  return wordContext.wordService.createWords(wordInputs).added.map(word => word.id);
}

function listWordIds(wordContext, filters) {
  return wordContext.wordService.listWords(filters).map(word => word.id);
}

test('logWordError adds one error and leaves the status alone; a lookup creates a missing word as new', () => {
  const wordContext = createTestContext();
  const [wordId] = createWordIds(wordContext, [{ nl: 'raam', uk: 'вікно', status: 'learned' }]);
  const logged = wordContext.wordService.logWordError(wordId, { source: 'exercise', wrong_answer: 'x' });
  assert.equal(logged.status, 'learned');
  assert.equal(logged.error_count, 1);

  const lookup = wordContext.wordService.logWordErrorByLookup({
    nl: 'deur',
    uk: 'двері',
    article: 'de',
    source: 'lesson',
  });
  assert.equal(lookup.created, true);
  assert.equal(lookup.word.status, 'new');
  assert.equal(lookup.word.error_count, 1);
});

test('add_words gives a new word its priority from the frequency list', () => {
  const wordContext = createTestContext();
  wordContext.priorityService.importFrequencyList([{ wordForm: 'tafel', frequencyRank: 100 }], {
    shouldReplaceExisting: true,
  });
  const [added] = wordContext.wordService.createWords([
    { nl: 'tafel', uk: 'стіл', article: 'de', section: '3.2' },
  ]).added;
  assert.equal(added.priority, 1);
  assert.equal(added.frequency_rank, 100);
});

test('changing a word section re-ranks it and recalculates its priority', () => {
  const wordContext = createTestContext();
  const [wordId] = createWordIds(wordContext, [{ nl: 'raam', uk: 'вікно', section: '3.2' }]);
  assert.equal(wordContext.wordService.getWord(wordId).priority, 3);
  assert.equal(wordContext.wordService.updateWord(wordId, { section: '6.1' }).priority, 1);
});

test('once FSRS is set up, a word is always stored as new, and before it the given status is kept', () => {
  const clock = createFixedClock(MORNING_IN_AMSTERDAM);
  const wordContext = createTestContext({ clock });
  const beforeMigration = wordContext.wordService.createWord({
    nl: 'huis',
    uk: 'дім',
    section: '6.1',
    status: 'learning',
  });
  assert.equal(beforeMigration.status, 'learning');

  wordContext.practiceService.migrateToFsrs({ isDryRun: false });
  assert.equal(wordContext.wordService.createWord({ nl: 'boom', uk: 'дерево', status: 'learned' }).status, 'new');
  const [added] = wordContext.wordService.createWords([{ nl: 'vogel', uk: 'птах', status: 'learning' }]).added;
  assert.equal(added.status, 'new');
});

test('once FSRS is set up, status learning or learned is refused, and new resets the card', () => {
  const clock = createFixedClock(MORNING_IN_AMSTERDAM);
  const wordContext = createTestContext({ clock });
  const [wordId] = createWordIds(wordContext, [{ nl: 'huis', uk: 'дім', section: '6.1' }]);
  wordContext.practiceService.migrateToFsrs({ isDryRun: false });
  wordContext.practiceService.gradeWord({ wordId, grade: 'good', answer: 'huis', sessionId: 'session-1' });
  assert.equal(wordContext.wordService.getWord(wordId).state, 'review');

  assert.throws(() => wordContext.wordService.updateWordStatus(wordId, 'learning'), ValidationError);
  assert.throws(() => wordContext.wordService.updateWord(wordId, { status: 'learned' }), ValidationError);
  assert.throws(() => wordContext.wordService.updateWordStatus(wordId, 'learned'), ValidationError);

  const reset = wordContext.wordService.updateWordStatus(wordId, 'new');
  assert.equal(reset.status, 'new');
  assert.equal(reset.state, 'new');
  assert.equal(reset.next_due_on, null);
  const row = wordContext.database.prepare(
    'SELECT fsrs_card, due_at, introduced_on FROM words WHERE id = ?',
  ).get(wordId);
  assert.deepEqual({ ...row }, { fsrs_card: null, due_at: null, introduced_on: null });
});

test('resetting a word to new clears its learning-deck places in both directions', () => {
  const clock = createFixedClock(MORNING_IN_AMSTERDAM);
  const wordContext = createTestContext({ clock });
  const [wordId] = createWordIds(wordContext, [{ nl: 'huis', uk: 'дім', section: '6.1' }]);
  wordContext.practiceService.migrateToFsrs({ isDryRun: false });
  wordContext.practiceService.gradeWord({ wordId, grade: 'again', answer: 'x', sessionId: 'session-1' });
  const inDeck = wordContext.database.prepare(`
    SELECT deck_required_correct, deck_reverse_required_correct FROM words WHERE id = ?
  `).get(wordId);
  assert.deepEqual({ ...inDeck }, { deck_required_correct: 3, deck_reverse_required_correct: 2 });

  wordContext.wordService.updateWordStatus(wordId, 'new');
  const cleared = wordContext.database.prepare(`
    SELECT deck_required_correct, deck_correct_count, deck_entered_by_lapse,
      deck_reverse_required_correct, deck_reverse_correct_count, deck_reverse_entered_by_lapse
    FROM words WHERE id = ?
  `).get(wordId);
  assert.deepEqual({ ...cleared }, {
    deck_required_correct: null,
    deck_correct_count: 0,
    deck_entered_by_lapse: 0,
    deck_reverse_required_correct: null,
    deck_reverse_correct_count: 0,
    deck_reverse_entered_by_lapse: 0,
  });
  assert.equal(wordContext.practiceService.calculatePracticeStatistics().deck_size, 0);
});

test('list_words filters by state, priority and due day, and sorts by due and by frequency', () => {
  const clock = createFixedClock(MORNING_IN_AMSTERDAM);
  const wordContext = createTestContext({ clock });
  const [huisId, tafelId, stoelId, raamId] = createWordIds(wordContext, [
    { nl: 'huis', uk: 'дім', section: '6.1' },
    { nl: 'tafel', uk: 'стіл', section: '6.1' },
    { nl: 'stoel', uk: 'стілець', section: '3.2' },
    { nl: 'raam', uk: 'вікно', section: '3.2' },
  ]);
  wordContext.practiceService.migrateToFsrs({ isDryRun: false });
  wordContext.practiceService.gradeWord({ wordId: huisId, grade: 'good', sessionId: 'session-1' });
  wordContext.practiceService.gradeWord({ wordId: stoelId, grade: 'good', sessionId: 'session-1' });
  clock.moveTo('2026-11-03T12:00:00+01:00');
  wordContext.practiceService.gradeWord({ wordId: stoelId, grade: 'again', sessionId: 'session-2' });

  assert.deepEqual(listWordIds(wordContext, { state: 'new' }), [tafelId, raamId]);
  assert.deepEqual(listWordIds(wordContext, { state: 'review' }), [huisId, stoelId]);
  assert.deepEqual(listWordIds(wordContext, { state: 'learning' }), []);
  assert.deepEqual(listWordIds(wordContext, { priority: 1 }), [huisId, tafelId]);
  assert.deepEqual(listWordIds(wordContext, { priority: 3 }), [stoelId, raamId]);
  // huis is in the learning deck, so it came back the day after its grade (2026-10-25).
  assert.deepEqual(listWordIds(wordContext, { dueBefore: findStartOfDay('2026-10-26', TIME_ZONE) }), [huisId]);
  assert.deepEqual(listWordIds(wordContext, { dueBefore: findStartOfDay('2026-11-04', TIME_ZONE) }), [huisId]);

  assert.deepEqual(listWordIds(wordContext, { sort: 'due' }), [huisId, stoelId, tafelId, raamId]);

  wordContext.priorityService.importFrequencyList([
    { wordForm: 'raam', frequencyRank: 50 },
    { wordForm: 'huis', frequencyRank: 500 },
  ], { shouldReplaceExisting: true });
  assert.deepEqual(listWordIds(wordContext, { sort: 'frequency' }), [raamId, huisId, tafelId, stoelId]);
});

test('stats reports the FSRS states and the words due today, overdue ones included', () => {
  const clock = createFixedClock(MORNING_IN_AMSTERDAM);
  const wordContext = createTestContext({ clock });
  const [huisId, tafelId] = createWordIds(wordContext, [
    { nl: 'huis', uk: 'дім', section: '6.1' },
    { nl: 'tafel', uk: 'стіл', section: '6.1' },
    { nl: 'raam', uk: 'вікно', section: '6.1' },
  ]);
  wordContext.practiceService.migrateToFsrs({ isDryRun: false });
  const fsrsCounts = () => wordContext.statisticsService.calculateStatistics().fsrs;
  assert.deepEqual(fsrsCounts(), { new: 3, learning: 0, review: 0, relearning: 0, due_today: 0 });

  wordContext.practiceService.gradeWord({ wordId: huisId, grade: 'good', sessionId: 'session-1' });
  wordContext.practiceService.gradeWord({ wordId: tafelId, grade: 'again', sessionId: 'session-1' });
  assert.deepEqual(fsrsCounts(), { new: 1, learning: 0, review: 2, relearning: 0, due_today: 0 });

  clock.moveTo('2026-11-03T12:00:00+01:00');
  assert.deepEqual(fsrsCounts(), { new: 1, learning: 0, review: 2, relearning: 0, due_today: 2 });

  // The long-term scheduler keeps a review card in review after a lapse; huis is due after today, so only tafel counts.
  wordContext.practiceService.gradeWord({ wordId: huisId, grade: 'again', sessionId: 'session-2' });
  assert.deepEqual(fsrsCounts(), { new: 1, learning: 0, review: 2, relearning: 0, due_today: 1 });
});
