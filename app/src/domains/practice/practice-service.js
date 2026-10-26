// Practice business rules: the batch of reviews and new words (with the backlog gate, the intake block and the
// extra new words), grading a word once per session, the one-time migration to FSRS, the struggling words and the
// practice statistics. Publishes 'words' after each write.
import { ConflictError, NotFoundError } from '../../errors/domain-errors.js';
import { mapBlankTextToNull } from '../blank-text.js';
import {
  buildMigrationCard,
  deriveLearningStatus,
  describeCardState,
  parseCard,
  serializeCard,
} from './fsrs-scheduling.js';
import { countExtraItemsToday, mapToStoredBlock, openIntakeBlock } from './intake-block.js';
import { planMigration, summarizeMigration } from './migration-planning.js';
import { addDaysToCalendarDate, findStartOfDay, formatCalendarDateInTimeZone } from './practice-calendar.js';

const FSRS_ALREADY_SET_UP_MESSAGE = 'FSRS practice is already set up: migrate_to_fsrs has run';
const SHORT_GOOD_SHARE_DAY_COUNT = 7;
const LONG_GOOD_SHARE_DAY_COUNT = 30;
const GOOD_SHARE_DECIMAL_PLACES = 3;

export function createPracticeService({
  practiceRepository,
  newWordPlanner,
  practiceSettings,
  priorityService,
  wordService,
  fsrsScheduler,
  phrasePracticeService,
  runInTransaction,
  changeEventBus,
  clock,
}) {
  // The words to practise now: reviews due before tomorrow (most overdue first) and the New words on offer. New words
  // wait while any word is overdue. Words already graded in this session are left out.
  function getPracticeBatch({ sessionId, maxReviews }) {
    const settings = practiceSettings.readActiveSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), settings.timeZone);
    const gradedWordIds = new Set(practiceRepository.listWordIdsReviewedInSession({ sessionId }));
    const dueWordIds = listWordIdsDueToday(today, settings.timeZone).filter(wordId => !gradedWordIds.has(wordId));
    const reviewWordIds = maxReviews === undefined ? dueWordIds : dueWordIds.slice(0, maxReviews);
    const newWordPlan = newWordPlanner.planNewWords({ settings, today, gradedWordIds });
    return {
      session_id: sessionId,
      reviews: reviewWordIds.map(wordId => mapToPracticeWord(getPracticeWordRowOrThrow(wordId))),
      new_words: newWordPlan.offeredCandidates.map(candidate => mapToPracticeWord(candidate.word)),
      counts: {
        due: dueWordIds.length,
        overdue: newWordPlan.overdueCount,
        introduced_today: newWordPlan.introducedTodayCount,
        new_today_remaining: newWordPlan.newTodayRemainingCount,
        new_remaining_by_priority: newWordPlan.remainingByPriority,
        new_words_blocked: newWordPlan.isBlocked,
      },
    };
  }

  // Adds count extra New words to the intake block of today. Refused while a word is overdue, and while the block
  // is not finished (its words are not all started). Extra words left unstarted carry over like any unfinished block.
  function addExtraNewWords({ count }) {
    const settings = practiceSettings.readActiveSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), settings.timeZone);
    const addResult = runInTransaction(() => {
      const newWordPlan = newWordPlanner.planNewWords({ settings, today, gradedWordIds: new Set() });
      newWordPlanner.assertExtraNewWordsAllowed({ newWordPlan });
      const extraWordIds = newWordPlanner.planExtraNewWordIds({
        settings,
        count,
        blockWordIds: newWordPlan.block.itemIds,
      });
      const extendedBlock = openIntakeBlock({
        today: newWordPlan.block.openedOn,
        itemIds: [...newWordPlan.block.itemIds, ...extraWordIds],
        extraCount: newWordPlan.block.extraCount + extraWordIds.length,
      });
      // Nothing to add (no New words are left): the block stays as it is.
      if (extraWordIds.length > 0) practiceSettings.saveNewWordBlock(mapToStoredBlock(extendedBlock));
      return {
        extra_new_words_today: countExtraItemsToday({ block: extendedBlock, today }),
        new_today_remaining: extraWordIds.length,
      };
    });
    changeEventBus.publishChange('words');
    return addResult;
  }

  // Grades a word's first answer in a session. Again and hard are logged as word errors. Returns the word's new state.
  function gradeWord({ wordId, grade, answer, sessionId }) {
    const settings = practiceSettings.readActiveSettings();
    const gradeResult = runInTransaction(() => gradeWordInTransaction({ settings, wordId, grade, answer, sessionId }));
    changeEventBus.publishChange('words');
    return gradeResult;
  }

  function gradeWordInTransaction({ settings, wordId, grade, answer, sessionId }) {
    const word = getPracticeWordRowOrThrow(wordId);
    const gradedLog = practiceRepository.findReviewLog({ sessionId, wordId });
    if (gradedLog) {
      throw new ConflictError(`word ${wordId} was already graded in session ${sessionId}`);
    }
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const cardBefore = parseCard(word.fsrs_card);
    const { card: cardAfter } = fsrsScheduler.gradeCard(cardBefore, grade, timestamp);
    // The due time is the start of the calendar day the interval lands on, so a grade late in the day or on a 25-hour
    // day does not come back the same day.
    const intervalDays = Math.max(1, cardAfter.scheduled_days);
    const dueAt = findStartOfDay(addDaysToCalendarDate(today, intervalDays), settings.timeZone);
    cardAfter.due = new Date(dueAt);
    const learningStatus = deriveLearningStatus(cardAfter, settings.learnedThresholdDays);
    const cardAfterJson = serializeCard(cardAfter);
    const wrongAnswer = mapBlankTextToNull(answer);
    if (cardBefore === null) saveIntakeBlockOnFirstStart({ settings, today });
    practiceRepository.updateWordSchedule(wordId, {
      fsrsCard: cardAfterJson,
      dueAt,
      introducedOn: cardBefore === null ? today : word.introduced_on,
      learningStatus,
      updatedAt: timestamp,
    });
    practiceRepository.createReviewLog({
      wordId,
      sessionId,
      reviewedAt: timestamp,
      grade,
      answer: wrongAnswer,
      cardBefore: serializeCard(cardBefore),
      cardAfter: cardAfterJson,
    });
    if (grade !== 'good') wordService.recordPracticeError({ wordId, occurredAt: timestamp, wrongAnswer });
    const gradedWordRow = getPracticeWordRowOrThrow(wordId);
    return {
      word: { ...mapToPracticeWord(gradedWordRow), error_count: gradedWordRow.error_count },
      grade,
      state: describeCardState(cardAfter),
      status: learningStatus,
      interval_days: intervalDays,
      next_due_on: formatCalendarDateInTimeZone(dueAt, settings.timeZone),
    };
  }

  // Switches the practice to FSRS. A dry run reports the counts and writes nothing. A real run writes the cards and the
  // priorities in one transaction and publishes once, after the commit.
  function migrateToFsrs({ isDryRun = true } = {}) {
    if (practiceSettings.isFsrsActive()) throw new ConflictError(FSRS_ALREADY_SET_UP_MESSAGE);
    const settings = practiceSettings.readSettings();
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const plan = planMigration(practiceRepository.listPracticeWords(), { settings, today });
    if (isDryRun) return summarizeMigration(plan, { isDryRun: true });
    runInTransaction(() => {
      writeMigrationCards(practiceRepository, plan, { settings, today, timestamp });
      priorityService.recalculatePrioritiesInTransaction();
      practiceSettings.markFsrsMigrated(timestamp);
    });
    changeEventBus.publishChange('words');
    return summarizeMigration(plan, { isDryRun: false });
  }

  // The words in rotation whose latest graded answer was again or hard, most errors first. Read only: nothing is graded
  // or written, so the learner can drill them without changing the schedule.
  function listStrugglingWords() {
    const settings = practiceSettings.readActiveSettings();
    const words = practiceRepository.listStrugglingWordRows().map(wordRow => ({
      ...mapToPracticeWord(wordRow),
      error_count: wordRow.error_count,
      last_grade: wordRow.last_grade,
      last_reviewed_on: formatCalendarDateInTimeZone(wordRow.last_reviewed_at, settings.timeZone),
    }));
    return { words, count: words.length };
  }

  // Due counts, overdue words, introductions, New words per priority, words per state and the good share of the last 7
  // and 30 days. The phrases' own counts are added under phrases.
  function calculatePracticeStatistics() {
    const settings = practiceSettings.readSettings();
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const dayAfterTomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 2), settings.timeZone);
    const words = practiceRepository.listPracticeWords();
    const stateCounts = { new: 0, learning: 0, review: 0, relearning: 0 };
    const newCounts = { 1: 0, 2: 0, 3: 0 };
    for (const word of words) {
      stateCounts[describeCardState(parseCard(word.fsrs_card))] += 1;
      if (word.fsrs_card === null) newCounts[word.priority] += 1;
    }
    const newWordPlan = newWordPlanner.planNewWords({ settings, today, gradedWordIds: new Set() });
    return {
      due_today: listWordIdsDueToday(today, settings.timeZone).length,
      due_tomorrow: words.filter(word => word.due_at !== null && word.due_at >= tomorrowStart
        && word.due_at < dayAfterTomorrowStart).length,
      overdue: newWordPlan.overdueCount,
      introduced_today: newWordPlan.introducedTodayCount,
      new_words_blocked: newWordPlan.isBlocked,
      extra_new_words_today: newWordPlan.extraNewWordsToday,
      new_remaining_by_priority: newCounts,
      states: stateCounts,
      good_share_7_days: calculateGoodShareSince(today, SHORT_GOOD_SHARE_DAY_COUNT, settings.timeZone),
      good_share_30_days: calculateGoodShareSince(today, LONG_GOOD_SHARE_DAY_COUNT, settings.timeZone),
      phrases: phrasePracticeService.calculatePhraseStatistics(),
    };
  }

  // The first New word started, when no intake block is open, pins the day's allocation as the block: its
  // leftovers stay on offer on later days until all are started. A block opened today is open already, so nothing
  // is planned; a block from an earlier day is planned, and kept when it still has leftovers.
  function saveIntakeBlockOnFirstStart({ settings, today }) {
    if (settings.newWordBlock?.openedOn === today) return;
    const { block, allocatedCandidates } = newWordPlanner.planNewWords({
      settings,
      today,
      gradedWordIds: new Set(),
    });
    if (!block.isFresh) return;
    const pinnedBlock = openIntakeBlock({ today, itemIds: allocatedCandidates.map(candidate => candidate.id) });
    practiceSettings.saveNewWordBlock(mapToStoredBlock(pinnedBlock));
  }

  // Word ids due before the start of tomorrow, overdue ones included: the words due today, most overdue first.
  function listWordIdsDueToday(today, timeZone) {
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), timeZone);
    return practiceRepository.listDueWordIds(tomorrowStart);
  }

  function getPracticeWordRowOrThrow(wordId) {
    const word = practiceRepository.findPracticeWordById(wordId);
    if (!word) throw new NotFoundError(`word ${wordId} not found`);
    return word;
  }

  function calculateGoodShareSince(today, dayCount, timeZone) {
    const sinceTimestamp = findStartOfDay(addDaysToCalendarDate(today, 1 - dayCount), timeZone);
    const gradeCounts = practiceRepository.countFirstGradesSince(sinceTimestamp);
    const gradeTotal = gradeCounts.again + gradeCounts.hard + gradeCounts.good;
    if (gradeTotal === 0) return null;
    const goodShare = gradeCounts.good / gradeTotal;
    const decimalFactor = 10 ** GOOD_SHARE_DECIMAL_PLACES;
    return Math.round(goodShare * decimalFactor) / decimalFactor;
  }

  return Object.freeze({
    getPracticeBatch,
    addExtraNewWords,
    gradeWord,
    migrateToFsrs,
    listStrugglingWords,
    calculatePracticeStatistics,
  });
}

function mapToPracticeWord(wordRow) {
  return {
    id: wordRow.id,
    uk: wordRow.uk,
    nl: wordRow.nl,
    article: wordRow.article,
    kind: wordRow.kind,
    state: describeCardState(parseCard(wordRow.fsrs_card)),
    priority: wordRow.priority,
  };
}

// Words that were learning or learned get a card. They were in rotation before FSRS, so they count as introduced
// the day before and stay outside today's new-word quota.
function writeMigrationCards(practiceRepository, plan, { settings, today, timestamp }) {
  const introducedOn = addDaysToCalendarDate(today, -1);
  for (const assignment of [...plan.learningAssignments, ...plan.learnedAssignments]) {
    const card = buildMigrationCard({ group: assignment.group, dueAt: assignment.dueAt, timestamp });
    practiceRepository.updateWordSchedule(assignment.word.id, {
      fsrsCard: serializeCard(card),
      dueAt: assignment.dueAt,
      introducedOn,
      learningStatus: deriveLearningStatus(card, settings.learnedThresholdDays),
      updatedAt: timestamp,
    });
  }
}
