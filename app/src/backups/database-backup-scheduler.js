// Daily online SQLite backup to <backupDirectory>/dutch-YYYY-MM-DD.db, keeping the newest retentionCount files.
import fs from 'node:fs';
import path from 'node:path';

const BACKUP_FILE_NAME_PATTERN = /^dutch-\d{4}-\d\d-\d\d\.db$/;
const FIRST_BACKUP_DELAY_MILLISECONDS = 60_000;
const BACKUP_INTERVAL_MILLISECONDS = 24 * 3600_000;

export function createDatabaseBackupScheduler({ database, backupDirectory, retentionCount, clock, logger = console }) {
  // Writes today's backup (UTC date) and deletes the oldest ones past the retention count. Returns the file path.
  async function createBackup() {
    fs.mkdirSync(backupDirectory, { recursive: true });
    const backupFilePath = path.join(backupDirectory, `dutch-${new Date(clock.now()).toISOString().slice(0, 10)}.db`);
    await database.backup(backupFilePath);
    const expiredFileNames = fs.readdirSync(backupDirectory)
      .filter(fileName => BACKUP_FILE_NAME_PATTERN.test(fileName))
      .sort()
      .slice(0, -retentionCount);
    for (const expiredFileName of expiredFileNames) fs.unlinkSync(path.join(backupDirectory, expiredFileName));
    return backupFilePath;
  }

  // First backup a minute after start, then every 24 hours. The timers do not keep the process alive.
  function startDailyBackups() {
    const runBackup = () => createBackup()
      .then(backupFilePath => logger.log('backup written', backupFilePath))
      .catch(error => logger.error('backup failed', error));
    setTimeout(runBackup, FIRST_BACKUP_DELAY_MILLISECONDS).unref();
    setInterval(runBackup, BACKUP_INTERVAL_MILLISECONDS).unref();
  }

  return Object.freeze({ createBackup, startDailyBackups });
}
