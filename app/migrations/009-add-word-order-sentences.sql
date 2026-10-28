-- Word-order exercise: stored Dutch sentences (each shown as its tiles in a shuffled pile) and one row per answer.
-- nl_key is the normalized Dutch sentence (lower case, single spaces, no edge punctuation); a repeat is skipped.
CREATE TABLE order_sentences (
  id         INTEGER PRIMARY KEY,
  nl         TEXT NOT NULL,
  uk         TEXT NOT NULL,
  rule       TEXT CHECK (rule IN ('v2','inversion','question','modal','separable','negation','subordinate','perfect')),
  source     TEXT NOT NULL CHECK (source IN ('mcp','import','openrouter')),
  nl_key     TEXT NOT NULL UNIQUE,
  added_at   INTEGER NOT NULL
);

-- answer is the tiles the learner put in the answer line, joined by one space.
CREATE TABLE order_sentence_answers (
  id           INTEGER PRIMARY KEY,
  sentence_id  INTEGER NOT NULL REFERENCES order_sentences(id) ON DELETE CASCADE,
  answered_at  INTEGER NOT NULL,
  is_correct   INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  answer       TEXT NOT NULL
);
CREATE INDEX index_order_sentence_answers_on_sentence_id ON order_sentence_answers(sentence_id, answered_at);
