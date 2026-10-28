// Practice business rules: the batch (the session's word set: old words first, new words in the room left), grading
// a word (FSRS for the first answer in a session, the learning deck for every answer), the one-time migration to
// FSRS, the deck rebuild, the struggling words, the round summary of the set and the practice statistics. Publishes 'words' after each write.
import { ConflictError, NotFoundError } from '../../errors/domain-errors.js';
import { mapBlankTextToNull } from '../blank-text.js';
import {
  buildMigrationCard,
  deriveLearningStatus,
  describeCardState,
  parseCard,
  serializeCard,
} from './fsrs-scheduling.js';
import { applyAnswerToDeck, describeDeckPosition, readDeckPosition, replayDeckAnswers } from './learning-deck.js';
import { planMigration, summarizeMigration } from './migration-planning.js';
import { mapToStoredSet, openPracticeSet } from './practice-set.js';
import { addDaysToCalendarDate, findStartOfDay, formatCalendarDateInTimeZone } from './practice-calendar.js';
import { summarizeRound } from './round-summary.js';

const FSRS_ALREADY_SET_UP_MESSAGE = 'FSRS practice is already set up: migrate_to_fsrs has run';
const SHORT_GOOD_SHARE_DAY_COUNT = 7;
const LONG_GOOD_SHARE_DAY_COUNT = 30;
const GOOD_SHARE_DECIMAL_PLACES = 3;
const DECK_LEARNING_STATUS = 'learning';
const MILLISECONDS_PER_DAY = 24 * 3600_000;

