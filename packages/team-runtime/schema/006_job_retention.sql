ALTER TABLE capability_jobs
  ADD COLUMN IF NOT EXISTS retention_cleaned_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS capability_jobs_retention_cleanup_idx
  ON capability_jobs (updated_at ASC)
  WHERE status IN ('succeeded', 'failed', 'cancelled', 'expired')
    AND retention_cleaned_at IS NULL;
