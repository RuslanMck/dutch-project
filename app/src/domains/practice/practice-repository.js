// SQL for the FSRS practice: settings, card, priority and learning-deck columns of words, review_logs and deck_answers.
// No business rules.
const EMPTY_PRIORITY_COUNTS = Object.freeze({ 1: 0, 2: 0, 3: 0 });
const EMPTY_GRADE_COUNTS = Object.freeze({ again: 0, hard: 0, good: 0 });

const PRACTICE_WORD_SELECT = `
  SELECT v_words.id, v_words.nl, v_words.uk, v_words.article, v_words.kind, v_words.section_code,
    v_words.status, v_words.fsrs_card, v_words.due_at, v_words.introduced_on, v_words.frequency_rank,
    v_words.priority_override, v_words.priority, v_words.error_count, v_words.deck_required_correct,
    v_words.deck_correct_count, v_words.deck_entered_by_lapse
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
  const updateWordScheduleStatement = database.prepare(`
    UPDATE words
    SET fsrs_card = @fsrsCard, due_at = @dueAt, introduced_on = @introducedOn, status = @learningStatus,
      updated_at = @updatedAt
    WHERE words.id = @wordId
  `);
  const updateWordDeckStatement = database.prepare(`
    UPDATE words
    SET deck_required_correct = @requiredCorrect, deck_correct_count = @correctCount,
      deck_entered_by_lapse = @isLapse, due_at = @dueAt,
      status = @learningStatus, updated_at = @updatedAt
    WHERE words.id = @wordId
  `);
  const clearDeckStatement = database.prepare(`
    UPDATE words
    SET deck_required_correct = NULL, deck_correct_count = 0, deck_entered_by_lapse = 0
    WHERE words.deck_required_correct IS NOT NULL
  `);
  const countDeckWordsStatement = database.prepare(`
    SELECT COUNT(*)
    FROM words
    WHERE words.deck_required_correct IS NOT NULL
  `).pluck();
  const countDeckWordsEnteredAsNewStatement = database.prepare(`
    SELECT COUNT(*)
    FROM words
    WHERE words.deck_required_correct IS NOT NULL AND words.deck_entered_by_lapse = 0
  `).pluck();
  const insertDeckAnswerStatement = database.prepare(`
    INSERT INTO deck_answers (word_id, session_id, answered_at, grade, is_first_in_session, required_correct_after,
      correct_count_after)
    VALUES (@wordId, @sessionId, @answeredAt, @grade, @isFirstInSession, @requiredCorrectAfter, @correctCountAfter)
  `);
  const updateDeckAnswersSupersededStatement = database.prepare(`
    UPDATE deck_answers
    SET superseded_at = @timestamp
    WHERE deck_answers.superseded_at IS NULL
  `);
  // Every answer that still counts, oldest first: the first answers from review_logs (with whether the word was New
  // before it) and the repeats from deck_answers. The deck rebuild replays them.
  const selectCountingAnswersStatement = database.prepare(`
    SELECT review_logs.word_id, review_logs.grade, review_logs.reviewed_at AS answered_at,
      review_logs.card_before IS NULL AS was_new
    FROM review_logs
    WHERE review_logs.superseded_at IS NULL
    UNION ALL
    SELECT deck_answers.word_id, deck_answers.grade, deck_answers.answered_at, 0 AS was_new
    FROM deck_answers
    WHERE deck_answers.superseded_at IS NULL AND deck_answers.is_first_in_session = 0
    ORDER BY answered_at ASC
  `);
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
    WHERE words.due_at < @beforeTimestamp AND words.deck_required_correct IS NULL
    ORDER BY words.due_at ASC, words.id ASC
  `).pluck();
  const countWordsDueBeforeStatement = database.prepare(`
    SELECT COUNT(*)
    FROM words
    WHERE words.due_at < @beforeTimestamp AND words.deck_required_correct IS NULL
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
    WHERE words.deck_required_correct IS NOT NULL
    ORDER BY first_deck_answers.first_answer_id ASC, words.id ASC
  `).pluck();
  const selectIntroducedOnCountsStatement = database.prepare(`
    SELECT words.priority, COUNT(*) AS word_count
    FROM words
    WHERE words.introduced_on = @calendarDate
    GROUP BY words.priority
  `);
  // Each word with a card whose latest review log is again or hard, with that log. recency_rank 1 is the latest log.
  const selectStrugglingWordRowsStatement = database.prepare(`
    SELECT v_words.id, v_words.nl, v_words.uk, v_words.article, v_words.kind, v_words.fsrs_card, v_words.priority,
      v_words.error_count, latest_review_logs.grade AS last_grade,
      latest_review_logs.reviewed_at AS last_reviewed_at
    FROM v_words
    JOIN (
      SELECT review_logs.word_id, review_logs.grade, review_logs.reviewed_at,
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
    INSERT INTO review_logs (word_id, session_id, reviewed_at, grade, answer, card_before, card_after)
    VALUES (@wordId, @sessionId, @reviewedAt, @grade, @answer, @cardBefore, @cardAfter)
  `);
  // Only logs that still count are looked up: a practice reset supersedes the logs before it.
  const selectReviewLogStatement = database.prepare(`
    SELECT review_logs.id, review_logs.word_id, review_logs.session_id, review_logs.reviewed_at,
      review_logs.grade, review_logs.answer, review_logs.card_before, review_logs.card_after
    FROM review_logs
    WHERE review_logs.session_id = @sessionId AND review_logs.word_id = @wordId
      AND review_logs.superseded_at IS NULL
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
  const selectFirstGradeCountsStatement = database.prepare(`
    SELECT review_logs.grade, COUNT(*) AS grade_count
    FROM review_logs
    WHERE review_logs.reviewed_at >= @timestamp
    GROUP BY review_logs.grade
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
  // deckPosition: { requiredCorrect, correctCount } or null (out of the deck). dueAt and learningStatus are written
  // with it, because the deck decides when a word comes back.
  function updateWordDeck(wordId, { deckPosition, dueAt, learningStatus, updatedAt }) {
    updateWordDeckStatement.run({
      wordId,
      requiredCorrect: deckPosition?.requiredCorrect ?? null,
      correctCount: deckPosition?.correctCount ?? 0,
      isLapse: deckPosition?.isLapse ? 1 : 0,
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

  // deckPositionAfter: the position after the answer, or null.
  function createDeckAnswer({ wordId, sessionId, answeredAt, grade, isFirstInSession, deckPositionAfter }) {
    insertDeckAnswerStatement.run({
      wordId,
      sessionId,
      answeredAt,
      grade,
      isFirstInSession: isFirstInSession ? 1 : 0,
      requiredCorrectAfter: deckPositionAfter?.requiredCorrect ?? null,
      correctCountAfter: deckPositionAfter?.correctCount ?? 0,
    });
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

  // Returns the new review log's id.
  function createReviewLog({ wordId, sessionId, reviewedAt, grade, answer = null, cardBefore = null, cardAfter }) {
    const insertResult = insertReviewLogStatement.run({
      wordId,
      sessionId,
      reviewedAt,
      grade,
      answer,
      cardBefore,
      cardAfter,
    });
    return Number(insertResult.lastInsertRowid);
  }

  // The log that still counts for the word in the session, or null.
  function findReviewLog({ sessionId, wordId }) {
    return selectReviewLogStatement.get({ sessionId, wordId }) ?? null;
  }

  // Word ids graded in the session by logs that still count.
  function listWordIdsReviewedInSession({ sessionId }) {
    return selectReviewedWordIdsStatement.all({ sessionId });
  }

  // timestamp: ms of a practice reset. Every log that still counts stops counting; the logs stay as history.
  function markReviewLogsSuperseded(timestamp) {
    updateReviewLogsSupersededStatement.run({ timestamp });
  }

  // Counts review logs (each one is a first grade) with reviewed_at >= timestamp. Every grade is present.
  function countFirstGradesSince(timestamp) {
    const countRows = selectFirstGradeCountsStatement.all({ timestamp });
    return {
      ...EMPTY_GRADE_COUNTS,
      ...Object.fromEntries(countRows.map(countRow => [countRow.grade, countRow.grade_count])),
    };
  }

  return Object.freeze({
    listSettings,
    saveSetting,
    listPracticeWords,
    findPracticeWordById,
    listStrugglingWordRows,
    updateWordSchedule,
    updateWordDeck,
    clearDeck,
    countDeckWords,
    countDeckWordsEnteredAsNew,
    createDeckAnswer,
    markDeckAnswersSuperseded,
    listCountingAnswers,
    listDeckWordIds,
    updateWordPriority,
    updateWordFrequencyRank,
    listDueWordIds,
    countWordsDueBefore,
    countIntroducedOnByPriority,
    createReviewLog,
    findReviewLog,
    listWordIdsReviewedInSession,
    markReviewLogsSuperseded,
    countFirstGradesSince,
  });
}
