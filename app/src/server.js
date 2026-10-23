import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRoutes, requireAuth } from './auth.js';
import { createApiRouter } from './api.js';
import { createMcpRouter } from './mcp.js';
import { createDatabaseBackupScheduler } from './backups/database-backup-scheduler.js';
import { createChangeEventBus } from './change-events/change-event-bus.js';
import { createDatabaseConnection } from './database/create-database-connection.js';
import { runDatabaseMigrations } from './database/run-database-migrations.js';
import { createDomainServices } from './server/create-domain-services.js';
import { createSystemClock } from './time/system-clock.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT || 3000);

const clock = createSystemClock();
const database = createDatabaseConnection({ databasePath: process.env.DB_PATH || './data/dutch.db' });
runDatabaseMigrations({ database, clock });   // before accepting requests
const changeEventBus = createChangeEventBus({ clock });
const services = createDomainServices({ database, changeEventBus, clock });

const app = express();
app.set('trust proxy', 'loopback, uniquelocal');   // behind Caddy
app.disable('x-powered-by');

app.get('/api/health', (req, res) => res.json({ ok: true }));
// MCP clients probe OAuth discovery; a plain 404 tells them the server needs no OAuth (auth is the secret URL).
app.use('/.well-known', (req, res) => res.status(404).json({ error: 'not found' }));
app.use('/mcp', express.json({ limit: '2mb' }), createMcpRouter(services));   // own auth (secret path or bearer)
app.use(express.urlencoded({ extended: false }), express.json({ limit: '2mb' }));
app.use(authRoutes);                                                 // /login, /auth/login, /auth/logout
for (const f of ['app.css', 'icon.svg', 'manifest.webmanifest']) {   // the login page needs these before sign-in
  app.get('/' + f, (req, res) => res.sendFile(path.join(PUBLIC_DIR, f)));
}
app.use(requireAuth);                                                // everything below needs cookie or bearer
app.use('/api', createApiRouter({ ...services, changeEventBus }));
app.use(express.static(PUBLIC_DIR, { index: 'index.html' }));

app.listen(PORT, () => console.log(`dutch-app listening on :${PORT}`));
createDatabaseBackupScheduler({
  database,
  backupDirectory: process.env.BACKUP_DIR || './data/backups',
  retentionCount: Number(process.env.BACKUP_KEEP || 30),
  clock,
}).startDailyBackups();
