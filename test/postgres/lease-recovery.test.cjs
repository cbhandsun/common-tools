"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { Client } = require("pg");
const { PostgresJobRepository, createTeamJob, recoverWorkerLeases } = require("../../packages/team-runtime");
const { runMigrations } = require("../../packages/team-runtime/migrations");
const { verifyRedisDeliveryRecovery } = require("../helpers/redis-delivery-recovery.cjs");

const IMAGE = "postgres@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error("isolated PostgreSQL container command failed");
  return result.stdout.trim();
}

test("PostgreSQL fences expired claims and repairs delivery after real Redis loss", { timeout: 120000 }, async () => {
  const password = crypto.randomBytes(24).toString("hex");
  const id = docker(["run", "--detach", "--rm", "--memory", "256m", "--cpus", "1", "--pids-limit", "128", "--tmpfs", "/var/lib/postgresql/data:rw,size=128m", "--publish", "127.0.0.1::5432", "--env", `POSTGRES_PASSWORD=${password}`, "--env", "POSTGRES_DB=lease_test", IMAGE]);
  assert.match(id, /^[a-f0-9]{64}$/);
  const clients = [];
  try {
    const binding = docker(["port", id, "5432/tcp"]);
    assert.match(binding, /^127\.0\.0\.1:\d+$/);
    const options = { host: "127.0.0.1", port: Number(binding.split(":")[1]), database: "lease_test", user: "postgres", password, connectionTimeoutMillis: 1000, query_timeout: 5000 };
    const deadline = Date.now() + 30000;
    let primary;
    while (Date.now() < deadline) {
      const candidate = new Client(options);
      try { await candidate.connect(); primary = candidate; clients.push(candidate); break; }
      catch { await candidate.end(); await delay(200); }
    }
    assert.ok(primary, "isolated database did not become ready");
    const secondary = new Client(options);
    await secondary.connect();
    clients.push(secondary);
    assert.equal((await runMigrations({ client: primary })).length, 11);
    assert.deepEqual(await runMigrations({ client: primary }), []);
    const first = new PostgresJobRepository({ query: primary.query.bind(primary) });
    const second = new PostgresJobRepository({ query: secondary.query.bind(secondary) });
    const ownerId = "lease-fixture";
    const owner = crypto.createHash("sha256").update(ownerId).digest("hex");
    const job = createTeamJob({ capability: "project-audit", ownerId, idempotencyKey: "lease-recovery", inputObjectKey: `owners/${owner}/inputs/fixture.tar.gz`, expiresAt: new Date(Date.now() + 3600000).toISOString(), maxAttempts: 3 });
    await first.create(job);
    const claims = await Promise.all([first.claim(job.id, "same-worker", 30), second.claim(job.id, "same-worker", 30)]);
    assert.equal(claims.filter(Boolean).length, 1, "only one connection may claim a queued job");
    assert.equal(claims.find(Boolean).attempt, 1);
    // Advance only this fixture row; do not wait for or alter the database clock.
    await primary.query("UPDATE capability_jobs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [job.id]);
    assert.equal(await first.heartbeat(job.id, "same-worker", 30, 1), false);
    assert.equal((await second.recoverExpiredLeases("fixture-recovery", "project-audit"))[0].status, "queued");
    const replacement = await second.claim(job.id, "same-worker", 30);
    assert.equal(replacement.attempt, 2);
    assert.equal(await first.heartbeat(job.id, "same-worker", 30, 1), false);
    assert.equal(await second.heartbeat(job.id, "same-worker", 30, 2), true);
    for (const to of ["succeeded", "failed"]) {
      await assert.rejects(first.transition({ id: job.id, workerId: "same-worker", attempt: 1, from: "running", to }), /lease is no longer valid/);
    }
    await second.requestCancel(job.id, ownerId);
    assert.equal(await first.isCancellationRequested(job.id, "same-worker", 1), false);
    assert.equal(await second.isCancellationRequested(job.id, "same-worker", 2), true);
    await assert.rejects(first.transition({ id: job.id, workerId: "same-worker", attempt: 1, from: "cancel_requested", to: "cancelled" }), /lease is no longer valid/);
    assert.equal((await second.transition({ id: job.id, workerId: "same-worker", attempt: 2, from: "cancel_requested", to: "cancelled" })).status, "cancelled");
    assert.equal(await second.heartbeat(job.id, "same-worker", 30, 2), false);
    await assert.rejects(second.transition({ id: job.id, workerId: "same-worker", attempt: 2, from: "cancel_requested", to: "cancelled" }), /lease is no longer valid/);
    const result = await first.get(job.id, ownerId);
    assert.equal(result.attempt, 2);
    assert.equal(result.status, "cancelled");
    const lastTry = createTeamJob({ capability: "project-audit", ownerId, idempotencyKey: "last-attempt", inputObjectKey: job.inputObjectKey, expiresAt: job.expiresAt, maxAttempts: 1 });
    await first.create(lastTry);
    assert.equal((await first.claim(lastTry.id, "same-worker", 30)).attempt, 1);
    await primary.query("UPDATE capability_jobs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [lastTry.id]);
    const recovered = await second.recoverExpiredLeases("fixture-recovery", "project-audit");
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].status, "failed");
    assert.equal(recovered[0].error.code, "WORKER_LEASE_EXPIRED");
    assert.equal(await first.claim(lastTry.id, "same-worker", 30), null);
    const pending = createTeamJob({ capability: "project-audit", ownerId, idempotencyKey: "delivery-outage", inputObjectKey: job.inputObjectKey, expiresAt: job.expiresAt, maxAttempts: 3 });
    await first.create(pending);
    const initialIntent = (await first.listPendingDeliveries("project-audit"))[0];
    assert.equal(initialIntent.id, pending.id, "initial creation commits delivery intent");
    await first.claim(pending.id, "same-worker", 30);
    assert.deepEqual(await first.listPendingDeliveries("project-audit"), []);
    await primary.query("UPDATE capability_jobs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [pending.id]);
    const sent = [];
    let unavailable = true;
    const queue = { async recover() { return false; }, async enqueue(message) { if (unavailable) throw new Error("injected queue outage"); sent.push(message); } };
    const recover = () => recoverWorkerLeases({ repository: first, queue, actorId: "fixture-recovery", capability: "project-audit" });
    await assert.rejects(recover(), /injected queue outage/);
    assert.equal((await first.get(pending.id, ownerId)).status, "queued");
    const retryIntent = (await first.listPendingDeliveries("project-audit"))[0];
    assert.notEqual(retryIntent.generation, initialIntent.generation);
    assert.equal(await first.acknowledgeDelivery(pending.id, initialIntent.generation), false);
    unavailable = false;
    assert.deepEqual(await recover(), [], "second pass has no expired running leases");
    assert.deepEqual(sent, [{ id: pending.id, capability: "project-audit" }]);
    assert.deepEqual(await first.listPendingDeliveries("project-audit"), [], "successful publish defers periodic repair");
    sent.length = 0; // Simulate lost queue contents; this is not a real Redis crash test.
    await primary.query("UPDATE capability_job_deliveries SET available_at = NOW() - INTERVAL '1 second' WHERE job_id = $1", [pending.id]);
    await recover();
    assert.equal(sent.length, 1, "queued intent survives successful publication for loss repair");
    const duplicateClaims = await Promise.all([first.claim(pending.id, "same-worker", 30), second.claim(pending.id, "same-worker", 30)]);
    assert.equal(duplicateClaims.filter(Boolean).length, 1);
    assert.equal(duplicateClaims.find(Boolean).attempt, 2);
    assert.deepEqual(await first.listPendingDeliveries("project-audit"), []);
    assert.equal(await first.acknowledgeDelivery(pending.id, retryIntent.generation), false);
    const fixture = (key) => createTeamJob({ capability: "project-audit", ownerId, idempotencyKey: key, inputObjectKey: job.inputObjectKey, expiresAt: job.expiresAt });
    const rolledBack = fixture("rolled-back-intent");
    await primary.query("BEGIN");
    await first.create(rolledBack);
    assert.equal((await first.listPendingDeliveries("project-audit"))[0].id, rolledBack.id);
    await primary.query("ROLLBACK");
    assert.deepEqual(await second.listPendingDeliveries("project-audit"), [], "intent rolls back with Job creation");
    const oldest = fixture("oldest-pending");
    const next = fixture("next-pending");
    await first.create(oldest);
    await first.create(next);
    const [head] = await first.listPendingDeliveries("project-audit", 1);
    assert.equal(head.id, oldest.id);
    await first.acknowledgeDelivery(head.id, head.generation);
    assert.equal((await second.listPendingDeliveries("project-audit", 1))[0].id, next.id, "successful head does not starve later intent");
    assert.deepEqual(await first.listPendingDeliveries("ppt-quality"), []);
    // Settle earlier queued fixtures so this real queue exercise has one pending Job.
    await first.claim(oldest.id, "fixture-worker", 30);
    await first.claim(next.id, "fixture-worker", 30);
    // These exact fixtures have finished their assertions; do not let slow CI
    // expire their leases while the later process test is selecting deliveries.
    await primary.query("UPDATE capability_jobs SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL WHERE id = ANY($1::uuid[])", [[pending.id, oldest.id, next.id]]);
    await verifyRedisDeliveryRecovery({ primary, first, second, fixture, database: options });
  } finally {
    try { await Promise.all(clients.map((client) => client.end())); }
    finally { docker(["rm", "--force", id]); }
  }
});
