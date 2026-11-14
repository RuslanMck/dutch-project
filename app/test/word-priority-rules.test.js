// Word priority rules (WORD_PRIORITY_AND_DICTIONARY §1): the chapter halves the rank, queue order with the manual tag,
// the topic caps of a new set, the current chapter that follows added words, the manual tag and the one-off
// recalculation. The pure rules are tested directly; the rest runs against an in-memory database.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allocateNewWords } from '../src/domains/practice/new-word-allocation.js';
import {
  calculateEffectiveRank,
  calculatePriority,
  compareQueueOrder,
  mapPriorityOverrideToTag,
  mapPriorityTagToOverride,
} from '../src/domains/practice/priority-calculation.js';
import { createTestContext } from './database-test-helpers.js';

const MORNING_IN_AMSTERDAM = '2026-10-24T12:00:00+02:00';

function createFixedClock(isoText) {
  return { now: () => Date.parse(isoText) };
}

function priorityOf({ chapterNumber, frequencyRank, currentChapter }) {
  return calculatePriority({ priorityOverride: null, chapterNumber, frequencyRank, currentChapter });
}

test('plan examples: trui, hoofdgerecht, boek and paella', () => {
  // trui: chapter 7, rank 3231, current chapter 7 → 1615.5 → P1
  assert.equal(calculateEffectiveRank({ frequencyRank: 3231, chapterNumber: 7, currentChapter: 7 }), 1615.5);
  assert.equal(priorityOf({ chapterNumber: 7, frequencyRank: 3231, currentChapter: 7 }), 1);
  // hoofdgerecht: chapter 6, rank 14309, current chapter 7 → 7154.5 → P3
  assert.equal(calculateEffectiveRank({ frequencyRank: 14309, chapterNumber: 6, currentChapter: 7 }), 7154.5);
  assert.equal(priorityOf({ chapterNumber: 6, frequencyRank: 14309, currentChapter: 7 }), 3);
  // boek: no chapter, rank 399 → P1
  assert.equal(priorityOf({ chapterNumber: null, frequencyRank: 399, currentChapter: 7 }), 1);
  // paella: chapter 6, unranked → P3
  assert.equal(priorityOf({ chapterNumber: 6, frequencyRank: null, currentChapter: 6 }), 3);
});

test('the chapter is not a priority by itself: a lesson word is P1 only through its rank', () => {
  assert.equal(priorityOf({ chapterNumber: 6, frequencyRank: 4001, currentChapter: 6 }), 2, '4001 halved is 2000.5');
  assert.equal(priorityOf({ chapterNumber: 6, frequencyRank: 4000, currentChapter: 6 }), 1, '4000 halved is 2000');
  assert.equal(priorityOf({ chapterNumber: 6, frequencyRank: 10001, currentChapter: 6 }), 3, '10001 halved is 5000.5');
  const rankedWord = { frequencyRank: 3000, currentChapter: 6 };
  assert.equal(priorityOf({ ...rankedWord, chapterNumber: 5 }), 1, 'the previous chapter counts');
  assert.equal(priorityOf({ ...rankedWord, chapterNumber: 4 }), 2, 'two chapters back does not');
});

test('a manual override wins over the rank and the chapter', () => {
  assert.equal(calculatePriority({ priorityOverride: 3, chapterNumber: 6, frequencyRank: 1, currentChapter: 6 }), 3);
  assert.equal(calculatePriority({ priorityOverride: 2, chapterNumber: 6, frequencyRank: 1, currentChapter: 6 }), 2);
});

test('queue order: priority, then the tag «Вчити першим», then the effective rank, never the chapter', () => {
  const entry = (id, fields) => ({ id, priority: 1, priorityOverride: null, effectiveRank: null, ...fields });
  const sortedIds = [
    entry(1, { effectiveRank: 1200 }),
    entry(2, { effectiveRank: 600 }),
    entry(3, { priorityOverride: 1, effectiveRank: 1900 }),
    entry(4, { effectiveRank: null }),
    entry(5, { priority: 2, priorityOverride: 1, effectiveRank: 1 }),
  ].sort(compareQueueOrder).map(candidate => candidate.id);
  assert.deepEqual(sortedIds, [3, 2, 1, 4, 5]);
});

test('queue order: a lesson word at rank 1500 (effective 750) comes before rank 800 outside the lesson', () => {
  const lessonWord = { id: 1, frequencyRank: 1500, chapterNumber: 6, currentChapter: 6 };
  const otherWord = { id: 2, frequencyRank: 800, chapterNumber: null, currentChapter: 6 };
  const entries = [lessonWord, otherWord].map(word => ({
    id: word.id,
    priority: priorityOf(word),
    priorityOverride: null,
    effectiveRank: calculateEffectiveRank(word),
  }));
  assert.deepEqual(entries.sort(compareQueueOrder).map(entry => entry.id), [1, 2], 'halved to 750, it comes first');
});

