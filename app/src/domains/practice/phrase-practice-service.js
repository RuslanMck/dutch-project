// Phrase practice business rules: the batch of phrase reviews and New phrases (held back while a phrase is overdue; an
// open intake block offers only its pinned leftovers), grading a phrase once per session and the phrase statistics.
// Phrases use the word scheduler and day boundary, with no word errors and no priorities. Publishes 'phrases' after
// each grade.
import { ConflictError, NotFoundError } from '../../errors/domain-errors.js';
import { deriveLearningStatus, describeCardState, parseCard, serializeCard } from './fsrs-scheduling.js';
import { mapToStoredBlock, openIntakeBlock, resolveIntakeBlock } from './intake-block.js';
import { addDaysToCalendarDate, findStartOfDay, formatCalendarDateInTimeZone } from './practice-calendar.js';

export function createPhrasePracticeService({
  phrasePracticeRepository,
  practiceSettings,
  fsrsScheduler,
  runInTransaction,
  changeEventBus,
  clock,
}) {
  // Phrases due before the start of tomorrow (most overdue first), minus the ones graded in this session, plus the New
  // phrases on offer. While a phrase is overdue, no New phrase is offered.
  function getPhraseBatch({ sessionId, maxReviews }) {
    const settings = practiceSettings.readActiveSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), settings.timeZone);
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const gradedPhraseIds = new Set(phrasePracticeRepository.listPhraseIdsReviewedInSession({ sessionId }));
    const phrases = phrasePracticeRepository.listPracticePhrases();
    const duePhrases = phrases
      .filter(phrase => isDueBefore(phrase, tomorrowStart) && !gradedPhraseIds.has(phrase.id))
      .sort(compareMostOverdueFirst);
    const reviewPhrases = maxReviews === undefined ? duePhrases : duePhrases.slice(0, maxReviews);
    const newPlan = planNewPhrases({ settings, today, phrases, gradedPhraseIds });
    return {
      session_id: sessionId,
      reviews: reviewPhrases.map(mapToPracticePhrase),
      new_phrases: newPlan.offeredPhrases.map(mapToPracticePhrase),
      counts: {
        due: duePhrases.length,
        overdue: newPlan.overdueCount,
        introduced_today: newPlan.introducedTodayCount,
        new_today_remaining: newPlan.newTodayRemainingCount,
        new_remaining: newPlan.newCandidates.length - newPlan.offeredPhrases.length,
        new_phrases_blocked: newPlan.isBlocked,
      },
    };
  }

  // Grades a phrase's first answer in a session and returns its new state. The whole grade is one transaction.
  function gradePhrase({ phraseId, grade, sessionId }) {
    const settings = practiceSettings.readActiveSettings();
    const gradeResult = runInTransaction(() => gradePhraseInTransaction({ settings, phraseId, grade, sessionId }));
    changeEventBus.publishChange('phrases');
    return gradeResult;
  }

  function gradePhraseInTransaction({ settings, phraseId, grade, sessionId }) {
    const phrase = getPhraseRowOrThrow(phraseId);
    const gradedLog = phrasePracticeRepository.findPhraseReviewLog({ sessionId, phraseId });
    if (gradedLog) {
      throw new ConflictError(`phrase ${phraseId} was already graded in session ${sessionId}`);
    }
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const cardBefore = parseCard(phrase.fsrs_card);
    const { card: cardAfter } = fsrsScheduler.gradeCard(cardBefore, grade, timestamp);
    // The due time is the start of the calendar day the interval lands on, as for words.
    const intervalDays = Math.max(1, cardAfter.scheduled_days);
    const dueAt = findStartOfDay(addDaysToCalendarDate(today, intervalDays), settings.timeZone);
    cardAfter.due = new Date(dueAt);
    const learningStatus = deriveLearningStatus(cardAfter, settings.learnedThresholdDays);
    const cardAfterJson = serializeCard(cardAfter);
    if (cardBefore === null) savePhraseBlockOnFirstStart({ settings, today });
    phrasePracticeRepository.updatePhraseSchedule(phraseId, {
      fsrsCard: cardAfterJson,
      dueAt,
      introducedOn: cardBefore === null ? today : phrase.introduced_on,
      learningStatus,
    });
    phrasePracticeRepository.createPhraseReviewLog({
      phraseId,
      sessionId,
      reviewedAt: timestamp,
      grade,
      cardBefore: serializeCard(cardBefore),
      cardAfter: cardAfterJson,
    });
    return {
      phrase: mapToGradedPhrase(getPhraseRowOrThrow(phraseId), settings.timeZone),
      grade,
      state: describeCardState(cardAfter),
      status: learningStatus,
      interval_days: intervalDays,
      next_due_on: formatCalendarDateInTimeZone(dueAt, settings.timeZone),
    };
  }

  // Due counts for today and tomorrow, overdue phrases, phrases introduced today, New phrases waiting, and phrases per
  // state. new_phrases_blocked is judged for a fresh session, with no phrase graded yet.
  function calculatePhraseStatistics() {
    const settings = practiceSettings.readSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), settings.timeZone);
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const dayAfterTomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 2), settings.timeZone);
    const phrases = phrasePracticeRepository.listPracticePhrases();
    const stateCounts = { new: 0, learning: 0, review: 0, relearning: 0 };
    for (const phrase of phrases) stateCounts[describeCardState(parseCard(phrase.fsrs_card))] += 1;
    const newPlan = planNewPhrases({ settings, today, phrases, gradedPhraseIds: new Set() });
    return {
      due_today: phrases.filter(phrase => isDueBefore(phrase, tomorrowStart)).length,
      due_tomorrow: phrases.filter(phrase => isDueWithin(phrase, tomorrowStart, dayAfterTomorrowStart)).length,
      overdue: newPlan.overdueCount,
      introduced_today: newPlan.introducedTodayCount,
      new_remaining: phrases.filter(phrase => phrase.fsrs_card === null).length,
      new_phrases_blocked: newPlan.isBlocked,
      states: stateCounts,
    };
  }

  // The New phrases on offer: the pinned leftovers of an open intake block that gradedPhraseIds (graded in this
  // session) do not hold back, or, when no block is open, the oldest New phrases up to the day's count. Overdue phrases
  // hold them back; isBlocked is true only when that holds back at least one phrase. newTodayRemainingCount counts what
  // is still to be started: the block's leftovers, or the day's pick.
  function planNewPhrases({ settings, today, phrases, gradedPhraseIds }) {
    const todayStart = findStartOfDay(today, settings.timeZone);
    const overdueCount = phrases.filter(phrase => isDueBefore(phrase, todayStart)).length;
    const introducedTodayCount = phrasePracticeRepository.countIntroducedOn(today);
    const newPhrases = phrases.filter(phrase => phrase.fsrs_card === null);
    const block = resolveIntakeBlock({
      storedBlock: settings.newPhraseBlock,
      today,
      newItemIds: new Set(newPhrases.map(phrase => phrase.id)),
    });
    const newCandidates = newPhrases
      .filter(phrase => !gradedPhraseIds.has(phrase.id))
      .sort(compareOldestFirst);
    const allocatedPhrases = block.isFresh
      ? newCandidates.slice(0, settings.phraseNewPerDay)
      : findLeftoverPhrases(newPhrases, block.leftoverIds).filter(phrase => !gradedPhraseIds.has(phrase.id));
    const isBlocked = overdueCount > 0 && allocatedPhrases.length > 0;
    return {
      block,
      overdueCount,
      introducedTodayCount,
      newTodayRemainingCount: block.isFresh ? allocatedPhrases.length : block.leftoverIds.length,
      newCandidates,
      allocatedPhrases,
      isBlocked,
      offeredPhrases: isBlocked ? [] : allocatedPhrases,
    };
  }

  // The first New phrase started, when no intake block is open, pins the day's allocation as the block, so its
  // leftovers stay on offer on later days until all are started. A block opened today is open already, so nothing is
  // planned; a block from an earlier day is planned, and kept when it still has leftovers.
  function savePhraseBlockOnFirstStart({ settings, today }) {
    if (settings.newPhraseBlock?.openedOn === today) return;
    const plan = planNewPhrases({
      settings,
      today,
      phrases: phrasePracticeRepository.listPracticePhrases(),
      gradedPhraseIds: new Set(),
    });
    if (!plan.block.isFresh) return;
    const pinnedBlock = openIntakeBlock({ today, itemIds: plan.allocatedPhrases.map(phrase => phrase.id) });
    practiceSettings.saveNewPhraseBlock(mapToStoredBlock(pinnedBlock));
  }

  function getPhraseRowOrThrow(phraseId) {
    const phrase = phrasePracticeRepository.findPracticePhraseById(phraseId);
    if (!phrase) throw new NotFoundError(`phrase ${phraseId} not found`);
    return phrase;
  }

  return Object.freeze({ getPhraseBatch, gradePhrase, calculatePhraseStatistics });
}

