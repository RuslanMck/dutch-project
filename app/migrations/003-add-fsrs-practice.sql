-- FSRS practice: a ts-fsrs card per word, the review log, practice settings and the frequency list.
--
-- priority and status are cached derivations, not facts: priority is computed from the override, the chapter and
-- the frequency rank; status is computed from the card. They are kept as columns because the practice queue is
-- ordered and filtered by them. The practice services rewrite them whenever their inputs change, so they can be
-- recomputed from the other columns at any time.

ALTER TABLE words ADD COLUMN fsrs_card TEXT;          -- ts-fsrs card as JSON; NULL = state New (not in rotation)
ALTER TABLE words ADD COLUMN due_at INTEGER;           -- copy of the card's due for indexed selection; NULL = New
ALTER TABLE words ADD COLUMN introduced_on TEXT;       -- YYYY-MM-DD (Amsterdam) the word entered rotation; NULL = New
ALTER TABLE words ADD COLUMN frequency_rank INTEGER;   -- rank in the frequency list; NULL = not in the list
ALTER TABLE words ADD COLUMN priority_override INTEGER CHECK (priority_override IN (1, 2, 3)); -- NULL = none
ALTER TABLE words ADD COLUMN priority INTEGER NOT NULL DEFAULT 3 CHECK (priority IN (1, 2, 3)); -- cached, see note
CREATE INDEX index_words_on_due_at ON words(due_at);
CREATE INDEX index_words_on_introduced_on ON words(introduced_on);
CREATE INDEX index_words_on_priority ON words(priority);

CREATE TABLE review_logs (
  id           INTEGER PRIMARY KEY,
  word_id      INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  session_id   TEXT NOT NULL,
  reviewed_at  INTEGER NOT NULL,
  grade        TEXT NOT NULL CHECK (grade IN ('again', 'hard', 'good')),
  answer       TEXT,                                -- NULL = not given
  card_before  TEXT,                                -- JSON; NULL = the word was New
  card_after   TEXT NOT NULL                        -- JSON
);
CREATE UNIQUE INDEX unique_index_review_logs_on_session_id_and_word_id ON review_logs(session_id, word_id);
CREATE INDEX index_review_logs_on_word_id ON review_logs(word_id);
CREATE INDEX index_review_logs_on_reviewed_at ON review_logs(reviewed_at);

CREATE TABLE practice_settings (
  name  TEXT PRIMARY KEY,
  value TEXT NOT NULL                               -- JSON
);
INSERT INTO practice_settings (name, value) VALUES
  ('current_chapter', '6'),
  ('new_per_day', '10'),
  ('tier_quota', '{"1":7,"2":2,"3":1}'),
  ('desired_retention', '0.9'),
  ('learned_threshold_days', '21'),
  ('timezone', '"Europe/Amsterdam"');
-- 'fsrs_migrated_at' (ms) is inserted by migrate_to_fsrs.

CREATE TABLE word_frequencies (
  word_form       TEXT PRIMARY KEY COLLATE NOCASE,  -- any form (gaat, ging, gaan); lowercase
  frequency_rank  INTEGER NOT NULL                  -- rank of the form's lemma, 1 = most frequent
);
