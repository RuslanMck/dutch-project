-- A practice reset starts the sessions over. The review logs it supersedes stay as history, but they stop counting: the
-- reset sets superseded_at on every log that counts (see markReviewLogsSuperseded). The one-grade-per-session rule
-- becomes a unique index over the logs that still count, so a word or phrase graded before a reset can be graded once
-- more in the same session, and a third grade is still refused.

ALTER TABLE review_logs ADD COLUMN superseded_at INTEGER;   -- NULL = counts for its session; set by a practice reset
DROP INDEX unique_index_review_logs_on_session_id_and_word_id;
CREATE UNIQUE INDEX unique_index_review_logs_on_session_id_and_word_id
  ON review_logs(session_id, word_id) WHERE superseded_at IS NULL;

ALTER TABLE phrase_review_logs ADD COLUMN superseded_at INTEGER; -- NULL = counts for its session; a practice reset sets it
DROP INDEX unique_index_phrase_review_logs_on_session_id_and_phrase_id;
CREATE UNIQUE INDEX unique_index_phrase_review_logs_on_session_id_and_phrase_id
  ON phrase_review_logs(session_id, phrase_id) WHERE superseded_at IS NULL;
