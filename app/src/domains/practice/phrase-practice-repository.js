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
  const countIntroducedStatement = database.prepare(`
    SELECT COUNT(*)
    FROM phrases
    WHERE phrases.introduced_on IS NOT NULL
  `).pluck();
  const insertPhraseReviewLogStatement = database.prepare(`
    INSERT INTO phrase_review_logs (phrase_id, session_id, reviewed_at, grade, card_before, card_after)
    VALUES (@phraseId, @sessionId, @reviewedAt, @grade, @cardBefore, @cardAfter)
  `);
  const selectPhraseReviewLogStatement = database.prepare(`
    SELECT phrase_review_logs.id
    FROM phrase_review_logs
    WHERE phrase_review_logs.session_id = @sessionId AND phrase_review_logs.phrase_id = @phraseId
  `);
  const selectReviewedPhraseIdsStatement = database.prepare(`
    SELECT phrase_review_logs.phrase_id
    FROM phrase_review_logs
    WHERE phrase_review_logs.session_id = @sessionId
    ORDER BY phrase_review_logs.phrase_id ASC
  `).pluck();

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

  // Phrases started so far (first graded, still in rotation).
  function countIntroduced() {
    return countIntroducedStatement.get();
  }

  // A second log for the same session and phrase fails on the unique index.
  function createPhraseReviewLog({ phraseId, sessionId, reviewedAt, grade, cardBefore = null, cardAfter }) {
    insertPhraseReviewLogStatement.run({ phraseId, sessionId, reviewedAt, grade, cardBefore, cardAfter });
  }

  function findPhraseReviewLog(sessionId, phraseId) {
    return selectPhraseReviewLogStatement.get({ sessionId, phraseId }) ?? null;
  }

  function listPhraseIdsReviewedInSession(sessionId) {
    return selectReviewedPhraseIdsStatement.all({ sessionId });
  }

  return Object.freeze({
    listPracticePhrases,
    findPracticePhraseById,
    updatePhraseSchedule,
    countIntroducedOn,
    countIntroduced,
    createPhraseReviewLog,
    findPhraseReviewLog,
    listPhraseIdsReviewedInSession,
  });
}
