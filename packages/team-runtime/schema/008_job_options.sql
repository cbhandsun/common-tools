ALTER TABLE capability_jobs
  ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE capability_jobs
  DROP CONSTRAINT IF EXISTS capability_jobs_options_object;

ALTER TABLE capability_jobs
  ADD CONSTRAINT capability_jobs_options_object
  CHECK (jsonb_typeof(options) = 'object');
