-- Wrong forms: wrong_forms is a JSON array of single words that look like a word of the sentence but are wrong in it
-- ("gaat" for "gaan"); they are the sentence's extra tiles. '[]' = none, the extra tiles are random words. Existing
-- sentences get '[]'.
ALTER TABLE order_sentences ADD COLUMN wrong_forms TEXT NOT NULL DEFAULT '[]';
