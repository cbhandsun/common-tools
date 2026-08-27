CREATE INDEX IF NOT EXISTS capability_job_events_lease_recovery_index
  ON capability_job_events (event_type, occurred_at)
  WHERE event_type IN ('lease-expired-requeued', 'lease-expired-failed');
