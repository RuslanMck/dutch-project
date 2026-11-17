// The review set's order (review-set-planning.js), pure: priority 1, 2, 3; the harder word first (FSRS difficulty, then
// lapses); the earlier due time; then the id. Words introduced today and the excluded ids are left out.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareReviewOrder, mapToReviewCandidate, orderReviewCandidates } from '../src/domains/practice/review-set-planning.js';

const TODAY = '2026-10-24';

function candidate(overrides) {
  return {
    id: 1,
    priority: 2,
    difficulty: 5,
    lapses: 0,
    dueAt: Date.parse('2026-10-20T09:00:00+02:00'),
    introducedOn: '2026-10-01',
    ...overrides,
  };
}

function idsOf(candidates) {
  return candidates.map(item => item.id);
}

test('the priority comes first: priority 1 before 2 and 3, whatever the difficulty', () => {
  const easyP1 = candidate({ id: 1, priority: 1, difficulty: 1 });
  const hardP2 = candidate({ id: 2, priority: 2, difficulty: 9, lapses: 9 });
  const hardP3 = candidate({ id: 3, priority: 3, difficulty: 9, lapses: 9 });
  const ordered = orderReviewCandidates({ candidates: [hardP3, hardP2, easyP1], today: TODAY });
  assert.deepEqual(idsOf(ordered), [1, 2, 3]);
});

test('inside a priority the harder word first: higher FSRS difficulty, then more lapses', () => {
  const easy = candidate({ id: 1, difficulty: 3, lapses: 4 });
  const hardWithFewLapses = candidate({ id: 2, difficulty: 8, lapses: 0 });
  const hardWithManyLapses = candidate({ id: 3, difficulty: 8, lapses: 2 });
  const ordered = orderReviewCandidates({ candidates: [easy, hardWithFewLapses, hardWithManyLapses], today: TODAY });
  assert.deepEqual(idsOf(ordered), [3, 2, 1]);
});

test('equal priority, difficulty and lapses: the earlier due time first, then the lower id', () => {
  const laterDue = candidate({ id: 1, dueAt: Date.parse('2026-10-23T09:00:00+02:00') });
  const earlierDue = candidate({ id: 2, dueAt: Date.parse('2026-10-21T09:00:00+02:00') });
  const sameDueHigherId = candidate({ id: 5, dueAt: earlierDue.dueAt });
  const sameDueLowerId = candidate({ id: 4, dueAt: earlierDue.dueAt });
  const ordered = orderReviewCandidates({
    candidates: [laterDue, sameDueHigherId, earlierDue, sameDueLowerId],
    today: TODAY,
  });
  assert.deepEqual(idsOf(ordered), [2, 4, 5, 1]);
});

test('compareReviewOrder is negative, zero or positive in that order', () => {
  assert.ok(compareReviewOrder(candidate({ priority: 1 }), candidate({ priority: 2 })) < 0);
  assert.equal(compareReviewOrder(candidate({ id: 7 }), candidate({ id: 7 })), 0);
  assert.ok(compareReviewOrder(candidate({ difficulty: 2 }), candidate({ difficulty: 6 })) > 0);
});

test('a word introduced today is not a review yet, and the excluded ids (graded in this session) are left out', () => {
  const introducedToday = candidate({ id: 1, introducedOn: TODAY });
  const graded = candidate({ id: 2 });
  const owed = candidate({ id: 3 });
  const ordered = orderReviewCandidates({ candidates: [introducedToday, graded, owed], today: TODAY, excludedIds: [2] });
  assert.deepEqual(idsOf(ordered), [3]);
});

test('orderReviewCandidates returns a frozen array and does not reorder the input', () => {
  const input = [candidate({ id: 2, priority: 3 }), candidate({ id: 1, priority: 1 })];
  const ordered = orderReviewCandidates({ candidates: input, today: TODAY });
  assert.ok(Object.isFrozen(ordered));
  assert.deepEqual(idsOf(input), [2, 1]);
});

test('mapToReviewCandidate reads the difficulty and lapses of the card; a word without a card counts 0 for both', () => {
  const card = { due: '2026-10-25T00:00:00.000Z', difficulty: 6.5, lapses: 3, last_review: null };
  const withCard = mapToReviewCandidate({
    id: 9, priority: 2, fsrs_card: JSON.stringify(card), due_at: 1000, introduced_on: '2026-10-01',
  });
  assert.deepEqual(withCard, {
    id: 9, priority: 2, difficulty: 6.5, lapses: 3, dueAt: 1000, introducedOn: '2026-10-01',
  });
  const withoutCard = mapToReviewCandidate({ id: 10, priority: 1, fsrs_card: null, due_at: null, introduced_on: null });
  assert.equal(withoutCard.difficulty, 0);
  assert.equal(withoutCard.lapses, 0);
  assert.equal(withoutCard.dueAt, 0);
  assert.equal(withoutCard.introducedOn, null);
});
