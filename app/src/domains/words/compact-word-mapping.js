// The compact word Claude sees from the word tools and the practice tools: enough to act on, without timestamps or
// legacy ids. Pure: no I/O.
export function mapWordToCompactWord(word) {
  return {
    id: word.id,
    nl: word.nl,
    uk: word.uk,
    article: word.article,
    kind: word.kind,
    section: word.section,
    topic: word.topic,
    status: word.status,
    error_count: word.error_count,
    example_nl: word.example_nl,
    example_uk: word.example_uk,
    priority: word.priority,
    priority_override: word.priority_override,
    frequency_rank: word.frequency_rank,
    state: word.state,
    next_due_on: word.next_due_on,
    in_deck: isInDeckDirection(word.deck_required_correct) || isInDeckDirection(word.deck_reverse_required_correct),
    times_left: countDeckTimesLeft(word),
  };
}

// A word is in the learning deck when either direction is: uk_nl (deck_required_correct) or nl_uk
// (deck_reverse_required_correct).
function isInDeckDirection(requiredCorrect) {
  return requiredCorrect !== null && requiredCorrect !== undefined;
}

// How many more right answers in a row one direction of the deck needs; 0 outside the deck.
function countDirectionTimesLeft(requiredCorrect, correctCount) {
  if (!isInDeckDirection(requiredCorrect)) return 0;
  return requiredCorrect - (correctCount ?? 0);
}

// How many more right answers in a row the word needs in the learning deck, both directions summed; 0 outside it.
function countDeckTimesLeft(word) {
  return countDirectionTimesLeft(word.deck_required_correct, word.deck_correct_count)
    + countDirectionTimesLeft(word.deck_reverse_required_correct, word.deck_reverse_correct_count);
}