test('the tag maps to the override and back; override 2 has no tag', () => {
  assert.equal(mapPriorityTagToOverride('first'), 1);
  assert.equal(mapPriorityTagToOverride('later'), 3);
  assert.equal(mapPriorityTagToOverride(null), null);
  assert.equal(mapPriorityOverrideToTag(1), 'first');
  assert.equal(mapPriorityOverrideToTag(3), 'later');
  assert.equal(mapPriorityOverrideToTag(2), null);
  assert.equal(mapPriorityOverrideToTag(null), null);
});

// Candidates in queue order: { id, priority, priorityOverride, category, kind }.
function candidate(id, { priority = 1, priorityOverride = null, category = null, kind = 'word' } = {}) {
  return { id, priority, priorityOverride, category, kind };
}

// Ranks the given Dutch texts; the rest of the list is replaced.
function rankWords(context, rankByDutchText) {
  context.priorityService.importFrequencyList(
    Object.entries(rankByDutchText).map(([wordForm, frequencyRank]) => ({ wordForm, frequencyRank })),
    { shouldReplaceExisting: true },
  );
}

function addWordIds(context, wordInputs) {
  return context.wordService.createWords(wordInputs).added.map(word => word.id);
}

function pickedIds(selectedWords) {
  return selectedWords.map(word => word.id);
}

