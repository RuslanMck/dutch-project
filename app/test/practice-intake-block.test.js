// The pinned intake blocks (§13.2) at service level with a fake clock: the block pins the items allocated when its
// first item is started, its leftovers are the only new items on offer until they are all started or deleted, and
// nothing outside the block changes it. Words and phrases follow the same rules.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTestContext } from './database-test-helpers.js';

const MORNING_IN_AMSTERDAM = '2026-10-24T12:00:00+02:00';
const NEXT_MORNING_IN_AMSTERDAM = '2026-10-25T12:00:00+01:00';
const DAY_AFTER_NEXT_MORNING_IN_AMSTERDAM = '2026-10-26T12:00:00+01:00';

function createFakeClock(startIsoText) {
  let currentTime = Date.parse(startIsoText);
  return {
    now() {
      return currentTime;
    },
    moveTo(isoText) {
      currentTime = Date.parse(isoText);
    },
  };
}

function createPracticeContext(startIsoText = MORNING_IN_AMSTERDAM) {
  return createTestContext({ clock: createFakeClock(startIsoText) });
}

// Adds words to one textbook section; returns their ids.
function addWords(context, sectionCode, dutchTexts) {
  const wordInputs = dutchTexts.map(dutchText => ({
    nl: dutchText,
    uk: `${dutchText} (переклад)`,
    section: sectionCode,
  }));
  return context.wordService.createWords(wordInputs).added.map(word => word.id);
}

function makeNames(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
}

function migrate(context) {
  context.practiceService.migrateToFsrs({ isDryRun: false });
}

function countByPriority(words) {
  return {
    1: words.filter(word => word.priority === 1).length,
    2: words.filter(word => word.priority === 2).length,
    3: words.filter(word => word.priority === 3).length,
  };
}

// P1: p1Count words in chapter 6. P2: p2Count words in chapter 3, ranked 3000 and up. P3: p3Count unranked words in
// chapter 3.
function addPriorityMix(context, { p1Count, p2Count, p3Count }) {
  const p2Names = makeNames('tweede', p2Count);
  addWords(context, '6.1', makeNames('eerste', p1Count));
  addWords(context, '3.2', p2Names);
  addWords(context, '3.2', makeNames('derde', p3Count));
  context.priorityService.importFrequencyList(
    p2Names.map((dutchText, index) => ({ wordForm: dutchText, frequencyRank: 3000 + index })),
    { shouldReplaceExisting: true },
  );
}

function gradeGood(context, wordIds, sessionId) {
  for (const wordId of wordIds) {
    context.practiceService.gradeWord({ wordId, grade: 'good', sessionId });
  }
}

test('the leftovers are exactly the pinned words: words added later do not join the open block', () => {
  const context = createPracticeContext();
  const originalIds = addWords(context, '6.1', makeNames('oud', 10));
  migrate(context);
  const firstBatch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.deepEqual(firstBatch.new_words.map(word => word.id), originalIds);
  gradeGood(context, originalIds.slice(0, 4), 's1');

  const laterIds = addWords(context, '6.1', ['beter1', 'beter2', 'beter3', 'beter4', 'beter5']);
  context.priorityService.importFrequencyList(
    ['beter1', 'beter2', 'beter3', 'beter4', 'beter5'].map((dutchText, index) => ({
      wordForm: dutchText,
      frequencyRank: index + 1,
    })),
    { shouldReplaceExisting: false },
  );
  const sameDayBatch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.deepEqual(sameDayBatch.new_words.map(word => word.id), originalIds.slice(4));
  assert.equal(sameDayBatch.counts.new_today_remaining, 6);

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const nextDayBatch = context.practiceService.getPracticeBatch({ sessionId: 's2' });

  assert.deepEqual(nextDayBatch.new_words.map(word => word.id), originalIds.slice(4), 'the 6 original unstarted ids');
  assert.equal(nextDayBatch.counts.new_today_remaining, 6);
  assert.equal(nextDayBatch.counts.new_remaining_by_priority[1], 5, 'the 5 later words wait outside the block');
  assert.equal(laterIds.length, 5);
});

