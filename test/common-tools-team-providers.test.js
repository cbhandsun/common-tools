"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMaintenanceHeartbeat, createMetricsProvider, createObjectStore, createReadinessCheck, createRedisQueue, createRedisRateLimiter, createWorkerHeartbeats, loadTeamSecrets, optionalSecretFromEnvironment, secretFromEnvironment, startWorkerHeartbeat } = require("../packages/remote-mcp-server/team-providers");
const { loadTeamConfig } = require("../packages/team-runtime");
const { main: auditWorkerMain } = require("../packages/remote-mcp-server/bin/common-tools-team-worker");
const { main: imageWorkerMain } = require("../packages/remote-mcp-server/bin/common-tools-team-image-worker");
const { main: pptImproveWorkerMain } = require("../packages/remote-mcp-server/bin/common-tools-team-ppt-improve-worker");

test("team provider configuration permits loopback HTTP only in development", () => {
  const base = { COMMON_TOOLS_DATABASE_URL: "postgresql://db.internal/common_tools", COMMON_TOOLS_REDIS_URL: "rediss://redis.internal", COMMON_TOOLS_OBJECT_STORE_BUCKET: "common-tools-artifacts" };
  assert.equal(loadTeamConfig({ ...base, COMMON_TOOLS_TEAM_MODE: "development", COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "http://127.0.0.1:9000" }).mode, "development");
  assert.deepEqual(loadTeamConfig({ ...base, COMMON_TOOLS_TEAM_MODE: "development", COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "http://127.0.0.1:9000", COMMON_TOOLS_TEAM_CAPABILITIES: "project-audit" }).enabledCapabilities, ["project-audit"]);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_TEAM_MODE: "development", COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "http://127.0.0.1:9000", COMMON_TOOLS_TEAM_CAPABILITIES: "project-audit,project-audit" }), /TEAM_CAPABILITIES/);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_TEAM_MODE: "development", COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "http://127.0.0.1:9000", COMMON_TOOLS_TEAM_CAPABILITIES: "unknown" }), /TEAM_CAPABILITIES/);
  assert.deepEqual(loadTeamConfig({ ...base, COMMON_TOOLS_TEAM_MODE: "development", COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "http://127.0.0.1:9000", COMMON_TOOLS_TEAM_CAPABILITIES: "ppt-improve" }).enabledCapabilities, ["ppt-improve"]);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_TEAM_MODE: "production", COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "http://127.0.0.1:9000" }), /https/);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_TEAM_MODE: "development", COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "http://objects.internal" }), /must be local/);
});

test("dedicated Workers fail closed when their capability is disabled", async () => {
  const base = { COMMON_TOOLS_TEAM_MODE: "development", COMMON_TOOLS_DATABASE_URL: "postgresql://db.internal/common_tools", COMMON_TOOLS_REDIS_URL: "redis://redis.internal", COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "http://minio:9000", COMMON_TOOLS_OBJECT_STORE_BUCKET: "common-tools-artifacts" };
  await assert.rejects(() => auditWorkerMain({ ...base, COMMON_TOOLS_TEAM_CAPABILITIES: "image-to-editable" }), /project-audit is not enabled/);
  await assert.rejects(() => imageWorkerMain({ ...base, COMMON_TOOLS_TEAM_CAPABILITIES: "project-audit" }), /image-to-editable is not enabled/);
  await assert.rejects(() => pptImproveWorkerMain({ ...base, COMMON_TOOLS_TEAM_CAPABILITIES: "ppt-quality" }), /ppt-improve is not enabled/);
});

test("team secrets require every credential without echoing values", () => {
  assert.throws(() => loadTeamSecrets({}), /COMMON_TOOLS_DATABASE_PASSWORD/);
  const values = loadTeamSecrets({ COMMON_TOOLS_DATABASE_PASSWORD: "db-secret", COMMON_TOOLS_REDIS_PASSWORD: "redis-secret", COMMON_TOOLS_OBJECT_STORE_ACCESS_KEY_ID: "access", COMMON_TOOLS_OBJECT_STORE_SECRET_ACCESS_KEY: "object-secret" });
  assert.equal(values.databaseUser, "common_tools");
  assert.equal(values.redisUsername, "default");
});

