-- FSRS practice for phrases: one card per phrase whichever side is shown, a daily allowance of new phrases and a review
-- log of its own. No word errors and no priorities: phrases are graded by the learner, oldest New phrase first.
--
-- status is a cached derivation of the card, like words.status: the phrase practice service rewrites it after every
-- grade, so it can be recomputed from the card at any time.

ALTER TABLE phrases ADD COLUMN fsrs_card TEXT;         -- ts-fsrs card as JSON; NULL = state New (not in rotation)
ALTER TABLE phrases ADD COLUMN due_at INTEGER;         -- copy of the card's due (ms) for indexed selection; NULL = New
ALTER TABLE phrases ADD COLUMN introduced_on TEXT;     -- YYYY-MM-DD (Amsterdam) the phrase entered rotation; NULL = New
ALTER TABLE phrases ADD COLUMN status TEXT NOT NULL DEFAULT 'new'
  CHECK (status IN ('new', 'learning', 'learned'));     -- cached, see note
CREATE INDEX index_phrases_on_due_at ON phrases(due_at);
CREATE INDEX index_phrases_on_introduced_on ON phrases(introduced_on);

CREATE TABLE phrase_review_logs (
  id           INTEGER PRIMARY KEY,
  phrase_id    INTEGER NOT NULL REFERENCES phrases(id) ON DELETE CASCADE,
  session_id   TEXT NOT NULL,
  reviewed_at  INTEGER NOT NULL,
  grade        TEXT NOT NULL CHECK (grade IN ('again', 'hard', 'good')),
  card_before  TEXT,                                 -- JSON; NULL = the phrase was New
  card_after   TEXT NOT NULL                         -- JSON
);
CREATE UNIQUE INDEX unique_index_phrase_review_logs_on_session_id_and_phrase_id
  ON phrase_review_logs(session_id, phrase_id);
CREATE INDEX index_phrase_review_logs_on_phrase_id ON phrase_review_logs(phrase_id);
CREATE INDEX index_phrase_review_logs_on_reviewed_at ON phrase_review_logs(reviewed_at);

INSERT INTO practice_settings (name, value) VALUES ('phrase_new_per_day', '5');