test('topic caps: at most 3 words of one category in a set, the fourth waits for the others', () => {
  const food = [1, 2, 3, 4, 5].map(id => candidate(id, { category: 'food' }));
  const city = [6, 7, 8].map(id => candidate(id, { category: 'city' }));
  const selectedWords = allocateNewWords({
    candidatesByPriority: { 1: [...food, ...city], 2: [], 3: [] },
    introducedTodayByPriority: { 1: 0, 2: 0, 3: 0 },
    newPerDay: 10,
    tierQuota: { 1: 10, 2: 0, 3: 0 },
  });
  // Only eight words exist: food 4 and 5 were set aside by the cap and fill the last two places. The result is in
  // queue order.
  assert.deepEqual(pickedIds(selectedWords), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('topic caps: the set is never left short, and the skipped words fill it after the other tiers', () => {
  const food = [1, 2, 3, 4, 5].map(id => candidate(id, { category: 'food' }));
  const home = [6, 7, 8, 9, 10].map(id => candidate(id, { category: 'home' }));
  const cities = [11, 12, 13].map(id => candidate(id, { category: 'city', priority: 2 }));
  const selectedWords = allocateNewWords({
    candidatesByPriority: { 1: [...food, ...home], 2: cities, 3: [] },
    introducedTodayByPriority: { 1: 0, 2: 0, 3: 0 },
    newPerDay: 10,
    tierQuota: { 1: 6, 2: 4, 3: 0 },
  });
  // P1: food 1–3 and home 6–8 by the quota, food 4 and 5 set aside by the cap; P2: city 11–13. Home 9 and 10 are over
  // the cap too, so the last slot goes to food 4, the first set-aside word in queue order. Each tier is in queue order.
  assert.deepEqual(pickedIds(selectedWords), [1, 2, 3, 4, 6, 7, 8, 11, 12, 13]);
});

test('topic caps: at most 2 expressions in a set', () => {
  const expressions = [1, 2, 3].map(id => candidate(id, { kind: 'expression' }));
  const words = [4, 5].map(id => candidate(id));
  const selectedWords = allocateNewWords({
    candidatesByPriority: { 1: [...expressions, ...words], 2: [], 3: [] },
    introducedTodayByPriority: { 1: 0, 2: 0, 3: 0 },
    newPerDay: 10,
    tierQuota: { 1: 5, 2: 0, 3: 0 },
  });
  assert.deepEqual(pickedIds(selectedWords), [1, 2, 3, 4, 5]);
});

test('topic caps: a word tagged «Вчити першим» ignores the caps and does not count toward them', () => {
  const tagged = [1, 2, 3, 4].map(id => candidate(id, { category: 'food', priorityOverride: 1 }));
  const regular = [5, 6].map(id => candidate(id, { category: 'food' }));
  const selectedWords = allocateNewWords({
    candidatesByPriority: { 1: [...tagged, ...regular], 2: [], 3: [] },
    introducedTodayByPriority: { 1: 0, 2: 0, 3: 0 },
    newPerDay: 6,
    tierQuota: { 1: 6, 2: 0, 3: 0 },
  });
  // The four tagged food words are all in; the regular food words count from zero: 5 and 6 both fit under the cap of 3.
  assert.deepEqual(pickedIds(selectedWords), [1, 2, 3, 4, 5, 6]);
});

test('topic caps: a word without a category has no category cap', () => {
  const uncategorized = [1, 2, 3, 4, 5].map(id => candidate(id));
  const selectedWords = allocateNewWords({
    candidatesByPriority: { 1: uncategorized, 2: [], 3: [] },
    introducedTodayByPriority: { 1: 0, 2: 0, 3: 0 },
    newPerDay: 5,
    tierQuota: { 1: 5, 2: 0, 3: 0 },
  });
  assert.deepEqual(pickedIds(selectedWords), [1, 2, 3, 4, 5]);
});

test('current chapter: a word from a later chapter makes it current and recalculates priorities', () => {
  const context = createTestContext({ clock: createFixedClock(MORNING_IN_AMSTERDAM) });
  const [sixId] = addWordIds(context, [{ nl: 'zes', uk: 'шість', section: '6.1' }]);
  rankWords(context, { zes: 3000 });
  assert.equal(context.wordService.getWord(sixId).priority, 1, '3000 halved in chapter 6 is P1');
  assert.equal(context.priorityService.readCurrentChapter(), 6);

  const [sevenId] = addWordIds(context, [{ nl: 'zeven', uk: 'сім', section: '7.1' }]);

  assert.equal(context.priorityService.readCurrentChapter(), 7);
  assert.equal(context.wordService.getWord(sevenId).priority, 3, 'unranked');
  assert.equal(context.wordService.getWord(sixId).priority, 1, 'chapter 6 is now the previous chapter: still halved');
  context.wordService.createWord({ nl: 'acht', uk: 'вісім', section: '5.1' });
  assert.equal(context.priorityService.readCurrentChapter(), 7, 'an earlier chapter does not lower it');
});

test('current chapter: a word of a chapter above 99 does not change it', () => {
  const context = createTestContext({ clock: createFixedClock(MORNING_IN_AMSTERDAM) });
  context.wordService.createWord({ nl: 'honderd', uk: 'сто', section: '120.1' });
  assert.equal(context.priorityService.readCurrentChapter(), 6);
});

test('manual tag: first and later set the override, null clears it; priority_tag follows on every word shape', () => {
  const context = createTestContext({ clock: createFixedClock(MORNING_IN_AMSTERDAM) });
  const word = context.wordService.createWord({ nl: 'boek', uk: 'книжка', section: '3.2' });
  assert.equal(word.priority_tag, null);

  const first = context.wordService.setWordPriorityTag(word.id, 'first');
  assert.equal(first.priority_override, 1);
  assert.equal(first.priority, 1);
  assert.equal(first.priority_tag, 'first');

  const later = context.wordService.setWordPriorityTag(word.id, 'later');
  assert.equal(later.priority_override, 3);
  assert.equal(later.priority, 3);
  assert.equal(later.priority_tag, 'later');

  context.priorityService.setWordPriority(word.id, 2);
  const priorityTwo = context.wordService.getWord(word.id);
  assert.equal(priorityTwo.priority_override, 2);
  assert.equal(priorityTwo.priority_tag, null, 'override 2 has no tag');

  const cleared = context.wordService.setWordPriorityTag(word.id, null);
  assert.equal(cleared.priority_override, null);
  assert.equal(cleared.priority_tag, null);
  assert.throws(() => context.wordService.setWordPriorityTag(999999, 'first'), /not found/);
});

test('one-off recalculation: stale priorities are recalculated once, then the marker stops it', () => {
  const context = createTestContext({ clock: createFixedClock(MORNING_IN_AMSTERDAM) });
  const [wordId] = addWordIds(context, [{ nl: 'zes', uk: 'шість', section: '6.1' }]);
  rankWords(context, { zes: 9000 });
  // Priorities as the old rules left them: the chapter alone made the word P1.
  context.database.prepare('UPDATE words SET priority = 1 WHERE id = ?').run(wordId);
  assert.equal(context.practiceSettings.readSettings().priorityRulesVersion, 1);

  assert.equal(context.priorityService.upgradePriorityRules(), true);
  assert.equal(context.wordService.getWord(wordId).priority, 2, '9000 halved is 4500: P2');
  assert.equal(context.practiceSettings.readSettings().priorityRulesVersion, 2);

  context.database.prepare('UPDATE words SET priority = 1 WHERE id = ?').run(wordId);
  assert.equal(context.priorityService.upgradePriorityRules(), false, 'the marker is 2: nothing runs');
  assert.equal(context.wordService.getWord(wordId).priority, 1, 'a second run would have recalculated it');
});
