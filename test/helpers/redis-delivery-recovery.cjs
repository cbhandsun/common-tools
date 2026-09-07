"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const net = require("node:net");
const { spawnSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { createRedisQueue } = require("../../packages/remote-mcp-server/team-providers");
const { recoverWorkerLeases } = require("../../packages/team-runtime");
const { connectTeamRedis } = require("../../packages/remote-mcp-server/redis-connection");
const { verifyWorkerProcessRecovery } = require("./worker-process-recovery.cjs");

const IMAGE = "redis@sha256:8b81dd37ff027bec4e516d41acfbe9fe2460070dc6d4a4570a2ac5b9d59df065";
function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error("isolated Redis command failed");
  return result.stdout.trim();
}

async function verifyRedisDeliveryRecovery({ primary, first, second, fixture, database }) {
  const password = crypto.randomBytes(24).toString("hex");
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once("error", reject); reservation.listen(0, "127.0.0.1", resolve); });
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  // An intervening bind fails container creation; never displace another service.
  const id = docker(["run", "--detach", "--publish", `127.0.0.1:${port}:6379`, "--read-only", "--memory", "128m", "--cpus", "1", "--pids-limit", "64", "--tmpfs", "/data:rw,size=32m", IMAGE, "redis-server", "--save", "", "--appendonly", "no", "--requirepass", password]);
  assert.match(id, /^[a-f0-9]{64}$/);
  let client;
  try {
    const cli = (args) => docker(["exec", "--env", `REDISCLI_AUTH=${password}`, id, "redis-cli", ...args]);
    const command = async (args) => JSON.parse(cli(["--json", ...args]));
    const waitFor = async (predicate) => {
      const deadline = Date.now() + 15000;
      while (!predicate() && Date.now() < deadline) await delay(100);
      assert.ok(predicate(), "Redis client state did not converge");
    };
    const ready = async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        try { if (await command(["PING"]) === "PONG") return; }
        catch { /* Only this disposable process may still be starting. */ }
        await delay(100);
      }
      throw new Error("isolated Redis did not become ready");
    };
    await ready();
    const binding = docker(["port", id, "6379/tcp"]);
    assert.match(binding, /^127\.0\.0\.1:\d+$/);
    client = await connectTeamRedis({ url: `redis://${binding}`, username: "default", password });
    const queue = createRedisQueue(client, "recovery-fixture");
    const job = { ...fixture("actual-redis-loss"), maxAttempts: 3 };
    await first.create(job);
    const message = { id: job.id, capability: job.capability };
    const recover = () => recoverWorkerLeases({ repository: first, queue, actorId: "redis-fixture", capability: "project-audit" });
    await recover();
    assert.deepEqual(await queue.reserve(1, "project-audit"), message);
    assert.equal(await command(["LLEN", "recovery-fixture:jobs:project-audit:processing"]), 1);
    await primary.query("UPDATE capability_job_deliveries SET available_at = NOW() - INTERVAL '1 second' WHERE job_id = $1", [job.id]);
    await recover();
    assert.equal(await command(["LLEN", "recovery-fixture:jobs:project-audit:processing"]), 0, "production Lua moves the pending delivery back to ready");
    assert.deepEqual(await queue.reserve(1, "project-audit"), message);
    const serverInfo = () => cli(["--raw", "INFO", "server"]);
    const serverBefore = serverInfo();
    const runBefore = serverBefore.match(/^run_id:(.+)$/m)?.[1];
    assert.ok(runBefore);
    // Kill only this exact owned container; persistence is disabled intentionally.
    docker(["kill", "--signal", "KILL", id]);
    await waitFor(() => !client.isReady);
    await assert.rejects(connectTeamRedis({ url: `redis://${binding}`, username: "default", password }), /Redis connection is unavailable/);
    await primary.query("UPDATE capability_job_deliveries SET available_at = NOW() - INTERVAL '1 second' WHERE job_id = $1", [job.id]);
    await assert.rejects(recover(), /offline|closed|socket/i);
    assert.ok((await first.listPendingDeliveries("project-audit")).some((entry) => entry.id === job.id));
    docker(["start", id]);
    await ready();
    assert.equal(docker(["port", id, "6379/tcp"]), binding);
    await waitFor(() => client.isReady);
    assert.notEqual(serverInfo().match(/^run_id:(.+)$/m)?.[1], runBefore);
    assert.equal(await command(["DBSIZE"]), 0, "restart has actually lost ready and processing lists");
    await recover();
    assert.deepEqual(await queue.reserve(1, "project-audit"), message);
    await queue.enqueue(message);
    assert.deepEqual(await queue.reserve(1, "project-audit"), message);
    const claims = await Promise.all([first.claim(job.id, "redis-worker-1", 30), second.claim(job.id, "redis-worker-2", 30)]);
    assert.equal(claims.filter(Boolean).length, 1, "real duplicate messages permit only one database claim");
    await queue.ack(message);
    await queue.ack(message);
    assert.equal(await command(["DBSIZE"]), 0);
    const interruptedReservation = assert.rejects(queue.reserve(30, "project-audit"), /offline|closed|socket/i);
    await delay(100);
    docker(["kill", "--signal", "KILL", id]);
    await interruptedReservation;
    await waitFor(() => !client.isReady);
    await primary.query("UPDATE capability_jobs SET lease_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [job.id]);
    await assert.rejects(recover(), /offline|closed|socket/i);
    assert.equal((await first.get(job.id, job.ownerId)).status, "queued");
    docker(["start", id]);
    await ready();
    assert.equal(docker(["port", id, "6379/tcp"]), binding);
    await waitFor(() => client.isReady);
    assert.deepEqual(await recover(), [], "durable intent republishes without another expired running row");
    assert.deepEqual(await queue.reserve(1, "project-audit"), message);
    const replacement = await first.claim(job.id, "redis-worker-replacement", 30);
    assert.equal(replacement.attempt, 2);
    const staleWorkerId = claims[0] ? "redis-worker-1" : "redis-worker-2";
    assert.equal(await first.heartbeat(job.id, staleWorkerId, 30, 1), false);
    await assert.rejects(first.transition({ id: job.id, workerId: staleWorkerId, attempt: 1, from: "running", to: "succeeded" }), /lease is no longer valid/);
    await queue.ack(message);
    assert.equal(await command(["DBSIZE"]), 0);
    await primary.query("UPDATE capability_jobs SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL WHERE id = $1", [job.id]);
    await verifyWorkerProcessRecovery({ primary, repository: first, fixture, database, redis: { url: `redis://${binding}`, username: "default", password }, queueClient: client });
    await require("./image-worker-process-recovery.cjs").verifyImageWorkerProcessRecovery({ primary, repository: first, fixture, database, redis: { url: `redis://${binding}`, username: "default", password }, queueClient: client });
  } finally {
    if (client?.isOpen) client.destroy();
    docker(["rm", "--force", id]);
  }
}

module.exports = { verifyRedisDeliveryRecovery };