// The block's leftovers, in the order they were pinned.
function findLeftoverPhrases(newPhrases, leftoverPhraseIds) {
  const phraseById = new Map(newPhrases.map(phrase => [phrase.id, phrase]));
  return leftoverPhraseIds.map(phraseId => phraseById.get(phraseId));
}

// A phrase is due before a timestamp when its card has a due time that is earlier than it (New phrases have none).
function isDueBefore(phrase, timestamp) {
  return phrase.due_at !== null && phrase.due_at < timestamp;
}

function isDueWithin(phrase, startTimestamp, endTimestamp) {
  return phrase.due_at !== null && phrase.due_at >= startTimestamp && phrase.due_at < endTimestamp;
}

function compareMostOverdueFirst(first, second) {
  return first.due_at - second.due_at || first.id - second.id;
}

function compareOldestFirst(first, second) {
  return first.added_at - second.added_at || first.id - second.id;
}

function mapToPracticePhrase(phraseRow) {
  return {
    id: phraseRow.id,
    nl: phraseRow.nl,
    uk: phraseRow.uk,
    context: phraseRow.context,
    state: describeCardState(parseCard(phraseRow.fsrs_card)),
    status: phraseRow.status,
  };
}

function mapToGradedPhrase(phraseRow, timeZone) {
  return {
    ...mapToPracticePhrase(phraseRow),
    next_due_on: phraseRow.due_at === null ? null : formatCalendarDateInTimeZone(phraseRow.due_at, timeZone),
  };
}
