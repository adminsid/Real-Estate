#!/bin/bash
# D1 Backup Automation Script
# Backs up the re-workspace-db to R2 bucket backup folders and local files.

DB_NAME="re-workspace-db"
BUCKET_NAME="re-workspace-assets"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="backup_${DB_NAME}_${TIMESTAMP}.sql"

echo "Starting D1 database backup for ${DB_NAME}..."

# Export D1 DB to SQL file
npx wrangler d1 export ${DB_NAME} --remote --output ./${BACKUP_FILE}

if [ $? -eq 0 ]; then
  echo "Backup successfully exported locally to ${BACKUP_FILE}"

  # Upload backup SQL to R2 assets bucket (under backups/ prefix)
  echo "Uploading backup to R2 bucket (${BUCKET_NAME})..."
  npx wrangler r2 object put ${BUCKET_NAME}/backups/${BACKUP_FILE} --file ./${BACKUP_FILE} --remote

  if [ $? -eq 0 ]; then
    echo "Backup uploaded to R2 successfully: backups/${BACKUP_FILE}"
    # Remove local temp file
    rm ./${BACKUP_FILE}
  else
    echo "Error: Failed to upload backup to R2."
    exit 1
  fi
else
  echo "Error: D1 export failed."
  exit 1
fi

echo "D1 backup process completed successfully."
