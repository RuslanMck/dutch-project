// SQL for the FSRS practice: settings, card, priority and learning-deck columns of words, review_logs and deck_answers.
// No business rules. A word is in the deck when either direction is (uk_nl: deck_required_correct, nl_uk:
// deck_reverse_required_correct).
const EMPTY_PRIORITY_COUNTS = Object.freeze({ 1: 0, 2: 0, 3: 0 });
const EMPTY_GRADE_COUNTS = Object.freeze({ again: 0, hard: 0, good: 0 });
const IS_IN_ANY_DECK_SQL = `(words.deck_required_correct IS NOT NULL
    OR words.deck_reverse_required_correct IS NOT NULL)`;
// The grade a review log counts for in its session: the worse of its first grade and its second one (NULL = none yet).
const SESSION_GRADE_SQL = `CASE
    WHEN 'again' IN (review_logs.grade, review_logs.second_grade) THEN 'again'
    WHEN 'hard' IN (review_logs.grade, review_logs.second_grade) THEN 'hard'
    ELSE 'good'
  END`;

const PRACTICE_WORD_SELECT = `
  SELECT v_words.id, v_words.nl, v_words.uk, v_words.article, v_words.kind, v_words.section_code,
    v_words.status, v_words.fsrs_card, v_words.due_at, v_words.introduced_on, v_words.frequency_rank,
    v_words.priority_override, v_words.priority, v_words.error_count, v_words.deck_required_correct,
    v_words.deck_correct_count, v_words.deck_entered_by_lapse, v_words.deck_reverse_required_correct,
    v_words.deck_reverse_correct_count, v_words.deck_reverse_entered_by_lapse
  FROM v_words
`;

