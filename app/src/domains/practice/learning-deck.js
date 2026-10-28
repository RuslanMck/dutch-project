import { NL_TO_UK_DIRECTION, UK_TO_NL_DIRECTION, findOtherDirection } from './practice-direction.js';

// The learning deck rules: the words of the current practice session, in each direction (uk_nl and nl_uk). Pure. A
// deck position is { requiredCorrect, correctCount, isLapse }, or null for a word outside the deck; isLapse says the
// word entered as a learned word answered wrong rather than as a New word. A word enters the deck on its first answer
// ever, or when a word outside it is answered again or hard (a lapse). In the deck, good adds a right answer; again or
// hard (both count as mistakes) adds one required right answer, up to MAXIMUM_REQUIRED_CORRECT, and keeps the right
// answers already given. When the right answers reach the required count the word is learned and leaves the deck.
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
  const startPosition = deckPosition
    ?? { requiredCorrect: FIRST_REQUIRED_CORRECT, correctCount: 0, isLapse: !isFirstAnswerEver };
  const nextPosition = isMistake
    ? {
      requiredCorrect: Math.min(MAXIMUM_REQUIRED_CORRECT, startPosition.requiredCorrect + 1),
      correctCount: startPosition.correctCount,
      isLapse: startPosition.isLapse,
    }
    : {
      requiredCorrect: startPosition.requiredCorrect,
      correctCount: startPosition.correctCount + 1,
      isLapse: startPosition.isLapse,
    };
  const hasLearned = nextPosition.correctCount >= nextPosition.requiredCorrect;
  return Object.freeze({
    deckPosition: hasLearned ? null : Object.freeze(nextPosition),
    hasEnteredDeck: isEntering,
    hasLearned,
  });
}

// How many more right answers the word needs; 0 outside the deck.
export function countTimesLeft(deckPosition) {
  return deckPosition ? deckPosition.requiredCorrect - deckPosition.correctCount : 0;
}

// The deck position stored in the given columns of a word row, or null when the word is out of that direction's deck.
function readPositionColumns({ requiredCorrect, correctCount, isLapse }) {
  if (requiredCorrect === null || requiredCorrect === undefined) return null;
  return Object.freeze({ requiredCorrect, correctCount, isLapse: isLapse === 1 });
}

// The uk_nl deck position stored in a word row (deck_required_correct, deck_correct_count, deck_entered_by_lapse), or
// null.
export function readDeckPosition(wordRow) {
  return readPositionColumns({
    requiredCorrect: wordRow.deck_required_correct,
    correctCount: wordRow.deck_correct_count,
    isLapse: wordRow.deck_entered_by_lapse,
  });
}

// The nl_uk deck position stored in a word row (deck_reverse_* columns), or null.
export function readReverseDeckPosition(wordRow) {
  return readPositionColumns({
    requiredCorrect: wordRow.deck_reverse_required_correct,
    correctCount: wordRow.deck_reverse_correct_count,
    isLapse: wordRow.deck_reverse_entered_by_lapse,
  });
}

// The deck positions of a word row: { uk_nl: position|null, nl_uk: position|null }.
export function readDeckPositions(wordRow) {
  return Object.freeze({
    [UK_TO_NL_DIRECTION]: readDeckPosition(wordRow),
    [NL_TO_UK_DIRECTION]: readReverseDeckPosition(wordRow),
  });
}

// The deck fields every adapter shows for a word: { in_deck, required_correct, correct_count, times_left }.
export function describeDeckPosition(deckPosition) {
  return {
    in_deck: deckPosition !== null,
    required_correct: deckPosition?.requiredCorrect ?? null,
    correct_count: deckPosition?.correctCount ?? 0,
    times_left: countTimesLeft(deckPosition),
  };
}

// Applies one answer in a direction to the word's two deck positions ({ uk_nl, nl_uk }). On the word's first answer
// ever both directions enter: the answered one gets the answer as applyAnswerToDeck gives it, the other starts at 2
// right answers needed and none given. Otherwise only the answered direction moves. Returns { deckPositions,
// hasEnteredDeck, hasLearnedDirection, hasLearned }: hasLearnedDirection says the answered direction left its deck
// now, hasLearned that the word left both.
export function applyAnswerToDecks({ deckPositions, direction, grade, isFirstAnswerEver }) {
  const answered = applyAnswerToDeck({ deckPosition: deckPositions[direction], grade, isFirstAnswerEver });
  const otherDirection = findOtherDirection(direction);
  const otherDeckPosition = isFirstAnswerEver && deckPositions[otherDirection] === null
    ? Object.freeze({ requiredCorrect: FIRST_REQUIRED_CORRECT, correctCount: 0, isLapse: false })
    : deckPositions[otherDirection];
  const hasLearnedDirection = deckPositions[direction] !== null && answered.deckPosition === null;
  const nextDeckPositions = Object.freeze({
    [direction]: answered.deckPosition,
    [otherDirection]: otherDeckPosition,
  });
  return Object.freeze({
    deckPositions: nextDeckPositions,
    hasEnteredDeck: answered.hasEnteredDeck,
    hasLearnedDirection,
    hasLearned: hasLearnedDirection && otherDeckPosition === null,
  });
}

// The deck fields every adapter shows for a word: { in_deck, times_left, uk_nl, nl_uk }. in_deck is true when either
// direction is in the deck; times_left is the sum of both directions' times left; uk_nl and nl_uk are each
// describeDeckPosition.
export function describeDeckPositions(deckPositions) {
  const uk = describeDeckPosition(deckPositions[UK_TO_NL_DIRECTION]);
  const nl = describeDeckPosition(deckPositions[NL_TO_UK_DIRECTION]);
  return {
    in_deck: uk.in_deck || nl.in_deck,
    times_left: uk.times_left + nl.times_left,
    [UK_TO_NL_DIRECTION]: uk,
    [NL_TO_UK_DIRECTION]: nl,
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
