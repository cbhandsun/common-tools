-- This schema owns durable team Job state.  Redis is deliberately not a source
-- of truth: a queue message may be delivered more than once or be lost.
CREATE TABLE IF NOT EXISTS capability_jobs (
  id UUID PRIMARY KEY,
  capability TEXT NOT NULL CHECK (capability IN ('image-to-editable', 'project-audit')),
  owner_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'input_required', 'cancel_requested', 'succeeded', 'failed', 'cancelled', 'expired')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  input_object_key TEXT NOT NULL,
  output_prefix TEXT NOT NULL,
  artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  quality JSONB,
  error JSONB,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS capability_jobs_active_idempotency
  ON capability_jobs (owner_id, capability, idempotency_key)
  WHERE status NOT IN ('succeeded', 'failed', 'cancelled', 'expired');

CREATE INDEX IF NOT EXISTS capability_jobs_queue_index
  ON capability_jobs (status, created_at)
  WHERE status IN ('queued', 'cancel_requested');

CREATE TABLE IF NOT EXISTS capability_job_events (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES capability_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS capability_job_events_job_index
  ON capability_job_events (job_id, occurred_at);
