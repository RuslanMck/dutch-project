// The struggling-words drill (§13.1) at service level with a fake clock: the words whose latest graded answer was again
// or hard, most errors first, and nothing the drill does changes a card, a review log or a word error.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ConflictError } from '../src/errors/domain-errors.js';
import { createTestContext } from './database-test-helpers.js';

const MORNING_IN_AMSTERDAM = '2026-10-24T10:00:00+02:00';
const NEXT_MORNING_IN_AMSTERDAM = '2026-10-25T10:00:00+01:00';
const THIRTY_MINUTES = 30 * 60_000;

function createFakeClock(startIsoText) {
  let currentTime = Date.parse(startIsoText);
  return {
    now() {
      return currentTime;
    },
    moveTo(isoText) {
      currentTime = Date.parse(isoText);
    },
    advance(milliseconds) {
      currentTime += milliseconds;
    },
  };
}

function snapshotPractice(context) {
  return {
    reviewLogCount: context.database.prepare('SELECT COUNT(*) FROM review_logs').pluck().get(),
    wordErrorCount: context.database.prepare('SELECT COUNT(*) FROM word_errors').pluck().get(),
    words: context.database.prepare('SELECT id, fsrs_card, due_at, status, introduced_on FROM words ORDER BY id').all(),
  };
}

test('listStrugglingWords is refused before the FSRS migration', () => {
  const context = createTestContext({ clock: createFakeClock(MORNING_IN_AMSTERDAM) });
  assert.throws(() => context.practiceService.listStrugglingWords(), ConflictError);
});

test('the struggling words are the latest answers again or hard, most errors first, then latest first', () => {
  const clock = createFakeClock(MORNING_IN_AMSTERDAM);
  const context = createTestContext({ clock });
  const [kat, hond, vis, boek] = context.wordService.createWords(
    ['kat', 'hond', 'vis', 'boek', 'huis'].map(dutchText => ({
      nl: dutchText,
      uk: `${dutchText} (переклад)`,
      section: '6.1',
    })),
  ).added.map(word => word.id);
  context.practiceService.migrateToFsrs({ isDryRun: false });

  context.practiceService.gradeWord({ wordId: hond, grade: 'hard', answer: 'hont', sessionId: 's1' });
  clock.advance(THIRTY_MINUTES);
  context.practiceService.gradeWord({ wordId: kat, grade: 'again', answer: 'x', sessionId: 's1' });
  clock.advance(THIRTY_MINUTES);
  context.practiceService.gradeWord({ wordId: vis, grade: 'again', answer: 'x', sessionId: 's1' });
  clock.advance(THIRTY_MINUTES);
  context.practiceService.gradeWord({ wordId: vis, grade: 'good', sessionId: 's2' });
  clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  context.practiceService.gradeWord({ wordId: boek, grade: 'hard', answer: 'boek?', sessionId: 's2' });
  context.practiceService.gradeWord({ wordId: kat, grade: 'again', answer: 'x', sessionId: 's3' });

  const drill = context.practiceService.listStrugglingWords();

  // vis's good in session s2 is a repeat of the same day in the same direction: its log still counts again.
  assert.deepEqual(drill.words.map(word => word.id), [kat, boek, vis, hond]);
  assert.equal(drill.count, 4);
  assert.deepEqual(drill.words.map(word => word.error_count), [2, 1, 1, 1]);
  assert.deepEqual(drill.words.map(word => word.last_grade), ['again', 'hard', 'again', 'hard']);
  assert.deepEqual(drill.words.map(word => word.last_reviewed_on), ['2026-10-25', '2026-10-25', '2026-10-24', '2026-10-24']);
  assert.deepEqual(Object.keys(drill.words[0]).sort(), [
    'article', 'deck', 'error_count', 'id', 'kind', 'last_grade', 'last_reviewed_on', 'nl', 'priority', 'state', 'uk',
  ]);
});

test('a word whose other direction was answered worse in the session is struggling: the session grade is the worse one', () => {
  const clock = createFakeClock(MORNING_IN_AMSTERDAM);
  const context = createTestContext({ clock });
  const [kat, hond, vis] = context.wordService.createWords(
    ['kat', 'hond', 'vis'].map(dutchText => ({ nl: dutchText, uk: `${dutchText} (переклад)`, section: '6.1' })),
  ).added.map(word => word.id);
  context.practiceService.migrateToFsrs({ isDryRun: false });

  context.practiceService.gradeWord({ wordId: kat, grade: 'good', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: kat, grade: 'again', answer: 'x', sessionId: 's1', direction: 'nl_uk' });
  context.practiceService.gradeWord({ wordId: hond, grade: 'hard', answer: 'x', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: hond, grade: 'good', sessionId: 's1', direction: 'nl_uk' });
  context.practiceService.gradeWord({ wordId: vis, grade: 'good', sessionId: 's1' });
  context.practiceService.gradeWord({ wordId: vis, grade: 'good', sessionId: 's1', direction: 'nl_uk' });

  const drill = context.practiceService.listStrugglingWords();

  assert.deepEqual(drill.words.map(word => word.id).sort(), [kat, hond].sort());
  const lastGradeOf = wordId => drill.words.find(word => word.id === wordId).last_grade;
  assert.equal(lastGradeOf(kat), 'again');
  assert.equal(lastGradeOf(hond), 'hard');
});

test('the drill writes nothing: no card, review log, word error or status changes', () => {
  const clock = createFakeClock(MORNING_IN_AMSTERDAM);
  const context = createTestContext({ clock });
  const [kat] = context.wordService.createWords([{ nl: 'kat', uk: 'кіт', section: '6.1' }]).added.map(word => word.id);
  context.practiceService.migrateToFsrs({ isDryRun: false });
  context.practiceService.gradeWord({ wordId: kat, grade: 'again', answer: 'x', sessionId: 's1' });
  const before = snapshotPractice(context);

  const first = context.practiceService.listStrugglingWords();
  const second = context.practiceService.listStrugglingWords();

  assert.deepEqual(first, second);
  assert.equal(first.count, 1);
  assert.deepEqual(snapshotPractice(context), before);
});
