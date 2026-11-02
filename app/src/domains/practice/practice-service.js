// Practice business rules: the batch (the session's word set: old words first, new words in the room left), grading
// a word in each direction (FSRS for the first answer in a session, the learning deck for every answer), the one-time
// migration to FSRS, the deck rebuild, the struggling words, the round summary of the set and the practice statistics.
// Publishes 'words' after each write.
import { ConflictError, NotFoundError, ValidationError } from '../../errors/domain-errors.js';
import { mapBlankTextToNull } from '../blank-text.js';
import {
  buildMigrationCard,
  deriveLearningStatus,
  describeCardState,
  parseCard,
  serializeCard,
} from './fsrs-scheduling.js';
import {
  applyAnswerToDecks,
  describeDeckPositions,
  readDeckPositions,
  readReverseDeckPosition,
  replayDeckAnswers,
} from './learning-deck.js';
import { planMigration, summarizeMigration } from './migration-planning.js';
import { mapToStoredSet, openPracticeSet } from './practice-set.js';
import { PRACTICE_DIRECTIONS, UK_TO_NL_DIRECTION, findWorseGrade } from './practice-direction.js';
import { addDaysToCalendarDate, findStartOfDay, formatCalendarDateInTimeZone } from './practice-calendar.js';
import { summarizeRound } from './round-summary.js';
import { listDirectionsLeft, mapAnsweredDirections } from './word-set-planning.js';

const FSRS_ALREADY_SET_UP_MESSAGE = 'FSRS practice is already set up: migrate_to_fsrs has run';
const SHORT_GOOD_SHARE_DAY_COUNT = 7;
const LONG_GOOD_SHARE_DAY_COUNT = 30;
const GOOD_SHARE_DECIMAL_PLACES = 3;
const DECK_LEARNING_STATUS = 'learning';
const MILLISECONDS_PER_DAY = 24 * 3600_000;
const CLIENT_ANSWER_KIND_GRADE = 'grade';
const CLIENT_ANSWER_KIND_DRILL = 'drill';
const CLIENT_ANSWER_RECEIPT_RETENTION_MS = 30 * MILLISECONDS_PER_DAY;
const ANSWERED_AT_MAXIMUM_AGE_MS = 7 * MILLISECONDS_PER_DAY;
const LATER_ANSWER_EXISTS_MESSAGE = 'пізніша відповідь уже є';

