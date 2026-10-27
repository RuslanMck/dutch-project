-- The learning deck: words being learned, at most new_per_day of them (lapses can add more). A word in the deck comes
-- back every day until it is answered right deck_required_correct times in a row; then it is learned and leaves the
-- deck for its FSRS schedule. Every answer counts, repeats in a session too, so each one is kept in deck_answers.
ALTER TABLE words ADD COLUMN deck_required_correct INTEGER
  CHECK (deck_required_correct BETWEEN 2 AND 6);              -- NULL = not in the deck
ALTER TABLE words ADD COLUMN deck_correct_streak INTEGER NOT NULL DEFAULT 0;  -- right answers in a row in the deck
CREATE INDEX index_words_on_deck_required_correct ON words(deck_required_correct);

CREATE TABLE deck_answers (
  id                      INTEGER PRIMARY KEY,
  word_id                 INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  session_id              TEXT NOT NULL,
  answered_at             INTEGER NOT NULL,
  grade                   TEXT NOT NULL CHECK (grade IN ('again', 'hard', 'good')),
  is_first_in_session     INTEGER NOT NULL CHECK (is_first_in_session IN (0, 1)),  -- 1 = also graded by FSRS
  required_correct_after  INTEGER,                    -- NULL = not in the deck after this answer (learned or outside)
  correct_streak_after    INTEGER NOT NULL,
  superseded_at           INTEGER                     -- NULL = counts; a practice reset sets it
);
CREATE INDEX index_deck_answers_on_word_id ON deck_answers(word_id);
CREATE INDEX index_deck_answers_on_session_id ON deck_answers(session_id);
