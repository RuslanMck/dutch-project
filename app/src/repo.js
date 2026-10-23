// Data layer. Every function takes plain data and returns plain objects.
// Errors are domain errors (errors/domain-errors.js): ValidationError for bad input, NotFoundError for a missing
// row, ConflictError for a constraint failure. The adapters map them to HTTP status codes and MCP results.
import {
  addMistakeCaseInputSchema,
  createMistakePatternInputSchema,
  listMistakePatternsQuerySchema,
  logMistakeInputSchema,
} from './contracts/mistake-contracts.js';
import { createPhraseInputSchema } from './contracts/phrase-contracts.js';
import { createRuleInputSchema, updateRuleInputSchema } from './contracts/rule-contracts.js';
import { createTextInputSchema, updateTextInputSchema } from './contracts/text-contracts.js';
import {
  createWordInputSchema,
  createWordsInputSchema,
  listWordsQuerySchema,
  logWordErrorInputSchema,
  recordPracticeResultInputSchema,
  searchWordsInputSchema,
  setWordStatusInputSchema,
  updateWordInputSchema,
} from './contracts/word-contracts.js';
import { getDb } from './db.js';
import { ConflictError, mapToDomainError, NotFoundError, ValidationError } from './errors/domain-errors.js';
import { notify } from './events.js';

const now = () => Date.now();

function parse(schema, input) {
  const r = schema.safeParse(input ?? {});
  if (!r.success) throw mapToDomainError(r.error);
  return r.data;
}

// Runs fn(db) in one transaction. SQLite constraint failures (duplicate legacy_id etc.) become ConflictError.
function tx(fn) {
  const db = getDb();
  try {
    return db.transaction(() => fn(db))();
  } catch (err) {
    if (typeof err?.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
      throw new ConflictError(`constraint violated: ${err.message}`);
    }
    throw err;
  }
}

export function toId(v, name = 'id') {
  const n = typeof v === 'number' ? v : /^\d+$/.test(String(v ?? '')) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) throw new ValidationError(`${name} must be a positive integer`);
  return n;
}

const blank = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const blankToNull = v => (blank(v) ? null : v);
const dropBlank = o => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => !blank(v)));
const setSql = set => Object.keys(set).map(k => `${k} = @${k}`).join(', ');

function assertExists(db, table, id, label) {
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) {
    throw new NotFoundError(`${label} ${id} not found`);
  }
}