test('a started word whose priority changes keeps the block: its leftovers and count are the same', () => {
  const context = createPracticeContext();
  const originalIds = addWords(context, '6.1', makeNames('oud', 10));
  migrate(context);
  context.practiceService.getPracticeBatch({ sessionId: 's1' });
  gradeGood(context, originalIds.slice(0, 4), 's1');
  const leftoverIdsBefore = context.practiceService.getPracticeBatch({ sessionId: 's1' })
    .new_words.map(word => word.id);

  context.priorityService.setWordPriority(originalIds[0], 3);
  context.priorityService.setCurrentChapter(9);

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.deepEqual(batch.new_words.map(word => word.id), leftoverIdsBefore);
  assert.equal(batch.counts.new_today_remaining, 6);
  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const nextDayBatch = context.practiceService.getPracticeBatch({ sessionId: 's2' });
  assert.deepEqual(nextDayBatch.new_words.map(word => word.id), originalIds.slice(4));
  assert.equal(nextDayBatch.counts.new_today_remaining, 6);
});

test('grading a New word outside the block leaves the block\'s leftovers unchanged', () => {
  const context = createPracticeContext();
  const originalIds = addWords(context, '6.1', makeNames('oud', 10));
  migrate(context);
  context.practiceService.getPracticeBatch({ sessionId: 's1' });
  gradeGood(context, originalIds.slice(0, 4), 's1');
  const [outsideId] = addWords(context, '3.2', ['buiten']);

  context.practiceService.gradeWord({ wordId: outsideId, grade: 'again', answer: 'x', sessionId: 's1' });

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.deepEqual(batch.new_words.map(word => word.id), originalIds.slice(4));
  assert.equal(batch.counts.new_today_remaining, 6);
  assert.equal(context.practiceSettings.readSettings().newWordBlock.itemIds.length, 10);
});

test('a deleted leftover counts as done; once all leftovers are done a fresh 10 opens the same day', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('oud', 25));
  migrate(context);
  const blockWords = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words;
  gradeGood(context, [blockWords[0].id], 's1');

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const deletedWordId = blockWords[5].id;
  context.wordService.deleteWord(deletedWordId);
  const leftovers = context.practiceService.getPracticeBatch({ sessionId: 's2' }).new_words;
  assert.equal(leftovers.length, 8, 'nine leftovers minus the deleted one');
  assert.equal(leftovers.some(word => word.id === deletedWordId), false);

  gradeGood(context, leftovers.map(word => word.id), 's2');
  const afterLeftovers = context.practiceService.getPracticeBatch({ sessionId: 's2' });

  assert.equal(afterLeftovers.new_words.length, 10, 'a fresh block of 10 opens the same day');
  assert.equal(afterLeftovers.counts.new_today_remaining, 10);
  const blockWordIds = blockWords.map(word => word.id);
  assert.equal(afterLeftovers.new_words.some(word => blockWordIds.includes(word.id)), false);
});

test('a block opened today that is finished gives no new words; extra words append 10 ids split 7, 2, 1', () => {
  const context = createPracticeContext();
  addPriorityMix(context, { p1Count: 24, p2Count: 8, p3Count: 6 });
  migrate(context);
  const firstBatch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  gradeGood(context, firstBatch.new_words.map(word => word.id), 's1');
  assert.equal(context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words.length, 0);

  const added = context.practiceService.addExtraNewWords({ count: 10 });
  const block = context.practiceSettings.readSettings().newWordBlock;
  const extraBatch = context.practiceService.getPracticeBatch({ sessionId: 's2' });

  assert.deepEqual(added, { extra_new_words_today: 10, new_today_remaining: 10 });
  assert.equal(block.itemIds.length, 20);
  assert.equal(extraBatch.new_words.length, 10);
  assert.deepEqual(countByPriority(extraBatch.new_words), { 1: 7, 2: 2, 3: 1 });
  assert.deepEqual(extraBatch.new_words.map(word => word.id), block.itemIds.slice(10));

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const carriedOver = context.practiceService.getPracticeBatch({ sessionId: 's3' });
  assert.deepEqual(carriedOver.new_words.map(word => word.id), block.itemIds.slice(10));
  assert.equal(carriedOver.counts.new_today_remaining, 10);
  assert.equal(context.practiceService.calculatePracticeStatistics().extra_new_words_today, 0);
});

