-- The same owner may submit the same idempotency key to separate projects.
-- NULL is the explicit legacy owner-only partition, not a wildcard.
DROP INDEX IF EXISTS capability_jobs_active_idempotency;

CREATE UNIQUE INDEX capability_jobs_active_idempotency
  ON capability_jobs (owner_id, project_id, capability, idempotency_key) NULLS NOT DISTINCT
  WHERE status NOT IN ('succeeded', 'failed', 'cancelled', 'expired');
