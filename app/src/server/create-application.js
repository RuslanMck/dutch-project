// Builds the Express application: health check, MCP endpoint, sign-in, the files the login page needs, then
// everything else behind authentication (the REST API and the static app). No side effects: listening and
// timers belong to start-server.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { createAuthenticationRoutes } from '../authentication/authentication-routes.js';
import { createLoginRateLimiter } from '../authentication/login-rate-limiter.js';
import { createRequireAuthentication } from '../authentication/require-authentication.js';
import { createSessionCookie } from '../authentication/session-cookie.js';
import { createMcpServer } from '../model-context-protocol/create-mcp-server.js';
import { createMcpRoutes } from '../model-context-protocol/mcp-routes.js';
import { computeAppVersion } from './app-version.js';
import { createApiRouter } from './create-api-router.js';

const PUBLIC_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const PUBLIC_FILE_NAMES_BEFORE_SIGN_IN = Object.freeze([
  'app.css', 'icon.svg', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png',
]);
const SERVICE_WORKER_FILE_NAME = 'sw.js';
const APP_VERSION_PLACEHOLDER = '__APP_VERSION__';
// The login page uses these too. Font files never change name, so browsers may cache them for a year.
const FONT_CACHE_MAX_AGE = '365d';
const JSON_BODY_LIMIT = '2mb';

// services: from create-domain-services.js, on the same changeEventBus. publicDirectory: where the app's files are
// (tests give a fixture directory).
export function createApplication({
  configuration,
  services,
  changeEventBus,
  clock,
  logger = console,
  publicDirectory = PUBLIC_DIRECTORY,
}) {
  const sessionCookie = createSessionCookie({ sessionSecret: configuration.sessionSecret, clock });
  const loginPagePath = path.join(publicDirectory, 'login.html');
  const fontDirectory = path.join(publicDirectory, 'fonts');
  const appVersion = computeAppVersion(publicDirectory);
  const serviceWorkerSource = createServiceWorkerSource({ publicDirectory, appVersion });
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
    loginPagePath,
  }));
  // The service worker holds no data, so it is served before sign-in. It is read per request (the first read is kept).
  application.get(`/${SERVICE_WORKER_FILE_NAME}`, async (request, response) => {
    const source = await serviceWorkerSource.read();
    if (source === null) return response.status(404).json({ error: 'not found' });
    response.type('text/javascript; charset=utf-8');
    response.set('Cache-Control', 'no-cache');
    response.send(source);
  });
  for (const fileName of PUBLIC_FILE_NAMES_BEFORE_SIGN_IN) {
    application.get(`/${fileName}`, (request, response) => response.sendFile(path.join(publicDirectory, fileName)));
  }
  application.use('/fonts', express.static(fontDirectory, { maxAge: FONT_CACHE_MAX_AGE, immutable: true }));
  application.use(createRequireAuthentication({ apiToken: configuration.apiToken, sessionCookie }));
  application.get('/api/version', (request, response) => response.json({ version: appVersion }));
  application.use('/api', createApiRouter({ ...services, changeEventBus, logger }));
  application.use(express.static(publicDirectory, { index: 'index.html' }));
  return application;
}

// Reads public/sw.js on first use, replaces the version placeholder and keeps the result. read() gives null when the
// file does not exist.
function createServiceWorkerSource({ publicDirectory, appVersion }) {
  const serviceWorkerPath = path.join(publicDirectory, SERVICE_WORKER_FILE_NAME);
  let cachedSource;
  return Object.freeze({
    async read() {
      if (cachedSource !== undefined) return cachedSource;
      try {
        const sourceText = await fs.promises.readFile(serviceWorkerPath, 'utf8');
        cachedSource = sourceText.replaceAll(APP_VERSION_PLACEHOLDER, appVersion);
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
      return cachedSource;
    },
  });
}