export function createPracticeRepository({ database }) {
  const selectSettingsStatement = database.prepare(`
    SELECT practice_settings.name, practice_settings.value
    FROM practice_settings
  `);
  const upsertSettingStatement = database.prepare(`
    INSERT INTO practice_settings (name, value)
    VALUES (@name, @value)
    ON CONFLICT (name) DO UPDATE SET value = @value
  `);
  const selectPracticeWordsStatement = database.prepare(`${PRACTICE_WORD_SELECT} ORDER BY v_words.id ASC`);
  const selectPracticeWordByIdStatement = database.prepare(`${PRACTICE_WORD_SELECT} WHERE v_words.id = @wordId`);
  const selectPracticeWordsByIdsStatement = database.prepare(`
    ${PRACTICE_WORD_SELECT}
    WHERE v_words.id IN (SELECT json_each.value FROM json_each(@wordIdsJson))
  `);
  const updateWordScheduleStatement = database.prepare(`
    UPDATE words
    SET fsrs_card = @fsrsCard, due_at = @dueAt, introduced_on = @introducedOn, status = @learningStatus,
      updated_at = @updatedAt
    WHERE words.id = @wordId
  `);
  const updateWordDeckStatement = database.prepare(`
    UPDATE words
    SET deck_required_correct = @requiredCorrect, deck_correct_count = @correctCount,
      deck_entered_by_lapse = @isLapse, deck_reverse_required_correct = @reverseRequiredCorrect,
      deck_reverse_correct_count = @reverseCorrectCount, deck_reverse_entered_by_lapse = @reverseIsLapse,
      due_at = @dueAt, status = @learningStatus, updated_at = @updatedAt
    WHERE words.id = @wordId
  `);
  const clearDeckStatement = database.prepare(`
    UPDATE words
    SET deck_required_correct = NULL, deck_correct_count = 0, deck_entered_by_lapse = 0,
      deck_reverse_required_correct = NULL, deck_reverse_correct_count = 0, deck_reverse_entered_by_lapse = 0
    WHERE ${IS_IN_ANY_DECK_SQL}
  `);
  const countDeckWordsStatement = database.prepare(`
    SELECT COUNT(*)
    FROM words
    WHERE ${IS_IN_ANY_DECK_SQL}
  `).pluck();
  // Words in the deck with a direction that entered as a New word (not by a lapse).
  const countDeckWordsEnteredAsNewStatement = database.prepare(`
    SELECT COUNT(*)
    FROM words
    WHERE (words.deck_required_correct IS NOT NULL AND words.deck_entered_by_lapse = 0)
      OR (words.deck_reverse_required_correct IS NOT NULL AND words.deck_reverse_entered_by_lapse = 0)
  `).pluck();
  const insertDrillAnswerStatement = database.prepare(`
    INSERT INTO drill_answers (word_id, direction, is_correct, answer, source, answered_at)
    VALUES (@wordId, @direction, @isCorrect, @answer, @source, @answeredAt)
  `);
  const insertDeckAnswerStatement = database.prepare(`
    INSERT INTO deck_answers (word_id, session_id, direction, answered_at, grade, is_first_in_session,
      required_correct_after, correct_count_after)
    VALUES (@wordId, @sessionId, @direction, @answeredAt, @grade, @isFirstInSession, @requiredCorrectAfter,
      @correctCountAfter)
  `);
  // The directions in which each of the words has a counting answer since sinceTimestamp (ms).
  const selectAnsweredDirectionsStatement = database.prepare(`
    SELECT DISTINCT deck_answers.word_id, deck_answers.direction
    FROM deck_answers
    WHERE deck_answers.superseded_at IS NULL AND deck_answers.answered_at >= @sinceTimestamp
      AND deck_answers.word_id IN (SELECT json_each.value FROM json_each(@wordIdsJson))
  `);
  const updateDeckAnswersSupersededStatement = database.prepare(`
    UPDATE deck_answers
    SET superseded_at = @timestamp
    WHERE deck_answers.superseded_at IS NULL
  `);
  // Every uk_nl answer that still counts, oldest first: the first answers from review_logs (with whether the word was
  // New before it) and the uk_nl repeats from deck_answers. The deck rebuild replays them; nl_uk stays as stored.
  const selectCountingAnswersStatement = database.prepare(`
    SELECT review_logs.word_id, review_logs.grade, review_logs.reviewed_at AS answered_at,
      review_logs.card_before IS NULL AS was_new
    FROM review_logs
    WHERE review_logs.superseded_at IS NULL AND review_logs.direction = 'uk_nl'
    UNION ALL
    SELECT deck_answers.word_id, deck_answers.grade, deck_answers.answered_at, 0 AS was_new
    FROM deck_answers
    WHERE deck_answers.superseded_at IS NULL AND deck_answers.is_first_in_session = 0
      AND deck_answers.direction = 'uk_nl'
    ORDER BY answered_at ASC
  `);
  // The answers that still count for the given words, oldest first: the round summary reads them.
  const selectDeckAnswersForWordsStatement = database.prepare(`
    SELECT deck_answers.word_id, deck_answers.session_id, deck_answers.direction, deck_answers.grade,
      deck_answers.answered_at, deck_answers.required_correct_after
    FROM deck_answers
    WHERE deck_answers.superseded_at IS NULL
      AND deck_answers.word_id IN (SELECT json_each.value FROM json_each(@wordIdsJson))
    ORDER BY deck_answers.answered_at ASC, deck_answers.id ASC
  `);
  // The time of every word and phrase answer in a span, oldest first: the round summary's time spent.
  const selectAnswerTimesBetweenStatement = database.prepare(`
    SELECT deck_answers.answered_at FROM deck_answers
    WHERE deck_answers.answered_at BETWEEN @startedAt AND @finishedAt
    UNION ALL
    SELECT phrase_review_logs.reviewed_at FROM phrase_review_logs
    WHERE phrase_review_logs.reviewed_at BETWEEN @startedAt AND @finishedAt
    ORDER BY 1 ASC
  `).pluck();
  const updateWordPriorityStatement = database.prepare(`
    UPDATE words
    SET priority = @priority
    WHERE words.id = @wordId
  `);
  const updateWordPriorityAndOverrideStatement = database.prepare(`
    UPDATE words
    SET priority = @priority, priority_override = @priorityOverride
    WHERE words.id = @wordId
  `);
  const updateWordFrequencyRankStatement = database.prepare(`
    UPDATE words
    SET frequency_rank = @frequencyRank
    WHERE words.id = @wordId
  `);
  // Due reviews: words outside the learning deck. The deck's words are in the session whatever their due time.
  const selectDueWordIdsStatement = database.prepare(`
    SELECT words.id
    FROM words
    WHERE words.due_at < @beforeTimestamp AND NOT ${IS_IN_ANY_DECK_SQL}
    ORDER BY words.due_at ASC, words.id ASC
  `).pluck();
  const countWordsDueBeforeStatement = database.prepare(`
    SELECT COUNT(*)
    FROM words
    WHERE words.due_at < @beforeTimestamp AND NOT ${IS_IN_ANY_DECK_SQL}
  `).pluck();
  // The words of the current session, the ones that entered the deck first coming first.
  const selectDeckWordIdsStatement = database.prepare(`
    SELECT words.id
    FROM words
    LEFT JOIN (
      SELECT deck_answers.word_id, MIN(deck_answers.id) AS first_answer_id
      FROM deck_answers
      GROUP BY deck_answers.word_id
    ) AS first_deck_answers ON first_deck_answers.word_id = words.id
    WHERE ${IS_IN_ANY_DECK_SQL}
    ORDER BY first_deck_answers.first_answer_id ASC, words.id ASC
  `).pluck();
  const selectIntroducedOnCountsStatement = database.prepare(`
    SELECT words.priority, COUNT(*) AS word_count
    FROM words
    WHERE words.introduced_on = @calendarDate
    GROUP BY words.priority
  `);
  // Each word with a card whose latest review log counts as again or hard (its session grade, see SESSION_GRADE_SQL),
  // with that log. recency_rank 1 is the latest log.
  const selectStrugglingWordRowsStatement = database.prepare(`
    SELECT v_words.id, v_words.nl, v_words.uk, v_words.article, v_words.kind, v_words.fsrs_card, v_words.priority,
      v_words.error_count, latest_review_logs.grade AS last_grade,
      latest_review_logs.reviewed_at AS last_reviewed_at
    FROM v_words
    JOIN (
      SELECT review_logs.word_id, ${SESSION_GRADE_SQL} AS grade, review_logs.reviewed_at,
        ROW_NUMBER() OVER (
          PARTITION BY review_logs.word_id
          ORDER BY review_logs.reviewed_at DESC, review_logs.id DESC
        ) AS recency_rank
      FROM review_logs
    ) AS latest_review_logs
      ON latest_review_logs.word_id = v_words.id AND latest_review_logs.recency_rank = 1
    WHERE v_words.fsrs_card IS NOT NULL AND latest_review_logs.grade IN ('again', 'hard')
    ORDER BY v_words.error_count DESC, latest_review_logs.reviewed_at DESC, v_words.id ASC
  `);
  const insertReviewLogStatement = database.prepare(`
    INSERT INTO review_logs (word_id, session_id, reviewed_at, grade, direction, answer, card_before, card_after)
    VALUES (@wordId, @sessionId, @reviewedAt, @grade, @direction, @answer, @cardBefore, @cardAfter)
  `);
  // The first answer's review log in the other direction: its second grade and the card graded with the worse grade.
  const updateReviewLogSecondGradeStatement = database.prepare(`
    UPDATE review_logs
    SET second_grade = @secondGrade, card_after = @cardAfter
    WHERE review_logs.id = @reviewLogId
  `);
  // The word's latest log that still counts and was reviewed since sinceTimestamp (ms): the review log of the day. A
  // practice reset supersedes the logs before it.
  const selectLatestReviewLogSinceStatement = database.prepare(`
    SELECT review_logs.id, review_logs.word_id, review_logs.session_id, review_logs.reviewed_at,
      review_logs.grade, review_logs.direction, review_logs.second_grade, review_logs.answer,
      review_logs.card_before, review_logs.card_after
    FROM review_logs
    WHERE review_logs.word_id = @wordId AND review_logs.reviewed_at >= @sinceTimestamp
      AND review_logs.superseded_at IS NULL
    ORDER BY review_logs.reviewed_at DESC, review_logs.id DESC
    LIMIT 1
  `);
  const selectReviewedWordIdsStatement = database.prepare(`
    SELECT review_logs.word_id
    FROM review_logs
    WHERE review_logs.session_id = @sessionId AND review_logs.superseded_at IS NULL
    ORDER BY review_logs.word_id ASC
  `).pluck();
  const updateReviewLogsSupersededStatement = database.prepare(`
    UPDATE review_logs
    SET superseded_at = @timestamp
    WHERE review_logs.superseded_at IS NULL
  `);
  // Counts the review logs (one per word and session) by their session grade, since timestamp.
  const selectFirstGradeCountsStatement = database.prepare(`
    SELECT ${SESSION_GRADE_SQL} AS session_grade, COUNT(*) AS grade_count
    FROM review_logs
    WHERE review_logs.reviewed_at >= @timestamp
    GROUP BY session_grade
  `);

  // Returns { name: parsedValue } for every setting.
  function listSettings() {
    return Object.fromEntries(selectSettingsStatement.all()
      .map(settingRow => [settingRow.name, JSON.parse(settingRow.value)]));
  }

  // value is any JSON-serializable value; it is stored as text.
  function saveSetting(name, value) {
    upsertSettingStatement.run({ name, value: JSON.stringify(value) });
  }

  function listPracticeWords() {
    return selectPracticeWordsStatement.all();
  }

  function findPracticeWordById(wordId) {
    return selectPracticeWordByIdStatement.get({ wordId }) ?? null;
  }

  // The practice words with these ids, in one query (the order is not defined; the caller sorts).
  function findPracticeWordsByIds(wordIds) {
    return selectPracticeWordsByIdsStatement.all({ wordIdsJson: JSON.stringify(wordIds) });
  }

  // The words in rotation whose latest graded answer was again or hard, most errors first, then the latest review
  // first. Each row also carries last_grade and last_reviewed_at (ms).
  function listStrugglingWordRows() {
    return selectStrugglingWordRowsStatement.all();
  }

  // fsrsCard: the card as a JSON string (null = state New). dueAt and introducedOn are null for New words.
  function updateWordSchedule(wordId, { fsrsCard, dueAt, introducedOn, learningStatus, updatedAt }) {
    updateWordScheduleStatement.run({
      wordId,
      fsrsCard: fsrsCard ?? null,
      dueAt: dueAt ?? null,
      introducedOn: introducedOn ?? null,
      learningStatus,
      updatedAt,
    });
  }

  // priorityOverride undefined leaves the override as it is; null clears it.
  // deckPositions: { uk_nl, nl_uk }, each { requiredCorrect, correctCount, isLapse } or null (out of that deck).
  // dueAt and learningStatus are written with it, because the deck decides when a word comes back.
  function updateWordDeck(wordId, { deckPositions, dueAt, learningStatus, updatedAt }) {
    const ukPosition = deckPositions.uk_nl;
    const reversePosition = deckPositions.nl_uk;
    updateWordDeckStatement.run({
      wordId,
      requiredCorrect: ukPosition?.requiredCorrect ?? null,
      correctCount: ukPosition?.correctCount ?? 0,
      isLapse: ukPosition?.isLapse ? 1 : 0,
      reverseRequiredCorrect: reversePosition?.requiredCorrect ?? null,
      reverseCorrectCount: reversePosition?.correctCount ?? 0,
      reverseIsLapse: reversePosition?.isLapse ? 1 : 0,
      dueAt,
      learningStatus,
      updatedAt,
    });
  }

  function clearDeck() {
    clearDeckStatement.run();
  }

  function countDeckWords() {
    return countDeckWordsStatement.get();
  }

  // The deck's words that entered as New words: the session's new words not learned yet.
  function countDeckWordsEnteredAsNew() {
    return countDeckWordsEnteredAsNewStatement.get();
  }

  // One checked answer of a custom drill; returns its id. The schedule never reads drill_answers.
  function createDrillAnswer({ wordId, direction, isCorrect, answer, source, answeredAt }) {
    const insertResult = insertDrillAnswerStatement.run({
      wordId, direction, isCorrect: isCorrect ? 1 : 0, answer, source, answeredAt,
    });
    return Number(insertResult.lastInsertRowid);
  }

  // direction: 'uk_nl' or 'nl_uk'. deckPositionAfter: the position in that direction after the answer, or null.
  function createDeckAnswer({ wordId, sessionId, direction, answeredAt, grade, isFirstInSession, deckPositionAfter }) {
    insertDeckAnswerStatement.run({
      wordId,
      sessionId,
      direction,
      answeredAt,
      grade,
      isFirstInSession: isFirstInSession ? 1 : 0,
      requiredCorrectAfter: deckPositionAfter?.requiredCorrect ?? null,
      correctCountAfter: deckPositionAfter?.correctCount ?? 0,
    });
  }

  // The { word_id, direction } pairs with a counting deck answer since sinceTimestamp (ms), for the given words.
  function listAnsweredDirectionsSince({ wordIds, sinceTimestamp }) {
    return selectAnsweredDirectionsStatement.all({ wordIdsJson: JSON.stringify(wordIds), sinceTimestamp });
  }

  function markDeckAnswersSuperseded(timestamp) {
    updateDeckAnswersSupersededStatement.run({ timestamp });
  }

  function listCountingAnswers() {
    return selectCountingAnswersStatement.all().map(answer => ({ ...answer, was_new: answer.was_new === 1 }));
  }

  function listDeckWordIds() {
    return selectDeckWordIdsStatement.all();
  }

  function listAnswerTimesBetween({ startedAt, finishedAt }) {
    return selectAnswerTimesBetweenStatement.all({ startedAt, finishedAt });
  }

  function listDeckAnswersForWords(wordIds) {
    return selectDeckAnswersForWordsStatement.all({ wordIdsJson: JSON.stringify(wordIds) });
  }

  function updateWordPriority(wordId, { priority, priorityOverride }) {
    if (priorityOverride === undefined) {
      updateWordPriorityStatement.run({ wordId, priority });
      return;
    }
    updateWordPriorityAndOverrideStatement.run({ wordId, priority, priorityOverride: priorityOverride ?? null });
  }

  function updateWordFrequencyRank(wordId, frequencyRank) {
    updateWordFrequencyRankStatement.run({ wordId, frequencyRank: frequencyRank ?? null });
  }

  // Word ids whose due_at is before beforeTimestamp (ms), most overdue first.
  function listDueWordIds(beforeTimestamp) {
    return selectDueWordIdsStatement.all({ beforeTimestamp });
  }

  // Number of words, of any session, whose due_at is before beforeTimestamp (ms): the overdue words.
  function countWordsDueBefore(beforeTimestamp) {
    return countWordsDueBeforeStatement.get({ beforeTimestamp });
  }

  // calendarDate: 'YYYY-MM-DD' in the practice time zone. Every priority is present, zero when none.
  function countIntroducedOnByPriority(calendarDate) {
    const countRows = selectIntroducedOnCountsStatement.all({ calendarDate });
    return {
      ...EMPTY_PRIORITY_COUNTS,
      ...Object.fromEntries(countRows.map(countRow => [countRow.priority, countRow.word_count])),
    };
  }

  // direction: the direction of the answer that created the log (default uk_nl). Returns the new review log's id.
  function createReviewLog({
    wordId, sessionId, reviewedAt, grade, direction = 'uk_nl', answer = null, cardBefore = null, cardAfter,
  }) {
    const insertResult = insertReviewLogStatement.run({
      wordId,
      sessionId,
      reviewedAt,
      grade,
      direction,
      answer,
      cardBefore,
      cardAfter,
    });
    return Number(insertResult.lastInsertRowid);
  }

  // The first answer in the other direction: its grade is the log's second grade, and the card is replaced by the one
  // graded with the worse of the two grades.
  function updateReviewLogSecondGrade({ reviewLogId, secondGrade, cardAfter }) {
    updateReviewLogSecondGradeStatement.run({ reviewLogId, secondGrade, cardAfter });
  }

  // The word's latest log that still counts and was reviewed since sinceTimestamp (ms), or null. Any session counts: a
  // round of the day may be graded in another session (a new tab, a new round, MCP).
  function findLatestReviewLogSince({ wordId, sinceTimestamp }) {
    return selectLatestReviewLogSinceStatement.get({ wordId, sinceTimestamp }) ?? null;
  }

  // Word ids graded in the session by logs that still count.
  function listWordIdsReviewedInSession({ sessionId }) {
    return selectReviewedWordIdsStatement.all({ sessionId });
  }

  // timestamp: ms of a practice reset. Every log that still counts stops counting; the logs stay as history.
  function markReviewLogsSuperseded(timestamp) {
    updateReviewLogsSupersededStatement.run({ timestamp });
  }

  // Counts review logs (one per word and session) by session grade since timestamp. Every grade is present.
  function countFirstGradesSince(timestamp) {
    const countRows = selectFirstGradeCountsStatement.all({ timestamp });
    return {
      ...EMPTY_GRADE_COUNTS,
      ...Object.fromEntries(countRows.map(countRow => [countRow.session_grade, countRow.grade_count])),
    };
  }

  return Object.freeze({
    listSettings,
    saveSetting,
    listPracticeWords,
    findPracticeWordById,
    findPracticeWordsByIds,
    listStrugglingWordRows,
    updateWordSchedule,
    updateWordDeck,
    clearDeck,
    countDeckWords,
    countDeckWordsEnteredAsNew,
    createDeckAnswer,
    createDrillAnswer,
    markDeckAnswersSuperseded,
    listCountingAnswers,
    listDeckWordIds,
    listDeckAnswersForWords,
    listAnsweredDirectionsSince,
    listAnswerTimesBetween,
    updateWordPriority,
    updateWordFrequencyRank,
    listDueWordIds,
    countWordsDueBefore,
    countIntroducedOnByPriority,
    createReviewLog,
    findLatestReviewLogSince,
    updateReviewLogSecondGrade,
    listWordIdsReviewedInSession,
    markReviewLogsSuperseded,
    countFirstGradesSince,
  });
}
