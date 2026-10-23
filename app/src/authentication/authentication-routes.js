// Browser sign-in: GET /login (the page), POST /auth/login (password form, sets the session cookie) and
// POST /auth/logout (clears it).
import fs from 'node:fs';

import express from 'express';

import { isSameSecret } from './secret-comparison.js';
import { SESSION_COOKIE_NAME, SESSION_MAXIMUM_AGE_SECONDS } from './session-cookie.js';

const COOKIE_ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Lax';

// Used only when public/login.html is missing.
const renderFallbackLoginPage = hasFailed => `<!doctype html>
<html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Вхід</title></head>
<body style="font-family:system-ui,sans-serif;max-width:320px;margin:15vh auto;padding:0 16px">
<form method="post" action="/auth/login">
<label>Пароль<br><input type="password" name="password" autofocus required style="width:100%;font-size:16px;padding:8px"></label>
<p><button type="submit" style="font-size:16px;padding:8px 16px">Увійти</button></p>
${hasFailed ? '<p style="color:#b91c1c">Невірний пароль</p>' : ''}
</form></body></html>`;

export function createAuthenticationRoutes({ applicationPassword, sessionCookie, loginRateLimiter, loginPagePath }) {
  const authenticationRouter = express.Router();

  authenticationRouter.get('/login', (request, response) => {
    response.set('Cache-Control', 'no-store');
    if (fs.existsSync(loginPagePath)) return response.sendFile(loginPagePath);
    response.type('html').send(renderFallbackLoginPage(request.query.e !== undefined));
  });

  authenticationRouter.post('/auth/login', express.urlencoded({ extended: false }), (request, response) => {
    const clientAddress = request.ip;
    if (loginRateLimiter.isLimited(clientAddress)) {
      return response.status(429).type('text/plain; charset=utf-8')
        .send('Забагато невдалих спроб. Спробуйте через 15 хвилин.');
    }
    const submittedPassword = typeof request.body?.password === 'string' ? request.body.password : '';
    const isCorrectPassword = applicationPassword !== '' && isSameSecret(submittedPassword, applicationPassword);
    if (!isCorrectPassword) {
      loginRateLimiter.recordFailedLogin(clientAddress);
      return response.redirect(303, '/login?e=1');
    }
    loginRateLimiter.clearFailedLogins(clientAddress);
    const sessionValue = sessionCookie.createSessionValue();
    response.append(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${sessionValue}; Max-Age=${SESSION_MAXIMUM_AGE_SECONDS}; ${COOKIE_ATTRIBUTES}`,
    );
    response.redirect(303, '/');
  });

  authenticationRouter.post('/auth/logout', (request, response) => {
    response.append('Set-Cookie', `${SESSION_COOKIE_NAME}=; Max-Age=0; ${COOKIE_ATTRIBUTES}`);
    response.redirect(303, '/login');
  });

  return authenticationRouter;
}