export function createPracticeService({
  practiceRepository,
  clientAnswerReceiptRepository,
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
  // the New ones. Each word carries directions_left: the directions it still needs in the set. A planned set is pinned
  // at once, so the words shown are the set. maxReviews limits the reviews returned.
  function getPracticeBatch({ sessionId, maxReviews }) {
    const settings = practiceSettings.readActiveSettings();
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const gradedWordIds = new Set(practiceRepository.listWordIdsReviewedInSession({ sessionId }));
    const plan = runInTransaction(() => pinWordSet({ settings, today, gradedWordIds, timestamp }));
    const setWordRows = plan.wordIds.map(getPracticeWordRowOrThrow);
    const answeredDirections = mapAnsweredDirections(practiceRepository.listAnsweredDirectionsSince({
      wordIds: plan.wordIds,
      sinceTimestamp: plan.practiceSet?.openedAt ?? timestamp,
    }));
    const mapToBatchWord = wordRow => mapToPracticeWordWithDirections(wordRow, answeredDirections);
    const reviewRows = setWordRows.filter(wordRow => wordRow.fsrs_card !== null);
    const newRows = setWordRows.filter(wordRow => wordRow.fsrs_card === null);
    return {
      session_id: sessionId,
      reviews: (maxReviews === undefined ? reviewRows : reviewRows.slice(0, maxReviews)).map(mapToBatchWord),
      new_words: newRows.map(mapToBatchWord),
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

  // Grades an answer in a direction (uk_nl: the Ukrainian is shown and the Dutch answered; nl_uk: the reverse). The
  // first answer to a word in a session is its FSRS grade and review log; the first answer in the other direction
  // sets the log's second grade and grades FSRS again when it is worse; a later answer moves only the deck. Every
  // answer moves the word's deck in its direction and is kept in deck_answers. Returns the word's new state with its
  // deck (describeDeckPositions, has_learned, has_learned_direction) and is_repeat.
  // The offline fields (REST): answeredAt is the time of the answer (default now), clientAnswerId makes a repeated
  // answer return the first response, setWordIds is the set practised offline and setOpenedAt when it started (see
  // gradeFirstInSessionInTransaction).
  function gradeWord({
    wordId, grade, answer, sessionId, direction = UK_TO_NL_DIRECTION, answeredAt, clientAnswerId, setWordIds,
    setOpenedAt,
  }) {
    assertDirection(direction);
    answeredAt = resolveAnsweredAt(answeredAt, clock.now());
    const settings = practiceSettings.readActiveSettings();
    const { response, isReplay } = runInTransaction(() => runClientAnswerOnce({
      clientAnswerId,
      kind: CLIENT_ANSWER_KIND_GRADE,
      operation: () => gradeWordInTransaction({
        settings, wordId, grade, answer, sessionId, direction, answeredAt, setWordIds, setOpenedAt,
      }),
    }));
    if (!isReplay) changeEventBus.publishChange('words');
    return response;
  }

  // Picks the case of the answer from the word's review log of today, whatever the session: no log (first grade), a log
  // whose other direction is not answered yet (the first answer in the other direction), or a repeat. With answeredAt
  // the answer is dated then, and refused when the word has an answer later than that.
  function gradeWordInTransaction({
    settings, wordId, grade, answer, sessionId, direction, answeredAt, setWordIds, setOpenedAt,
  }) {
    const word = getPracticeWordRowOrThrow(wordId);
    if (answeredAt !== undefined) assertNoLaterAnswer(wordId, answeredAt);
    const timestamp = answeredAt ?? clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const gradeContext = {
      settings, word, grade, answer, sessionId, direction, timestamp, today, setWordIds, setOpenedAt,
    };
    const reviewLog = practiceRepository.findLatestReviewLogSince({
      wordId,
      sinceTimestamp: findStartOfDay(today, settings.timeZone),
    });
    if (!reviewLog) return gradeFirstInSessionInTransaction(gradeContext);
    if (direction !== reviewLog.direction && reviewLog.second_grade === null) {
      return gradeOtherDirectionInTransaction({ ...gradeContext, reviewLog });
    }
    return gradeRepeatInTransaction(gradeContext);
  }

  // The first grade of a word today: FSRS from its card and the review log (both directions enter the deck when the
  // word is New). A New word outside an open set is refused. The word comes back tomorrow whatever the card says: its other
  // direction is still to be answered, and a review word may not be asked the other way later. The card keeps its own
  // due day for the second direction.
  // setWordIds (offline, REST): when no set is open today, the set is pinned to these words instead of the planned one.
  // setOpenedAt (offline, REST): when the phone's set started, so the answers it got before this grade count for it.
  function gradeFirstInSessionInTransaction({
    settings, word, grade, answer, sessionId, direction, timestamp, today, setWordIds, setOpenedAt,
  }) {
    const gradedWordIds = new Set(practiceRepository.listWordIdsReviewedInSession({ sessionId }));
    const plan = pinWordSet({
      settings, today, gradedWordIds, timestamp, preferredWordIds: setWordIds, gradedWordId: word.id, setOpenedAt,
    });
    // A set is 10 words at most: a New word outside the open set waits for a later set.
    if (plan.isOpen && word.fsrs_card === null && !plan.wordIds.includes(word.id)) {
      throw new ConflictError(`word ${word.id} is not in the current set: finish the set first`);
    }
    const cardBefore = parseCard(word.fsrs_card);
    const { card: cardAfter } = fsrsScheduler.gradeCard(cardBefore, grade, timestamp);
    const { card: scheduledCard } = dueCardOnDay({ card: cardAfter, today, timeZone: settings.timeZone });
    const cardAfterJson = serializeCard(scheduledCard);
    const deckMove = applyAnswerToDecks({
      deckPositions: readDeckPositions(word),
      direction,
      grade,
      isFirstAnswerEver: cardBefore === null,
    });
    const inDeck = isInAnyDeck(deckMove.deckPositions);
    const scheduledDueAt = findTomorrowStart({ today, timeZone: settings.timeZone });
    const learningStatus = inDeck
      ? DECK_LEARNING_STATUS
      : deriveLearningStatus(scheduledCard, settings.learnedThresholdDays);
    const wrongAnswer = mapBlankTextToNull(answer);
    practiceRepository.updateWordSchedule(word.id, {
      fsrsCard: cardAfterJson,
      dueAt: scheduledDueAt,
      introducedOn: cardBefore === null ? today : word.introduced_on,
      learningStatus,
      updatedAt: timestamp,
    });
    practiceRepository.updateWordDeck(word.id, {
      deckPositions: deckMove.deckPositions,
      dueAt: scheduledDueAt,
      learningStatus,
      updatedAt: timestamp,
    });
    practiceRepository.createDeckAnswer({
      wordId: word.id,
      sessionId,
      direction,
      answeredAt: timestamp,
      grade,
      isFirstInSession: true,
      deckPositionAfter: deckMove.deckPositions[direction],
    });
    practiceRepository.createReviewLog({
      wordId: word.id,
      sessionId,
      reviewedAt: timestamp,
      grade,
      direction,
      answer: wrongAnswer,
      cardBefore: serializeCard(cardBefore),
      cardAfter: cardAfterJson,
    });
    if (grade !== 'good') wordService.recordPracticeError({ wordId: word.id, occurredAt: timestamp, wrongAnswer });
    return buildGradeResult({
      settings, wordId: word.id, grade, direction, isRepeat: false, card: scheduledCard, learningStatus,
      scheduledDueAt, today, deckMove,
    });
  }

  // The first answer in the other direction of the day. The deck moves in its direction and the log keeps the grade as
  // its second grade. When that grade is worse than the first, FSRS grades the card again from the card the log
  // started from, with the worse grade, and the log's card after becomes that card. A word reset to New meanwhile has
  // no card: it stays without one unless the re-grade gives it one.
  function gradeOtherDirectionInTransaction({
    settings, word, reviewLog, grade, answer, sessionId, direction, timestamp, today,
  }) {
    const deckMove = applyAnswerToDecks({
      deckPositions: readDeckPositions(word),
      direction,
      grade,
      isFirstAnswerEver: false,
    });
    const worseGrade = findWorseGrade(reviewLog.grade, grade);
    const isRegraded = worseGrade !== reviewLog.grade;
    const card = isRegraded
      ? regradeFromReviewLog({ reviewLog, grade: worseGrade, timeZone: settings.timeZone })
      : parseCard(word.fsrs_card);
    const cardAfterJson = isRegraded ? serializeCard(card) : word.fsrs_card;
    // A word in a deck comes back tomorrow; a learned word follows its FSRS due day (tomorrow at the earliest).
    const tomorrowStart = findTomorrowStart({ today, timeZone: settings.timeZone });
    const inDeck = isInAnyDeck(deckMove.deckPositions);
    const scheduledDueAt = inDeck || !card
      ? tomorrowStart
      : Math.max(tomorrowStart, new Date(card.due).getTime());
    const learningStatus = inDeck || !card
      ? DECK_LEARNING_STATUS
      : deriveLearningStatus(card, settings.learnedThresholdDays);
    practiceRepository.updateWordSchedule(word.id, {
      fsrsCard: cardAfterJson,
      dueAt: scheduledDueAt,
      introducedOn: word.introduced_on,
      learningStatus,
      updatedAt: timestamp,
    });
    practiceRepository.updateWordDeck(word.id, {
      deckPositions: deckMove.deckPositions,
      dueAt: scheduledDueAt,
      learningStatus,
      updatedAt: timestamp,
    });
    practiceRepository.createDeckAnswer({
      wordId: word.id,
      sessionId,
      direction,
      answeredAt: timestamp,
      grade,
      isFirstInSession: false,
      deckPositionAfter: deckMove.deckPositions[direction],
    });
    practiceRepository.updateReviewLogSecondGrade({
      reviewLogId: reviewLog.id,
      secondGrade: grade,
      cardAfter: isRegraded ? cardAfterJson : reviewLog.card_after,
    });
    if (grade !== 'good') {
      const wrongAnswer = mapBlankTextToNull(answer);
      wordService.recordPracticeError({ wordId: word.id, occurredAt: timestamp, wrongAnswer });
    }
    return buildGradeResult({
      settings,
      wordId: word.id,
      grade,
      direction,
      isRepeat: false,
      card,
      learningStatus,
      scheduledDueAt,
      today,
      deckMove,
    });
  }

  // A later answer of the day in the same direction, or after both directions: FSRS and the review log stay as they
  // are; only the deck moves.
  // A word learned now leaves for its FSRS due date (tomorrow at the earliest).
  function gradeRepeatInTransaction({ settings, word, grade, sessionId, direction, timestamp, today }) {
    const card = parseCard(word.fsrs_card);
    const deckMove = applyAnswerToDecks({
      deckPositions: readDeckPositions(word),
      direction,
      grade,
      isFirstAnswerEver: false,
    });
    const tomorrowStart = findTomorrowStart({ today, timeZone: settings.timeZone });
    const inDeck = isInAnyDeck(deckMove.deckPositions);
    const cardDueAt = card ? new Date(card.due).getTime() : tomorrowStart;
    const dueAt = inDeck ? tomorrowStart : Math.max(tomorrowStart, cardDueAt);
    const learningStatus = inDeck || !card
      ? DECK_LEARNING_STATUS
      : deriveLearningStatus(card, settings.learnedThresholdDays);
    practiceRepository.updateWordDeck(word.id, {
      deckPositions: deckMove.deckPositions,
      dueAt,
      learningStatus,
      updatedAt: timestamp,
    });
    practiceRepository.createDeckAnswer({
      wordId: word.id,
      sessionId,
      direction,
      answeredAt: timestamp,
      grade,
      isFirstInSession: false,
      deckPositionAfter: deckMove.deckPositions[direction],
    });
    return buildGradeResult({
      settings, wordId: word.id, grade, direction, isRepeat: true, card, learningStatus, scheduledDueAt: dueAt, today,
      deckMove,
    });
  }

  // The grade response: the word, the grade and direction, its state and due day, and its deck.
  function buildGradeResult({
    settings, wordId, grade, direction, isRepeat, card, learningStatus, scheduledDueAt, today, deckMove,
  }) {
    const gradedWordRow = getPracticeWordRowOrThrow(wordId);
    return {
      word: { ...mapToPracticeWord(gradedWordRow), error_count: gradedWordRow.error_count },
      grade,
      direction,
      is_repeat: isRepeat,
      state: describeCardState(card),
      status: learningStatus,
      interval_days: countDaysBetween(today, scheduledDueAt, settings.timeZone),
      next_due_on: formatCalendarDateInTimeZone(scheduledDueAt, settings.timeZone),
      deck: {
        ...describeDeckPositions(deckMove.deckPositions),
        has_learned: deckMove.hasLearned,
        has_learned_direction: deckMove.hasLearnedDirection,
      },
    };
  }

  // FSRS graded again from the card the review log started from, with the given grade, on the day of the first answer.
  function regradeFromReviewLog({ reviewLog, grade, timeZone }) {
    const reviewedOn = formatCalendarDateInTimeZone(reviewLog.reviewed_at, timeZone);
    const { card } = fsrsScheduler.gradeCard(parseCard(reviewLog.card_before), grade, reviewLog.reviewed_at);
    return dueCardOnDay({ card, today: reviewedOn, timeZone }).card;
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
        // The uk_nl direction is replayed; the nl_uk position stays as it is stored.
        const deckPositions = { uk_nl: replayDeckAnswers(answers), nl_uk: readReverseDeckPosition(word) };
        const inDeck = isInAnyDeck(deckPositions);
        words.push({
          id: wordId,
          nl: word.nl,
          grades: answers.map(answer => answer.grade),
          ...describeDeckPositions(deckPositions),
        });
        if (isDryRun) continue;
        const card = parseCard(word.fsrs_card);
        const lastAnsweredOn = formatCalendarDateInTimeZone(lastAnsweredAtByWordId.get(wordId), settings.timeZone);
        const dayAfterLastAnswerStart = findStartOfDay(addDaysToCalendarDate(lastAnsweredOn, 1), settings.timeZone);
        const dueAt = inDeck
          ? Math.min(word.due_at ?? dayAfterLastAnswerStart, dayAfterLastAnswerStart)
          : word.due_at;
        practiceRepository.updateWordDeck(wordId, {
          deckPositions,
          dueAt,
          learningStatus: inDeck
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

  // The words of a custom drill, in the order given (repeats count once); ids that are not words are skipped. Read
  // only: nothing is graded or written, so the drill never changes the schedule.
  function getDrillWords({ wordIds }) {
    const uniqueWordIds = [...new Set(wordIds)];
    const wordRows = practiceRepository.findPracticeWordsByIds(uniqueWordIds);
    const wordRowById = new Map(wordRows.map(wordRow => [wordRow.id, wordRow]));
    const words = uniqueWordIds.filter(wordId => wordRowById.has(wordId))
      .map(wordId => mapToPracticeWord(wordRowById.get(wordId)));
    return { words };
  }

  // Logs one checked answer of a custom drill for the statistics. Nothing else changes: no card, deck, review log or
  // error count, and no change event (the statistics are read when shown). NotFoundError when the word is gone.
  // answeredAt (default now) and clientAnswerId as for gradeWord.
  function recordDrillAnswer({
    wordId, direction, isCorrect, answer = '', source, answeredAt, clientAnswerId,
  }) {
    answeredAt = resolveAnsweredAt(answeredAt, clock.now());
    const { response } = runInTransaction(() => runClientAnswerOnce({
      clientAnswerId,
      kind: CLIENT_ANSWER_KIND_DRILL,
      operation: () => {
        if (!practiceRepository.findPracticeWordById(wordId)) throw new NotFoundError(`word ${wordId} not found`);
        const id = practiceRepository.createDrillAnswer({
          wordId, direction, isCorrect, answer, source, answeredAt: answeredAt ?? clock.now(),
        });
        return { id };
      },
    }));
    return response;
  }

  // The spare words of the next set, for the phone to keep offline (planSpareWords). The current set (when one is
  // open today) and the words graded in this session are left out. Read only: nothing is pinned or written.
  function getSpareWords({ sessionId }) {
    const settings = practiceSettings.readActiveSettings();
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const gradedWordIds = new Set(practiceRepository.listWordIdsReviewedInSession({ sessionId }));
    const plan = wordSetPlanner.planWordSet({ settings, today, gradedWordIds });
    const currentSetWordIds = plan.isOpen ? plan.practiceSet.itemIds : [];
    const spareWordIds = wordSetPlanner.planSpareWords({
      settings,
      today,
      excludeIds: [...currentSetWordIds, ...gradedWordIds],
      count: settings.newPerDay,
    });
    const words = spareWordIds.map(getPracticeWordRowOrThrow)
      .map(wordRow => mapToPracticeWordWithDirections(wordRow, new Map()));
    return { words };
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

  // The open set, or the next set pinned now (when it has words). isOpen says it was open already. preferredWordIds
  // (the set practised offline) is pinned instead of the planned set: its words that exist, in order, without repeats,
  // up to the set size; when none is left the planned set is pinned. A set pinned from preferredWordIds counts as
  // open. Runs inside a transaction.
  // preferredWordIds (offline): the set the phone practised. It is pinned when no set is open, and also when one is
  // open but the graded word belongs to the phone's set and not to the open one: offline the phone cannot see the
  // learning deck, so it may finish a set the server still holds open. The words left in that set stay in the learning
  // deck, and the deck comes first in a later set. A set that is the same as the open one is not pinned again.
  // setOpenedAt: the time the phone's set started (see resolvePinnedOpenedAt); the set opens then.
  function pinWordSet({
    settings, today, gradedWordIds, timestamp, preferredWordIds = [], gradedWordId = null, setOpenedAt,
  }) {
    const plan = wordSetPlanner.planWordSet({ settings, today, gradedWordIds });
    const preferredExistingWordIds = keepExistingWordIds(preferredWordIds, settings.newPerDay);
    const hasPhoneMovedOn = plan.isOpen && preferredExistingWordIds.includes(gradedWordId)
      && !plan.wordIds.includes(gradedWordId) && !plan.practiceSet.itemIds.includes(gradedWordId)
      && !areSameWordIds(preferredExistingWordIds, plan.practiceSet.itemIds);
    if (plan.isOpen && !hasPhoneMovedOn) return plan;
    if (preferredExistingWordIds.length) {
      const openedAt = resolvePinnedOpenedAt(setOpenedAt, timestamp);
      const practiceSet = openPracticeSet({ today, openedAt, itemIds: preferredExistingWordIds });
      practiceSettings.saveWordSet(mapToStoredSet(practiceSet));
      return Object.freeze({ ...plan, isOpen: true, practiceSet, wordIds: practiceSet.itemIds });
    }
    if (plan.wordIds.length) {
      const practiceSet = openPracticeSet({ today, openedAt: timestamp, itemIds: plan.wordIds });
      practiceSettings.saveWordSet(mapToStoredSet(practiceSet));
    }
    return plan;
  }

  // The opened_at of a set pinned from the phone's set: its set_opened_at when given, not older than 7 days before the
  // answer and clamped to now (a later time is now); otherwise the answer's time.
  function resolvePinnedOpenedAt(setOpenedAt, timestamp) {
    if (setOpenedAt === undefined) return timestamp;
    const clampedOpenedAt = Math.min(setOpenedAt, clock.now());
    if (clampedOpenedAt < timestamp - ANSWERED_AT_MAXIMUM_AGE_MS) return timestamp;
    return Math.min(clampedOpenedAt, timestamp);
  }

  // Whether two lists of word ids hold the same ids in the same order.
  function areSameWordIds(firstWordIds, secondWordIds) {
    return firstWordIds.length === secondWordIds.length
      && firstWordIds.every((wordId, index) => wordId === secondWordIds[index]);
  }

  // The ids (without repeats, in the given order) of the words that exist, at most limit.
  function keepExistingWordIds(wordIds, limit) {
    const uniqueWordIds = [...new Set(wordIds)];
    const existingWordIds = new Set(practiceRepository.findPracticeWordsByIds(uniqueWordIds).map(row => row.id));
    return uniqueWordIds.filter(wordId => existingWordIds.has(wordId)).slice(0, limit);
  }

  // Runs the write of one client answer once, inside the caller's transaction. Without a clientAnswerId it just runs.
  // With one: a receipt of the same id gives its stored response back (isReplay true) and nothing is written; otherwise
  // the write runs and its response is stored as the receipt, and receipts older than 30 days are deleted. Returns
  // { response, isReplay }.
  function runClientAnswerOnce({ clientAnswerId, kind, operation }) {
    if (clientAnswerId === undefined) return { response: operation(), isReplay: false };
    const receipt = clientAnswerReceiptRepository.findReceipt(clientAnswerId);
    if (receipt) {
      if (receipt.kind !== kind) throw new ConflictError(`client_answer_id ${clientAnswerId} is already used`);
      return { response: JSON.parse(receipt.response), isReplay: true };
    }
    const response = operation();
    const now = clock.now();
    clientAnswerReceiptRepository.createReceipt({ clientAnswerId, kind, response, createdAt: now });
    clientAnswerReceiptRepository.deleteReceiptsCreatedBefore(now - CLIENT_ANSWER_RECEIPT_RETENTION_MS);
    return { response, isReplay: false };
  }

  // The time to grade with: answeredAt, or now when it is later than now (a phone clock running fast would otherwise
  // lose the answer). Refuses an answer more than 7 days back. undefined stays undefined (now).
  function resolveAnsweredAt(answeredAt, now) {
    if (answeredAt === undefined) return undefined;
    if (answeredAt < now - ANSWERED_AT_MAXIMUM_AGE_MS) throw new ValidationError('answered_at is more than 7 days old');
    return Math.min(answeredAt, now);
  }

  // Refuses a dated answer when the word has a counting review log or deck answer later than it: the schedule never
  // moves backwards.
  function assertNoLaterAnswer(wordId, answeredAt) {
    const latestAnswerTime = practiceRepository.findLatestAnswerTimeOfWord(wordId);
    if (latestAnswerTime !== null && latestAnswerTime > answeredAt) {
      throw new ConflictError(LATER_ANSWER_EXISTS_MESSAGE);
    }
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
    getDrillWords,
    recordDrillAnswer,
    getSpareWords,
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
    deck: describeDeckPositions(readDeckPositions(wordRow)),
  };
}

// A word of the batch: its practice word with the directions it still needs in the set. answeredDirections: the Map
// from word id to the directions answered since the set opened.
function mapToPracticeWordWithDirections(wordRow, answeredDirections) {
  return {
    ...mapToPracticeWord(wordRow),
    directions_left: listDirectionsLeft({
      deckPositions: readDeckPositions(wordRow),
      answeredDirections: answeredDirections.get(wordRow.id) ?? new Set(),
    }),
  };
}

// Whether either direction of a word's deck positions ({ uk_nl, nl_uk }) is in the deck.
function isInAnyDeck(deckPositions) {
  return deckPositions.uk_nl !== null || deckPositions.nl_uk !== null;
}

// Throws a ValidationError for a direction that is neither uk_nl nor nl_uk.
function assertDirection(direction) {
  if (!PRACTICE_DIRECTIONS.includes(direction)) {
    throw new ValidationError(`direction must be one of ${PRACTICE_DIRECTIONS.join(', ')}`);
  }
}

// The start of the calendar day after today, in the time zone.
function findTomorrowStart({ today, timeZone }) {
  return findStartOfDay(addDaysToCalendarDate(today, 1), timeZone);
}

// Sets the FSRS card's due to the start of the calendar day its interval lands on, so a grade late in the day or on a
// 25-hour day does not come back the same day. Returns { card, dueAt }.
function dueCardOnDay({ card, today, timeZone }) {
  const intervalDays = Math.max(1, card.scheduled_days);
  const dueAt = findStartOfDay(addDaysToCalendarDate(today, intervalDays), timeZone);
  card.due = new Date(dueAt);
  return { card, dueAt };
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
