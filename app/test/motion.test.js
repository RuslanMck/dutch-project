import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  choosePetalCount, RULE_QUIZ_LOADING_PHRASES, pickLoadingPhrase, chooseStreakRollStart,
} from '../public/logic.js';

test('choosePetalCount: many for a strong result, some for a good one, none for a weak one', () => {
  assert.equal(choosePetalCount(10, 10), 36);
  assert.equal(choosePetalCount(9, 10), 36);
  assert.equal(choosePetalCount(7, 10), 20);
  assert.equal(choosePetalCount(6, 10), 0);
  assert.equal(choosePetalCount(0, 0), 0);
});

test('pickLoadingPhrase: the captions in turn, the last one stays', () => {
  assert.equal(pickLoadingPhrase(0), RULE_QUIZ_LOADING_PHRASES[0]);
  assert.equal(pickLoadingPhrase(2), RULE_QUIZ_LOADING_PHRASES[2]);
  assert.equal(pickLoadingPhrase(99), RULE_QUIZ_LOADING_PHRASES.at(-1));
  assert.equal(pickLoadingPhrase(-1), RULE_QUIZ_LOADING_PHRASES[0]);
});

test('chooseStreakRollStart: rolls only when the streak grew since it was seen', () => {
  assert.equal(chooseStreakRollStart('6', 7), 6);
  assert.equal(chooseStreakRollStart('7', 7), null);
  assert.equal(chooseStreakRollStart('9', 2), null);
  assert.equal(chooseStreakRollStart(null, 3), null);
  assert.equal(chooseStreakRollStart('abc', 3), null);
});

test('the service worker keeps motion.js for offline use, and reduced motion turns animations off', () => {
  assert.match(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), /'\/motion\.js'/);
  assert.match(readFileSync(new URL('../storybook/styles/garden.css', import.meta.url), 'utf8'), /prefers-reduced-motion: reduce/);
});
