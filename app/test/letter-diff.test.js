// The letter diff of a wrong typed word (plan 3.1) and the basket hit test of the article practice (plan 3.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildAnswerLetterDiff, buildLetterDiff, findBasketAt } from '../public/logic.js';

// Compact form of a diff: same letters as they are, wrong «[typed>right]», extra «[-typed]», missing «[+right]».
function summarise(diff) {
  if (diff === null) return null;
  return diff.map(entry => {
    if (entry.kind === 'same') return entry.typed;
    if (entry.kind === 'wrong') return `[${entry.typed}>${entry.right}]`;
    if (entry.kind === 'extra') return `[-${entry.typed}]`;
    return `[+${entry.right}]`;
  }).join('');
}

test('buildLetterDiff: a substituted letter is wrong (huiz / huis)', () => {
  assert.equal(summarise(buildLetterDiff('huiz', 'huis')), 'hui[z>s]');
});

test('buildLetterDiff: two swapped letters are two wrong letters (fiest / fiets)', () => {
  assert.equal(summarise(buildLetterDiff('fiest', 'fiets')), 'fie[s>t][t>s]');
});

test('buildLetterDiff: one wrong vowel (morgan / morgen)', () => {
  assert.equal(summarise(buildLetterDiff('morgan', 'morgen')), 'morg[a>e]n');
});

test('buildLetterDiff: a missing letter is missing (nagerect / nagerecht)', () => {
  assert.equal(summarise(buildLetterDiff('nagerect', 'nagerecht')), 'nagerec[+h]t');
});

test('buildLetterDiff: a typed letter the word does not have is extra', () => {
  assert.equal(summarise(buildLetterDiff('huisx', 'huis')), 'huis[-x]');
});

test('buildLetterDiff: the comparison ignores case, the letters keep their case', () => {
  assert.equal(summarise(buildLetterDiff('HUIS', 'huis')), 'HUIS');
  assert.equal(summarise(buildLetterDiff('Huiz', 'huis')), 'Hui[z>s]');
});

test('buildLetterDiff: too far apart, or an empty side, gives null', () => {
  assert.equal(buildLetterDiff('abc', 'abcdefghi'), null);   // 6 edits; the limit for 9 letters is 3
  assert.equal(buildLetterDiff('ho', 'huis'), null);         // 3 edits; the limit for 4 letters is 2
  assert.equal(buildLetterDiff('', 'huis'), null);
  assert.equal(buildLetterDiff('huis', ''), null);
});

test('buildAnswerLetterDiff: the article is left out, and nothing is shown when only the article or nothing is wrong', () => {
  const word = { nl: 'huis', article: 'het', uk: 'дім' };
  assert.equal(summarise(buildAnswerLetterDiff(word, 'het huiz')), 'hui[z>s]');
  assert.equal(summarise(buildAnswerLetterDiff(word, 'huiz')), 'hui[z>s]');
  assert.equal(buildAnswerLetterDiff(word, 'het huis'), null);
  assert.equal(buildAnswerLetterDiff(word, 'de huis'), null);   // only the article is wrong
  assert.equal(buildAnswerLetterDiff(word, 'dnk'), null);
  assert.equal(buildAnswerLetterDiff(word, '   '), null);
});

test('findBasketAt: the basket under the point, edges included, none outside', () => {
  const rects = {
    de: { left: 0, top: 0, right: 100, bottom: 50 },
    het: { left: 110, top: 0, right: 210, bottom: 50 },
  };
  assert.equal(findBasketAt({ x: 50, y: 25 }, rects), 'de');
  assert.equal(findBasketAt({ x: 150, y: 25 }, rects), 'het');
  assert.equal(findBasketAt({ x: 0, y: 0 }, rects), 'de');
  assert.equal(findBasketAt({ x: 100, y: 50 }, rects), 'de');
  assert.equal(findBasketAt({ x: 105, y: 25 }, rects), null);
  assert.equal(findBasketAt({ x: 150, y: 60 }, rects), null);
  assert.equal(findBasketAt({ x: 150, y: 25 }, { de: null, het: rects.het }), 'het');
  assert.equal(findBasketAt(null, rects), null);
});
