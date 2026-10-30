-- Drill answers: one row per checked answer in a custom drill (round-summary drills, decks, the Важкі слова drill).
-- A separate log that the schedule never reads: it only feeds the statistics. source: round | deck | struggling |
-- custom. Deleting a word deletes its drill answers.
CREATE TABLE drill_answers (
  id           INTEGER PRIMARY KEY,
  word_id      INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  direction    TEXT NOT NULL CHECK (direction IN ('uk_nl', 'nl_uk')),
  is_correct   INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  answer       TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL,
  answered_at  INTEGER NOT NULL
);
CREATE INDEX index_drill_answers_on_answered_at ON drill_answers(answered_at);
CREATE INDEX index_drill_answers_on_word_id ON drill_answers(word_id);
