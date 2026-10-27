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
    in_deck: word.deck_required_correct !== null && word.deck_required_correct !== undefined,
    times_left: countDeckTimesLeft(word),
  };
}

// How many more right answers in a row a word in the learning deck needs; 0 outside the deck.
function countDeckTimesLeft(word) {
  if (word.deck_required_correct === null || word.deck_required_correct === undefined) return 0;
  return word.deck_required_correct - (word.deck_correct_count ?? 0);
}