test('a block saved in the old format (no item_ids) reads as finished: an earlier day gives a fresh 10', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('oud', 12));
  migrate(context);
  context.practiceSettings.saveNewWordBlock({
    opened_on: '2026-10-23',
    size: 10,
    introduced_at_open: { 1: 4, 2: 0, 3: 0 },
  });

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });

  assert.equal(batch.new_words.length, 10, 'not the 6 the old counts would leave');
  assert.equal(batch.counts.new_today_remaining, 10);
  assert.equal(batch.counts.new_words_blocked, false);
});

test('a block saved in the old format and opened today is finished for the day: no new words until tomorrow', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('oud', 12));
  migrate(context);
  context.practiceSettings.saveNewWordBlock({
    opened_on: '2026-10-24',
    size: 10,
    introduced_at_open: { 1: 0, 2: 0, 3: 0 },
  });

  const batch = context.practiceService.getPracticeBatch({ sessionId: 's1' });

  assert.deepEqual(batch.new_words, []);
  assert.equal(batch.counts.new_today_remaining, 0);
});

test('phrases: the leftovers are the pinned phrases, and a phrase added later waits outside the block', () => {
  const context = createPracticeContext();
  const phraseIds = [];
  for (const dutchText of makeNames('Zin ', 5)) {
    phraseIds.push(context.phraseService.createPhrase({ nl: dutchText, uk: `${dutchText} (переклад)` }).id);
  }
  migrate(context);
  const firstBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  assert.deepEqual(firstBatch.new_phrases.map(phrase => phrase.id), phraseIds);
  for (const phraseId of phraseIds.slice(0, 2)) {
    context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1' });
  }
  context.phraseService.createPhrase({ nl: 'Nieuwe zin', uk: 'Нова фраза' });

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  const nextDayBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' });

  assert.deepEqual(nextDayBatch.new_phrases.map(phrase => phrase.id), phraseIds.slice(2));
  assert.equal(nextDayBatch.counts.new_today_remaining, 3);
  assert.equal(nextDayBatch.counts.new_remaining, 1);
});

test('phrases: a deleted leftover counts as done, and finishing the leftovers opens a fresh 5 the same day', () => {
  const context = createPracticeContext();
  const phraseIds = [];
  for (const dutchText of makeNames('Zin ', 12)) {
    phraseIds.push(context.phraseService.createPhrase({ nl: dutchText, uk: 'фраза' }).id);
  }
  migrate(context);
  const blockPhraseIds = context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' }).new_phrases
    .map(phrase => phrase.id);
  context.phrasePracticeService.gradePhrase({ phraseId: blockPhraseIds[0], grade: 'good', sessionId: 's1' });

  context.clock.moveTo(NEXT_MORNING_IN_AMSTERDAM);
  context.phraseService.deletePhrase(blockPhraseIds[1]);
  const leftovers = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' }).new_phrases;
  assert.deepEqual(leftovers.map(phrase => phrase.id), blockPhraseIds.slice(2));
  for (const phrase of leftovers) {
    context.phrasePracticeService.gradePhrase({ phraseId: phrase.id, grade: 'good', sessionId: 's2' });
  }

  const freshBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' });
  assert.deepEqual(freshBatch.new_phrases.map(phrase => phrase.id), phraseIds.slice(5, 10));
  assert.equal(freshBatch.counts.new_today_remaining, 5);
});

