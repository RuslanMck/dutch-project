// Phrase practice business rules: the batch (the session's phrase set, practice-set.js: due phrases first, New phrases
// in the room left), grading a phrase once per session and the phrase statistics.
// Phrases use the word scheduler and day boundary, with no word errors and no priorities. Publishes 'phrases' after
// each grade.
import { ConflictError, NotFoundError } from '../../errors/domain-errors.js';
import { deriveLearningStatus, describeCardState, parseCard, serializeCard } from './fsrs-scheduling.js';
import { findOpenSet, mapToStoredSet, openPracticeSet, planSetRoom } from './practice-set.js';
import { addDaysToCalendarDate, findStartOfDay, formatCalendarDateInTimeZone } from './practice-calendar.js';

export function createPhrasePracticeService({
  phrasePracticeRepository,
  practiceSettings,
  fsrsScheduler,
  runInTransaction,
  changeEventBus,
  clock,
}) {
  // The phrases to practise now: the session's set, at most new_per_day phrases. The open set's phrases not finished
  // yet, or the next set: phrases due today (most overdue first, the ones graded in this session left out), then the
  // oldest New phrases in the room left. A planned set is pinned at once, so the phrases shown are the set. maxReviews
  // limits the reviews returned.
  function getPhraseBatch({ sessionId, maxReviews }) {
    const settings = practiceSettings.readActiveSettings();
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const phrases = phrasePracticeRepository.listPracticePhrases();
    const plan = runInTransaction(() => pinPhraseSet({ settings, today, sessionId, timestamp }));
    const reviewPhrases = plan.phrases.filter(phrase => phrase.fsrs_card !== null);
    const newPhrases = plan.phrases.filter(phrase => phrase.fsrs_card === null);
    return {
      session_id: sessionId,
      reviews: (maxReviews === undefined ? reviewPhrases : reviewPhrases.slice(0, maxReviews)).map(mapToPracticePhrase),
      new_phrases: newPhrases.map(mapToPracticePhrase),
      counts: {
        set_size: settings.newPerDay,
        set_phrases: plan.phrases.length,
        set_new_phrases: newPhrases.length,
        is_set_open: plan.isOpen,
        due: phrases.filter(phrase => isDueBefore(phrase, plan.tomorrowStart)).length,
        overdue: plan.overdueCount,
        introduced_today: phrasePracticeRepository.countIntroducedOn(today),
        new_remaining: phrases.filter(phrase => phrase.fsrs_card === null).length - newPhrases.length,
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
    const plan = pinPhraseSet({ settings, today, sessionId, timestamp });
    // A set is 10 phrases at most: a New phrase outside the open set waits for a later set.
    if (plan.isOpen && phrase.fsrs_card === null && !plan.phrases.some(setPhrase => setPhrase.id === phraseId)) {
      throw new ConflictError(`phrase ${phraseId} is not in the current set: finish the set first`);
    }
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

  // Due counts for today and tomorrow, overdue phrases, phrases introduced today, New phrases waiting, and phrases per
  // state, and the phrases of the set still to practise in a fresh session.
  function calculatePhraseStatistics() {
    const settings = practiceSettings.readSettings();
    const today = formatCalendarDateInTimeZone(clock.now(), settings.timeZone);
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const dayAfterTomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 2), settings.timeZone);
    const phrases = phrasePracticeRepository.listPracticePhrases();
    const stateCounts = { new: 0, learning: 0, review: 0, relearning: 0 };
    for (const phrase of phrases) stateCounts[describeCardState(parseCard(phrase.fsrs_card))] += 1;
    const plan = planPhraseSet({ settings, today, phrases, gradedPhraseIds: new Set() });
    return {
      due_today: phrases.filter(phrase => isDueBefore(phrase, tomorrowStart)).length,
      due_tomorrow: phrases.filter(phrase => isDueWithin(phrase, tomorrowStart, dayAfterTomorrowStart)).length,
      overdue: plan.overdueCount,
      introduced_today: phrasePracticeRepository.countIntroducedOn(today),
      new_remaining: phrases.filter(phrase => phrase.fsrs_card === null).length,
      set_size: settings.newPerDay,
      set_phrases_left: plan.phrases.length,
      is_set_open: plan.isOpen,
      states: stateCounts,
    };
  }

  // The open set's phrases not finished yet (New, or still due today), or the next set planned now. Returns
  // { isOpen, phrases, overdueCount, tomorrowStart }.
  function planPhraseSet({ settings, today, phrases, gradedPhraseIds }) {
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const overdueCount = phrases.filter(phrase => isDueBefore(phrase, findStartOfDay(today, settings.timeZone))).length;
    const phraseById = new Map(phrases.map(phrase => [phrase.id, phrase]));
    const openSet = findOpenSet({
      storedSet: settings.phraseSet,
      today,
      isPending: phraseId => isPhrasePending(phraseById.get(phraseId), tomorrowStart),
    });
    if (openSet) {
      const pendingPhrases = openSet.pendingIds.map(phraseId => phraseById.get(phraseId));
      return { isOpen: true, phrases: pendingPhrases, overdueCount, tomorrowStart };
    }
    const duePhraseIds = phrases
      .filter(phrase => isDueBefore(phrase, tomorrowStart) && !gradedPhraseIds.has(phrase.id))
      .sort(compareMostOverdueFirst)
      .map(phrase => phrase.id);
    const { oldIds, room } = planSetRoom({ oldIds: duePhraseIds, setSize: settings.newPerDay });
    const newPhrases = phrases.filter(phrase => phrase.fsrs_card === null).sort(compareOldestFirst).slice(0, room);
    return {
      isOpen: false,
      phrases: [...oldIds.map(phraseId => phraseById.get(phraseId)), ...newPhrases],
      overdueCount,
      tomorrowStart,
    };
  }

  // The open set, or the next set planned and pinned now (when it has phrases). isOpen says it was open already. Runs
  // inside a transaction.
  function pinPhraseSet({ settings, today, sessionId, timestamp }) {
    const plan = planPhraseSet({
      settings,
      today,
      phrases: phrasePracticeRepository.listPracticePhrases(),
      gradedPhraseIds: new Set(phrasePracticeRepository.listPhraseIdsReviewedInSession({ sessionId })),
    });
    if (!plan.isOpen && plan.phrases.length) {
      const itemIds = plan.phrases.map(phrase => phrase.id);
      practiceSettings.savePhraseSet(mapToStoredSet(openPracticeSet({ today, openedAt: timestamp, itemIds })));
    }
    return plan;
  }

  function getPhraseRowOrThrow(phraseId) {
    const phrase = phrasePracticeRepository.findPracticePhraseById(phraseId);
    if (!phrase) throw new NotFoundError(`phrase ${phraseId} not found`);
    return phrase;
  }

  return Object.freeze({ getPhraseBatch, gradePhrase, calculatePhraseStatistics });
}

// A phrase of the set is not finished while it is New or still due today. A deleted phrase is.
function isPhrasePending(phrase, tomorrowStart) {
  return !!phrase && (phrase.fsrs_card === null || isDueBefore(phrase, tomorrowStart));
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