test("team provider secrets support only bounded files under the configured Docker secret root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-secrets-"));
  const write = (name, value) => { const target = path.join(root, name); fs.writeFileSync(target, `${value}\n`, "utf8"); return target; };
  try {
    const environment = {
      COMMON_TOOLS_DATABASE_USER_FILE: write("db-user", "team-db"),
      COMMON_TOOLS_DATABASE_PASSWORD_FILE: write("db-password", "db-secret"),
      COMMON_TOOLS_REDIS_USERNAME_FILE: write("redis-user", "team-redis"),
      COMMON_TOOLS_REDIS_PASSWORD_FILE: write("redis-password", "redis-secret"),
      COMMON_TOOLS_OBJECT_STORE_ACCESS_KEY_ID_FILE: write("object-key-id", "object-key"),
      COMMON_TOOLS_OBJECT_STORE_SECRET_ACCESS_KEY_FILE: write("object-secret", "object-secret")
    };
    const secrets = loadTeamSecrets(environment, { secretRoot: root });
    assert.deepEqual(secrets, { databaseUser: "team-db", databasePassword: "db-secret", redisUsername: "team-redis", redisPassword: "redis-secret", objectStoreAccessKeyId: "object-key", objectStoreSecretAccessKey: "object-secret" });
    assert.equal(secretFromEnvironment({ COMMON_TOOLS_DATABASE_PASSWORD: "", COMMON_TOOLS_DATABASE_PASSWORD_FILE: environment.COMMON_TOOLS_DATABASE_PASSWORD_FILE }, "COMMON_TOOLS_DATABASE_PASSWORD", { secretRoot: root }), "db-secret");
    assert.equal(optionalSecretFromEnvironment({ COMMON_TOOLS_METRICS_TOKEN: "" }, "COMMON_TOOLS_METRICS_TOKEN"), undefined);
    assert.throws(() => secretFromEnvironment({ COMMON_TOOLS_DATABASE_PASSWORD: "direct", COMMON_TOOLS_DATABASE_PASSWORD_FILE: environment.COMMON_TOOLS_DATABASE_PASSWORD_FILE }, "COMMON_TOOLS_DATABASE_PASSWORD", { secretRoot: root }), /mutually exclusive/);
    assert.throws(() => secretFromEnvironment({ COMMON_TOOLS_DATABASE_PASSWORD_FILE: path.join(path.dirname(root), "outside") }, "COMMON_TOOLS_DATABASE_PASSWORD", { secretRoot: root }), /secret file root/);
    assert.throws(() => secretFromEnvironment({ COMMON_TOOLS_DATABASE_PASSWORD_FILE: path.join(root, "missing") }, "COMMON_TOOLS_DATABASE_PASSWORD", { secretRoot: root }), /unavailable/);
    const oversized = write("oversized", "a".repeat(16385));
    assert.throws(() => secretFromEnvironment({ COMMON_TOOLS_DATABASE_PASSWORD_FILE: oversized }, "COMMON_TOOLS_DATABASE_PASSWORD", { secretRoot: root }), /invalid/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Redis queue uses a pending-processing-ack lifecycle", async () => {
  const calls = [];
  const client = { lPush: async (...args) => calls.push(["lPush", ...args]), sendCommand: async (args) => { calls.push(["sendCommand", ...args]); return args[0] === "EVAL" ? 1 : JSON.stringify({ id: "job-1" }); }, lRem: async (...args) => calls.push(["lRem", ...args]), rPopLPush: async (...args) => { calls.push(["rPopLPush", ...args]); return null; } };
  const queue = createRedisQueue(client, "test");
  await queue.enqueue({ id: "job-1", capability: "project-audit" });
  assert.deepEqual(await queue.reserve(2, "project-audit"), { id: "job-1" });
  await queue.ack({ id: "job-1", capability: "project-audit" });
  assert.equal(calls[0][1], "test:jobs:project-audit");
  assert.deepEqual(calls[1].slice(1), ["BRPOPLPUSH", "test:jobs:project-audit", "test:jobs:project-audit:processing", "2"]);
  assert.deepEqual(calls[2].slice(1, 3), ["test:jobs:project-audit:processing", 1]);
  assert.equal(await queue.recover({ id: "job-1", capability: "project-audit" }), true);
  assert.equal(calls[3][1], "EVAL");
  assert.deepEqual(calls[3].slice(-3, -1), ["test:jobs:project-audit:processing", "test:jobs:project-audit"]);
});

