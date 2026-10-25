// Practice business rules: the batch of reviews and new words (with the backlog gate and the extra new words), grading
// a word once per session, the one-time migration to FSRS and the practice statistics. Publishes 'words' after each
// write.
import { ConflictError, NotFoundError } from '../../errors/domain-errors.js';
import { mapBlankTextToNull } from '../blank-text.js';
import {
  buildMigrationCard,
  deriveLearningStatus,
  describeCardState,
  parseCard,
  serializeCard,
} from './fsrs-scheduling.js';
import { calculateNewWordAllowance } from './new-word-allocation.js';
import { addDaysToCalendarDate, findStartOfDay, formatCalendarDateInTimeZone } from './practice-calendar.js';

const FSRS_NOT_SET_UP_MESSAGE = 'FSRS practice is not set up yet: run migrate_to_fsrs';
const FSRS_ALREADY_SET_UP_MESSAGE = 'FSRS practice is already set up: migrate_to_fsrs has run';
const LEARNING_MIGRATION_DAY_COUNT = 4;
const LEARNED_MIGRATION_DAY_COUNT = 21;
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
  // The words to practise now: reviews due before tomorrow (most overdue first) and the New words allowed today. New
  // words wait while any word is overdue. Words already graded in this session are left out.
  function getPracticeBatch({ sessionId, maxReviews }) {
    const settings = readActiveSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), settings.timeZone);
    const gradedWordIds = new Set(practiceRepository.listWordIdsReviewedInSession(sessionId));
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

  // Adds `count` extra New words for today on top of the regular allowance. Refused while a word is overdue, and while
  // today's New words are not all introduced yet. The extra count resets on the next calendar day.
  function addExtraNewWords({ count }) {
    const settings = readActiveSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), settings.timeZone);
    const addResult = runInTransaction(() => {
      const newWordPlan = newWordPlanner.planNewWords({ settings, today, gradedWordIds: new Set() });
      newWordPlanner.assertExtraNewWordsAllowed({ newWordPlan });
      const extraNewWordCount = newWordPlanner.countExtraNewWordsOn(settings, today) + count;
      practiceSettings.saveExtraNewWords({ calendarDate: today, count: extraNewWordCount });
      const { effectiveNewPerDay } = calculateNewWordAllowance({
        newPerDay: settings.newPerDay,
        tierQuota: settings.tierQuota,
        extraNewWordCount,
      });
      return {
        extra_new_words_today: extraNewWordCount,
        new_today_remaining: Math.max(0, effectiveNewPerDay - newWordPlan.introducedTodayCount),
      };
    });
    changeEventBus.publishChange('words');
    return addResult;
  }

  // Grades a word's first answer in a session. Again and hard are logged as word errors. Returns the word's new state.
  function gradeWord({ wordId, grade, answer, sessionId }) {
    const settings = readActiveSettings();
    const gradeResult = runInTransaction(() => gradeWordInTransaction({ settings, wordId, grade, answer, sessionId }));
    changeEventBus.publishChange('words');
    return gradeResult;
  }

  function gradeWordInTransaction({ settings, wordId, grade, answer, sessionId }) {
    const word = getPracticeWordRowOrThrow(wordId);
    if (practiceRepository.findReviewLog(sessionId, wordId)) {
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
      extra_new_words_today: newWordPlanner.countExtraNewWordsOn(settings, today),
      new_remaining_by_priority: newCounts,
      states: stateCounts,
      good_share_7_days: calculateGoodShareSince(today, SHORT_GOOD_SHARE_DAY_COUNT, settings.timeZone),
      good_share_30_days: calculateGoodShareSince(today, LONG_GOOD_SHARE_DAY_COUNT, settings.timeZone),
      phrases: phrasePracticeService.calculatePhraseStatistics(),
    };
  }

  function readActiveSettings() {
    if (!practiceSettings.isFsrsActive()) throw new ConflictError(FSRS_NOT_SET_UP_MESSAGE);
    return practiceSettings.readSettings();
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

// Learning words are spread over the next four days, most errors first; learned words are due in 21 days; new words
// stay new. Returns the assignments the real run would write.
function planMigration(wordRows, { settings, today }) {
  const learningRows = wordRows
    .filter(word => word.status === 'learning')
    .sort((first, second) => second.error_count - first.error_count || first.id - second.id);
  const learnedRows = wordRows.filter(word => word.status === 'learned');
  const learningAssignments = learningRows.map((word, index) => {
    const dayOffset = Math.floor((index * LEARNING_MIGRATION_DAY_COUNT) / learningRows.length);
    const calendarDate = addDaysToCalendarDate(today, dayOffset);
    return buildAssignment({ word, group: 'learning', calendarDate, settings });
  });
  const learnedDate = addDaysToCalendarDate(today, LEARNED_MIGRATION_DAY_COUNT);
  const learnedAssignments = learnedRows.map(word => buildAssignment({
    word,
    group: 'learned',
    calendarDate: learnedDate,
    settings,
  }));
  const learningDueByDay = {};
  for (let dayOffset = 0; dayOffset < LEARNING_MIGRATION_DAY_COUNT; dayOffset += 1) {
    learningDueByDay[addDaysToCalendarDate(today, dayOffset)] = 0;
  }
  for (const assignment of learningAssignments) {
    learningDueByDay[assignment.calendarDate] += 1;
  }
  return {
    learningAssignments,
    learnedAssignments,
    newWordCount: wordRows.filter(word => word.status === 'new').length,
    learningDueByDay,
    learnedDueOn: learnedDate,
  };
}

function buildAssignment({ word, group, calendarDate, settings }) {
  return { word, group, calendarDate, dueAt: findStartOfDay(calendarDate, settings.timeZone) };
}

function summarizeMigration(plan, { isDryRun }) {
  return {
    dry_run: isDryRun,
    learning: plan.learningAssignments.length,
    learned: plan.learnedAssignments.length,
    new: plan.newWordCount,
    learning_due_by_day: plan.learningDueByDay,
    learned_due_on: plan.learnedDueOn,
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
