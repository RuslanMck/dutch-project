-- Word categories: the topic each word belongs to (food, home, clothes, …), set by the categorizer or by hand (PATCH).
-- NULL = not set yet. The achievements count the learned words of each category.
ALTER TABLE words ADD COLUMN category TEXT;
CREATE INDEX index_words_on_category ON words(category);
