-- Project membership is asserted by the OIDC token at request time.  A NULL
-- project_id denotes a pre-RBAC owner-only Job and must never become project
-- readable by inference.
ALTER TABLE capability_jobs
  ADD COLUMN IF NOT EXISTS project_id TEXT;

ALTER TABLE capability_jobs
  DROP CONSTRAINT IF EXISTS capability_jobs_project_id_format;

ALTER TABLE capability_jobs
  ADD CONSTRAINT capability_jobs_project_id_format
  CHECK (project_id IS NULL OR project_id ~ '^[a-z][a-z0-9-]{2,63}$');

CREATE INDEX IF NOT EXISTS capability_jobs_project_index
  ON capability_jobs (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
