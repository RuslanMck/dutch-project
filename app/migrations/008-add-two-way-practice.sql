-- Two-way practice: every card is practised in two rounds, uk_nl (the Ukrainian is shown, the Dutch is answered) and
-- then nl_uk (the Dutch is shown, the Ukrainian is answered). The existing deck columns are the uk_nl direction; the
-- deck_reverse_* columns are the nl_uk direction. A word is learned when neither direction is in the deck.
ALTER TABLE words ADD COLUMN deck_reverse_required_correct INTEGER
  CHECK (deck_reverse_required_correct BETWEEN 2 AND 6);      -- NULL = nl_uk not in the deck
ALTER TABLE words ADD COLUMN deck_reverse_correct_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE words ADD COLUMN deck_reverse_entered_by_lapse INTEGER NOT NULL DEFAULT 0
  CHECK (deck_reverse_entered_by_lapse IN (0, 1));
CREATE INDEX index_words_on_deck_reverse_required_correct ON words(deck_reverse_required_correct);

-- Words being learned now as New words learn the nl_uk direction too. Learned words are only checked in it.
UPDATE words
SET deck_reverse_required_correct = 2, deck_reverse_correct_count = 0, deck_reverse_entered_by_lapse = 0
WHERE deck_required_correct IS NOT NULL AND deck_entered_by_lapse = 0;

ALTER TABLE deck_answers ADD COLUMN direction TEXT NOT NULL DEFAULT 'uk_nl'
  CHECK (direction IN ('uk_nl', 'nl_uk'));
CREATE INDEX index_deck_answers_on_session_id_and_word_id ON deck_answers(session_id, word_id);

-- A review log is the session's one FSRS grade of a word. direction is the direction of the answer that created it
-- (grade); second_grade is the first answer in the other direction in the same session (NULL = none yet). The card
-- after is graded with the worse of the two.
ALTER TABLE review_logs ADD COLUMN direction TEXT NOT NULL DEFAULT 'uk_nl'
  CHECK (direction IN ('uk_nl', 'nl_uk'));
ALTER TABLE review_logs ADD COLUMN second_grade TEXT
  CHECK (second_grade IN ('again', 'hard', 'good'));
ALTER TABLE phrase_review_logs ADD COLUMN direction TEXT NOT NULL DEFAULT 'uk_nl'
  CHECK (direction IN ('uk_nl', 'nl_uk'));
ALTER TABLE phrase_review_logs ADD COLUMN second_grade TEXT
  CHECK (second_grade IN ('again', 'hard', 'good'));

-- A phrase's first grade in each direction of a session. A phrase is graded by the learner once per direction and
-- session; repeats are not posted.
CREATE TABLE phrase_answers (
  id             INTEGER PRIMARY KEY,
  phrase_id      INTEGER NOT NULL REFERENCES phrases(id) ON DELETE CASCADE,
  session_id     TEXT NOT NULL,
  direction      TEXT NOT NULL CHECK (direction IN ('uk_nl', 'nl_uk')),
  answered_at    INTEGER NOT NULL,
  grade          TEXT NOT NULL CHECK (grade IN ('again', 'hard', 'good')),
  superseded_at  INTEGER                              -- NULL = counts; a practice reset sets it
);
CREATE UNIQUE INDEX unique_index_phrase_answers_on_session_phrase_direction
  ON phrase_answers(session_id, phrase_id, direction) WHERE superseded_at IS NULL;
CREATE INDEX index_phrase_answers_on_phrase_id ON phrase_answers(phrase_id);

-- The phrase grades so far were given in one direction; they count as uk_nl.
INSERT INTO phrase_answers (phrase_id, session_id, direction, answered_at, grade, superseded_at)
SELECT phrase_review_logs.phrase_id, phrase_review_logs.session_id, 'uk_nl', phrase_review_logs.reviewed_at,
  phrase_review_logs.grade, phrase_review_logs.superseded_at
FROM phrase_review_logs;

-- A word's FSRS grade is now found by day (its review log of today, from any session), not by session, so a session
-- id used again on a later day (an MCP client may keep one) grades the word again. The unique index on (session, word)
-- would refuse that log; it becomes a plain index.
DROP INDEX unique_index_review_logs_on_session_id_and_word_id;
CREATE INDEX index_review_logs_on_session_id_and_word_id ON review_logs(session_id, word_id);
