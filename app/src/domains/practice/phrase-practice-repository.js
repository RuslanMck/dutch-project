// SQL for the FSRS practice of phrases: the card, due, introduction and status columns of phrases, and
// phrase_review_logs. No business rules.
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
    INSERT INTO phrase_review_logs (phrase_id, session_id, reviewed_at, grade, card_before, card_after)
    VALUES (@phraseId, @sessionId, @reviewedAt, @grade, @cardBefore, @cardAfter)
  `);
  // Only logs that still count are looked up: a practice reset supersedes the logs before it.
  const selectPhraseReviewLogStatement = database.prepare(`
    SELECT phrase_review_logs.id
    FROM phrase_review_logs
    WHERE phrase_review_logs.session_id = @sessionId AND phrase_review_logs.phrase_id = @phraseId
      AND phrase_review_logs.superseded_at IS NULL
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

  function createPhraseReviewLog({ phraseId, sessionId, reviewedAt, grade, cardBefore = null, cardAfter }) {
    insertPhraseReviewLogStatement.run({ phraseId, sessionId, reviewedAt, grade, cardBefore, cardAfter });
  }

  // The log that still counts for the phrase in the session, or null.
  function findPhraseReviewLog({ sessionId, phraseId }) {
    return selectPhraseReviewLogStatement.get({ sessionId, phraseId }) ?? null;
  }

  // Phrase ids graded in the session by logs that still count.
  function listPhraseIdsReviewedInSession({ sessionId }) {
    return selectReviewedPhraseIdsStatement.all({ sessionId });
  }

  // timestamp: ms of a practice reset. Every log that still counts stops counting; the logs stay as history.
  function markPhraseReviewLogsSuperseded(timestamp) {
    updatePhraseReviewLogsSupersededStatement.run({ timestamp });
  }

  return Object.freeze({
    listPracticePhrases,
    findPracticePhraseById,
    updatePhraseSchedule,
    countIntroducedOn,
    createPhraseReviewLog,
    findPhraseReviewLog,
    listPhraseIdsReviewedInSession,
    markPhraseReviewLogsSuperseded,
  });
}
