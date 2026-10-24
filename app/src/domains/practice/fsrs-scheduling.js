// Wraps ts-fsrs for practice grades and converts cards to and from JSON. Pure: the caller passes every timestamp.
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';

import { CARD_STATE_VALUES } from '../../contracts/shared-contracts.js';
import { ValidationError } from '../../errors/domain-errors.js';

const MILLISECONDS_PER_DAY = 86_400_000;
const LEARNED_MIGRATION_INTERVAL_DAYS = 21;

const RATING_BY_GRADE = Object.freeze({
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
});

// Builds the scheduler once. Short-term steps are always off, so a grade gives a whole-day interval.
export function createFsrsScheduler({ desiredRetention, isFuzzEnabled }) {
  const scheduler = fsrs(
    generatorParameters({
      request_retention: desiredRetention,
      enable_fuzz: isFuzzEnabled,
      enable_short_term: false,
    }),
  );

  // A null card is a New word. Returns the next card, its due time in ms and its interval in whole days.
  function gradeCard(card, grade, timestamp) {
    if (!Object.hasOwn(RATING_BY_GRADE, grade)) {
      throw new ValidationError(`grade must be again, hard or good, got ${grade}`);
    }
    const gradedAt = new Date(timestamp);
    const cardBeforeGrade = card ?? createEmptyCard(gradedAt);
    const { card: cardAfterGrade } = scheduler.next(cardBeforeGrade, gradedAt, RATING_BY_GRADE[grade]);
    return {
      card: cardAfterGrade,
      dueAt: cardAfterGrade.due.getTime(),
      intervalDays: calculateIntervalDays(cardAfterGrade),
    };
  }

  return Object.freeze({ gradeCard });
}

// A null card (New) is stored as NULL, so it serializes to null.
export function serializeCard(card) {
  return card ? JSON.stringify(card) : null;
}

export function parseCard(json) {
  if (json === null || json === undefined) return null;
  const storedCard = JSON.parse(json);
  const isLastReviewMissing = storedCard.last_review === null || storedCard.last_review === undefined;
  return {
    ...storedCard,
    due: new Date(storedCard.due),
    last_review: isLastReviewMissing ? undefined : new Date(storedCard.last_review),
  };
}

// Whole days between the last review and the next due time; 0 when the card was never reviewed.
export function calculateIntervalDays(card) {
  if (!card.last_review) return 0;
  return Math.round((card.due.getTime() - card.last_review.getTime()) / MILLISECONDS_PER_DAY);
}

// 'learned' needs a Review card whose interval has reached the threshold; anything else already started is 'learning'.
export function deriveLearningStatus(card, learnedThresholdDays) {
  if (!card || card.state === State.New) return 'new';
  if (card.state === State.Review && calculateIntervalDays(card) >= learnedThresholdDays) return 'learned';
  return 'learning';
}

// ts-fsrs numbers its states 0 to 3 in the order of CARD_STATE_VALUES, so the state's name is the value at its index.
export function describeCardState(card) {
  return card ? CARD_STATE_VALUES[card.state] : 'new';
}

// Cards for words that were already learning or learned before FSRS was switched on.
export function buildMigrationCard({ group, dueAt, timestamp }) {
  const due = new Date(dueAt);
  if (group === 'learning') {
    return {
      due,
      stability: 1,
      difficulty: 6,
      elapsed_days: 0,
      scheduled_days: 1,
      learning_steps: 0,
      reps: 1,
      lapses: 1,
      state: State.Review,
      last_review: new Date(timestamp - MILLISECONDS_PER_DAY),
    };
  }
  if (group === 'learned') {
    return {
      due,
      stability: LEARNED_MIGRATION_INTERVAL_DAYS,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: LEARNED_MIGRATION_INTERVAL_DAYS,
      learning_steps: 0,
      reps: 3,
      lapses: 0,
      state: State.Review,
      // Measured back from the due date, so the interval is exactly 21 days and the word counts as learned.
      last_review: new Date(dueAt - LEARNED_MIGRATION_INTERVAL_DAYS * MILLISECONDS_PER_DAY),
    };
  }
  throw new ValidationError(`migration group must be learning or learned, got ${group}`);
}
