// The learning deck rules. Pure. A deck position is { requiredCorrect, correctStreak }, or null for a word outside
// the deck. A word enters the deck on its first answer ever, or when a word outside it is answered again or hard (a
// lapse). In the deck, good adds to the streak; again or hard (both count as mistakes) adds one required right answer,
// up to MAXIMUM_REQUIRED_CORRECT, and resets the streak. When the streak reaches the required count the word is
// learned and leaves the deck.
export const FIRST_REQUIRED_CORRECT = 2;
export const MAXIMUM_REQUIRED_CORRECT = 6;

// isFirstAnswerEver: the word was New (no FSRS card) before this answer.
// Returns { deckPosition, hasEnteredDeck, hasLearned }.
export function applyAnswerToDeck({ deckPosition, grade, isFirstAnswerEver }) {
  const isMistake = grade !== 'good';
  const isEntering = deckPosition === null && (isFirstAnswerEver || isMistake);
  if (deckPosition === null && !isEntering) {
    return Object.freeze({ deckPosition: null, hasEnteredDeck: false, hasLearned: false });
  }
  const startPosition = deckPosition ?? { requiredCorrect: FIRST_REQUIRED_CORRECT, correctStreak: 0 };
  const nextPosition = isMistake
    ? {
      requiredCorrect: Math.min(MAXIMUM_REQUIRED_CORRECT, startPosition.requiredCorrect + 1),
      correctStreak: 0,
    }
    : { requiredCorrect: startPosition.requiredCorrect, correctStreak: startPosition.correctStreak + 1 };
  const hasLearned = nextPosition.correctStreak >= nextPosition.requiredCorrect;
  return Object.freeze({
    deckPosition: hasLearned ? null : Object.freeze(nextPosition),
    hasEnteredDeck: isEntering,
    hasLearned,
  });
}

// How many more right answers in a row the word needs; 0 outside the deck.
export function countTimesLeft(deckPosition) {
  return deckPosition ? deckPosition.requiredCorrect - deckPosition.correctStreak : 0;
}

// The deck position stored in a word row (deck_required_correct, deck_correct_streak), or null.
export function readDeckPosition(wordRow) {
  if (wordRow.deck_required_correct === null || wordRow.deck_required_correct === undefined) return null;
  return Object.freeze({ requiredCorrect: wordRow.deck_required_correct, correctStreak: wordRow.deck_correct_streak });
}

// The deck fields every adapter shows for a word: { in_deck, required_correct, correct_streak, times_left }.
export function describeDeckPosition(deckPosition) {
  return {
    in_deck: deckPosition !== null,
    required_correct: deckPosition?.requiredCorrect ?? null,
    correct_streak: deckPosition?.correctStreak ?? 0,
    times_left: countTimesLeft(deckPosition),
  };
}

// Replays answers (oldest first, each { grade, isFirstAnswerEver }) from outside the deck. Returns the final position.
export function replayDeckAnswers(answers) {
  let deckPosition = null;
  for (const answer of answers) {
    deckPosition = applyAnswerToDeck({ deckPosition, ...answer }).deckPosition;
  }
  return deckPosition;
}
