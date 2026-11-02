-- Client answer receipts: the response of each answer the phone sent with a client_answer_id, so a repeated post
-- (a retry after a lost connection) is answered with the first response and writes nothing. Kept 30 days.
CREATE TABLE client_answer_receipts (
  client_answer_id TEXT PRIMARY KEY,
  kind             TEXT NOT NULL CHECK (kind IN ('grade', 'drill')),
  response         TEXT NOT NULL,          -- the JSON returned the first time
  created_at       INTEGER NOT NULL
);
CREATE INDEX index_client_answer_receipts_on_created_at ON client_answer_receipts(created_at);
