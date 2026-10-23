// Browser login (signed cookie) and API auth (cookie or Bearer token).
// Required env: APP_PASSWORD, SESSION_SECRET, API_TOKEN. Missing values stop the process at import,
// except when NODE_ENV=test.
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOGIN_PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'login.html');
const COOKIE = 'dutch_session';
const MAX_AGE_S = 15552000;                 // 180 days
const RATE_MAX = 10;                        // failed logins per window, per IP
const RATE_WINDOW_MS = 15 * 60_000;

const APP_PASSWORD = process.env.APP_PASSWORD ?? '';
const SESSION_SECRET = process.env.SESSION_SECRET ?? '';
const API_TOKEN = process.env.API_TOKEN ?? '';

if (process.env.NODE_ENV !== 'test') {
  const missing = Object.entries({ APP_PASSWORD, SESSION_SECRET, API_TOKEN })
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`auth: missing required env ${missing.join(', ')}`);
}

const sha256 = s => crypto.createHash('sha256').update(String(s)).digest();
const PASSWORD_DIGEST = sha256(APP_PASSWORD);
const TOKEN_DIGEST = sha256(API_TOKEN);

// Cookie value: "<expiresMs>.<hex HMAC-SHA256(expiresMs, SESSION_SECRET)>"
const sign = expiresStr => crypto.createHmac('sha256', SESSION_SECRET).update(expiresStr).digest('hex');

function makeSessionValue() {
  const exp = String(Date.now() + MAX_AGE_S * 1000);
  return `${exp}.${sign(exp)}`;
}

function validSession(value) {
  if (typeof value !== 'string') return false;
  const dot = value.indexOf('.');
  if (dot < 0) return false;
  const expStr = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^\d+$/.test(expStr) || !(Number(expStr) > Date.now())) return false;
  const expected = sign(expStr);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i >= 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

function validBearer(req) {
  const h = req.headers.authorization;
  if (!h || !API_TOKEN) return false;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return Boolean(m) && crypto.timingSafeEqual(sha256(m[1].trim()), TOKEN_DIGEST);
}

function isAuthed(req) {
  return validBearer(req) || validSession(getCookie(req, COOKIE));
}

export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.redirect(303, '/login');
}

// ---- failed-login rate limit (in memory, per IP)

const failures = new Map();   // ip -> { count, resetAt }

function limited(ip) {
  const f = failures.get(ip);
  if (!f) return false;
  if (Date.now() >= f.resetAt) {
    failures.delete(ip);
    return false;
  }
  return f.count >= RATE_MAX;
}

function recordFailure(ip) {
  const now = Date.now();
  let f = failures.get(ip);
  if (!f || now >= f.resetAt) {
    f = { count: 0, resetAt: now + RATE_WINDOW_MS };
    failures.set(ip, f);
  }
  f.count++;
}

const FALLBACK_LOGIN = (failed) => `<!doctype html>
<html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Вхід</title></head>
<body style="font-family:system-ui,sans-serif;max-width:320px;margin:15vh auto;padding:0 16px">
<form method="post" action="/auth/login">
<label>Пароль<br><input type="password" name="password" autofocus required style="width:100%;font-size:16px;padding:8px"></label>
<p><button type="submit" style="font-size:16px;padding:8px 16px">Увійти</button></p>
${failed ? '<p style="color:#b91c1c">Невірний пароль</p>' : ''}
</form></body></html>`;

export const authRoutes = express.Router();

authRoutes.get('/login', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (fs.existsSync(LOGIN_PAGE)) return res.sendFile(LOGIN_PAGE);
  res.type('html').send(FALLBACK_LOGIN(req.query.e !== undefined));
});

authRoutes.post('/auth/login', express.urlencoded({ extended: false }), (req, res) => {
  const ip = req.ip;
  if (limited(ip)) {
    return res.status(429).type('text/plain; charset=utf-8')
      .send('Забагато невдалих спроб. Спробуйте через 15 хвилин.');
  }
  const submitted = typeof req.body?.password === 'string' ? req.body.password : '';
  const ok = APP_PASSWORD !== '' && crypto.timingSafeEqual(sha256(submitted), PASSWORD_DIGEST);
  if (!ok) {
    recordFailure(ip);
    return res.redirect(303, '/login?e=1');
  }
  failures.delete(ip);
  res.append('Set-Cookie', `${COOKIE}=${makeSessionValue()}; Max-Age=${MAX_AGE_S}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  res.redirect(303, '/');
});

authRoutes.post('/auth/logout', (req, res) => {
  res.append('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
  res.redirect(303, '/login');
});
