-- RE Workspace — Task document requirement flag
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/009_task_document_required.sql --remote

ALTER TABLE transaction_tasks ADD COLUMN document_required INTEGER NOT NULL DEFAULT 0;
