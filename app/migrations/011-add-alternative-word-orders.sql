-- Several correct word orders: alt_orders is a JSON array of the other natural orders of the sentence, as written
-- (strings). '[]' = the sentence has only its canonical order. Existing sentences get '[]'.
ALTER TABLE order_sentences ADD COLUMN alt_orders TEXT NOT NULL DEFAULT '[]';
