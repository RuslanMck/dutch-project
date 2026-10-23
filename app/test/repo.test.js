import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, setDb, getDb } from '../src/db.js';
import * as repo from '../src/repo.js';
import { importExport } from '../scripts/import.js';

process.env.NODE_ENV = 'test';

const here = path.dirname(fileURLToPath(import.meta.url));
import { seed, SKIP } from './seed.js';

const ADJ_HET_EEN = 'Додав -e до прикметника з het-словом (een / без артикля)';

beforeEach(() => {
  setDb(openDb(':memory:'));
  if (seed) importExport(structuredClone(seed));
});

const wordId = nl => repo.findWords(nl, { limit: 1 })[0].id;

test('practice: correct on a new word keeps it new', SKIP, () => {
  const id = wordId('bestellen');
  const w = repo.recordPracticeResult(id, { correct: true, mode: 'translate', answer: 'bestellen' });
  assert.equal(w.status, 'new');
  assert.equal(w.error_count, 0);
  assert.equal(getDb().prepare('SELECT COUNT(*) FROM practice_attempts WHERE word_id = ?').pluck().get(id), 1);
});

test('practice: correct on a learning word makes it learned', SKIP, () => {
  const id = wordId('bestellen');
  repo.setWordStatus(id, 'learning');
  assert.equal(repo.recordPracticeResult(id, { correct: true, mode: 'article', answer: 'de' }).status, 'learned');
});

test('practice: wrong answer sets learning and adds one error', SKIP, () => {
  const id = wordId('bestellen');
  const w = repo.recordPracticeResult(id, { correct: false, mode: 'translate', answer: 'bestelen' });
  assert.equal(w.status, 'learning');
  assert.equal(w.error_count, 1);
  const row = getDb().prepare("SELECT source, mode, wrong_answer FROM word_errors WHERE word_id = ?").get(id);
  assert.deepEqual({ ...row }, { source: 'practice', mode: 'translate', wrong_answer: 'bestelen' });
});

test('practice: wrong answer on groot goes 4 -> 5', SKIP, () => {
  const id = wordId('groot');
  assert.equal(repo.getWord(id).error_count, 4);
  assert.equal(repo.recordPracticeResult(id, { correct: false, mode: 'translate', answer: 'x' }).error_count, 5);
});

test('logMistake adds a case to an existing pattern (case-insensitive title match)', SKIP, () => {
  const before = repo.listPatterns({ rule_code: '5.5' }).find(p => p.title === ADJ_HET_EEN);
  assert.equal(before.count, 3);
  const after = repo.logMistake({
    rule_code: '5.5',
    title: ADJ_HET_EEN.toUpperCase(),
    wrong: 'een kleine kind',
    right: 'een klein kind',
    date: '2026-10-20',
    source: 'exercise',
  });
  assert.equal(after.id, before.id);
  assert.equal(after.count, 4);
  assert.equal(after.last_on, '2026-10-20');
  assert.equal(after.cases[0].wrong_text, 'een kleine kind');
  assert.equal(after.cases[0].source, 'exercise');
});

test('logMistake with no rule creates a pattern with rule null, then reuses it', SKIP, () => {
  const first = repo.logMistake({ rule_code: null, title: 'Нова помилка', wrong: 'a b', right: 'b a' });
  assert.equal(first.rule_id, null);
  assert.equal(first.rule_code, null);
  assert.equal(first.count, 1);
  const second = repo.logMistake({ rule_code: 'other', title: 'нова помилка', wrong: 'c', right: 'd' });
  assert.equal(second.id, first.id);
  assert.equal(second.count, 2);
});

test('logMistake rejects an unknown rule code with 400', SKIP, () => {
  assert.throws(() => repo.logMistake({ rule_code: '99.9', title: 'x', wrong: 'a', right: 'b' }),
    err => err.status === 400);
});

test('addWords skips existing entries (case-insensitive nl, same article)', SKIP, () => {
  const groot = wordId('groot');
  const { added, skipped } = repo.addWords([
    { nl: 'GROOT', uk: 'великий' },
    { nl: 'nieuwwoord', uk: 'нове слово' },
    { nl: 'groot', uk: 'велика', article: 'het' },
  ]);
  assert.deepEqual(skipped, [{ nl: 'GROOT', existing_id: groot }]);
  assert.deepEqual(added.map(w => w.nl), ['nieuwwoord', 'groot']);
});

test('listWords sort=errors puts groot first', SKIP, () => {
  const rows = repo.listWords({ sort: 'errors' });
  assert.equal(rows[0].nl, 'groot');
  assert.equal(rows[0].error_count, 4);
});

test('listWords filters by status and text, and returns topic names', SKIP, () => {
  assert.equal(repo.listWords({ status: 'learned' }).length, 3);
  const cafe = repo.listWords({ topic: 'У кафе' });
  assert.ok(cafe.length > 0);
  assert.ok(cafe.every(w => w.topic === 'У кафе'));
});

test('addWord detects expressions and creates a word with lesson errors', SKIP, () => {
  const expr = repo.addWord({ nl: 'hoe gaat het?', uk: 'як справи?', err: 2 });
  assert.equal(expr.kind, 'expression');
  assert.equal(expr.error_count, 2);
  assert.equal(repo.addWord({ nl: 'huis', uk: 'дім', article: 'het' }).kind, 'word');
});

test('updateWord moves a word to another topic and clears it with null', SKIP, () => {
  const id = wordId('bestellen');
  assert.equal(repo.updateWord(id, { topic: 'Нова тема' }).topic, 'Нова тема');
  assert.equal(repo.updateWord(id, { topic: null }).topic, null);
});

test('deleteRule moves its patterns to "other"', SKIP, () => {
  const adj = repo.getRule('5.5');
  repo.deleteRule(adj.id);
  const moved = repo.listPatterns({ rule_id: 'null' }).map(p => p.title);
  assert.ok(moved.includes(ADJ_HET_EEN));
  assert.equal(repo.listPatterns({ rule_code: '5.5' }).length, 0);
});

test('getRule accepts an id or a code', SKIP, () => {
  const byCode = repo.getRule('5.5');
  assert.equal(repo.getRule(byCode.id).code, '5.5');
  assert.equal(byCode.error_count, 10);
  assert.equal(repo.getRule('Д1').category, 'дієслово');
});

test('bad input gives 400 and missing rows give 404', SKIP, () => {
  assert.throws(() => repo.addWord({ nl: '', uk: 'x' }), err => err.status === 400);
  assert.throws(() => repo.getWord(999999), err => err.status === 404);
  assert.throws(() => repo.getWord('abc'), err => err.status === 400);
  assert.throws(() => repo.addCase(999999, { wrong: 'a', right: 'b' }), err => err.status === 404);
  assert.throws(() => repo.addCase(repo.listPatterns()[0].id, { wrong: 'a', right: 'b', date: '2026-02-30' }),
    err => err.status === 400);
});

test('stats and exportAll report the imported data', SKIP, () => {
  const s = repo.stats();
  assert.equal(s.words.total, 586);
  assert.equal(s.words.learned, 3);
  assert.equal(s.words.expressions, 137);
  assert.equal(s.cases, 22);
  assert.ok(s.sections.includes('Д1'));
  const out = repo.exportAll();
  assert.equal(out.collections.words.length, 586);
  assert.equal(out.collections.mistakes.find(m => m.id === 'hoeveelheid').rule, 'other');
});
