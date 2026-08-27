ALTER TABLE capability_jobs
  ADD COLUMN IF NOT EXISTS trace_parent TEXT;

ALTER TABLE capability_jobs
  ADD CONSTRAINT capability_jobs_trace_parent_format
  CHECK (
    trace_parent IS NULL OR (
      trace_parent ~ '^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$'
      AND substr(trace_parent, 4, 32) <> repeat('0', 32)
      AND substr(trace_parent, 37, 16) <> repeat('0', 16)
    )
  );