test('phrases: a block finished today stays; a fresh block opens only on a later day', () => {
  const context = createPracticeContext();
  const phraseIds = [];
  for (const dutchText of makeNames('Zin ', 6)) {
    phraseIds.push(context.phraseService.createPhrase({ nl: dutchText, uk: 'фраза' }).id);
  }
  migrate(context);
  context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' });
  for (const phraseId of phraseIds.slice(0, 5)) {
    context.phrasePracticeService.gradePhrase({ phraseId, grade: 'good', sessionId: 's1' });
  }

  assert.deepEqual(context.phrasePracticeService.getPhraseBatch({ sessionId: 's1' }).new_phrases, []);
  context.clock.moveTo(DAY_AFTER_NEXT_MORNING_IN_AMSTERDAM);
  const laterBatch = context.phrasePracticeService.getPhraseBatch({ sessionId: 's2' });
  assert.deepEqual(laterBatch.new_phrases.map(phrase => phrase.id), [phraseIds[5]]);
  assert.equal(laterBatch.counts.new_today_remaining, 1, 'only one New phrase is left to start');
});

test('a word graded in session S and set back to New is held back in S only; a new session offers it again', () => {
  const context = createPracticeContext();
  const originalIds = addWords(context, '6.1', makeNames('oud', 10));
  migrate(context);
  context.practiceService.getPracticeBatch({ sessionId: 's1' });
  gradeGood(context, [originalIds[0]], 's1');
  context.wordService.updateWordStatus(originalIds[0], 'new');

  const sameSessionBatch = context.practiceService.getPracticeBatch({ sessionId: 's1' });
  assert.deepEqual(sameSessionBatch.new_words.map(word => word.id), originalIds.slice(1), 'not offered again in S');
  assert.equal(sameSessionBatch.counts.new_today_remaining, 10, 'the block holds the word until a session starts it');

  const nextSessionBatch = context.practiceService.getPracticeBatch({ sessionId: 's2' });
  assert.deepEqual(nextSessionBatch.new_words.map(word => word.id), originalIds);
});

test('a block saved in the old format (no extra_count) and opened today: 10 extra words report 10', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('oud', 20));
  migrate(context);
  const blockWords = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words;
  gradeGood(context, blockWords.map(word => word.id), 's1');
  context.practiceSettings.saveNewWordBlock({
    opened_on: '2026-10-24',
    item_ids: blockWords.map(word => word.id),
  });

  const added = context.practiceService.addExtraNewWords({ count: 10 });

  assert.deepEqual(added, { extra_new_words_today: 10, new_today_remaining: 10 });
  assert.equal(context.practiceSettings.readSettings().newWordBlock.extraCount, 10);
  assert.equal(context.practiceService.calculatePracticeStatistics().extra_new_words_today, 10);
});

test('a fresh block pinned with only 6 words, then 10 extra words: the extra count is 10', () => {
  const context = createPracticeContext();
  addWords(context, '6.1', makeNames('oud', 6));
  migrate(context);
  const pinnedWords = context.practiceService.getPracticeBatch({ sessionId: 's1' }).new_words;
  assert.equal(pinnedWords.length, 6);
  gradeGood(context, pinnedWords.map(word => word.id), 's1');
  addWords(context, '6.1', makeNames('extra', 10));

  const added = context.practiceService.addExtraNewWords({ count: 10 });
  const extraBatch = context.practiceService.getPracticeBatch({ sessionId: 's2' });

  assert.deepEqual(added, { extra_new_words_today: 10, new_today_remaining: 10 });
  assert.equal(context.practiceSettings.readSettings().newWordBlock.itemIds.length, 16);
  assert.equal(extraBatch.new_words.length, 10);
  assert.equal(context.practiceService.calculatePracticeStatistics().extra_new_words_today, 10);
});

test('with no New words at all, the day has nothing to offer and extra words are not refused; nothing is saved', () => {
  const context = createPracticeContext();
  migrate(context);
  assert.equal(context.practiceService.getPracticeBatch({ sessionId: 's1' }).counts.new_today_remaining, 0);

  assert.deepEqual(context.practiceService.addExtraNewWords({ count: 10 }), {
    extra_new_words_today: 0,
    new_today_remaining: 0,
  });
  assert.equal(context.practiceSettings.readSettings().newWordBlock, null);
  assert.equal(context.practiceService.calculatePracticeStatistics().extra_new_words_today, 0);
});
