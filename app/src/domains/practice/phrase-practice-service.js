// Phrase practice business rules: the batch of phrase reviews and New phrases, grading a phrase once per session and
// the phrase statistics. Phrases use the word scheduler and day boundary, with no word errors and no priorities.
// Publishes 'phrases' after each grade.
import { ConflictError, NotFoundError } from '../../errors/domain-errors.js';
import { deriveLearningStatus, describeCardState, parseCard, serializeCard } from './fsrs-scheduling.js';
import { addDaysToCalendarDate, findStartOfDay, formatCalendarDateInTimeZone } from './practice-calendar.js';

const FSRS_NOT_SET_UP_MESSAGE = 'FSRS practice is not set up yet: run migrate_to_fsrs';

export function createPhrasePracticeService({
  phrasePracticeRepository,
  practiceSettings,
  fsrsScheduler,
  runInTransaction,
  changeEventBus,
  clock,
}) {
  // Phrases due before the start of tomorrow (most overdue first), minus the ones graded in this session, plus the
  // New phrases the day's allowance still has room for (oldest first).
  function getPhraseBatch({ sessionId, maxReviews }) {
    const settings = readActiveSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), settings.timeZone);
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const gradedPhraseIds = new Set(phrasePracticeRepository.listPhraseIdsReviewedInSession(sessionId));
    const phrases = phrasePracticeRepository.listPracticePhrases();
    const duePhrases = phrases
      .filter(phrase => isDueBefore(phrase, tomorrowStart) && !gradedPhraseIds.has(phrase.id))
      .sort(compareMostOverdueFirst);
    const reviewPhrases = maxReviews === undefined ? duePhrases : duePhrases.slice(0, maxReviews);
    const introducedTodayCount = phrasePracticeRepository.countIntroducedOn(today);
    const newCandidates = phrases
      .filter(phrase => phrase.fsrs_card === null && !gradedPhraseIds.has(phrase.id))
      .sort(compareOldestFirst);
    const newAllowanceCount = Math.max(0, settings.phraseNewPerDay - introducedTodayCount);
    const newPhrases = newCandidates.slice(0, newAllowanceCount);
    return {
      session_id: sessionId,
      reviews: reviewPhrases.map(mapToPracticePhrase),
      new_phrases: newPhrases.map(mapToPracticePhrase),
      counts: {
        due: duePhrases.length,
        introduced_today: introducedTodayCount,
        new_today_remaining: newAllowanceCount,
        new_remaining: newCandidates.length - newPhrases.length,
      },
    };
  }

  // Grades a phrase's first answer in a session and returns its new state. The whole grade is one transaction.
  function gradePhrase({ phraseId, grade, sessionId }) {
    const settings = readActiveSettings();
    const gradeResult = runInTransaction(() => gradePhraseInTransaction({ settings, phraseId, grade, sessionId }));
    changeEventBus.publishChange('phrases');
    return gradeResult;
  }

  function gradePhraseInTransaction({ settings, phraseId, grade, sessionId }) {
    const phrase = getPhraseRowOrThrow(phraseId);
    if (phrasePracticeRepository.findPhraseReviewLog(sessionId, phraseId)) {
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

  // Due counts for today and tomorrow, phrases introduced today, New phrases waiting, and phrases per state.
  function calculatePhraseStatistics() {
    const settings = practiceSettings.readSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), settings.timeZone);
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const dayAfterTomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 2), settings.timeZone);
    const phrases = phrasePracticeRepository.listPracticePhrases();
    const stateCounts = { new: 0, learning: 0, review: 0, relearning: 0 };
    for (const phrase of phrases) stateCounts[describeCardState(parseCard(phrase.fsrs_card))] += 1;
    return {
      due_today: phrases.filter(phrase => isDueBefore(phrase, tomorrowStart)).length,
      due_tomorrow: phrases.filter(phrase => isDueWithin(phrase, tomorrowStart, dayAfterTomorrowStart)).length,
      introduced_today: phrasePracticeRepository.countIntroducedOn(today),
      new_remaining: phrases.filter(phrase => phrase.fsrs_card === null).length,
      states: stateCounts,
    };
  }

  function readActiveSettings() {
    if (!practiceSettings.isFsrsActive()) throw new ConflictError(FSRS_NOT_SET_UP_MESSAGE);
    return practiceSettings.readSettings();
  }

  function getPhraseRowOrThrow(phraseId) {
    const phrase = phrasePracticeRepository.findPracticePhraseById(phraseId);
    if (!phrase) throw new NotFoundError(`phrase ${phraseId} not found`);
    return phrase;
  }

  return Object.freeze({ getPhraseBatch, gradePhrase, calculatePhraseStatistics });
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
