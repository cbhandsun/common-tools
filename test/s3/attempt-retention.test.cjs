"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { S3Client } = require("@aws-sdk/client-s3");
const { Client } = require("pg");
const { runMigrations } = require("../../packages/team-runtime/migrations");
const { createObjectStore } = require("../../packages/remote-mcp-server/team-providers");
const { createTeamJob, PostgresJobRepository, TeamWorker, runTeamRetention } = require("../../packages/team-runtime");

const IMAGE = "minio/minio@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e";
const POSTGRES_IMAGE = "postgres@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error("isolated S3 container command failed");
  return result.stdout.trim();
}

test("PostgreSQL and MinIO recover expired execution and retry partial retention without losing winner bytes", { timeout: 120000 }, async (t) => {
  const secretAccessKey = crypto.randomBytes(24).toString("hex");
  const accessKeyId = "isolated-retention";
  const id = docker(["run", "--detach", "--rm", "--memory", "512m", "--cpus", "1", "--pids-limit", "128", "--tmpfs", "/data:rw,size=128m", "--publish", "127.0.0.1::9000", "--env", `MINIO_ROOT_USER=${accessKeyId}`, "--env", `MINIO_ROOT_PASSWORD=${secretAccessKey}`, IMAGE, "server", "/data", "--console-address", ":9001"]);
  assert.match(id, /^[a-f0-9]{64}$/);
  let client, databaseId;
  const connections = [];
  const keepAlive = setInterval(() => {}, 1000);
  let cleanedUp = false;
  async function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(keepAlive);
    if (client) client.destroy();
    try { await Promise.all(connections.map((connection) => connection.end())); }
    finally {
      try { if (databaseId) docker(["rm", "--force", databaseId]); }
      finally { docker(["rm", "--force", id]); }
    }
  }
  t.after(cleanup);
  try {
    const binding = docker(["port", id, "9000/tcp"]);
    assert.match(binding, /^127\.0\.0\.1:\d+$/);
    const endpoint = `http://${binding}`;
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      try { ready = (await fetch(`${endpoint}/minio/health/ready`, { signal: AbortSignal.timeout(1000) })).ok; } catch { ready = false; }
      if (ready) break;
      await delay(200);
    }
    assert.ok(ready, "isolated S3 did not become ready");
    client = new S3Client({ endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId, secretAccessKey }, maxAttempts: 1, requestHandler: { requestTimeout: 3000, connectionTimeout: 1000 } });
    const store = createObjectStore(client, "attempt-fixture", 900, { readinessRetryDelaysMs: [] });
    await store.ensureBucket(true);
    const password = crypto.randomBytes(24).toString("hex");
    databaseId = docker(["run", "--detach", "--rm", "--memory", "256m", "--cpus", "1", "--pids-limit", "128", "--tmpfs", "/var/lib/postgresql/data:rw,size=128m", "--publish", "127.0.0.1::5432", "--env", `POSTGRES_PASSWORD=${password}`, "--env", "POSTGRES_DB=retention_test", POSTGRES_IMAGE]);
    assert.match(databaseId, /^[a-f0-9]{64}$/);
    const databaseBinding = docker(["port", databaseId, "5432/tcp"]);
    assert.match(databaseBinding, /^127\.0\.0\.1:\d+$/);
    const options = { host: "127.0.0.1", port: Number(databaseBinding.split(":")[1]), database: "retention_test", user: "postgres", password, connectionTimeoutMillis: 1000, query_timeout: 5000 };
    const databaseDeadline = Date.now() + 30000;
    let primary;
    while (Date.now() < databaseDeadline) {
      const candidate = new Client(options);
      try { await candidate.connect(); primary = candidate; connections.push(candidate); break; }
      catch { await candidate.end(); await delay(200); }
    }
    assert.ok(primary, "isolated database did not become ready");
    const secondary = new Client(options);
    connections.push(secondary);
    await secondary.connect();
    assert.equal((await runMigrations({ client: primary })).length, 11);
    const repository = new PostgresJobRepository({ query: primary.query.bind(primary) });
    const replacementRepository = new PostgresJobRepository({ query: secondary.query.bind(secondary) });
    const ownerId = "s3-fixture";
    const root = `owners/${crypto.createHash("sha256").update(ownerId).digest("hex")}/`;
    const job = createTeamJob({ capability: "project-audit", ownerId, idempotencyKey: "fixture", inputObjectKey: `${root}inputs/source`, expiresAt: new Date(Date.now() + 3600000).toISOString(), maxAttempts: 3 });
    await store.putObject({ objectKey: job.inputObjectKey, body: Buffer.from("input"), contentType: "text/plain" });
    const sibling = `${root}jobs/unrelated/keep`;
    await store.putObject({ objectKey: sibling, body: Buffer.from("keep"), contentType: "text/plain" });
    await repository.create(job);
    let releaseOld, announceOld;
    const oldStarted = new Promise((resolve) => { announceOld = resolve; });
    const gate = new Promise((resolve) => { releaseOld = resolve; });
    const handlers = { "project-audit": async ({ job: scoped }) => {
      if (scoped.attempt === 1) { announceOld(); await gate; }
      const body = Buffer.from(String(scoped.attempt));
      const objectKey = `${scoped.outputPrefix}report.json`;
      await store.putObject({ objectKey, body, contentType: "application/json" });
      return { artifacts: [{ name: "report.json", objectKey, mediaType: "application/json", sha256: crypto.createHash("sha256").update(body).digest("hex") }], quality: { passed: true, checks: [{ name: "fixture", passed: true }], metrics: {} } };
    } };
    const worker = new TeamWorker({ repository, handlers });
    const replacementWorker = new TeamWorker({ repository: replacementRepository, handlers });
    const old = worker.process({ id: job.id }, "same-worker");
    const rejected = assert.rejects(old, /lease is no longer valid/);
    await oldStarted;
    try {
      await primary.query("UPDATE capability_jobs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [job.id]);
      const recovered = await replacementRepository.recoverExpiredLeases("fixture-recovery", "project-audit");
      assert.equal(recovered.length, 1);
      assert.equal(recovered[0].status, "queued");
      await replacementWorker.process({ id: job.id }, "same-worker");
    } finally { releaseOld(); }
    await rejected;
    const winner = await repository.get(job.id, ownerId);
    assert.equal(winner.status, "succeeded");
    assert.equal(winner.attempt, 2);
    assert.equal((await store.readObject({ objectKey: winner.artifacts[0].objectKey, maxBytes: 10 })).toString(), "2");
    assert.equal((await store.listObjects({ prefix: job.outputPrefix })).keys.length, 2);
    const retention = { repository, objectStore: store, actorId: "fixture-retention", retentionDays: 1 };
    assert.deepEqual(await runTeamRetention(retention), { expired: 0, cleaned: 0 });
    // Age only the terminal fixture row; the real candidate query must admit it.
    await primary.query("UPDATE capability_jobs SET updated_at = NOW() - INTERVAL '2 days' WHERE id = $1", [job.id]);
    let deletions = 0;
    await assert.rejects(runTeamRetention({ ...retention, objectStore: {
      ...store,
      async deleteObject(input) {
        if (++deletions === 2) throw new Error("injected storage outage");
        return store.deleteObject(input);
      }
    } }), /injected storage outage/);
    assert.equal(deletions, 2);
    assert.equal((await primary.query("SELECT retention_cleaned_at FROM capability_jobs WHERE id = $1", [job.id])).rows[0].retention_cleaned_at, null);
    assert.equal((await repository.get(job.id, ownerId)).artifacts.length, 1);
    assert.deepEqual(await runTeamRetention(retention), { expired: 0, cleaned: 1 });
    assert.ok((await primary.query("SELECT retention_cleaned_at FROM capability_jobs WHERE id = $1", [job.id])).rows[0].retention_cleaned_at);
    assert.deepEqual((await repository.get(job.id, ownerId)).artifacts, []);
    assert.deepEqual(await runTeamRetention(retention), { expired: 0, cleaned: 0 });
    assert.deepEqual((await store.listObjects({ prefix: job.outputPrefix })).keys, []);
    const firstCleanup = (await primary.query("SELECT retention_cleaned_at, updated_at FROM capability_jobs WHERE id = $1", [job.id])).rows[0];
    // A fenced-out worker can still finish an already admitted storage write.
    // The row must remain eligible for later orphan reconciliation after cleanup.
    const lateKey = `${job.outputPrefix}attempts/1/late-report.json`;
    await store.putObject({ objectKey: lateKey, body: Buffer.from("late"), contentType: "application/json" });
    assert.deepEqual(await runTeamRetention(retention), { expired: 0, cleaned: 0 }, "recent sweeps are throttled");
    await primary.query("UPDATE capability_jobs SET retention_last_swept_at = NOW() - INTERVAL '2 hours' WHERE id = $1", [job.id]);
    const beforeFailure = (await primary.query("SELECT retention_last_swept_at FROM capability_jobs WHERE id = $1", [job.id])).rows[0].retention_last_swept_at;
    await assert.rejects(runTeamRetention({ ...retention, objectStore: {
      ...store,
      async deleteObject(input) {
        if (input.objectKey === lateKey) throw new Error("injected recheck outage");
        return store.deleteObject(input);
      }
    } }), /injected recheck outage/);
    assert.equal((await primary.query("SELECT retention_last_swept_at FROM capability_jobs WHERE id = $1", [job.id])).rows[0].retention_last_swept_at.toISOString(), beforeFailure.toISOString());
    assert.deepEqual(await runTeamRetention(retention), { expired: 0, cleaned: 1 });
    assert.deepEqual((await store.listObjects({ prefix: job.outputPrefix })).keys, []);
    const afterRecheck = (await primary.query("SELECT retention_cleaned_at, updated_at FROM capability_jobs WHERE id = $1", [job.id])).rows[0];
    assert.deepEqual(afterRecheck, firstCleanup, "rechecks preserve first cleanup and job update timestamps");
    assert.equal((await primary.query("SELECT COUNT(*)::int AS count FROM capability_job_events WHERE job_id = $1 AND event_type = 'retention-cleaned'", [job.id])).rows[0].count, 1);
    // Existing deployments have no last-sweep value; fall back to their first cleanup.
    await primary.query("UPDATE capability_jobs SET retention_last_swept_at = NULL, retention_cleaned_at = NOW() - INTERVAL '2 hours' WHERE id = $1", [job.id]);
    assert.equal((await repository.listRetentionCandidates(1, 1))[0].id, job.id);
    const concurrentMarks = await Promise.all([
      repository.markRetentionCleaned(job.id, "fixture-retention"),
      replacementRepository.markRetentionCleaned(job.id, "fixture-retention")
    ]);
    assert.equal(concurrentMarks.filter(Boolean).length, 1, "only one sweep marker advances during concurrent completion");
    assert.equal((await primary.query("SELECT COUNT(*)::int AS count FROM capability_job_events WHERE job_id = $1 AND event_type = 'retention-cleaned'", [job.id])).rows[0].count, 1);
    const newlyDue = createTeamJob({ capability: "project-audit", ownerId, idempotencyKey: "retention-order", inputObjectKey: `${root}inputs/new`, expiresAt: new Date(Date.now() + 3600000).toISOString() });
    await repository.create(newlyDue);
    await primary.query("UPDATE capability_jobs SET status = 'failed', updated_at = NOW() - INTERVAL '1 day 30 minutes' WHERE id = $1", [newlyDue.id]);
    await primary.query("UPDATE capability_jobs SET retention_last_swept_at = NOW() - INTERVAL '2 hours' WHERE id = $1", [job.id]);
    assert.equal((await repository.listRetentionCandidates(1, 1))[0].id, job.id, "older due rechecks are not always placed behind first cleanups");
    assert.deepEqual((await repository.listRetentionCandidates(1, 2)).map((candidate) => candidate.id), [job.id, newlyDue.id]);
    const beforeEventFailure = (await primary.query("SELECT retention_cleaned_at, retention_last_swept_at, updated_at FROM capability_jobs WHERE id = $1", [newlyDue.id])).rows[0];
    await primary.query("CREATE FUNCTION reject_retention_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected retention event failure'; END $$");
    await primary.query("CREATE TRIGGER reject_retention_event BEFORE INSERT ON capability_job_events FOR EACH ROW WHEN (NEW.event_type = 'retention-cleaned') EXECUTE FUNCTION reject_retention_event()");
    await assert.rejects(repository.markRetentionCleaned(newlyDue.id, "fixture-retention"), /injected retention event failure/);
    assert.deepEqual((await primary.query("SELECT retention_cleaned_at, retention_last_swept_at, updated_at FROM capability_jobs WHERE id = $1", [newlyDue.id])).rows[0], beforeEventFailure, "event failure rolls back the cleanup marker in the same statement");
    await primary.query("DROP TRIGGER reject_retention_event ON capability_job_events");
    await primary.query("DROP FUNCTION reject_retention_event()");
    assert.ok(await repository.markRetentionCleaned(newlyDue.id, "fixture-retention"));
    assert.equal((await primary.query("SELECT COUNT(*)::int AS count FROM capability_job_events WHERE job_id = $1 AND event_type = 'retention-cleaned'", [newlyDue.id])).rows[0].count, 1);
    assert.equal((await store.readObject({ objectKey: sibling, maxBytes: 10 })).toString(), "keep");
    await assert.rejects(store.readObject({ objectKey: job.inputObjectKey, maxBytes: 10 }));
  } finally {
    await cleanup();
  }
});
