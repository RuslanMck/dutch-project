import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, setDb, getDb } from '../src/db.js';
import { exportAll } from '../src/repo.js';
import { importExport } from '../scripts/import.js';

process.env.NODE_ENV = 'test';

const here = path.dirname(fileURLToPath(import.meta.url));
import { seed, SKIP } from './seed.js';

const TABLES = ['sections', 'topics', 'rules', 'texts', 'words', 'word_errors', 'phrases', 'mistake_patterns', 'mistake_cases'];
const snapshot = db => Object.fromEntries(TABLES.map(t => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));

function freshDbWithSeed() {
  setDb(openDb(':memory:'));
  return importExport(structuredClone(seed));
}

test('import of the real seed gives the expected counts', SKIP, () => {
  const { counts, report } = freshDbWithSeed();
  assert.equal(counts.words, 586);
  assert.equal(counts.word_errors, 12);
  assert.equal(counts.rules, 7);
  assert.equal(counts.mistake_patterns, 13);
  assert.equal(counts.mistake_cases, 22);
  assert.equal(counts.phrases, 13);
  assert.equal(counts.texts, 1);
  assert.equal(counts.sections, 8);
  assert.equal(counts.topics, 16);
  assert.equal(counts.expression_words, 137);
  assert.deepEqual(counts.rule_errors, {
    adjectief: 10, pluralis: 5, artikel: 4, modaal: 1, 'pronomen-werkwoord': 1, NULL: 1,
  });
  assert.match(report, /Duplicate nl values \(10\)/);
  for (const nl of ['eten', 'mes', 'nemen', 'raam', 'rekening', 'rest', 'melk', 'tafel', 'vinden', 'zitten']) {
    assert.match(report, new RegExp(`^  ${nl}: `, 'm'));
  }
  assert.match(report, /Words marked kind=expression: 137/);
});

test('import maps rule topics, the Д prefix and the other pseudo-rule', SKIP, () => {
  freshDbWithSeed();
  const db = getDb();
  const adj = db.prepare("SELECT code, category, section_code, sort_order FROM rules WHERE legacy_id = 'adjectief'").get();
  assert.deepEqual({ ...adj }, { code: '5.5', category: 'прикметник', section_code: '5.5', sort_order: 60 });
  const modal = db.prepare("SELECT code, category FROM rules WHERE legacy_id = 'modaal'").get();
  assert.deepEqual({ ...modal }, { code: 'Д1', category: 'дієслово' });
  assert.equal(db.prepare("SELECT is_textbook FROM sections WHERE code = 'Д1'").pluck().get(), 0);
  assert.equal(db.prepare("SELECT is_textbook FROM sections WHERE code = '5.5'").pluck().get(), 1);
  const other = db.prepare("SELECT rule_id FROM mistake_patterns WHERE legacy_id = 'hoeveelheid'").get();
  assert.equal(other.rule_id, null);
});

test('import splits examples on the first " — " and keeps NL-only examples in example_nl', SKIP, () => {
  freshDbWithSeed();
  const db = getDb();
  const split = db.prepare("SELECT example_nl, example_uk FROM words WHERE legacy_id = 'bestellen'").get();
  assert.equal(split.example_nl, 'Kan ik een toetje bestellen?');
  assert.equal(split.example_uk, 'Можна замовити десерт?');
  const nlOnly = db.prepare("SELECT example_nl, example_uk FROM words WHERE legacy_id = 'w-groot'").get();
  assert.equal(nlOnly.example_uk, null);
});

test('second import changes nothing', SKIP, () => {
  const first = freshDbWithSeed();
  const db = getDb();
  const before = snapshot(db);
  const second = importExport(structuredClone(seed));
  assert.deepEqual(snapshot(db), before);
  assert.deepEqual(second.counts, first.counts);
});

test('groot has 4 legacy_import errors and error_count 4', SKIP, () => {
  freshDbWithSeed();
  const db = getDb();
  const groot = db.prepare("SELECT id FROM words WHERE legacy_id = 'w-groot'").get();
  const legacy = db.prepare(`SELECT COUNT(*) FROM word_errors
      WHERE word_id = ? AND source = 'legacy_import' AND occurred_at IS NULL`).pluck().get(groot.id);
  assert.equal(legacy, 4);
  assert.equal(db.prepare('SELECT error_count FROM v_words WHERE id = ?').pluck().get(groot.id), 4);
});

test('exportAll output imports back to the same counts', SKIP, () => {
  const first = freshDbWithSeed();
  const exported = JSON.parse(JSON.stringify(exportAll()));
  setDb(openDb(':memory:'));
  const second = importExport(exported);
  assert.deepEqual(second.counts, first.counts);
});
