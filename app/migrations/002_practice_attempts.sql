-- Every practice answer, right or wrong (handoff 3.2)
CREATE TABLE practice_attempts (
  id      INTEGER PRIMARY KEY,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  at      INTEGER NOT NULL,
  mode    TEXT NOT NULL CHECK (mode IN ('translate','article')),
  answer  TEXT,
  correct INTEGER NOT NULL CHECK (correct IN (0,1))
);
CREATE INDEX idx_attempts_word ON practice_attempts(word_id);
