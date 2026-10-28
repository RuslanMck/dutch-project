// SQL for the FSRS practice of phrases: the card, due, introduction and status columns of phrases, phrase_review_logs
// and phrase_answers. No business rules.
const PRACTICE_PHRASE_SELECT = `
  SELECT phrases.id, phrases.nl, phrases.uk, phrases.context, phrases.status, phrases.fsrs_card, phrases.due_at,
    phrases.introduced_on, phrases.added_at
  FROM phrases
`;

export function createPhrasePracticeRepository({ database }) {
  const selectPracticePhrasesStatement = database.prepare(`${PRACTICE_PHRASE_SELECT} ORDER BY phrases.id ASC`);
  const selectPracticePhraseByIdStatement = database.prepare(`
    ${PRACTICE_PHRASE_SELECT}
    WHERE phrases.id = @phraseId
  `);
  const updatePhraseScheduleStatement = database.prepare(`
    UPDATE phrases
    SET fsrs_card = @fsrsCard, due_at = @dueAt, introduced_on = @introducedOn, status = @learningStatus
    WHERE phrases.id = @phraseId
  `);
  const countIntroducedOnStatement = database.prepare(`
    SELECT COUNT(*)
    FROM phrases
    WHERE phrases.introduced_on = @calendarDate
  `).pluck();
  const insertPhraseReviewLogStatement = database.prepare(`
    INSERT INTO phrase_review_logs (phrase_id, session_id, reviewed_at, grade, card_before, card_after, direction)
    VALUES (@phraseId, @sessionId, @reviewedAt, @grade, @cardBefore, @cardAfter, @direction)
  `);
  // The phrase's latest log that still counts and was reviewed since sinceTimestamp (ms): the review log of the day. A
  // practice reset supersedes the logs before it.
  const selectLatestPhraseReviewLogSinceStatement = database.prepare(`
    SELECT phrase_review_logs.id, phrase_review_logs.reviewed_at, phrase_review_logs.grade,
      phrase_review_logs.card_before, phrase_review_logs.card_after, phrase_review_logs.direction,
      phrase_review_logs.second_grade
    FROM phrase_review_logs
    WHERE phrase_review_logs.phrase_id = @phraseId AND phrase_review_logs.reviewed_at >= @sinceTimestamp
      AND phrase_review_logs.superseded_at IS NULL
    ORDER BY phrase_review_logs.reviewed_at DESC, phrase_review_logs.id DESC
    LIMIT 1
  `);
  const updatePhraseReviewLogSecondGradeStatement = database.prepare(`
    UPDATE phrase_review_logs
    SET second_grade = @secondGrade, card_after = @cardAfter
    WHERE phrase_review_logs.id = @logId
  `);
  const selectReviewedPhraseIdsStatement = database.prepare(`
    SELECT phrase_review_logs.phrase_id
    FROM phrase_review_logs
    WHERE phrase_review_logs.session_id = @sessionId AND phrase_review_logs.superseded_at IS NULL
    ORDER BY phrase_review_logs.phrase_id ASC
  `).pluck();
  const updatePhraseReviewLogsSupersededStatement = database.prepare(`
    UPDATE phrase_review_logs
    SET superseded_at = @timestamp
    WHERE phrase_review_logs.superseded_at IS NULL
  `);
  const insertPhraseAnswerStatement = database.prepare(`
    INSERT INTO phrase_answers (phrase_id, session_id, direction, answered_at, grade)
    VALUES (@phraseId, @sessionId, @direction, @answeredAt, @grade)
  `);
  // Only answers that still count are looked up, as for the review logs.
  const selectPhraseAnswerStatement = database.prepare(`
    SELECT phrase_answers.id, phrase_answers.grade
    FROM phrase_answers
    WHERE phrase_answers.session_id = @sessionId AND phrase_answers.phrase_id = @phraseId
      AND phrase_answers.direction = @direction AND phrase_answers.superseded_at IS NULL
  `);
  const selectAnsweredDirectionsSinceStatement = database.prepare(`
    SELECT phrase_answers.phrase_id, phrase_answers.direction
    FROM phrase_answers
    WHERE phrase_answers.answered_at >= @answeredSince AND phrase_answers.superseded_at IS NULL
    ORDER BY phrase_answers.phrase_id ASC, phrase_answers.direction ASC
  `);
  const updatePhraseAnswersSupersededStatement = database.prepare(`
    UPDATE phrase_answers
    SET superseded_at = @timestamp
    WHERE phrase_answers.superseded_at IS NULL
  `);

  // Every phrase with its practice columns; the service filters and sorts them.
  function listPracticePhrases() {
    return selectPracticePhrasesStatement.all();
  }

  function findPracticePhraseById(phraseId) {
    return selectPracticePhraseByIdStatement.get({ phraseId }) ?? null;
  }

  // fsrsCard: the card as JSON (null = New). dueAt and introducedOn are null for New phrases.
  function updatePhraseSchedule(phraseId, { fsrsCard, dueAt, introducedOn, learningStatus }) {
    updatePhraseScheduleStatement.run({
      phraseId,
      fsrsCard: fsrsCard ?? null,
      dueAt: dueAt ?? null,
      introducedOn: introducedOn ?? null,
      learningStatus,
    });
  }

  // calendarDate: 'YYYY-MM-DD' in the practice time zone.
  function countIntroducedOn(calendarDate) {
    return countIntroducedOnStatement.get({ calendarDate });
  }

  function createPhraseReviewLog({ phraseId, sessionId, reviewedAt, grade, cardBefore = null, cardAfter, direction }) {
    insertPhraseReviewLogStatement.run({ phraseId, sessionId, reviewedAt, grade, cardBefore, cardAfter, direction });
  }

  // The phrase's latest log that still counts and was reviewed since sinceTimestamp (ms), or null, in whatever session
  // it was graded: its grade (the first answer's), card_before, card_after, direction and second_grade (the answer in the
  // other direction, null until it is given).
  function findLatestPhraseReviewLogSince({ phraseId, sinceTimestamp }) {
    return selectLatestPhraseReviewLogSinceStatement.get({ phraseId, sinceTimestamp }) ?? null;
  }

  // secondGrade and cardAfter replace the log's second grade and card after (the card graded with the worse grade).
  function updatePhraseReviewLogSecondGrade(logId, { secondGrade, cardAfter }) {
    updatePhraseReviewLogSecondGradeStatement.run({ logId, secondGrade, cardAfter });
  }

  // Phrase ids graded in the session by logs that still count.
  function listPhraseIdsReviewedInSession({ sessionId }) {
    return selectReviewedPhraseIdsStatement.all({ sessionId });
  }

  // timestamp: ms of a practice reset. Every log that still counts stops counting; the logs stay as history.
  function markPhraseReviewLogsSuperseded(timestamp) {
    updatePhraseReviewLogsSupersededStatement.run({ timestamp });
  }

  // The phrase's answer in one direction of the session that still counts, or null.
  function findPhraseAnswer({ sessionId, phraseId, direction }) {
    return selectPhraseAnswerStatement.get({ sessionId, phraseId, direction }) ?? null;
  }

  function createPhraseAnswer({ phraseId, sessionId, direction, answeredAt, grade }) {
    insertPhraseAnswerStatement.run({ phraseId, sessionId, direction, answeredAt, grade });
  }

  // The directions answered (counting answers) since answeredSince (ms), as rows { phrase_id, direction }.
  function listPhraseDirectionsAnsweredSince(answeredSince) {
    return selectAnsweredDirectionsSinceStatement.all({ answeredSince });
  }

  // timestamp: ms of a practice reset. Every answer that still counts stops counting, as the review logs do.
  function markPhraseAnswersSuperseded(timestamp) {
    updatePhraseAnswersSupersededStatement.run({ timestamp });
  }

  return Object.freeze({
    listPracticePhrases,
    findPracticePhraseById,
    updatePhraseSchedule,
    countIntroducedOn,
    createPhraseReviewLog,
    findLatestPhraseReviewLogSince,
    updatePhraseReviewLogSecondGrade,
    listPhraseIdsReviewedInSession,
    markPhraseReviewLogsSuperseded,
    findPhraseAnswer,
    createPhraseAnswer,
    listPhraseDirectionsAnsweredSince,
    markPhraseAnswersSuperseded,
  });
}
