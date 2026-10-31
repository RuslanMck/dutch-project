// Builds the Express application: health check, MCP endpoint, sign-in, the files the login page needs, then
// everything else behind authentication (the REST API and the static app). No side effects: listening and
// timers belong to start-server.js.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { createAuthenticationRoutes } from '../authentication/authentication-routes.js';
import { createLoginRateLimiter } from '../authentication/login-rate-limiter.js';
import { createRequireAuthentication } from '../authentication/require-authentication.js';
import { createSessionCookie } from '../authentication/session-cookie.js';
import { createMcpServer } from '../model-context-protocol/create-mcp-server.js';
import { createMcpRoutes } from '../model-context-protocol/mcp-routes.js';
import { createApiRouter } from './create-api-router.js';

const PUBLIC_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const LOGIN_PAGE_PATH = path.join(PUBLIC_DIRECTORY, 'login.html');
const PUBLIC_FILE_NAMES_BEFORE_SIGN_IN = Object.freeze(['app.css', 'icon.svg', 'manifest.webmanifest']);
// The login page uses these too. Font files never change name, so browsers may cache them for a year.
const PUBLIC_FONT_DIRECTORY = path.join(PUBLIC_DIRECTORY, 'fonts');
const FONT_CACHE_MAX_AGE = '365d';
const JSON_BODY_LIMIT = '2mb';

// services: from create-domain-services.js, on the same changeEventBus.
export function createApplication({ configuration, services, changeEventBus, clock, logger = console }) {
  const sessionCookie = createSessionCookie({ sessionSecret: configuration.sessionSecret, clock });
  const application = express();
  application.set('trust proxy', 'loopback, uniquelocal');   // behind Caddy
  application.disable('x-powered-by');

  application.get('/api/health', (request, response) => response.json({ ok: true }));
  // MCP clients probe OAuth discovery; a plain 404 tells them the server needs no OAuth (auth is the secret URL).
  application.use('/.well-known', (request, response) => response.status(404).json({ error: 'not found' }));
  application.use('/mcp', express.json({ limit: JSON_BODY_LIMIT }), createMcpRoutes({
    createMcpServer: () => createMcpServer(services),
    mcpSecret: configuration.mcpSecret,
    apiToken: configuration.apiToken,
    logger,
  }));
  application.use(express.urlencoded({ extended: false }), express.json({ limit: JSON_BODY_LIMIT }));
  application.use(createAuthenticationRoutes({
    applicationPassword: configuration.applicationPassword,
    sessionCookie,
    loginRateLimiter: createLoginRateLimiter({ clock }),
    loginPagePath: LOGIN_PAGE_PATH,
  }));
  for (const fileName of PUBLIC_FILE_NAMES_BEFORE_SIGN_IN) {
    application.get(`/${fileName}`, (request, response) => response.sendFile(path.join(PUBLIC_DIRECTORY, fileName)));
  }
  application.use('/fonts', express.static(PUBLIC_FONT_DIRECTORY, { maxAge: FONT_CACHE_MAX_AGE, immutable: true }));
  application.use(createRequireAuthentication({ apiToken: configuration.apiToken, sessionCookie }));
  application.use('/api', createApiRouter({ ...services, changeEventBus, logger }));
  application.use(express.static(PUBLIC_DIRECTORY, { index: 'index.html' }));
  return application;
}