test("worker object storage reads bounded streams, writes typed buffers, and deletes exact keys", async () => {
  const calls = [];
  const client = { send: async (command) => {
    calls.push(command);
    if (command.constructor.name === "GetObjectCommand") return { ContentLength: 3, Body: (async function* () { yield Buffer.from("a"); yield Buffer.from("bc"); })() };
    return {};
  } };
  const store = createObjectStore(client, "common-tools-artifacts");
  assert.equal((await store.readObject({ objectKey: "owners/a/inputs/test", maxBytes: 3 })).toString("utf8"), "abc");
  await store.putObject({ objectKey: "owners/a/jobs/1/report.json", body: Buffer.from("{}"), contentType: "application/json" });
  await store.deleteObject({ objectKey: "owners/a/jobs/1/report.json" });
  assert.equal(calls[0].constructor.name, "GetObjectCommand");
  assert.equal(calls[1].constructor.name, "PutObjectCommand");
  assert.equal(calls[2].constructor.name, "DeleteObjectCommand");
  await assert.rejects(() => store.deleteObject({ objectKey: "" }), /retention object key/);
  const oversized = createObjectStore({ send: async () => ({ ContentLength: 4, Body: (async function* () {})() }) }, "common-tools-artifacts");
  await assert.rejects(() => oversized.readObject({ objectKey: "owners/a/inputs/test", maxBytes: 3 }), /exceeds worker limit/);
});

