-- Keep the durable Job table aligned with the capabilities accepted by the
-- remote MCP boundary.  The original table constraint predated the PPT and
-- note capabilities, so existing databases need an explicit forward migration.
ALTER TABLE capability_jobs
  DROP CONSTRAINT IF EXISTS capability_jobs_capability_check;

ALTER TABLE capability_jobs
  ADD CONSTRAINT capability_jobs_capability_check
  CHECK (capability IN (
    'image-to-editable',
    'ppt-create',
    'ppt-improve',
    'ppt-quality',
    'project-audit',
    'siyuan-note'
  )) NOT VALID;

ALTER TABLE capability_jobs
  VALIDATE CONSTRAINT capability_jobs_capability_check;
