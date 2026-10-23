// Idempotent import of the claude.ai artifact export (handoff section 3.1).
// CLI: node scripts/import.js <path-to-export.json>
// Re-running updates rows matched by legacy_id and adds only what is missing.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb } from '../src/db.js';
import { notify } from '../src/events.js';
import { detectKind, ensureSection, ensureTopic } from '../src/repo.js';

// "5.5 · прикметник" -> code 5.5, category прикметник; "Д1 · дієслово" -> Д1; "5.5" -> 5.5
const TOPIC_RE = /^(\S+)(?:\s*·\s*(.+))?$/;
const EX_SEP = ' — ';
const same = (a, b) => (a ?? null) === (b ?? null);

function splitExample(ex) {
  const s = (ex ?? '').trim();
  if (!s) return { example_nl: null, example_uk: null };
  const i = s.indexOf(EX_SEP);
  if (i < 0) return { example_nl: s, example_uk: null };
  return {
    example_nl: s.slice(0, i).trim() || null,
    example_uk: s.slice(i + EX_SEP.length).trim() || null,
  };
}

function dateMs(d) {
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

// Insert or update one row keyed by legacy_id. An update writes only the columns that differ,
// so a second run leaves untouched rows (and their updated_at) as they are.
function upsert(db, table, legacyId, values, { ts, insertOnly = {}, touch = false }) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE legacy_id = ?`).get(legacyId);
  if (!row) {
    const all = { legacy_id: legacyId, ...values, ...insertOnly };
    const cols = Object.keys(all);
    const info = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(c => `@${c}`).join(', ')})`)
      .run(all);
    return Number(info.lastInsertRowid);
  }
  const diff = Object.keys(values).filter(k => !same(row[k], values[k]));
  if (diff.length) {
    const set = Object.fromEntries(diff.map(k => [k, values[k]]));
    if (touch) set.updated_at = ts;
    db.prepare(`UPDATE ${table} SET ${Object.keys(set).map(k => `${k} = @${k}`).join(', ')} WHERE id = @id`)
      .run({ ...set, id: row.id });
  }
  return row.id;
}

// word_errors with source 'legacy_import' must equal the legacy `err` count. Adds or removes the difference.
function syncLegacyErrors(db, wordId, n) {
  const ids = db.prepare("SELECT id FROM word_errors WHERE word_id = ? AND source = 'legacy_import' ORDER BY id")
    .pluck().all(wordId);
  if (ids.length < n) {
    const ins = db.prepare("INSERT INTO word_errors (word_id, occurred_at, source) VALUES (?, NULL, 'legacy_import')");
    for (let i = ids.length; i < n; i++) ins.run(wordId);
  } else if (ids.length > n) {
    const del = db.prepare('DELETE FROM word_errors WHERE id = ?');
    for (const id of ids.slice(n)) del.run(id);
  }
}

// A case is identified by pattern + wrong + right + date.
function insertCaseOnce(db, patternId, c, ts) {
  const exists = db.prepare(`SELECT 1 FROM mistake_cases
    WHERE pattern_id = ? AND wrong_text = ? AND right_text = ? AND occurred_on = ?`)
    .get(patternId, c.w, c.r, c.d);
  if (exists) return;
  db.prepare(`INSERT INTO mistake_cases (pattern_id, wrong_text, right_text, occurred_on, source, created_at)
    VALUES (?, ?, ?, ?, NULL, ?)`)
    .run(patternId, c.w, c.r, c.d, dateMs(c.d) ?? ts);
}

function parseRuleTopic(rule) {
  const m = TOPIC_RE.exec(String(rule.topic ?? '').trim());
  if (!m) return { code: rule.id, category: null, parsed: false };
  return { code: m[1], category: m[2]?.trim() || null, parsed: true };
}

function getCounts(db) {
  const n = sql => db.prepare(sql).pluck().get();
  const ruleErrors = Object.fromEntries(db.prepare(`SELECT
      CASE WHEN e.rule_id IS NULL THEN 'NULL' ELSE COALESCE(r.legacy_id, r.code) END AS k,
      e.error_count AS v
    FROM v_rule_errors e LEFT JOIN rules r ON r.id = e.rule_id`).all().map(r => [r.k, r.v]));
  return {
    words: n('SELECT COUNT(*) FROM words'),
    word_errors: n('SELECT COUNT(*) FROM word_errors'),
    rules: n('SELECT COUNT(*) FROM rules'),
    mistake_patterns: n('SELECT COUNT(*) FROM mistake_patterns'),
    mistake_cases: n('SELECT COUNT(*) FROM mistake_cases'),
    phrases: n('SELECT COUNT(*) FROM phrases'),
    texts: n('SELECT COUNT(*) FROM texts'),
    sections: n('SELECT COUNT(*) FROM sections'),
    topics: n('SELECT COUNT(*) FROM topics'),
    expression_words: n("SELECT COUNT(*) FROM words WHERE kind = 'expression'"),
    rule_errors: ruleErrors,
  };
}

