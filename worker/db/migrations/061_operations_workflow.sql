-- Add workflow details without changing existing project and task identities.
ALTER TABLE operations_projects ADD COLUMN workflow_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE operations_projects ADD COLUMN last_command_id TEXT;
ALTER TABLE operations_project_tasks ADD COLUMN details_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE operations_project_comments ADD COLUMN task_id TEXT;
