-- Word categories: the topic each word belongs to (food, home, clothes, …), set by the categorizer or by hand (PATCH).
-- NULL = not set yet. The achievements count the learned words of each category.
ALTER TABLE words ADD COLUMN category TEXT;
CREATE INDEX index_words_on_category ON words(category);

-- Achievements once unlocked: the first time a medal is seen unlocked it is kept here, so it never locks again (a
-- word that lapses, a set that turns imperfect) and the page can show the latest ones.
CREATE TABLE achievement_unlocks (
  achievement_id TEXT PRIMARY KEY,
  unlocked_at    INTEGER NOT NULL
);
