-- Core schema, verbatim from docs/HANDOFF.md section 3 (PRAGMAs are set in src/db.js)

CREATE TABLE sections (               -- textbook sections referenced by rules/words/texts
  code        TEXT PRIMARY KEY,       -- '5.5', '6.1', 'Д1' (Д* = rules not from the textbook)
  title       TEXT,
  is_textbook INTEGER NOT NULL DEFAULT 1 CHECK (is_textbook IN (0,1))
);

CREATE TABLE topics (                 -- thematic buckets of the dictionary ("У кафе", "Числа", ...)
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE rules (
  id           INTEGER PRIMARY KEY,
  legacy_id    TEXT UNIQUE,           -- 'adjectief', 'pluralis', ...
  code         TEXT NOT NULL,         -- number shown to the user and cited in feedback: '5.5', 'Д1'
  category     TEXT,                  -- word class after the dot in the old topic: 'прикметник'
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,         -- mini-markdown (section 1.4)
  sort_order   INTEGER NOT NULL,      -- old `order`
  section_code TEXT REFERENCES sections(code),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_rules_code ON rules(code);   -- deliberately not UNIQUE

CREATE TABLE texts (
  id           INTEGER PRIMARY KEY,
  legacy_id    TEXT UNIQUE,
  title        TEXT NOT NULL,
  section_code TEXT REFERENCES sections(code),
  body         TEXT NOT NULL,         -- NL/UK interleaved, blank-line separated
  added_at     INTEGER NOT NULL
);

CREATE TABLE words (
  id           INTEGER PRIMARY KEY,
  legacy_id    TEXT UNIQUE,
  nl           TEXT NOT NULL,
  uk           TEXT NOT NULL,
  article      TEXT NOT NULL DEFAULT '' CHECK (article IN ('','de','het')),
  kind         TEXT NOT NULL DEFAULT 'word' CHECK (kind IN ('word','expression')),
  example_nl   TEXT,
  example_uk   TEXT,
  topic_id     INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  section_code TEXT REFERENCES sections(code),   -- old `ch`
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','learning','learned')),
  added_at     INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_words_status ON words(status);
CREATE INDEX idx_words_nl     ON words(nl COLLATE NOCASE);   -- lookups by nl; NOT unique (homographs/duplicates exist)

CREATE TABLE word_errors (            -- one row per time a word was got wrong
  id           INTEGER PRIMARY KEY,
  word_id      INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  occurred_at  INTEGER,               -- NULL only for legacy_import (date unknown)
  source       TEXT NOT NULL CHECK (source IN ('practice','exercise','lesson','legacy_import')),
  mode         TEXT CHECK (mode IN ('translate','article')),   -- practice mode, else NULL
  wrong_answer TEXT
);
CREATE INDEX idx_word_errors_word ON word_errors(word_id);

CREATE TABLE phrases (
  id           INTEGER PRIMARY KEY,
  legacy_id    TEXT UNIQUE,
  nl           TEXT NOT NULL,
  uk           TEXT NOT NULL,
  context      TEXT,                  -- old `ctx`
  text_id      INTEGER REFERENCES texts(id) ON DELETE SET NULL,
  section_code TEXT REFERENCES sections(code),
  added_at     INTEGER NOT NULL
);

CREATE TABLE mistake_patterns (       -- "kind of mistake"; was a mistakes/<id> doc
  id         INTEGER PRIMARY KEY,
  legacy_id  TEXT UNIQUE,
  rule_id    INTEGER REFERENCES rules(id) ON DELETE SET NULL,  -- NULL = old rule "other"
  title      TEXT NOT NULL,           -- what went wrong
  fix        TEXT,                    -- one-line correct rule
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_patterns_rule ON mistake_patterns(rule_id);

CREATE TABLE mistake_cases (          -- one concrete occurrence; was mistakes.cases[]
  id          INTEGER PRIMARY KEY,
  pattern_id  INTEGER NOT NULL REFERENCES mistake_patterns(id) ON DELETE CASCADE,
  wrong_text  TEXT NOT NULL,          -- old `w`
  right_text  TEXT NOT NULL,          -- old `r`
  occurred_on TEXT NOT NULL,          -- 'YYYY-MM-DD', old `d`
  source      TEXT CHECK (source IN ('exercise','lesson','practice')),   -- NULL for imported cases
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_cases_pattern ON mistake_cases(pattern_id);

-- Derived numbers the UI shows
CREATE VIEW v_words AS
  SELECT w.*, (SELECT COUNT(*) FROM word_errors e WHERE e.word_id = w.id) AS error_count
  FROM words w;

CREATE VIEW v_mistake_patterns AS
  SELECT p.*, COUNT(c.id) AS count, MAX(c.occurred_on) AS last_on, MAX(c.id) AS last_case_id
  FROM mistake_patterns p LEFT JOIN mistake_cases c ON c.pattern_id = p.id
  GROUP BY p.id;

CREATE VIEW v_rule_errors AS         -- the red badge on each rule; rule_id NULL = "Інші помилки"
  SELECT p.rule_id AS rule_id, COUNT(c.id) AS error_count
  FROM mistake_patterns p JOIN mistake_cases c ON c.pattern_id = p.id
  GROUP BY p.rule_id;