// Local calendar date, YYYY-MM-DD.
export function todayIso(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 'expression' if 3+ whitespace-separated tokens or ends with ? or ., else 'word'.
export function detectKind(nl) {
  const s = String(nl ?? '').trim();
  const tokens = s.split(/\s+/).filter(Boolean).length;
  return tokens >= 3 || /[?.]$/.test(s) ? 'expression' : 'word';
}

// Shared by import.js: create-on-demand rows for textbook sections and dictionary topics.
export function ensureSection(db, code) {
  if (!code) return null;
  db.prepare('INSERT OR IGNORE INTO sections (code, title, is_textbook) VALUES (?, NULL, ?)')
    .run(code, code.startsWith('Д') ? 0 : 1);
  return code;
}

export function ensureTopic(db, name) {
  if (!name) return null;
  db.prepare(`INSERT OR IGNORE INTO topics (name, sort_order)
              VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM topics))`).run(name);
  return db.prepare('SELECT id FROM topics WHERE name = ?').pluck().get(name);
}

// ---------------------------------------------------------------- words

const WORD_SELECT = `SELECT v.id, v.legacy_id, v.nl, v.uk, v.article, v.kind, v.example_nl, v.example_uk,
    t.name AS topic, v.section_code AS section, v.status, v.error_count, v.added_at, v.updated_at
  FROM v_words v LEFT JOIN topics t ON t.id = v.topic_id`;

function wordRow(db, id) {
  const row = db.prepare(`${WORD_SELECT} WHERE v.id = ?`).get(id);
  if (!row) throw new NotFoundError(`word ${id} not found`);
  return row;
}

function normalizeWord(d) {
  return {
    nl: d.nl,
    uk: d.uk,
    article: d.article ?? '',
    kind: d.kind ?? detectKind(d.nl),
    example_nl: blankToNull(d.example_nl),
    example_uk: blankToNull(d.example_uk),
    section: blankToNull(d.section),
    topic: blankToNull(d.topic),
    status: d.status ?? 'new',
    err: d.err ?? 0,
  };
}

// Inserts a words row; returns its id. Does not touch word_errors.
function insertWord(db, n, ts) {
  const info = db.prepare(`INSERT INTO words
      (nl, uk, article, kind, example_nl, example_uk, topic_id, section_code, status, added_at, updated_at)
    VALUES (@nl, @uk, @article, @kind, @example_nl, @example_uk, @topic_id, @section_code, @status, @ts, @ts)`)
    .run({
      nl: n.nl,
      uk: n.uk,
      article: n.article,
      kind: n.kind,
      example_nl: n.example_nl,
      example_uk: n.example_uk,
      topic_id: ensureTopic(db, n.topic),
      section_code: ensureSection(db, n.section),
      status: n.status,
      ts,
    });
  return Number(info.lastInsertRowid);
}

function addLessonErrors(db, wordId, count, ts) {
  const ins = db.prepare("INSERT INTO word_errors (word_id, occurred_at, source) VALUES (?, ?, 'lesson')");
  for (let i = 0; i < count; i++) ins.run(wordId, ts);
}

export function getWord(id) {
  return wordRow(getDb(), toId(id));
}

export function listWords(opts = {}) {
  const o = parse(listWordsQuerySchema, dropBlank(opts));
  const db = getDb();
  const where = [];
  const params = {};
  if (o.status) { where.push('v.status = @status'); params.status = o.status; }
  if (o.topic) { where.push('t.name = @topic'); params.topic = o.topic; }
  const order = o.sort === 'errors' ? 'v.error_count DESC, v.added_at ASC, v.id ASC' : 'v.added_at ASC, v.id ASC';
  let rows = db.prepare(`${WORD_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}`)
    .all(params);
  if (o.q) {
    const needle = o.q.toLowerCase();
    rows = rows.filter(w => w.nl.toLowerCase().includes(needle) || w.uk.toLowerCase().includes(needle));
  }
  if (o.limit) rows = rows.slice(0, o.limit);
  return rows;
}

// Case-insensitive search on nl and uk; exact nl matches first, then by added date.
export function findWords(q, opts = {}) {
  const { query, limit } = parse(searchWordsInputSchema, { query: q, limit: opts.limit });
  const needle = query.toLowerCase();
  const rows = getDb().prepare(`${WORD_SELECT} ORDER BY v.added_at ASC, v.id ASC`).all()
    .filter(w => w.nl.toLowerCase().includes(needle) || w.uk.toLowerCase().includes(needle));
  rows.sort((a, b) => Number(b.nl.toLowerCase() === needle) - Number(a.nl.toLowerCase() === needle));
  return rows.slice(0, limit);
}

export function addWord(input) {
  const n = normalizeWord(parse(createWordInputSchema, input));
  const id = tx(db => {
    const ts = now();
    const wordId = insertWord(db, n, ts);
    addLessonErrors(db, wordId, n.err, ts);
    return wordId;
  });
  notify('words');
  return getWord(id);
}

// skipExisting: an entry with the same nl (case-insensitive) and the same article is skipped.
export function addWords(list, { skipExisting = true } = {}) {
  const items = parse(createWordsInputSchema, list ?? []).map(normalizeWord);
  const skip = skipExisting !== false;
  const key = (nl, article) => `${nl.toLowerCase()}\u0000${article}`;
  const { added, skipped } = tx(db => {
    const known = new Map();
    for (const r of db.prepare('SELECT id, nl, article FROM words').all()) known.set(key(r.nl, r.article), r.id);
    const added = [];
    const skipped = [];
    for (const n of items) {
      const k = key(n.nl, n.article);
      if (skip && known.has(k)) {
        skipped.push({ nl: n.nl, existing_id: known.get(k) });
        continue;
      }
      const ts = now();
      const id = insertWord(db, n, ts);
      addLessonErrors(db, id, n.err, ts);
      known.set(k, id);
      added.push(id);
    }
    return { added, skipped };
  });
  if (added.length) notify('words');
  return { added: added.map(getWord), skipped };
}

export function updateWord(id, patch) {
  const wid = toId(id);
  const p = parse(updateWordInputSchema, patch);
  tx(db => {
    wordRow(db, wid);
    const set = {};
    if (p.nl !== undefined) set.nl = p.nl;
    if (p.uk !== undefined) set.uk = p.uk;
    if (p.article !== undefined) set.article = p.article ?? '';
    if (p.kind !== undefined) set.kind = p.kind;
    else if (p.nl !== undefined) set.kind = detectKind(p.nl);
    if (p.example_nl !== undefined) set.example_nl = blankToNull(p.example_nl);
    if (p.example_uk !== undefined) set.example_uk = blankToNull(p.example_uk);
    if (p.section !== undefined) set.section_code = ensureSection(db, blankToNull(p.section));
    if (p.topic !== undefined) set.topic_id = ensureTopic(db, blankToNull(p.topic));
    if (p.status !== undefined) set.status = p.status;
    set.updated_at = now();
    db.prepare(`UPDATE words SET ${setSql(set)} WHERE id = @id`).run({ ...set, id: wid });
  });
  notify('words');
  return getWord(wid);
}

export function deleteWord(id) {
  const wid = toId(id);
  tx(db => {
    wordRow(db, wid);
    db.prepare('DELETE FROM words WHERE id = ?').run(wid);
  });
  notify('words');
  return { ok: true };
}

export function setWordStatus(id, status) {
  const wid = toId(id);
  const s = parse(setWordStatusInputSchema, { status });
  tx(db => {
    wordRow(db, wid);
    db.prepare('UPDATE words SET status = ?, updated_at = ? WHERE id = ?').run(s.status, now(), wid);
  });
  notify('words');
  return getWord(wid);
}

// correct: learning -> learned, new stays new. wrong: status learning and one word_errors row.
export function recordPracticeResult(id, input) {
  const wid = toId(id);
  const d = parse(recordPracticeResultInputSchema, input);
  const answer = blankToNull(d.answer ?? d.wrong_answer);
  tx(db => {
    const w = wordRow(db, wid);
    const ts = now();
    db.prepare('INSERT INTO practice_attempts (word_id, at, mode, answer, correct) VALUES (?, ?, ?, ?, ?)')
      .run(wid, ts, d.mode, answer, d.correct ? 1 : 0);
    let status = w.status;
    if (d.correct) {
      if (status === 'learning') status = 'learned';
    } else {
      status = 'learning';
      db.prepare("INSERT INTO word_errors (word_id, occurred_at, source, mode, wrong_answer) VALUES (?, ?, 'practice', ?, ?)")
        .run(wid, ts, d.mode, answer);
    }
    db.prepare('UPDATE words SET status = ?, updated_at = ? WHERE id = ?').run(status, ts, wid);
  });
  notify('words');
  return getWord(wid);
}

export function logWordError(id, input) {
  const wid = toId(id);
  const d = parse(logWordErrorInputSchema, input);
  tx(db => {
    wordRow(db, wid);
    const ts = now();
    db.prepare('INSERT INTO word_errors (word_id, occurred_at, source, mode, wrong_answer) VALUES (?, ?, ?, ?, ?)')
      .run(wid, ts, d.source, d.mode ?? null, blankToNull(d.wrong_answer));
    db.prepare("UPDATE words SET status = 'learning', updated_at = ? WHERE id = ?").run(ts, wid);
  });
  notify('words');
  return getWord(wid);
}

export function listTopics() {
  return getDb().prepare(`SELECT t.id, t.name, COUNT(w.id) AS word_count
    FROM topics t LEFT JOIN words w ON w.topic_id = t.id
    GROUP BY t.id ORDER BY t.sort_order, t.id`).all();
}

// ---------------------------------------------------------------- rules

const RULE_SELECT = `SELECT r.id, r.legacy_id, r.code, r.category, r.title, r.body, r.sort_order,
    r.section_code AS section, COALESCE(e.error_count, 0) AS error_count, r.created_at, r.updated_at
  FROM rules r LEFT JOIN v_rule_errors e ON e.rule_id = r.id`;

// ref: numeric id (number or digit string) or a code such as '5.5'. Codes are not unique: first by sort_order.
function ruleRow(db, ref) {
  const s = String(ref ?? '').trim();
  if (!s) throw new ValidationError('rule id or code required');
  const row = /^\d+$/.test(s)
    ? db.prepare(`${RULE_SELECT} WHERE r.id = ?`).get(Number(s))
    : db.prepare(`${RULE_SELECT} WHERE r.code = ? ORDER BY r.sort_order, r.id LIMIT 1`).get(s);
  if (!row) throw new NotFoundError(`rule ${s} not found`);
  return row;
}

export function listRules() {
  return getDb().prepare(`${RULE_SELECT} ORDER BY r.sort_order, r.id`).all();
}

export function getRule(idOrCode) {
  return ruleRow(getDb(), idOrCode);
}

export function addRule(input) {
  const d = parse(createRuleInputSchema, input);
  const id = tx(db => {
    const section = ensureSection(db, d.section === undefined ? d.code : blankToNull(d.section));
    const sortOrder = d.sort_order ?? db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 10 FROM rules').pluck().get();
    const ts = now();
    const info = db.prepare(`INSERT INTO rules
        (legacy_id, code, category, title, body, sort_order, section_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(blankToNull(d.legacy_id), d.code, blankToNull(d.category), d.title, d.body, sortOrder, section, ts, ts);
    return Number(info.lastInsertRowid);
  });
  notify('rules');
  return getRule(id);
}

export function updateRule(id, patch) {
  const rid = toId(id);
  const p = parse(updateRuleInputSchema, patch);
  tx(db => {
    ruleRow(db, rid);
    const set = {};
    if (p.code !== undefined) set.code = p.code;
    if (p.category !== undefined) set.category = blankToNull(p.category);
    if (p.title !== undefined) set.title = p.title;
    if (p.body !== undefined) set.body = p.body;
    if (p.sort_order !== undefined) set.sort_order = p.sort_order;
    if (p.section !== undefined) set.section_code = ensureSection(db, blankToNull(p.section));
    set.updated_at = now();
    db.prepare(`UPDATE rules SET ${setSql(set)} WHERE id = @id`).run({ ...set, id: rid });
  });
  notify('rules');
  return getRule(rid);
}

// Patterns that pointed at the rule fall back to "other" (rule_id NULL).
export function deleteRule(id) {
  const rid = toId(id);
  tx(db => {
    ruleRow(db, rid);
    db.prepare('DELETE FROM rules WHERE id = ?').run(rid);
  });
  notify('rules');
  notify('mistakes');
  return { ok: true };
}

// ---------------------------------------------------------------- mistake patterns

const PATTERN_SELECT = `SELECT p.id, p.legacy_id, p.rule_id, r.code AS rule_code, p.title, p.fix,
    p.count, p.last_on, p.created_at
  FROM v_mistake_patterns p LEFT JOIN rules r ON r.id = p.rule_id`;

function withCases(db, row) {
  const cases = db.prepare(`SELECT id, wrong_text, right_text, occurred_on, source, created_at
    FROM mistake_cases WHERE pattern_id = ? ORDER BY occurred_on DESC, id DESC`).all(row.id);
  return { ...row, cases };
}

function patternRow(db, id) {
  const row = db.prepare(`${PATTERN_SELECT} WHERE p.id = ?`).get(id);
  if (!row) throw new NotFoundError(`mistake pattern ${id} not found`);
  return withCases(db, row);
}

export function getPattern(id) {
  return patternRow(getDb(), toId(id));
}

// rule_id: number, or 'null' for the "other" pattern. Ordered by count desc, last_on desc.
export function listPatterns(filter = {}) {
  const f = parse(listMistakePatternsQuerySchema, dropBlank(filter));
  const where = [];
  const params = [];
  if (f.rule_id != null) {
    if (f.rule_id === 'null' || f.rule_id === 'other') where.push('p.rule_id IS NULL');
    else if (typeof f.rule_id === 'number' || /^\d+$/.test(f.rule_id)) {
      where.push('p.rule_id = ?');
      params.push(Number(f.rule_id));
    } else throw new ValidationError('rule_id must be a number or "null"');
  }
  if (f.rule_code !== undefined) {
    if (f.rule_code === 'other' || f.rule_code === 'null') where.push('p.rule_id IS NULL');
    else {
      where.push('p.rule_id IN (SELECT id FROM rules WHERE code = ?)');
      params.push(f.rule_code);
    }
  }
  const db = getDb();
  const sql = `${PATTERN_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.count DESC, p.last_on DESC, p.id`;
  return db.prepare(sql).all(...params).map(r => withCases(db, r));
}

// ruleId (already an id) wins over ruleCode. null / 'other' / 'null' mean no rule.
function resolveRule(db, ruleId, ruleCode) {
  if (ruleId != null) {
    const r = db.prepare('SELECT id FROM rules WHERE id = ?').pluck().get(ruleId);
    if (r === undefined) throw new ValidationError(`unknown rule_id ${ruleId}`);
    return r;
  }
  if (ruleCode == null || ruleCode === '' || ruleCode === 'other' || ruleCode === 'null') return null;
  const r = db.prepare('SELECT id FROM rules WHERE code = ? ORDER BY sort_order, id LIMIT 1').pluck().get(ruleCode);
  if (r === undefined) throw new ValidationError(`unknown rule code ${ruleCode}`);
  return r;
}

export function addPattern(input) {
  const d = parse(createMistakePatternInputSchema, input);
  const id = tx(db => {
    const ruleId = resolveRule(db, d.rule_id, d.rule_code);
    const info = db.prepare('INSERT INTO mistake_patterns (rule_id, title, fix, created_at) VALUES (?, ?, ?, ?)')
      .run(ruleId, d.title, blankToNull(d.fix), now());
    return Number(info.lastInsertRowid);
  });
  notify('mistakes');
  return getPattern(id);
}

export function deletePattern(id) {
  const pid = toId(id);
  tx(db => {
    assertExists(db, 'mistake_patterns', pid, 'mistake pattern');
    db.prepare('DELETE FROM mistake_patterns WHERE id = ?').run(pid);
  });
  notify('mistakes');
  return { ok: true };
}

function insertCase(db, patternId, c, ts) {
  db.prepare(`INSERT INTO mistake_cases (pattern_id, wrong_text, right_text, occurred_on, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(patternId, c.wrong, c.right, c.date ?? todayIso(), c.source ?? null, ts);
}

export function addCase(patternId, input) {
  const pid = toId(patternId, 'pattern id');
  const c = parse(addMistakeCaseInputSchema, input);
  tx(db => {
    assertExists(db, 'mistake_patterns', pid, 'mistake pattern');
    insertCase(db, pid, c, now());
  });
  notify('mistakes');
  return getPattern(pid);
}

export function deleteCase(caseId) {
  const cid = toId(caseId, 'case id');
  tx(db => {
    assertExists(db, 'mistake_cases', cid, 'mistake case');
    db.prepare('DELETE FROM mistake_cases WHERE id = ?').run(cid);
  });
  notify('mistakes');
  return { ok: true };
}

// With pattern_id: add a case to it. Otherwise: the same rule and same title (case-insensitive)
// gets the case, or a new pattern is created. Returns the pattern.
export function logMistake(input) {
  const d = parse(logMistakeInputSchema, input);
  const pid = tx(db => {
    if (d.pattern_id != null) {
      assertExists(db, 'mistake_patterns', d.pattern_id, 'mistake pattern');
      insertCase(db, d.pattern_id, d, now());
      return d.pattern_id;
    }
    if (!d.title) throw new ValidationError('title is required when pattern_id is not given');
    const ruleId = resolveRule(db, null, d.rule_code);
    const wanted = d.title.toLowerCase();
    const hit = db.prepare('SELECT id, title FROM mistake_patterns WHERE rule_id IS ? ORDER BY id').all(ruleId)
      .find(r => r.title.toLowerCase() === wanted);
    const ts = now();
    const patternId = hit
      ? hit.id
      : Number(db.prepare('INSERT INTO mistake_patterns (rule_id, title, fix, created_at) VALUES (?, ?, ?, ?)')
        .run(ruleId, d.title, blankToNull(d.fix), ts).lastInsertRowid);
    insertCase(db, patternId, d, ts);
    return patternId;
  });
  notify('mistakes');
  return getPattern(pid);
}

// ---------------------------------------------------------------- phrases

const PHRASE_SELECT = `SELECT id, legacy_id, nl, uk, context, section_code AS section, added_at FROM phrases`;

function phraseRow(db, id) {
  const row = db.prepare(`${PHRASE_SELECT} WHERE id = ?`).get(id);
  if (!row) throw new NotFoundError(`phrase ${id} not found`);
  return row;
}

export function listPhrases() {
  return getDb().prepare(`${PHRASE_SELECT} ORDER BY added_at DESC, id DESC`).all();
}

export function addPhrase(input) {
  const d = parse(createPhraseInputSchema, input);
  const id = tx(db => {
    const info = db.prepare(`INSERT INTO phrases (nl, uk, context, section_code, added_at) VALUES (?, ?, ?, ?, ?)`)
      .run(d.nl, d.uk, blankToNull(d.context), ensureSection(db, blankToNull(d.section)), now());
    return Number(info.lastInsertRowid);
  });
  notify('phrases');
  return phraseRow(getDb(), id);
}

export function deletePhrase(id) {
  const pid = toId(id);
  tx(db => {
    phraseRow(db, pid);
    db.prepare('DELETE FROM phrases WHERE id = ?').run(pid);
  });
  notify('phrases');
  return { ok: true };
}

// ---------------------------------------------------------------- texts

const TEXT_SELECT = `SELECT id, legacy_id, title, section_code AS section, body, added_at FROM texts`;

function textRow(db, id) {
  const row = db.prepare(`${TEXT_SELECT} WHERE id = ?`).get(id);
  if (!row) throw new NotFoundError(`text ${id} not found`);
  return row;
}

export function listTexts() {
  return getDb().prepare(`${TEXT_SELECT} ORDER BY added_at DESC, id DESC`).all();
}

export function getText(id) {
  return textRow(getDb(), toId(id));
}

export function addText(input) {
  const d = parse(createTextInputSchema, input);
  const id = tx(db => {
    const info = db.prepare('INSERT INTO texts (title, section_code, body, added_at) VALUES (?, ?, ?, ?)')
      .run(d.title, ensureSection(db, blankToNull(d.section)), d.body, now());
    return Number(info.lastInsertRowid);
  });
  notify('texts');
  return textRow(getDb(), id);
}

export function updateText(id, patch) {
  const tid = toId(id);
  const p = parse(updateTextInputSchema, patch);
  tx(db => {
    textRow(db, tid);
    const set = {};
    if (p.title !== undefined) set.title = p.title;
    if (p.body !== undefined) set.body = p.body;
    if (p.section !== undefined) set.section_code = ensureSection(db, blankToNull(p.section));
    if (Object.keys(set).length) db.prepare(`UPDATE texts SET ${setSql(set)} WHERE id = @id`).run({ ...set, id: tid });
  });
  notify('texts');
  return getText(tid);
}

export function deleteText(id) {
  const tid = toId(id);
  tx(db => {
    textRow(db, tid);
    db.prepare('DELETE FROM texts WHERE id = ?').run(tid);
  });
  notify('texts');
  return { ok: true };
}

// ---------------------------------------------------------------- stats and export

export function stats() {
  const db = getDb();
  const one = sql => db.prepare(sql).pluck().get();
  const byStatus = { new: 0, learning: 0, learned: 0 };
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM words GROUP BY status').all()) byStatus[r.status] = r.n;
  return {
    words: {
      total: one('SELECT COUNT(*) FROM words'),
      new: byStatus.new,
      learning: byStatus.learning,
      learned: byStatus.learned,
      expressions: one("SELECT COUNT(*) FROM words WHERE kind = 'expression'"),
    },
    rules: one('SELECT COUNT(*) FROM rules'),
    patterns: one('SELECT COUNT(*) FROM mistake_patterns'),
    cases: one('SELECT COUNT(*) FROM mistake_cases'),
    phrases: one('SELECT COUNT(*) FROM phrases'),
    texts: one('SELECT COUNT(*) FROM texts'),
    sections: db.prepare('SELECT code FROM sections ORDER BY code').pluck().all(),
  };
}

const exportId = (legacyId, prefix, id) => legacyId ?? `${prefix}-${id}`;

// Same shape as data/seed/dutch-export.json. Rows created in the app get ids like 'word-12'.
export function exportAll() {
  const db = getDb();

  const words = db.prepare(`${WORD_SELECT} ORDER BY v.added_at ASC, v.id ASC`).all().map(w => {
    const out = {
      id: exportId(w.legacy_id, 'word', w.id),
      added: w.added_at,
      art: w.article,
      nl: w.nl,
      uk: w.uk,
      status: w.status,
      ex: [w.example_nl, w.example_uk].filter(Boolean).join(' — '),
    };
    if (w.section) out.ch = w.section;
    if (w.topic) out.topic = w.topic;
    if (w.error_count) out.err = w.error_count;
    return out;
  });

  const ruleRows = listRules();
  const ruleExportId = new Map(ruleRows.map(r => [r.id, exportId(r.legacy_id, 'rule', r.id)]));
  const rules = ruleRows.map(r => ({
    id: ruleExportId.get(r.id),
    title: r.title,
    topic: r.category ? `${r.code} · ${r.category}` : r.code,
    order: r.sort_order,
    body: r.body,
  }));

  const caseRows = db.prepare(`SELECT pattern_id, wrong_text, right_text, occurred_on, created_at
    FROM mistake_cases ORDER BY created_at ASC, id ASC`).all();
  const casesBy = new Map();
  for (const c of caseRows) {
    if (!casesBy.has(c.pattern_id)) casesBy.set(c.pattern_id, []);
    casesBy.get(c.pattern_id).push(c);
  }
  const mistakes = db.prepare('SELECT id, legacy_id, rule_id, title, fix FROM mistake_patterns ORDER BY id').all()
    .map(p => {
      const cs = casesBy.get(p.id) ?? [];
      return {
        id: exportId(p.legacy_id, 'pattern', p.id),
        rule: p.rule_id == null ? 'other' : ruleExportId.get(p.rule_id),
        title: p.title,
        fix: p.fix,
        count: cs.length,
        last: cs.length ? Math.max(...cs.map(c => c.created_at)) : null,
        cases: cs.map(c => ({ d: c.occurred_on, r: c.right_text, w: c.wrong_text })),
      };
    });

  const phrases = db.prepare(`${PHRASE_SELECT} ORDER BY added_at ASC, id ASC`).all().map(p => ({
    id: exportId(p.legacy_id, 'phrase', p.id),
    added: p.added_at,
    ctx: p.context,
    nl: p.nl,
    uk: p.uk,
  }));

  const texts = db.prepare(`${TEXT_SELECT} ORDER BY added_at ASC, id ASC`).all().map(t => {
    const out = { id: exportId(t.legacy_id, 'text', t.id), added: t.added_at, body: t.body, title: t.title };
    if (t.section) out.ch = t.section;
    return out;
  });

  return {
    exported_at: todayIso(),
    source: 'dutch-app export (VPS)',
    note: 'Every document is {id, ...fields as stored}. Timestamps (added, last) are ms since epoch.',
    collections: { words, rules, mistakes, phrases, texts },
  };
}
