// The two directions of practice. Every card of a set is practised in two rounds: uk_nl first (the Ukrainian is
// shown, the Dutch is answered), then nl_uk (the Dutch is shown, the Ukrainian is answered). Pure.
export const UK_TO_NL_DIRECTION = 'uk_nl';
export const NL_TO_UK_DIRECTION = 'nl_uk';
export const PRACTICE_DIRECTIONS = Object.freeze([UK_TO_NL_DIRECTION, NL_TO_UK_DIRECTION]);

const GRADE_RANK = Object.freeze({ again: 0, hard: 1, good: 2 });

// The other direction of the two.
export function findOtherDirection(direction) {
  return direction === UK_TO_NL_DIRECTION ? NL_TO_UK_DIRECTION : UK_TO_NL_DIRECTION;
}

// The worse of two grades (again < hard < good); a missing grade (null) leaves the other one.
export function findWorseGrade(firstGrade, secondGrade) {
  if (!secondGrade) return firstGrade;
  if (!firstGrade) return secondGrade;
  return GRADE_RANK[secondGrade] < GRADE_RANK[firstGrade] ? secondGrade : firstGrade;
}
