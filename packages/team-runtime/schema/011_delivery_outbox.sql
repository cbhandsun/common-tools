-- Retain queued delivery intent until claim/cancellation, including after Redis publication.
CREATE TABLE capability_job_deliveries (
  job_id UUID PRIMARY KEY REFERENCES capability_jobs(id) ON DELETE CASCADE,
  generation BIGSERIAL NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX capability_job_deliveries_order_idx ON capability_job_deliveries (available_at, generation);
CREATE FUNCTION maintain_capability_job_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'queued' THEN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO capability_job_deliveries (job_id) VALUES (NEW.id)
      ON CONFLICT (job_id) DO UPDATE SET generation = EXCLUDED.generation, available_at = EXCLUDED.available_at;
    END IF;
  ELSE
    DELETE FROM capability_job_deliveries WHERE job_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER capability_job_delivery_intent
AFTER INSERT OR UPDATE OF status ON capability_jobs
FOR EACH ROW EXECUTE FUNCTION maintain_capability_job_delivery();
INSERT INTO capability_job_deliveries (job_id)
SELECT id FROM capability_jobs WHERE status = 'queued';
