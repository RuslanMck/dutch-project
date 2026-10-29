-- Custom decks («Колоди»): named lists of words the learner drills on their own. A deck never changes a word's
-- schedule; its words are only referenced here. A deleted word leaves its decks (cascade).
CREATE TABLE custom_decks (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX unique_index_custom_decks_on_name ON custom_decks(name COLLATE NOCASE);

-- The words of a deck, in the order added (added_at, then the row's insertion order).
CREATE TABLE custom_deck_words (
  deck_id   INTEGER NOT NULL REFERENCES custom_decks(id) ON DELETE CASCADE,
  word_id   INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (deck_id, word_id)
);
CREATE INDEX index_custom_deck_words_on_word_id ON custom_deck_words(word_id);
