ALTER TABLE capability_jobs
  ADD COLUMN IF NOT EXISTS retention_last_swept_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS capability_jobs_retention_recheck_idx
  ON capability_jobs (COALESCE(retention_last_swept_at, retention_cleaned_at), id)
  WHERE status IN ('succeeded', 'failed', 'cancelled', 'expired')
    AND retention_cleaned_at IS NOT NULL;
