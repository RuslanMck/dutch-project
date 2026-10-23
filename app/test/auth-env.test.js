import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const AUTH = pathToFileURL(path.join(here, '..', 'src', 'auth.js')).href;

function importAuthWith(env) {
  const base = { ...process.env, NODE_ENV: 'production' };
  for (const k of ['APP_PASSWORD', 'SESSION_SECRET', 'API_TOKEN']) delete base[k];
  return spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(AUTH)})`], {
    env: { ...base, ...env },
    encoding: 'utf8',
  });
}

test('auth refuses to load outside test mode when a secret is missing', () => {
  const r = importAuthWith({ APP_PASSWORD: 'a', SESSION_SECRET: 'b' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /missing required env API_TOKEN/);
});

test('auth loads outside test mode when all secrets are set', () => {
  const r = importAuthWith({ APP_PASSWORD: 'a', SESSION_SECRET: 'b', API_TOKEN: 'c' });
  assert.equal(r.status, 0, r.stderr);
});
