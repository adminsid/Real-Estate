# D1 Database Backup & Recovery Operations

This document details the backup automation script, cron configuration for scheduling automated runs, and recovery procedures for the Prime America real estate workspace D1 database.

## 1. Backup Script Overview
The automated backup script lives at [scripts/d1-backup.sh](file:///Users/siddharthalama/dev/real-estate/scripts/d1-backup.sh).

It executes the following workflow:
1. Performs a schema and data export of the remote production D1 database (`re-workspace-db`) using `wrangler d1 export`.
2. Uploads the exported `.sql` script file directly to the Cloudflare R2 bucket `re-workspace-assets` (under the `backups/` prefix).
3. Cleans up the temporary local SQL file.

### Manual Execution
Run the script from the repository root:
```bash
./scripts/d1-backup.sh
```

---

## 2. Automated Scheduling (Cron Job)
To schedule this script to run daily at 2:00 AM, configure a cron job on your server or orchestration host:

1. Open the cron editor:
   ```bash
   crontab -e
   ```

2. Add the following entry (adjust paths to absolute workspace values):
   ```cron
   0 2 * * * /Users/siddharthalama/dev/real-estate/scripts/d1-backup.sh >> /Users/siddharthalama/dev/real-estate/logs/d1-backup.log 2>&1
   ```

---

## 3. Database Recovery Procedure
If a bad migration or corruption occurs, recover the database using the stored SQL backups in R2.

### Step 1: Retrieve the Backup File
List backups in the R2 bucket:
```bash
npx wrangler r2 object list re-workspace-assets --prefix backups/
```

Download the desired backup file locally:
```bash
npx wrangler r2 object get re-workspace-assets/backups/backup_re-workspace-db_YYYY-MM-DD_HH-MM-SS.sql --file ./restore_backup.sql
```

### Step 2: Clear the Corrupt Database Tables
Before executing the backup script, you must drop the existing tables or recreate the database. The cleanest way is to recreate/reset:
```bash
# WARNING: This deletes all data and tables in the database!
npx wrangler d1 execute re-workspace-db --remote --command="DROP TABLE IF EXISTS d1_migrations; DROP TABLE IF EXISTS contacts; DROP TABLE IF EXISTS transactions; DROP TABLE IF EXISTS contact_activities; DROP TABLE IF EXISTS transaction_tasks; DROP TABLE IF EXISTS documents; DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS transaction_parties;"
```

### Step 3: Execute the Restore Script
Run the downloaded SQL backup script against the production database:
```bash
npx wrangler d1 execute re-workspace-db --remote --file ./restore_backup.sql
```

Confirm data is restored by querying:
```bash
npx wrangler d1 execute re-workspace-db --remote --command="SELECT COUNT(*) FROM transactions;"
```
