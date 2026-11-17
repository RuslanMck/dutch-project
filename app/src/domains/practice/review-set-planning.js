// Pure ordering of the review set (kind 'review' of practice-set.js): the words already practised that are owed today,
// most important first. Priority 1, then 2, then 3; inside a priority the harder word first (the FSRS difficulty, then
// the lapses, both higher first); then the earlier due time; then the id. A word introduced today is not a review yet:
// today's New words stay in the new set until tomorrow. Reads and writes nothing: the caller passes the candidates.
import { parseCard } from './fsrs-scheduling.js';

// The review candidate of a word row with a card: its priority, FSRS difficulty and lapses from the card, its due time
// (ms), its introduction day ('YYYY-MM-DD' or null) and its id. A row without a card has no FSRS difficulty or lapses,
// so both count as 0 for it.
export function mapToReviewCandidate(wordRow) {
  const card = parseCard(wordRow.fsrs_card);
  return Object.freeze({
    id: wordRow.id,
    priority: wordRow.priority,
    difficulty: card?.difficulty ?? 0,
    lapses: card?.lapses ?? 0,
    dueAt: wordRow.due_at ?? 0,
    introducedOn: wordRow.introduced_on ?? null,
  });
}

// Orders two review candidates: lower priority number first, then the harder word (higher difficulty, then more
// lapses), then the earlier due time, then the lower id. Returns a negative, zero or positive number.
export function compareReviewOrder(first, second) {
  return compareNumbers(first.priority, second.priority)
    || compareNumbers(second.difficulty, first.difficulty)
    || compareNumbers(second.lapses, first.lapses)
    || compareNumbers(first.dueAt, second.dueAt)
    || compareNumbers(first.id, second.id);
}

// The candidates owed as reviews today, in review order: the ones introduced today and the excludedIds (the words
// graded in this session) are left out. The first setSize of them make the review set.
export function orderReviewCandidates({ candidates, today, excludedIds = [] }) {
  const excludedIdSet = new Set(excludedIds);
  const owedCandidates = candidates.filter(candidate => (
    candidate.introducedOn !== today && !excludedIdSet.has(candidate.id)
  ));
  return Object.freeze([...owedCandidates].sort(compareReviewOrder));
}

function compareNumbers(first, second) {
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}