function buildReport(words, issues, counts) {
  const byNl = new Map();
  for (const w of words) {
    if (!byNl.has(w.nl)) byNl.set(w.nl, []);
    byNl.get(w.nl).push(w);
  }
  const dupes = [...byNl].filter(([, list]) => list.length > 1);
  const lines = ['Import report', ''];
  lines.push(`Duplicate nl values (${dupes.length}), to merge by hand:`);
  for (const [nl, list] of dupes) {
    lines.push(`  ${nl}: ${list.map(w => `${w.id} ("${w.uk}"${w.art ? `, ${w.art}` : ''})`).join(' | ')}`);
  }
  lines.push('');
  lines.push(`Mistake patterns where count != cases.length (${issues.countMismatch.length}):`);
  for (const m of issues.countMismatch) lines.push(`  ${m.id}: count ${m.count}, cases ${m.cases}`);
  lines.push('');
  lines.push(`Unknown rule ids (${issues.unknownRules.length}):`);
  for (const u of issues.unknownRules) lines.push(`  pattern ${u.pattern} -> rule ${u.rule}`);
  lines.push('');
  lines.push(`Rules whose topic could not be parsed (${issues.unparsedRules.length}):`);
  for (const id of issues.unparsedRules) lines.push(`  ${id}`);
  lines.push('');
  lines.push(`Words marked kind=expression: ${counts.expression_words}`);
  return lines.join('\n') + '\n';
}

export function importExport(json) {
  const c = json?.collections;
  if (!c || typeof c !== 'object') throw new Error('export has no "collections" object');
  const words = c.words ?? [];
  const rules = c.rules ?? [];
  const mistakes = c.mistakes ?? [];
  const phrases = c.phrases ?? [];
  const texts = c.texts ?? [];
  const db = getDb();
  const ts = Date.now();
  const issues = { unknownRules: [], countMismatch: [], unparsedRules: [] };

  db.transaction(() => {
    // 1. Sections: textbook codes from rules, words (ch) and texts (ch).
    for (const r of rules) {
      const { code, parsed } = parseRuleTopic(r);
      if (parsed) ensureSection(db, code);
    }
    for (const w of words) ensureSection(db, w.ch ?? null);
    for (const t of texts) ensureSection(db, t.ch ?? null);

    // 2. Topics, in order of first appearance.
    const topicIds = new Map();
    for (const w of words) {
      if (w.topic && !topicIds.has(w.topic)) topicIds.set(w.topic, ensureTopic(db, w.topic));
    }

    // 3. Rules.
    const ruleIds = new Map();
    for (const r of rules) {
      const { code, category, parsed } = parseRuleTopic(r);
      if (!parsed) issues.unparsedRules.push(r.id);
      const id = upsert(db, 'rules', r.id, {
        code,
        category,
        title: r.title,
        body: r.body ?? '',
        sort_order: r.order ?? 0,
        section_code: parsed ? code : null,
      }, { ts, insertOnly: { created_at: ts, updated_at: ts }, touch: true });
      ruleIds.set(r.id, id);
    }

    // 4. Words, with their legacy error counts.
    for (const w of words) {
      const ex = splitExample(w.ex);
      const added = w.added ?? ts;
      const id = upsert(db, 'words', w.id, {
        nl: w.nl,
        uk: w.uk,
        article: w.art ?? '',
        kind: detectKind(w.nl),
        example_nl: ex.example_nl,
        example_uk: ex.example_uk,
        topic_id: w.topic ? topicIds.get(w.topic) : null,
        section_code: w.ch ?? null,
        status: w.status ?? 'new',
        added_at: added,
      }, { ts, insertOnly: { updated_at: added }, touch: true });
      syncLegacyErrors(db, id, Number(w.err ?? 0));
    }

    // 5. Phrases and texts.
    for (const p of phrases) {
      upsert(db, 'phrases', p.id, {
        nl: p.nl,
        uk: p.uk,
        context: p.ctx ?? null,
        added_at: p.added ?? ts,
      }, { ts });
    }
    for (const t of texts) {
      upsert(db, 'texts', t.id, {
        title: t.title,
        section_code: t.ch ?? null,
        body: t.body,
        added_at: t.added ?? ts,
      }, { ts });
    }

    // 6. Mistake patterns and their cases. Rule "other" becomes rule_id NULL.
    for (const m of mistakes) {
      const cases = m.cases ?? [];
      if (m.count !== undefined && m.count !== cases.length) {
        issues.countMismatch.push({ id: m.id, count: m.count, cases: cases.length });
      }
      let ruleId = null;
      if (m.rule && m.rule !== 'other') {
        ruleId = ruleIds.get(m.rule) ?? null;
        if (ruleId === null) issues.unknownRules.push({ pattern: m.id, rule: m.rule });
      }
      const id = upsert(db, 'mistake_patterns', m.id, {
        rule_id: ruleId,
        title: m.title,
        fix: m.fix ?? null,
      }, { ts, insertOnly: { created_at: m.last ?? ts } });
      for (const c of cases) insertCaseOnce(db, id, c, ts);
    }
  })();

  for (const collection of ['words', 'rules', 'mistakes', 'phrases', 'texts']) notify(collection);

  const counts = getCounts(db);
  const report = buildReport(words, issues, counts);
  return { counts, report };
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/import.js <path-to-export.json>');
    process.exit(2);
  }
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { counts, report } = importExport(json);
  const out = path.join(process.cwd(), 'import-report.txt');
  fs.writeFileSync(out, report);
  console.log(`report written to ${out}`);
  for (const [k, v] of Object.entries(counts)) {
    if (k === 'rule_errors') {
      console.log(`${'rule_errors'.padEnd(18)} ${Object.entries(v).map(([r, n]) => `${r} ${n}`).join(', ')}`);
    } else {
      console.log(`${k.padEnd(18)} ${v}`);
    }
  }
  getDb().close();
}
