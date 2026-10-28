// The server refuses to start without its secrets, outside test mode.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseEnvironmentConfiguration } from '../src/configuration/environment-configuration.js';

const START_SERVER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'server', 'start-server.js');

test('the server refuses to start outside test mode when a secret is missing', () => {
  const environment = { ...process.env, NODE_ENV: 'production', APP_PASSWORD: 'a', SESSION_SECRET: 'b' };
  delete environment.API_TOKEN;
  const startResult = spawnSync(process.execPath, [START_SERVER_PATH], { env: environment, encoding: 'utf8' });
  assert.notEqual(startResult.status, 0);
  assert.match(startResult.stderr, /missing required env API_TOKEN/);
});

test('the configuration loads outside test mode when all secrets are set', () => {
  const configuration = parseEnvironmentConfiguration({
    NODE_ENV: 'production',
    APP_PASSWORD: 'a',
    SESSION_SECRET: 'b',
    API_TOKEN: 'c',
  });
  assert.equal(configuration.applicationPassword, 'a');
  assert.equal(configuration.databasePath, './data/dutch.db');
  assert.equal(configuration.backupRetentionCount, 30);
  assert.ok(Object.isFrozen(configuration));
});

test('the OpenRouter key is optional and the model has a default', () => {
  const configuration = parseEnvironmentConfiguration({ NODE_ENV: 'test', OPENROUTER_API_KEY: '' });
  assert.equal(configuration.openRouterApiKey, '');
  assert.equal(configuration.openRouterModel, 'anthropic/claude-sonnet-4.5');
});

test('a blank OpenRouter key counts as not set, and surrounding spaces are dropped', () => {
  const blankKey = parseEnvironmentConfiguration({ NODE_ENV: 'test', OPENROUTER_API_KEY: '   ' });
  assert.equal(blankKey.openRouterApiKey, '');
  const paddedKey = parseEnvironmentConfiguration({ NODE_ENV: 'test', OPENROUTER_API_KEY: '  test-key \n' });
  assert.equal(paddedKey.openRouterApiKey, 'test-key');
});

test('a blank OpenRouter model falls back to the default, and a padded one is trimmed', () => {
  const blankModel = parseEnvironmentConfiguration({ NODE_ENV: 'test', OPENROUTER_MODEL: '  ' });
  assert.equal(blankModel.openRouterModel, 'anthropic/claude-sonnet-4.5');
  const paddedModel = parseEnvironmentConfiguration({ NODE_ENV: 'test', OPENROUTER_MODEL: ' openai/gpt-test ' });
  assert.equal(paddedModel.openRouterModel, 'openai/gpt-test');
});

test('the OpenRouter key and model are read when set', () => {
  const configuration = parseEnvironmentConfiguration({
    NODE_ENV: 'test',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL: 'openai/gpt-test',
  });
  assert.equal(configuration.openRouterApiKey, 'test-key');
  assert.equal(configuration.openRouterModel, 'openai/gpt-test');
});
