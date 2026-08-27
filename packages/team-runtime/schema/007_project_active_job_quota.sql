-- Supports the project-scoped active Job admission query. The admission query
-- holds a transaction advisory lock per project, so this index is an efficiency
-- aid rather than the source of its concurrency guarantee.
CREATE INDEX IF NOT EXISTS capability_jobs_project_active_index
  ON capability_jobs (project_id, status)
  WHERE status IN ('queued', 'running', 'input_required', 'cancel_requested');
