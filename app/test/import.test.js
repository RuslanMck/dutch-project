// Import of the seed export through the artifact import service, and the export round trip.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTestContext } from './database-test-helpers.js';
import { seed, SKIP } from './seed.js';

const TABLES = ['sections', 'topics', 'rules', 'texts', 'words', 'word_errors', 'phrases', 'mistake_patterns', 'mistake_cases'];
const snapshot = database => Object.fromEntries(TABLES
  .map(tableName => [tableName, database.prepare(`SELECT * FROM ${tableName} ORDER BY rowid`).all()]));

let context;

function createContextWithSeed() {
  context = createTestContext();
  return context.artifactImportService.importArtifactExport(structuredClone(seed));
}

test('import of the real seed gives the expected counts', SKIP, () => {
  const { counts, report } = createContextWithSeed();
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
  createContextWithSeed();
  const database = context.database;
  const adj = database.prepare("SELECT code, category, section_code, sort_order FROM rules WHERE legacy_id = 'adjectief'").get();
  assert.deepEqual({ ...adj }, { code: '5.5', category: 'прикметник', section_code: '5.5', sort_order: 60 });
  const modal = database.prepare("SELECT code, category FROM rules WHERE legacy_id = 'modaal'").get();
  assert.deepEqual({ ...modal }, { code: 'Д1', category: 'дієслово' });
  assert.equal(database.prepare("SELECT is_textbook FROM sections WHERE code = 'Д1'").pluck().get(), 0);
  assert.equal(database.prepare("SELECT is_textbook FROM sections WHERE code = '5.5'").pluck().get(), 1);
  const other = database.prepare("SELECT rule_id FROM mistake_patterns WHERE legacy_id = 'hoeveelheid'").get();
  assert.equal(other.rule_id, null);
});

test('import splits examples on the first " — " and keeps NL-only examples in example_nl', SKIP, () => {
  createContextWithSeed();
  const database = context.database;
  const split = database.prepare("SELECT example_nl, example_uk FROM words WHERE legacy_id = 'bestellen'").get();
  assert.equal(split.example_nl, 'Kan ik een toetje bestellen?');
  assert.equal(split.example_uk, 'Можна замовити десерт?');
  const nlOnly = database.prepare("SELECT example_nl, example_uk FROM words WHERE legacy_id = 'w-groot'").get();
  assert.equal(nlOnly.example_uk, null);
});

test('second import changes nothing', SKIP, () => {
  const first = createContextWithSeed();
  const database = context.database;
  const before = snapshot(database);
  const second = context.artifactImportService.importArtifactExport(structuredClone(seed));
  assert.deepEqual(snapshot(database), before);
  assert.deepEqual(second.counts, first.counts);
});

test('groot has 4 legacy_import errors and error_count 4', SKIP, () => {
  createContextWithSeed();
  const database = context.database;
  const groot = database.prepare("SELECT id FROM words WHERE legacy_id = 'w-groot'").get();
  const legacy = database.prepare(`SELECT COUNT(*) FROM word_errors
      WHERE word_id = ? AND source = 'legacy_import' AND occurred_at IS NULL`).pluck().get(groot.id);
  assert.equal(legacy, 4);
  assert.equal(database.prepare('SELECT error_count FROM v_words WHERE id = ?').pluck().get(groot.id), 4);
});

test('exportAll output imports back to the same counts', SKIP, () => {
  const first = createContextWithSeed();
  const exported = JSON.parse(JSON.stringify(context.artifactExportService.exportCollections()));
  const second = createTestContext().artifactImportService.importArtifactExport(exported);
  assert.deepEqual(second.counts, first.counts);
});

const ONE_WORD_EXPORT = Object.freeze({
  collections: { words: [{ id: 'w-after-fsrs', nl: 'nieuw', uk: 'новий', status: 'learned' }] },
});

test('the artifact import works before the FSRS migration', () => {
  const beforeMigration = createTestContext();
  beforeMigration.artifactImportService.importArtifactExport(structuredClone(ONE_WORD_EXPORT));
  const status = beforeMigration.database.prepare("SELECT status FROM words WHERE legacy_id = 'w-after-fsrs'").pluck();
  assert.equal(status.get(), 'learned');
});

test('after the FSRS migration the artifact import is refused and writes nothing', () => {
  const migrated = createTestContext();
  migrated.practiceService.migrateToFsrs({ isDryRun: false });
  const before = snapshot(migrated.database);
  assert.throws(
    () => migrated.artifactImportService.importArtifactExport(structuredClone(ONE_WORD_EXPORT)),
    {
      name: 'ConflictError',
      message: 'the artifact import is disabled after the FSRS migration: it would overwrite the schedule',
    },
  );
  assert.deepEqual(snapshot(migrated.database), before);
});
