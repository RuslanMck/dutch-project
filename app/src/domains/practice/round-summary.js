// The end of a round: the words of the intake block, how many answers and mistakes each took, and the time spent from
// the first answer to the last. Pure.

// A gap longer than this between two answers is a pause (the app closed, a break, another day) and is not counted.
export const PAUSE_AFTER_MILLISECONDS = 5 * 60_000;

// words: [{ id, nl, uk, article, in_deck }]. answers: [{ word_id, grade, answered_at, required_correct_after }], oldest
// first. A word's answers end at the one that learned it (required_correct_after null), so a later lapse is not
// counted. Returns the round, hardest word first, or null when the round has no answers.
export function summarizeRound({ words, answers }) {
  const answersByWordId = new Map(words.map(word => [word.id, []]));
  for (const answer of answers) {
    const wordAnswers = answersByWordId.get(answer.word_id);
    if (!wordAnswers) continue;
    const isAlreadyLearned = wordAnswers.some(earlierAnswer => earlierAnswer.required_correct_after === null);
    if (!isAlreadyLearned) wordAnswers.push(answer);
  }
  const roundAnswers = [...answersByWordId.values()].flat().sort((left, right) => left.answered_at - right.answered_at);
  if (!roundAnswers.length) return null;

  const wordSummaries = words.map(word => {
    const wordAnswers = answersByWordId.get(word.id);
    const mistakeCount = wordAnswers.filter(answer => answer.grade !== 'good').length;
    return {
      id: word.id,
      nl: word.nl,
      uk: word.uk,
      article: word.article,
      answer_count: wordAnswers.length,
      mistake_count: mistakeCount,
      difficulty: classifyDifficulty(mistakeCount),
      is_learned: wordAnswers.length > 0 && !word.in_deck,
    };
  }).sort((left, right) => right.mistake_count - left.mistake_count || right.answer_count - left.answer_count);

  const startedAt = roundAnswers[0].answered_at;
  const finishedAt = roundAnswers[roundAnswers.length - 1].answered_at;
  const learnedCount = wordSummaries.filter(word => word.is_learned).length;
  return {
    words: wordSummaries,
    total_count: wordSummaries.length,
    learned_count: learnedCount,
    is_complete: learnedCount === wordSummaries.length,
    answer_count: roundAnswers.length,
    mistake_count: roundAnswers.filter(answer => answer.grade !== 'good').length,
    hardest_word_id: wordSummaries[0].mistake_count > 0 ? wordSummaries[0].id : null,
    started_at: startedAt,
    finished_at: finishedAt,
    active_seconds: Math.round(countActiveMilliseconds(roundAnswers) / 1000),
  };
}

// easy: no mistake; medium: one or two; hard: three or more.
export function classifyDifficulty(mistakeCount) {
  if (mistakeCount === 0) return 'easy';
  return mistakeCount <= 2 ? 'medium' : 'hard';
}

function countActiveMilliseconds(sortedAnswers) {
  let activeMilliseconds = 0;
  for (let index = 1; index < sortedAnswers.length; index += 1) {
    const gap = sortedAnswers[index].answered_at - sortedAnswers[index - 1].answered_at;
    if (gap <= PAUSE_AFTER_MILLISECONDS) activeMilliseconds += gap;
  }
  return activeMilliseconds;
}
