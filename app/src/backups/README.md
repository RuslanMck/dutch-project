# backups

Online backups of the SQLite database while the app runs.

## Files

| File | What it does |
|---|---|
| `database-backup-scheduler.js` | `createDatabaseBackupScheduler`: writes `dutch-YYYY-MM-DD.db` to the backup directory, keeps the newest files up to the retention count, and schedules a backup a minute after start and then daily. |
