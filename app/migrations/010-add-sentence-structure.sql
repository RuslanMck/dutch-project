-- Sentence structure: the sentence split into ordered segments, each with a role, as a JSON array of { text, role }.
-- NULL = the sentence has no schema yet (saved before this migration, or added without one).
ALTER TABLE order_sentences ADD COLUMN structure TEXT;
