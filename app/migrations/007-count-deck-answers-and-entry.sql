-- The learning deck counts right answers in total, not in a row: a mistake adds one required right answer but keeps
-- the ones already given. The columns are renamed to say so; their values carry over.
ALTER TABLE words RENAME COLUMN deck_correct_streak TO deck_correct_count;
ALTER TABLE deck_answers RENAME COLUMN correct_streak_after TO correct_count_after;

-- How a word entered the deck: 0 as a New word (part of the session's new words), 1 by a lapse (a learned word
-- answered wrong). Only New words hold back the next session's new words. The rebuild sets it for words already in.
ALTER TABLE words ADD COLUMN deck_entered_by_lapse INTEGER NOT NULL DEFAULT 0
  CHECK (deck_entered_by_lapse IN (0, 1));