export function createPracticeService({
  practiceRepository,
  wordSetPlanner,
  practiceSettings,
  priorityService,
  wordService,
  fsrsScheduler,
  phrasePracticeService,
  runInTransaction,
  changeEventBus,
  clock,
}) {
  // The words to practise now: the session's set (practice-set.js), at most new_per_day words. The open set's words
  // not finished yet, or the next set: the learning deck's words, then reviews due today (most overdue first, the ones
  // graded in this session left out), then New words in the room left. reviews are the words with a card, new_words
  // the New ones. A planned set is pinned at once, so the words shown are the set. maxReviews limits the reviews
  // returned.
  function getPracticeBatch({ sessionId, maxReviews }) {
    const settings = practiceSettings.readActiveSettings();
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const gradedWordIds = new Set(practiceRepository.listWordIdsReviewedInSession({ sessionId }));
    const plan = runInTransaction(() => pinWordSet({ settings, today, gradedWordIds, timestamp }));
    const setWordRows = plan.wordIds.map(getPracticeWordRowOrThrow);
    const reviewRows = setWordRows.filter(wordRow => wordRow.fsrs_card !== null);
    const newRows = setWordRows.filter(wordRow => wordRow.fsrs_card === null);
    return {
      session_id: sessionId,
      reviews: (maxReviews === undefined ? reviewRows : reviewRows.slice(0, maxReviews)).map(mapToPracticeWord),
      new_words: newRows.map(mapToPracticeWord),
      counts: {
        set_size: settings.newPerDay,
        set_words: setWordRows.length,
        set_new_words: newRows.length,
        is_set_open: plan.isOpen,
        due: listWordIdsDueToday(today, settings.timeZone).length,
        deck_words: practiceRepository.countDeckWords(),
        overdue: plan.overdueCount,
        introduced_today: countIntroducedToday(today),
        new_remaining_by_priority: wordSetPlanner.countNewWordsOutside(plan.wordIds),
      },
    };
  }

  // Grades an answer. The first answer to a word in a session updates its FSRS card and is logged as a review (again
  // and hard also as a word error); every answer, repeats in the session too, moves the word in the learning deck.
  // Returns the word's new state, with its deck position and is_repeat.
  function gradeWord({ wordId, grade, answer, sessionId }) {
    const settings = practiceSettings.readActiveSettings();
    const gradeResult = runInTransaction(() => gradeWordInTransaction({ settings, wordId, grade, answer, sessionId }));
    changeEventBus.publishChange('words');
    return gradeResult;
  }

  function gradeWordInTransaction({ settings, wordId, grade, answer, sessionId }) {
    const word = getPracticeWordRowOrThrow(wordId);
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    if (practiceRepository.findReviewLog({ sessionId, wordId })) {
      return gradeRepeatInTransaction({ settings, word, grade, sessionId, timestamp, today });
    }
    const gradedWordIds = new Set(practiceRepository.listWordIdsReviewedInSession({ sessionId }));
    const plan = pinWordSet({ settings, today, gradedWordIds, timestamp });
    // A set is 10 words at most: a New word outside the open set waits for a later set.
    if (plan.isOpen && word.fsrs_card === null && !plan.wordIds.includes(wordId)) {
      throw new ConflictError(`word ${wordId} is not in the current set: finish the set first`);
    }
    const cardBefore = parseCard(word.fsrs_card);
    const { card: cardAfter } = fsrsScheduler.gradeCard(cardBefore, grade, timestamp);
    // The due time is the start of the calendar day the interval lands on, so a grade late in the day or on a 25-hour
    // day does not come back the same day.
    const intervalDays = Math.max(1, cardAfter.scheduled_days);
    const dueAt = findStartOfDay(addDaysToCalendarDate(today, intervalDays), settings.timeZone);
    cardAfter.due = new Date(dueAt);
    const deckMove = applyAnswerToDeck({
      deckPosition: readDeckPosition(word),
      grade,
      isFirstAnswerEver: cardBefore === null,
    });
    // A word in the deck comes back tomorrow whatever its FSRS interval; a learned word follows its FSRS due date.
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const scheduledDueAt = deckMove.deckPosition ? tomorrowStart : dueAt;
    const learningStatus = deckMove.deckPosition
      ? DECK_LEARNING_STATUS
      : deriveLearningStatus(cardAfter, settings.learnedThresholdDays);
    const cardAfterJson = serializeCard(cardAfter);
    const wrongAnswer = mapBlankTextToNull(answer);
    practiceRepository.updateWordSchedule(wordId, {
      fsrsCard: cardAfterJson,
      dueAt: scheduledDueAt,
      introducedOn: cardBefore === null ? today : word.introduced_on,
      learningStatus,
      updatedAt: timestamp,
    });
    practiceRepository.updateWordDeck(wordId, {
      deckPosition: deckMove.deckPosition,
      dueAt: scheduledDueAt,
      learningStatus,
      updatedAt: timestamp,
    });
    practiceRepository.createDeckAnswer({
      wordId, sessionId, answeredAt: timestamp, grade, isFirstInSession: true, deckPositionAfter: deckMove.deckPosition,
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
      is_repeat: false,
      state: describeCardState(cardAfter),
      status: learningStatus,
      interval_days: countDaysBetween(today, scheduledDueAt, settings.timeZone),
      next_due_on: formatCalendarDateInTimeZone(scheduledDueAt, settings.timeZone),
      deck: { ...describeDeckPosition(deckMove.deckPosition), has_learned: deckMove.hasLearned },
    };
  }

  // A later answer in the same session: FSRS and the review log stay as the first answer left them; only the deck
  // moves. A word learned now leaves for its FSRS due date (tomorrow at the earliest).
  function gradeRepeatInTransaction({ settings, word, grade, sessionId, timestamp, today }) {
    const card = parseCard(word.fsrs_card);
    const deckMove = applyAnswerToDeck({ deckPosition: readDeckPosition(word), grade, isFirstAnswerEver: false });
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const isInDeck = deckMove.deckPosition !== null;
    const cardDueAt = card ? new Date(card.due).getTime() : tomorrowStart;
    const dueAt = isInDeck ? tomorrowStart : Math.max(tomorrowStart, cardDueAt);
    const learningStatus = isInDeck || !card
      ? DECK_LEARNING_STATUS
      : deriveLearningStatus(card, settings.learnedThresholdDays);
    practiceRepository.updateWordDeck(word.id, {
      deckPosition: deckMove.deckPosition,
      dueAt,
      learningStatus,
      updatedAt: timestamp,
    });
    practiceRepository.createDeckAnswer({
      wordId: word.id, sessionId, answeredAt: timestamp, grade, isFirstInSession: false,
      deckPositionAfter: deckMove.deckPosition,
    });
    const gradedWordRow = getPracticeWordRowOrThrow(word.id);
    return {
      word: { ...mapToPracticeWord(gradedWordRow), error_count: gradedWordRow.error_count },
      grade,
      is_repeat: true,
      state: describeCardState(card),
      status: learningStatus,
      interval_days: countDaysBetween(today, dueAt, settings.timeZone),
      next_due_on: formatCalendarDateInTimeZone(dueAt, settings.timeZone),
      deck: { ...describeDeckPosition(deckMove.deckPosition), has_learned: deckMove.hasLearned },
    };
  }

  // Rebuilds every word's deck position from the answers that still count (the first answers in review_logs and the
  // repeats in deck_answers; repeats before the deck existed were not stored). A dry run reports the positions and
  // writes nothing. Words left in the deck come back on the day after their last answer at the latest; learned words
  // keep their FSRS due date. Returns { dry_run, deck_size, words }.
  function rebuildLearningDeck({ isDryRun = true } = {}) {
    const settings = practiceSettings.readActiveSettings();
    const timestamp = clock.now();
    const summary = runInTransaction(() => {
      const answersByWordId = new Map();
      const lastAnsweredAtByWordId = new Map();
      for (const answer of practiceRepository.listCountingAnswers()) {
        if (!answersByWordId.has(answer.word_id)) answersByWordId.set(answer.word_id, []);
        answersByWordId.get(answer.word_id).push({ grade: answer.grade, isFirstAnswerEver: answer.was_new });
        lastAnsweredAtByWordId.set(answer.word_id, answer.answered_at);
      }
      const words = [];
      for (const [wordId, answers] of answersByWordId) {
        const word = practiceRepository.findPracticeWordById(wordId);
        if (!word || word.fsrs_card === null) continue;
        const deckPosition = replayDeckAnswers(answers);
        words.push({
          id: wordId,
          nl: word.nl,
          grades: answers.map(answer => answer.grade),
          ...describeDeckPosition(deckPosition),
        });
        if (isDryRun) continue;
        const card = parseCard(word.fsrs_card);
        const lastAnsweredOn = formatCalendarDateInTimeZone(lastAnsweredAtByWordId.get(wordId), settings.timeZone);
        const dayAfterLastAnswerStart = findStartOfDay(addDaysToCalendarDate(lastAnsweredOn, 1), settings.timeZone);
        const dueAt = deckPosition
          ? Math.min(word.due_at ?? dayAfterLastAnswerStart, dayAfterLastAnswerStart)
          : word.due_at;
        practiceRepository.updateWordDeck(wordId, {
          deckPosition,
          dueAt,
          learningStatus: deckPosition
            ? DECK_LEARNING_STATUS
            : deriveLearningStatus(card, settings.learnedThresholdDays),
          updatedAt: timestamp,
        });
      }
      return { dry_run: isDryRun, deck_size: words.filter(word => word.in_deck).length, words };
    });
    if (!isDryRun) changeEventBus.publishChange('words');
    return summary;
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

  // The current round: the words of the pinned set, each with its answers since the set opened and its mistakes, and
  // the time from the first answer to the last. Null when no set was pinned or nothing was answered.
  function getRoundSummary() {
    const settings = practiceSettings.readActiveSettings();
    const practiceSet = settings.wordSet;
    if (!practiceSet || !practiceSet.itemIds.length) return { round: null };
    const words = practiceSet.itemIds.map(wordId => practiceRepository.findPracticeWordById(wordId)).filter(Boolean)
      .map(mapToPracticeWord);
    const answers = practiceRepository.listDeckAnswersForWords(words.map(word => word.id))
      .filter(answer => answer.answered_at >= practiceSet.openedAt);
    if (!answers.length) return { round: null };
    const answerTimes = practiceRepository.listAnswerTimesBetween({
      startedAt: answers[0].answered_at,
      finishedAt: answers.at(-1).answered_at,
    });
    return { round: summarizeRound({ words, answers, answerTimes }) };
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
    const plan = wordSetPlanner.planWordSet({ settings, today, gradedWordIds: new Set() });
    return {
      due_today: listWordIdsDueToday(today, settings.timeZone).length,
      due_tomorrow: words.filter(word => word.due_at !== null && word.due_at >= tomorrowStart
        && word.due_at < dayAfterTomorrowStart).length,
      overdue: plan.overdueCount,
      introduced_today: countIntroducedToday(today),
      deck_size: practiceRepository.countDeckWords(),
      set_size: settings.newPerDay,
      set_words_left: plan.wordIds.length,
      is_set_open: plan.isOpen,
      new_remaining_by_priority: newCounts,
      states: stateCounts,
      good_share_7_days: calculateGoodShareSince(today, SHORT_GOOD_SHARE_DAY_COUNT, settings.timeZone),
      good_share_30_days: calculateGoodShareSince(today, LONG_GOOD_SHARE_DAY_COUNT, settings.timeZone),
      phrases: phrasePracticeService.calculatePhraseStatistics(),
    };
  }

  // The open set, or the next set planned and pinned now (when it has words). isOpen says it was open already. Runs
  // inside a transaction.
  function pinWordSet({ settings, today, gradedWordIds, timestamp }) {
    const plan = wordSetPlanner.planWordSet({ settings, today, gradedWordIds });
    if (!plan.isOpen && plan.wordIds.length) {
      const practiceSet = openPracticeSet({ today, openedAt: timestamp, itemIds: plan.wordIds });
      practiceSettings.saveWordSet(mapToStoredSet(practiceSet));
    }
    return plan;
  }

  function countIntroducedToday(today) {
    const countByPriority = practiceRepository.countIntroducedOnByPriority(today);
    return Object.values(countByPriority).reduce((total, count) => total + count, 0);
  }

  // Word ids due before the start of tomorrow, overdue ones included: the words due today, most overdue first.
  function listWordIdsDueToday(today, timeZone) {
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), timeZone);
    return practiceRepository.listDueWordIds(tomorrowStart);
  }

  // Whole calendar days from today to the day that starts at dueAt.
  function countDaysBetween(today, dueAt, timeZone) {
    const todayStart = findStartOfDay(today, timeZone);
    return Math.max(0, Math.round((dueAt - todayStart) / MILLISECONDS_PER_DAY));
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
    gradeWord,
    migrateToFsrs,
    rebuildLearningDeck,
    listStrugglingWords,
    getRoundSummary,
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
    deck: describeDeckPosition(readDeckPosition(wordRow)),
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
