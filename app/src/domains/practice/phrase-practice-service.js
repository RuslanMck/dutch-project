// Phrase practice business rules: the batch (the session's phrase set, practice-set.js: due phrases first, New phrases
// in the room left), grading a phrase once per direction and session and the phrase statistics.
// Every phrase is practised in two directions (practice-direction.js): a set's phrase is finished once both are
// answered. Phrases use the word scheduler and day boundary, with no word errors and no priorities. Publishes
// 'phrases' after each grade.
import { ConflictError, NotFoundError } from '../../errors/domain-errors.js';
import { deriveLearningStatus, describeCardState, parseCard, serializeCard } from './fsrs-scheduling.js';
import { findOpenSet, mapToStoredSet, openPracticeSet, planSetRoom } from './practice-set.js';
import { PRACTICE_DIRECTIONS, UK_TO_NL_DIRECTION, findWorseGrade } from './practice-direction.js';
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
  // limits the reviews returned. Each phrase lists the directions_left of the set.
  function getPhraseBatch({ sessionId, maxReviews }) {
    const settings = practiceSettings.readActiveSettings();
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const phrases = phrasePracticeRepository.listPracticePhrases();
    const plan = runInTransaction(() => pinPhraseSet({ settings, today, sessionId, timestamp }));
    const mapToSetPhrase = phrase => ({
      ...mapToPracticePhrase(phrase),
      directions_left: findDirectionsLeft(plan.answeredDirectionsByPhraseId, phrase.id),
    });
    const reviewPhrases = plan.phrases.filter(phrase => phrase.fsrs_card !== null);
    const newPhrases = plan.phrases.filter(phrase => phrase.fsrs_card === null);
    return {
      session_id: sessionId,
      reviews: (maxReviews === undefined ? reviewPhrases : reviewPhrases.slice(0, maxReviews)).map(mapToSetPhrase),
      new_phrases: newPhrases.map(mapToSetPhrase),
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

  // Grades a phrase's answer in one direction of a session and returns its new state. The whole grade is one
  // transaction.
  function gradePhrase({ phraseId, grade, sessionId, direction = UK_TO_NL_DIRECTION }) {
    const settings = practiceSettings.readActiveSettings();
    const gradeResult = runInTransaction(() =>
      gradePhraseInTransaction({ settings, phraseId, grade, sessionId, direction }),
    );
    changeEventBus.publishChange('phrases');
    return gradeResult;
  }

  // The phrase's answer: a counting answer of the same session and direction is refused (409). Otherwise it is stored,
  // and the phrase's review log of the day (any session) decides the case: none → the first FSRS grade; a log whose
  // other direction is not answered → the second direction; otherwise a repeat, stored with no FSRS change.
  function gradePhraseInTransaction({ settings, phraseId, grade, sessionId, direction }) {
    const phrase = getPhraseRowOrThrow(phraseId);
    if (phrasePracticeRepository.findPhraseAnswer({ sessionId, phraseId, direction })) {
      throw new ConflictError(`phrase ${phraseId} was already graded in session ${sessionId}`);
    }
    const timestamp = clock.now();
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const plan = pinPhraseSet({ settings, today, sessionId, timestamp });
    // A set is 10 phrases at most: a New phrase outside the open set waits for a later set.
    if (plan.isOpen && phrase.fsrs_card === null && !plan.phrases.some(setPhrase => setPhrase.id === phraseId)) {
      throw new ConflictError(`phrase ${phraseId} is not in the current set: finish the set first`);
    }
    phrasePracticeRepository.createPhraseAnswer({ phraseId, sessionId, direction, answeredAt: timestamp, grade });
    const gradedLog = phrasePracticeRepository.findLatestPhraseReviewLogSince({
      phraseId,
      sinceTimestamp: findStartOfDay(today, settings.timeZone),
    });
    if (!gradedLog) {
      gradeFirstDirection({ settings, phrase, grade, sessionId, direction, timestamp });
    } else if (direction !== gradedLog.direction && gradedLog.second_grade === null) {
      gradeSecondDirection({ settings, phrase, gradedLog, grade, timestamp });
    }
    const gradedPhrase = getPhraseRowOrThrow(phraseId);
    const cardAfter = parseCard(gradedPhrase.fsrs_card);
    return {
      phrase: mapToGradedPhrase(gradedPhrase, settings.timeZone),
      grade,
      direction,
      state: describeCardState(cardAfter),
      status: gradedPhrase.status,
      interval_days: Math.max(1, cardAfter.scheduled_days),
      next_due_on: formatCalendarDateInTimeZone(gradedPhrase.due_at, settings.timeZone),
    };
  }

  // The first grade of the phrase today: FSRS from the card, and the review log that the other direction builds on. The
  // phrase comes back tomorrow whatever its interval: its other direction is still to be answered. The card keeps its
  // own due day for the second direction.
  function gradeFirstDirection({ settings, phrase, grade, sessionId, direction, timestamp }) {
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const cardBefore = parseCard(phrase.fsrs_card);
    const { cardAfterJson, learningStatus } = scheduleCard({ settings, cardBefore, grade, timestamp });
    phrasePracticeRepository.updatePhraseSchedule(phrase.id, {
      fsrsCard: cardAfterJson,
      dueAt: findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone),
      introducedOn: cardBefore === null ? today : phrase.introduced_on,
      learningStatus,
    });
    phrasePracticeRepository.createPhraseReviewLog({
      phraseId: phrase.id,
      sessionId,
      reviewedAt: timestamp,
      grade,
      cardBefore: serializeCard(cardBefore),
      cardAfter: cardAfterJson,
      direction,
    });
  }

  // The answer in the other direction of the day: the log keeps the second grade. When it is worse than the grade the
  // card was graded with, FSRS grades the card again from its card before with the worse grade, on the day of the
  // first grade, and the card and the log's card after are replaced. Otherwise the phrase is due on its card's day
  // (tomorrow at the earliest), as a word is.
  function gradeSecondDirection({ settings, phrase, gradedLog, grade, timestamp }) {
    const gradedWith = gradedLog.grade;
    const worseGrade = findWorseGrade(gradedWith, grade);
    if (worseGrade === gradedWith) {
      const card = parseCard(phrase.fsrs_card);
      const tomorrowStart = findStartOfDay(
        addDaysToCalendarDate(formatCalendarDateInTimeZone(timestamp, settings.timeZone), 1),
        settings.timeZone,
      );
      phrasePracticeRepository.updatePhraseSchedule(phrase.id, {
        fsrsCard: phrase.fsrs_card,
        dueAt: card ? Math.max(tomorrowStart, new Date(card.due).getTime()) : tomorrowStart,
        introducedOn: phrase.introduced_on,
        learningStatus: phrase.status,
      });
      phrasePracticeRepository.updatePhraseReviewLogSecondGrade(gradedLog.id, {
        secondGrade: grade,
        cardAfter: gradedLog.card_after,
      });
      return;
    }
    const { cardAfterJson, dueAt, learningStatus } = scheduleCard({
      settings,
      cardBefore: parseCard(gradedLog.card_before),
      grade: worseGrade,
      timestamp: gradedLog.reviewed_at,
    });
    phrasePracticeRepository.updatePhraseSchedule(phrase.id, {
      fsrsCard: cardAfterJson,
      dueAt,
      introducedOn: phrase.introduced_on,
      learningStatus,
    });
    phrasePracticeRepository.updatePhraseReviewLogSecondGrade(gradedLog.id, {
      secondGrade: grade,
      cardAfter: cardAfterJson,
    });
  }

  // FSRS grades cardBefore (null = New) at timestamp. Returns the card as JSON, its due time (the start of the calendar
  // day the interval lands on, as for words) and its learning status.
  function scheduleCard({ settings, cardBefore, grade, timestamp }) {
    const today = formatCalendarDateInTimeZone(timestamp, settings.timeZone);
    const { card: cardAfter } = fsrsScheduler.gradeCard(cardBefore, grade, timestamp);
    const intervalDays = Math.max(1, cardAfter.scheduled_days);
    const dueAt = findStartOfDay(addDaysToCalendarDate(today, intervalDays), settings.timeZone);
    cardAfter.due = new Date(dueAt);
    return {
      cardAfterJson: serializeCard(cardAfter),
      dueAt,
      learningStatus: deriveLearningStatus(cardAfter, settings.learnedThresholdDays),
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

  // The open set's phrases not finished yet (a New phrase, a phrase due today, or one not answered in both directions),
  // or the next set planned now. Returns { isOpen, phrases, overdueCount, tomorrowStart, answeredDirectionsByPhraseId }.
  // The directions answered count from the open set's opened_at only; a new set has none.
  function planPhraseSet({ settings, today, phrases, gradedPhraseIds }) {
    const tomorrowStart = findStartOfDay(addDaysToCalendarDate(today, 1), settings.timeZone);
    const overdueCount = phrases.filter(phrase => isDueBefore(phrase, findStartOfDay(today, settings.timeZone))).length;
    const phraseById = new Map(phrases.map(phrase => [phrase.id, phrase]));
    const answeredDirectionsByPhraseId = findAnsweredDirectionsOfOpenSet({ settings, today });
    const openSet = findOpenSet({
      storedSet: settings.phraseSet,
      today,
      isPending: phraseId => isPhrasePending(phraseById.get(phraseId), answeredDirectionsByPhraseId.get(phraseId)),
    });
    if (openSet) {
      const pendingPhrases = openSet.pendingIds.map(phraseId => phraseById.get(phraseId));
      return { isOpen: true, phrases: pendingPhrases, overdueCount, tomorrowStart, answeredDirectionsByPhraseId };
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
      answeredDirectionsByPhraseId: new Map(),
    };
  }

  // The directions answered since the open set was opened, by phrase id (a Map of Sets). Empty when no set is open today.
  function findAnsweredDirectionsOfOpenSet({ settings, today }) {
    const answeredDirectionsByPhraseId = new Map();
    if (!settings.phraseSet || settings.phraseSet.openedOn !== today) return answeredDirectionsByPhraseId;
    for (const { phrase_id: phraseId, direction } of phrasePracticeRepository.listPhraseDirectionsAnsweredSince(
      settings.phraseSet.openedAt,
    )) {
      if (!answeredDirectionsByPhraseId.has(phraseId)) answeredDirectionsByPhraseId.set(phraseId, new Set());
      answeredDirectionsByPhraseId.get(phraseId).add(direction);
    }
    return answeredDirectionsByPhraseId;
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

// A phrase of the set is not finished while it is New, or it has no answer yet in one of the directions. A deleted
// phrase is finished.
function isPhrasePending(phrase, answeredDirections = new Set()) {
  return !!phrase && PRACTICE_DIRECTIONS.some(direction => !answeredDirections.has(direction));
}

// The directions of a phrase with no answer since the set was opened, in PRACTICE_DIRECTIONS order.
function findDirectionsLeft(answeredDirectionsByPhraseId, phraseId) {
  const answeredDirections = answeredDirectionsByPhraseId.get(phraseId) ?? new Set();
  return PRACTICE_DIRECTIONS.filter(direction => !answeredDirections.has(direction));
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
