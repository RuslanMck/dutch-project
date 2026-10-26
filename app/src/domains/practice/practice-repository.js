// SQL for the FSRS practice: settings, card and priority columns of words, and review_logs. No business rules.
const EMPTY_PRIORITY_COUNTS = Object.freeze({ 1: 0, 2: 0, 3: 0 });
const EMPTY_GRADE_COUNTS = Object.freeze({ again: 0, hard: 0, good: 0 });

const PRACTICE_WORD_SELECT = `
  SELECT v_words.id, v_words.nl, v_words.uk, v_words.article, v_words.kind, v_words.section_code,
    v_words.status, v_words.fsrs_card, v_words.due_at, v_words.introduced_on, v_words.frequency_rank,
    v_words.priority_override, v_words.priority, v_words.error_count
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
  const selectDueWordIdsStatement = database.prepare(`
    SELECT words.id
    FROM words
    WHERE words.due_at < @beforeTimestamp
    ORDER BY words.due_at ASC, words.id ASC
  `).pluck();
  const countWordsDueBeforeStatement = database.prepare(`
    SELECT COUNT(*)
    FROM words
    WHERE words.due_at < @beforeTimestamp
  `).pluck();
  const selectIntroducedOnCountsStatement = database.prepare(`
    SELECT words.priority, COUNT(*) AS word_count
    FROM words
    WHERE words.introduced_on = @calendarDate
    GROUP BY words.priority
  `);
  const selectIntroducedCountsStatement = database.prepare(`
    SELECT words.priority, COUNT(*) AS word_count
    FROM words
    WHERE words.introduced_on IS NOT NULL
    GROUP BY words.priority
  `);
  const insertReviewLogStatement = database.prepare(`
    INSERT INTO review_logs (word_id, session_id, reviewed_at, grade, answer, card_before, card_after)
    VALUES (@wordId, @sessionId, @reviewedAt, @grade, @answer, @cardBefore, @cardAfter)
  `);
  const selectReviewLogStatement = database.prepare(`
    SELECT review_logs.id, review_logs.word_id, review_logs.session_id, review_logs.reviewed_at,
      review_logs.grade, review_logs.answer, review_logs.card_before, review_logs.card_after
    FROM review_logs
    WHERE review_logs.session_id = @sessionId AND review_logs.word_id = @wordId
  `);
  const selectReviewedWordIdsStatement = database.prepare(`
    SELECT review_logs.word_id
    FROM review_logs
    WHERE review_logs.session_id = @sessionId
    ORDER BY review_logs.word_id ASC
  `).pluck();
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

  // Words started so far (first graded, still in rotation), by priority; every priority is present, zero when none.
  function countIntroducedByPriority() {
    const countRows = selectIntroducedCountsStatement.all();
    return {
      ...EMPTY_PRIORITY_COUNTS,
      ...Object.fromEntries(countRows.map(countRow => [countRow.priority, countRow.word_count])),
    };
  }

  // Returns the new review log's id. A second log for the same session and word fails on the unique index.
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

  function findReviewLog(sessionId, wordId) {
    return selectReviewLogStatement.get({ sessionId, wordId }) ?? null;
  }

  function listWordIdsReviewedInSession(sessionId) {
    return selectReviewedWordIdsStatement.all({ sessionId });
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
    updateWordSchedule,
    updateWordPriority,
    updateWordFrequencyRank,
    listDueWordIds,
    countWordsDueBefore,
    countIntroducedOnByPriority,
    countIntroducedByPriority,
    createReviewLog,
    findReviewLog,
    listWordIdsReviewedInSession,
    countFirstGradesSince,
  });
}