test("object storage can sign client URLs with a separate public endpoint client", async () => {
  const internal = { send: async () => ({}) };
  const publicClient = { send: async () => ({}) };
  const signed = [];
  const store = createObjectStore(internal, "common-tools-artifacts", 60, { presignClient: publicClient, signer: async (client, command) => {
    signed.push({ client, command: command.constructor.name });
    return `https://mcp.example.test/common-tools-artifacts/${command.input.Key}`;
  } });
  assert.match((await store.createUploadTarget({ objectKey: "owners/a/inputs/file", contentType: "application/json", contentLength: 2 })).uploadUrl, /^https:\/\/mcp\.example\.test\//);
  assert.match((await store.createDownloadTarget({ objectKey: "owners/a/jobs/1/report" })).downloadUrl, /^https:\/\/mcp\.example\.test\//);
  assert.deepEqual(signed.map((entry) => entry.client), [publicClient, publicClient]);
  assert.deepEqual(signed.map((entry) => entry.command), ["PutObjectCommand", "GetObjectCommand"]);
  assert.throws(() => createObjectStore(internal, "common-tools-artifacts", 60, { presignClient: {}, signer: async () => "" }), /client/);
});

test("team readiness checks database, Redis and object storage without returning secrets", async () => {
  const calls = [];
  const readiness = createReadinessCheck({
    pool: { query: async (query) => calls.push(query) },
    redis: { ping: async () => "PONG" },
    objectStore: { ensureBucket: async (allowCreate) => calls.push(allowCreate) }
  });
  await readiness();
  assert.deepEqual(calls, ["SELECT 1", false]);
  await assert.rejects(() => createReadinessCheck({ pool: { query: async () => {} }, redis: { ping: async () => "NOPE" }, objectStore: { ensureBucket: async () => {} } })(), /Redis readiness/);
});

test("team readiness requires a heartbeat for every enabled capability", async () => {
  const requested = [];
  const readiness = createReadinessCheck({
    pool: { query: async () => {} },
    redis: { ping: async () => "PONG" },
    objectStore: { ensureBucket: async () => {} },
    workerHeartbeats: { hasActive: async (capability) => { requested.push(capability); return capability === "project-audit"; } },
    requiredCapabilities: ["project-audit"]
  });
  await readiness();
  assert.deepEqual(requested, ["project-audit"]);
  const missingWorker = createReadinessCheck({ pool: { query: async () => {} }, redis: { ping: async () => "PONG" }, objectStore: { ensureBucket: async () => {} }, workerHeartbeats: { hasActive: async () => false }, requiredCapabilities: ["image-to-editable"] });
  await assert.rejects(() => missingWorker(), /worker is unavailable/);
});

test("Worker heartbeat keys are TTL-bound, capability-scoped, and removed at shutdown", async () => {
  const calls = [];
  const heartbeats = createWorkerHeartbeats({ sendCommand: async (command) => {
    calls.push(command);
    if (command[0] === "SCAN") return ["0", command[3] === "common-tools:workers:project-audit:*" ? ["common-tools:workers:project-audit:worker-1"] : []];
    return "OK";
  } });
  await heartbeats.beat("project-audit", "worker-1");
  assert.deepEqual(calls[0], ["SET", "common-tools:workers:project-audit:worker-1", "1", "EX", "45"]);
  assert.equal(await heartbeats.hasActive("project-audit"), true);
  assert.equal(await heartbeats.hasActive("image-to-editable"), false);
  await heartbeats.remove("project-audit", "worker-1");
  assert.deepEqual(calls.at(-1), ["DEL", "common-tools:workers:project-audit:worker-1"]);
  await assert.rejects(() => heartbeats.beat("unknown", "worker-1"), /identity/);
});

test("Worker heartbeat loop registers before work and clears its key at shutdown", async () => {
  const calls = [];
  const loop = startWorkerHeartbeat({ heartbeats: { async beat(capability, workerId) { calls.push(["beat", capability, workerId]); }, async remove(capability, workerId) { calls.push(["remove", capability, workerId]); } }, capability: "project-audit", workerId: "worker-1", intervalMs: 5000 });
  await loop.ready;
  await loop.stop();
  assert.deepEqual(calls, [["beat", "project-audit", "worker-1"], ["remove", "project-audit", "worker-1"]]);
  const failed = startWorkerHeartbeat({ heartbeats: { async beat() { throw new Error("Redis password=never-log"); }, async remove() {} }, capability: "project-audit", workerId: "worker-1", intervalMs: 5000 });
  await assert.rejects(() => failed.ready, /never-log/);
});

test("retention maintenance heartbeat is fixed-key, TTL-bound, and fails closed on invalid data", async () => {
  const commands = [];
  let stored = null;
  const heartbeat = createMaintenanceHeartbeat({ sendCommand: async (command) => {
    commands.push(command);
    if (command[0] === "SET") { stored = command[2]; return "OK"; }
    if (command[0] === "GET") return stored;
    throw new Error("unexpected Redis command");
  } }, { prefix: "common-tools", ttlSeconds: 600, now: () => 600000 });
  await heartbeat.beat();
  assert.deepEqual(commands[0], ["SET", "common-tools:maintenance:retention:last-success", "600", "EX", "600"]);
  assert.deepEqual(await heartbeat.status(), { healthy: true, lastSuccessAgeSeconds: 0 });
  stored = null;
  assert.deepEqual(await heartbeat.status(), { healthy: false, lastSuccessAgeSeconds: null });
  stored = "not-a-timestamp";
  await assert.rejects(() => heartbeat.status(), /maintenance heartbeat response/);
  const skewed = createMaintenanceHeartbeat({ sendCommand: async () => "601" }, { ttlSeconds: 600, now: () => 600000 });
  assert.deepEqual(await skewed.status(), { healthy: true, lastSuccessAgeSeconds: 0 });
  const future = createMaintenanceHeartbeat({ sendCommand: async () => "661" }, { ttlSeconds: 600, now: () => 600000 });
  await assert.rejects(() => future.status(), /maintenance heartbeat response/);
  assert.throws(() => createMaintenanceHeartbeat({ sendCommand: async () => {} }, { ttlSeconds: 599 }), /configuration/);
});

test("team metrics contain only aggregate capability, queue age, and lease recovery counts", async () => {
  const requestedQueues = [];
  const metrics = createMetricsProvider({
    pool: { query: async (query) => {
      if (query.includes("GROUP BY capability, status")) return { rows: [{ capability: "project-audit", status: "queued", count: "3" }, { capability: "image-to-editable", status: "failed", count: "2" }, { capability: "project-audit", status: "expired", count: "1" }, { capability: "unknown", status: "queued", count: "9" }] };
      if (query.includes("AS age_seconds")) return { rows: [{ capability: "project-audit", age_seconds: "901" }, { capability: "unknown", age_seconds: "7" }] };
      if (query.includes("lease-expired-requeued")) return { rows: [{ capability: "image-to-editable", count: "2" }, { capability: "project-audit", count: "not-a-number" }] };
      throw new Error("unexpected metrics query");
    } },
    redis: { lLen: async (queue) => { requestedQueues.push(queue); return queue.endsWith(":processing") ? 1 : 4; } },
    workerHeartbeats: { hasActive: async (capability) => capability === "project-audit" },
    maintenanceHeartbeat: { status: async () => ({ healthy: true, lastSuccessAgeSeconds: 4 }) }
  });
  const snapshot = await metrics();
  assert.equal(snapshot.jobs.find((item) => item.capability === "project-audit").counts.queued, 3);
  assert.equal(snapshot.jobs.find((item) => item.capability === "image-to-editable").counts.failed, 2);
  assert.equal(snapshot.jobs.find((item) => item.capability === "project-audit").counts.expired, 1);
  assert.deepEqual(snapshot.queues, [{ capability: "image-to-editable", ready: 4, processing: 1 }, { capability: "project-audit", ready: 4, processing: 1 }]);
  assert.deepEqual(snapshot.oldestQueuedSeconds, [{ capability: "image-to-editable", seconds: 0 }, { capability: "project-audit", seconds: 901 }]);
  assert.deepEqual(snapshot.leaseRecoveries, [{ capability: "image-to-editable", count: 2 }, { capability: "project-audit", count: 0 }]);
  assert.deepEqual(snapshot.workerHeartbeats, [{ capability: "image-to-editable", active: false }, { capability: "project-audit", active: true }]);
  assert.deepEqual(snapshot.retention, { healthy: true, lastSuccessAgeSeconds: 4 });
  assert.equal(snapshot.leaseRecoveryWindowSeconds, 900);
  assert.deepEqual(requestedQueues, ["common-tools:jobs:image-to-editable", "common-tools:jobs:image-to-editable:processing", "common-tools:jobs:project-audit", "common-tools:jobs:project-audit:processing"]);
});

test("team metrics omit disabled capabilities and their queues", async () => {
  const queues = [];
  const metrics = createMetricsProvider({
    capabilities: ["project-audit"],
    pool: { query: async () => ({ rows: [] }) },
    redis: { lLen: async (name) => { queues.push(name); return 0; } },
    workerHeartbeats: { hasActive: async () => true },
    maintenanceHeartbeat: { status: async () => ({ healthy: false, lastSuccessAgeSeconds: null }) }
  });
  const snapshot = await metrics();
  assert.deepEqual(snapshot.jobs.map((item) => item.capability), ["project-audit"]);
  assert.deepEqual(snapshot.queues, [{ capability: "project-audit", ready: 0, processing: 0 }]);
  assert.deepEqual(snapshot.workerHeartbeats, [{ capability: "project-audit", active: true }]);
  assert.deepEqual(snapshot.retention, { healthy: false, lastSuccessAgeSeconds: null });
  assert.deepEqual(queues, ["common-tools:jobs:project-audit", "common-tools:jobs:project-audit:processing"]);
  assert.throws(() => createMetricsProvider({ capabilities: ["unknown"], pool: { query: async () => ({ rows: [] }) }, redis: { lLen: async () => 0 }, workerHeartbeats: { hasActive: async () => true }, maintenanceHeartbeat: { status: async () => ({ healthy: true, lastSuccessAgeSeconds: 0 }) } }), /dependencies/);
  const invalidHeartbeat = createMetricsProvider({ capabilities: ["project-audit"], pool: { query: async () => ({ rows: [] }) }, redis: { lLen: async () => 0 }, workerHeartbeats: { hasActive: async () => "true" }, maintenanceHeartbeat: { status: async () => ({ healthy: true, lastSuccessAgeSeconds: 0 }) } });
  await assert.rejects(() => invalidHeartbeat(), /worker heartbeat metrics/);
  const invalidMaintenance = createMetricsProvider({ capabilities: ["project-audit"], pool: { query: async () => ({ rows: [] }) }, redis: { lLen: async () => 0 }, workerHeartbeats: { hasActive: async () => true }, maintenanceHeartbeat: { status: async () => ({ healthy: true, lastSuccessAgeSeconds: -1 }) } });
  await assert.rejects(() => invalidMaintenance(), /maintenance heartbeat metrics/);
});

test("Redis rate limiter uses an atomic opaque-subject fixed window", async () => {
  const calls = [];
  let current = 0;
  const limiter = createRedisRateLimiter({ sendCommand: async (command) => { calls.push(command); current += 1; return current; } }, { prefix: "test", windowSeconds: 30, maxRequests: 1, clock: () => 30000 });
  assert.equal(await limiter.consume("member@example.test"), true);
  assert.equal(await limiter.consume("member@example.test"), false);
  assert.equal(calls[0][0], "EVAL");
  assert.match(calls[0][3], /^test:ratelimit:1:[a-f0-9]{64}$/);
  assert.equal(calls[0][3].includes("member"), false);
});
