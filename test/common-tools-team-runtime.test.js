"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { PostgresJobRepository, TeamWorker, TeamWorkerRunner, assertTraceParent, createTeamJob, createTeamServices, fromRow, loadTeamConfig, normalizeTeamJobOptions, recoverWorkerLeases, retentionObjectKeys, runTeamRetention } = require("../packages/team-runtime");
const { assertQualityReport } = require("../packages/capability-contracts");
const { retentionSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-retention");
const { retentionScheduleSettings, runRetentionSchedule } = require("../packages/team-runtime/retention-scheduler");
const { composeProjectName, composeRuntimeSnapshot, gatewayReadiness, localTeamConfigReport, loopbackTcpPort, parse, probeReadyEndpoint, teamDoctorReport, teamRuntimeReport } = require("../packages/cli/bin/common-tools");

test("team configuration fails closed for insecure storage and embedded credentials", () => {
  const base = { COMMON_TOOLS_DATABASE_URL: "postgresql://database.internal/common_tools?sslmode=verify-full", COMMON_TOOLS_REDIS_URL: "rediss://redis.internal:6380", COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "https://objects.internal", COMMON_TOOLS_OBJECT_STORE_BUCKET: "common-tools-artifacts" };
  assert.equal(loadTeamConfig(base).workerLeaseSeconds, 60);
  assert.equal(loadTeamConfig(base).artifactRetentionDays, 30);
  assert.equal(loadTeamConfig(base).retentionIntervalSeconds, 86400);
  assert.equal(loadTeamConfig(base).projectActiveJobLimit, 100);
  assert.equal(loadTeamConfig({ ...base, COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT: "https://mcp.example.test" }).objectStorePublicEndpoint, "https://mcp.example.test/");
  assert.deepEqual(loadTeamConfig({ ...base, COMMON_TOOLS_TEAM_CAPABILITIES: "project-audit" }).enabledCapabilities, ["project-audit"]);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "http://objects.internal" }), /https/);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_DATABASE_URL: "postgresql://user:password@database.internal/common_tools" }), /embed credentials/);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_DATABASE_URL: "postgresql://database.internal/common_tools" }), /sslmode/);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_REDIS_URL: "redis://redis.internal:6379" }), /rediss/);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT: "http://mcp.example.test" }), /https/);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT: "https://mcp.example.test/storage" }), /origin URL/);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_WORKER_LEASE_SECONDS: "9" }), /between 30 and 600/);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_ARTIFACT_RETENTION_DAYS: "0" }), /between 1 and 3650/);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_RETENTION_INTERVAL_SECONDS: "299" }), /between 300 and 604800/);
  assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_PROJECT_ACTIVE_JOB_LIMIT: "0" }), /between 1 and 10000/);
});

test("retention scheduler bounds its cadence, stops cleanly, and never overlaps runs", async () => {
  assert.deepEqual(retentionScheduleSettings({}), { intervalMs: 86400000, intervalSeconds: 86400 });
  assert.deepEqual(retentionScheduleSettings({ COMMON_TOOLS_RETENTION_INTERVAL_SECONDS: "300" }), { intervalMs: 300000, intervalSeconds: 300 });
  assert.throws(() => retentionScheduleSettings({ COMMON_TOOLS_RETENTION_INTERVAL_SECONDS: "299" }), /between 300 and 604800/);
  assert.throws(() => retentionScheduleSettings({ COMMON_TOOLS_RETENTION_INTERVAL_SECONDS: "not-a-number" }), /between 300 and 604800/);

  const calls = [];
  const completed = await runRetentionSchedule({
    intervalMs: 300000,
    maxRuns: 2,
    runOnce: async () => { calls.push("run"); },
    wait: async (intervalMs) => { calls.push(`wait:${intervalMs}`); return true; }
  });
  assert.deepEqual(calls, ["run", "wait:300000", "run"]);
  assert.deepEqual(completed, { runs: 2, stopped: false });

  const controller = new AbortController();
  const stopped = await runRetentionSchedule({
    intervalMs: 300000,
    signal: controller.signal,
    runOnce: async () => { controller.abort(); },
    wait: async () => { throw new Error("wait must not run after shutdown"); }
  });
  assert.deepEqual(stopped, { runs: 1, stopped: true });
  await assert.rejects(() => runRetentionSchedule({ intervalMs: 42, runOnce: async () => {} }), /intervalMs/);
});

test("team doctor redacts configuration values when configuration is invalid", () => {
  const cli = path.join(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
  const result = spawnSync(process.execPath, [cli, "team", "doctor"], { encoding: "utf8", env: { ...process.env, COMMON_TOOLS_DATABASE_URL: "postgresql://user:secret@database.internal/common_tools" }, windowsHide: true });
  assert.equal(result.status, 2);
  assert.equal(result.stdout.includes("secret"), false);
  assert.match(result.stdout, /valid/);
});

test("team doctor reports metrics enablement without exposing its secret", () => {
  const cli = path.join(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
  const environment = { ...process.env, COMMON_TOOLS_DATABASE_URL: "postgresql://database.internal/common_tools?sslmode=verify-full", COMMON_TOOLS_REDIS_URL: "rediss://redis.internal:6380", COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "https://objects.internal", COMMON_TOOLS_OBJECT_STORE_BUCKET: "common-tools-artifacts" };
  const disabled = spawnSync(process.execPath, [cli, "team", "doctor"], { encoding: "utf8", env: environment, windowsHide: true });
  assert.equal(disabled.status, 0);
  assert.equal(JSON.parse(disabled.stdout).metrics.enabled, false);
  const token = "metrics-token-abcdefghijklmnopqrstuvwxyz";
  const enabled = spawnSync(process.execPath, [cli, "team", "doctor"], { encoding: "utf8", env: { ...environment, COMMON_TOOLS_METRICS_TOKEN: token }, windowsHide: true });
  assert.equal(enabled.status, 0);
  assert.equal(JSON.parse(enabled.stdout).metrics.enabled, true);
  assert.equal(enabled.stdout.includes(token), false);
  const fileEnabled = spawnSync(process.execPath, [cli, "team", "doctor"], { encoding: "utf8", env: { ...environment, COMMON_TOOLS_METRICS_TOKEN_FILE: "/run/secrets/metrics-token" }, windowsHide: true });
  assert.equal(fileEnabled.status, 0);
  assert.equal(JSON.parse(fileEnabled.stdout).metrics.enabled, true);
  const invalid = spawnSync(process.execPath, [cli, "team", "doctor"], { encoding: "utf8", env: { ...environment, COMMON_TOOLS_METRICS_TOKEN: "invalid token" }, windowsHide: true });
  assert.equal(invalid.status, 2);
  assert.equal(invalid.stdout.includes("invalid token"), false);
  assert.match(invalid.stdout, /COMMON_TOOLS_METRICS_TOKEN/);
});

test("retention runner accepts bounded batch settings without exposing provider credentials", () => {
  assert.deepEqual(retentionSettings({}), { actorId: "team-retention", limit: 100 });
  assert.deepEqual(retentionSettings({ COMMON_TOOLS_RETENTION_ACTOR_ID: "retention-1", COMMON_TOOLS_RETENTION_BATCH_SIZE: "1000" }), { actorId: "retention-1", limit: 1000 });
  assert.throws(() => retentionSettings({ COMMON_TOOLS_RETENTION_BATCH_SIZE: "1001" }), /BATCH_SIZE/);
  assert.throws(() => retentionSettings({ COMMON_TOOLS_RETENTION_ACTOR_ID: "x" }), /ACTOR_ID/);
});

test("team doctor runtime snapshot recognizes healthy Compose services without reading container environment", () => {
  const rows = [
    { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=postgres", Status: "Up 2 minutes (healthy)" },
    { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=redis", Status: "Up 2 minutes (healthy)" },
    { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=minio", Status: "Up 2 minutes (healthy)" },
    { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=team-migrate", Status: "Exited (0) 10 seconds ago" },
    { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=team-retention", Status: "Up 2 minutes" },
    { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=remote-mcp", Status: "Up 2 minutes (healthy)" },
    { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=project-audit-worker", Status: "Up 2 minutes" },
    { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=image-to-editable-worker", Status: "Up 2 minutes" }
  ];
  const snapshot = composeRuntimeSnapshot(rows, ["project-audit", "image-to-editable"]);
  assert.equal(snapshot.ok, true);
  assert.deepEqual(snapshot.requiredServices, ["postgres", "redis", "minio", "remote-mcp", "team-retention", "project-audit-worker", "image-to-editable-worker", "team-migrate"]);
  assert.deepEqual(snapshot.missingServices, []);
  assert.deepEqual(snapshot.inactiveServices, []);
  assert.deepEqual(snapshot.services["remote-mcp"], { count: 1, running: 1, healthy: 1, unhealthy: 0, completed: 0 });
  const requiredGateway = composeRuntimeSnapshot([...rows, { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=remote-mcp-gateway", Status: "Up 2 minutes (healthy)" }], ["project-audit", "image-to-editable"], { requireGateway: true });
  assert.equal(requiredGateway.ok, true);
  assert.equal(requiredGateway.requiredServices.includes("remote-mcp-gateway"), true);
  const unavailableGateway = composeRuntimeSnapshot(rows, ["project-audit", "image-to-editable"], { requireGateway: true });
  assert.equal(unavailableGateway.ok, false);
  assert.deepEqual(unavailableGateway.missingServices, ["remote-mcp-gateway"]);
  const unreadyGateway = composeRuntimeSnapshot([...rows, { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=remote-mcp-gateway", Status: "Up 2 minutes" }], ["project-audit", "image-to-editable"], { requireGateway: true });
  assert.equal(unreadyGateway.ok, false);
  assert.deepEqual(unreadyGateway.inactiveServices, ["remote-mcp-gateway"]);
  const probedGateway = composeRuntimeSnapshot([...rows, { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=remote-mcp-gateway", Status: "Up 2 minutes" }], ["project-audit", "image-to-editable"], { requireGateway: true, gatewayReady: true });
  assert.equal(probedGateway.ok, true);
  const missingMigration = composeRuntimeSnapshot(rows.filter((row) => !row.Labels.includes("team-migrate")), ["project-audit", "image-to-editable"]);
  assert.equal(missingMigration.ok, false);
  assert.deepEqual(missingMigration.missingServices, ["team-migrate"]);
  const inactiveWorker = composeRuntimeSnapshot(rows.map((row) => row.Labels.includes("project-audit-worker") ? { ...row, Status: "Exited (1) 10 seconds ago" } : row), ["project-audit", "image-to-editable"]);
  assert.equal(inactiveWorker.ok, false);
  assert.deepEqual(inactiveWorker.inactiveServices, ["project-audit-worker"]);
  assert.deepEqual(parse(["team", "doctor", "--runtime", "--project", "deploy"]), { _: ["team", "doctor"], runtime: true, project: "deploy" });
  assert.equal(composeProjectName("deploy"), "deploy");
  assert.throws(() => composeProjectName("invalid project"), /project name/);
});

test("gateway readiness probes only the Compose loopback ready endpoint", () => {
  const rows = [{ Labels: "com.docker.compose.project=deploy,com.docker.compose.service=remote-mcp-gateway", Ports: "127.0.0.1:54000->8080/tcp" }];
  const calls = [];
  const ready = gatewayReadiness(rows, (endpoint) => {
    calls.push(endpoint);
    return true;
  });
  assert.deepEqual(ready, { checked: true, ready: true, endpoint: "http://127.0.0.1:54000/readyz" });
  assert.deepEqual(calls, ["http://127.0.0.1:54000/readyz"]);
  assert.deepEqual(gatewayReadiness([{ Labels: "com.docker.compose.project=deploy,com.docker.compose.service=remote-mcp-gateway", Ports: "0.0.0.0:54000->8080/tcp" }], () => true), { checked: true, ready: false, endpoint: null });
  assert.throws(() => gatewayReadiness({}, () => ({ available: true })), /gateway readiness/);
  assert.throws(() => probeReadyEndpoint("https://outside.example/readyz"), /gateway ready endpoint/);
});

test("team doctor reports Docker runtime state even when this shell has no valid team configuration", () => {
  const calls = [];
  const report = teamDoctorReport(
    { runtime: true, project: "deploy" },
    { COMMON_TOOLS_DATABASE_URL: "postgresql://user:secret@database.internal/common_tools" },
    {
      docker: { available: true, status: 0, version: "29.4.2" },
      runtime(project, capabilities) {
        calls.push({ project, capabilities });
        return { available: true, ok: true, services: { "remote-mcp": { count: 1, running: 1, healthy: 1, unhealthy: 0, completed: 0 } } };
      }
    }
  );
  assert.equal(report.exitCode, 2);
  assert.equal(report.info.valid, false);
  assert.equal(report.info.docker.available, true);
  assert.equal(report.info.runtime.ok, true);
  assert.equal(report.info.error.includes("secret"), false);
  assert.deepEqual(calls, [{ project: "deploy", capabilities: ["image-to-editable", "project-audit"] }]);
});

test("team runtime reports Compose health without requiring team connection configuration", () => {
  const calls = [];
  const healthy = teamRuntimeReport(
    { project: "deploy", capabilities: "project-audit" },
    {
      docker: { available: true, version: "available" },
      runtime: (project, capabilities, options) => {
        calls.push({ project, capabilities, options });
        return { available: true, ok: true, services: {} };
      }
    }
  );
  assert.equal(healthy.exitCode, 0);
  assert.deepEqual(healthy.info.enabledCapabilities, ["project-audit"]);
  assert.equal(healthy.info.runtime.ok, true);
  assert.deepEqual(calls, [{ project: "deploy", capabilities: ["project-audit"], options: { requireGateway: false } }]);
  const gatewayRequired = teamRuntimeReport(
    { project: "deploy", capabilities: "project-audit", "require-gateway": true },
    { docker: { available: true, version: "available" }, runtime: (_project, _capabilities, options) => ({ available: true, ok: options.requireGateway, services: {} }) }
  );
  assert.equal(gatewayRequired.exitCode, 0);
  assert.equal(gatewayRequired.info.requireGateway, true);

  const unavailable = teamRuntimeReport({ project: "deploy" }, { docker: { available: false, version: null }, runtime: () => ({ available: false, ok: false, services: {} }) });
  assert.equal(unavailable.exitCode, 2);
  assert.throws(() => teamRuntimeReport({ capabilities: "unknown" }, { docker: { available: true, version: "available" }, runtime: () => ({ available: true, ok: true, services: {} }) }), /invalid/);
});

test("team local-config derives only fixed non-secret local endpoints from loopback mappings", () => {
  const rows = [
    { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=remote-mcp-gateway", Ports: "127.0.0.1:54000->8080/tcp" },
    { Labels: "com.docker.compose.project=deploy,com.docker.compose.service=keycloak", Ports: "127.0.0.1:58080->8080/tcp" }
  ];
  const report = localTeamConfigReport({ project: "deploy" }, { inventory: { available: true, rows } });
  assert.equal(report.exitCode, 0);
  assert.deepEqual(report.info.configuration, {
    COMMON_TOOLS_REMOTE_PUBLIC_URL: "http://127.0.0.1:54000",
    COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS: "http://127.0.0.1:54000",
    COMMON_TOOLS_OIDC_ISSUER: "http://127.0.0.1:58080/realms/common-tools",
    COMMON_TOOLS_OIDC_JWKS_URL: "http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs",
    COMMON_TOOLS_OIDC_AUDIENCE: "common-tools-mcp"
  });
  assert.equal(loopbackTcpPort("0.0.0.0:54000->8080/tcp", 8080), undefined);
  assert.equal(loopbackTcpPort("127.0.0.1:80->8080/tcp", 8080), undefined);
  assert.deepEqual(localTeamConfigReport({ project: "deploy" }, { inventory: { available: true, rows: rows.slice(1) } }).info.missing, ["remote-mcp-gateway loopback port 8080"]);
  assert.deepEqual(localTeamConfigReport({ project: "deploy" }, { inventory: { available: false, rows: [] } }).info.missing, ["Docker Compose runtime"]);
});

test("team jobs use opaque owner-scoped object prefixes and reject path-like input", () => {
  const ownerId = "member@example.test";
  const ownerHash = crypto.createHash("sha256").update(ownerId).digest("hex");
  const job = createTeamJob({ capability: "project-audit", ownerId, idempotencyKey: "request-1", inputObjectKey: `owners/${ownerHash}/inputs/source.tar.gz`, expiresAt: "2030-01-01T00:00:00.000Z" });
  assert.match(job.outputPrefix, /^owners\/[a-f0-9]{64}\/jobs\//);
  // The supplied prefix does not belong to this owner hash and must fail.
  assert.throws(() => createTeamJob({ capability: "project-audit", ownerId: "member@example.test", idempotencyKey: "request-1", inputObjectKey: "owners/0a/inputs/source.tar.gz", expiresAt: "2030-01-01T00:00:00.000Z" }), /owner input prefix/);
  assert.equal(createTeamJob({ capability: "project-audit", ownerId, projectId: "product-core", idempotencyKey: "project-request", inputObjectKey: `owners/${ownerHash}/inputs/project.tar.gz`, expiresAt: "2030-01-01T00:00:00.000Z" }).projectId, "product-core");
  assert.throws(() => createTeamJob({ capability: "project-audit", ownerId, projectId: "Bad project", idempotencyKey: "project-request", inputObjectKey: `owners/${ownerHash}/inputs/project.tar.gz`, expiresAt: "2030-01-01T00:00:00.000Z" }), /projectId/);
});

test("team Job options are capability-scoped and preserve PPT improvement profiles", () => {
  const ownerId = "member@example.test";
  const ownerHash = crypto.createHash("sha256").update(ownerId).digest("hex");
  const inputObjectKey = `owners/${ownerHash}/inputs/deck.pptx`;
  const job = createTeamJob({ capability: "ppt-improve", ownerId, idempotencyKey: "audit-only", inputObjectKey, options: { repairProfile: "audit-only" }, expiresAt: "2030-01-01T00:00:00.000Z" });
  assert.deepEqual(job.options, { repairProfile: "audit-only" });
  assert.deepEqual(normalizeTeamJobOptions("ppt-improve", undefined), {});
  assert.throws(() => createTeamJob({ capability: "project-audit", ownerId, idempotencyKey: "bad-options", inputObjectKey, options: { repairProfile: "audit-only" }, expiresAt: "2030-01-01T00:00:00.000Z" }), /options/);
  assert.throws(() => normalizeTeamJobOptions("ppt-improve", { repairProfile: "visual-repair" }), /options/);
  assert.throws(() => normalizeTeamJobOptions("ppt-improve", { repairProfile: "safe-package", token: "secret" }), /options/);
});

test("team Jobs preserve only a validated private trace parent for workers", () => {
  const ownerId = "member@example.test";
  const ownerHash = crypto.createHash("sha256").update(ownerId).digest("hex");
  const traceParent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  const job = createTeamJob({ capability: "project-audit", ownerId, idempotencyKey: "trace-request", inputObjectKey: `owners/${ownerHash}/inputs/trace.tar.gz`, expiresAt: "2030-01-01T00:00:00.000Z", traceParent });
  assert.equal(job.traceParent, traceParent);
  assert.equal(Object.keys(job).includes("traceParent"), false);
  assert.equal(JSON.stringify(job).includes(traceParent), false);
  assert.equal(assertTraceParent(null), undefined);
  assert.throws(() => assertTraceParent("00-00000000000000000000000000000000-00f067aa0ba902b7-01"), /traceParent/);
  assert.throws(() => assertTraceParent("00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01"), /traceParent/);
});

test("team services enqueue only newly persisted jobs and preserve upload ownership", async () => {
  const created = [];
  const queued = [];
  const services = createTeamServices({
    repository: {
      async create(job) { created.push(job); return job; },
      async get(id, ownerId) { return created.find((job) => job.id === id && job.ownerId === ownerId) || null; },
      async requestCancel(id, ownerId) { return created.find((job) => job.id === id && job.ownerId === ownerId) || null; }
    },
    queue: { async enqueue(message) { queued.push(message); } },
    objectStore: {
      async createUploadTarget(input) { return { objectKey: input.objectKey, uploadUrl: "https://storage.example.test/upload" }; },
      async createDownloadTarget(input) { return { objectKey: input.objectKey, downloadUrl: "https://storage.example.test/download" }; }
    }
  });
  const upload = await services.createUploadTarget({ ownerId: "member-1", capability: "project-audit", contentType: "application/gzip", contentLength: 42 });
  const job = await services.createJob({ capability: "project-audit", ownerId: "member-1", idempotencyKey: "request-1", inputObjectKey: upload.objectKey, expiresAt: "2030-01-01T00:00:00.000Z" });
  assert.equal(created.length, 1);
  assert.deepEqual(queued, [{ id: job.id, capability: "project-audit" }]);
  assert.match(upload.objectKey, /^owners\/[a-f0-9]{64}\/inputs\//);
  await assert.rejects(() => services.createUploadTarget({ ownerId: "member-1", capability: "image-to-editable", contentType: "image/png", contentLength: 42 }), /upload request is invalid/);
});

test("project Job admission is quota-atomic and idempotent retries do not enqueue twice", async () => {
  const queued = [];
  let admitted;
  const ownerId = "member-1";
  const inputObjectKey = `owners/${crypto.createHash("sha256").update(ownerId).digest("hex")}/inputs/project.tar.gz`;
  const services = createTeamServices({
    repository: {
      async create(job) { return job; },
      async createWithinProjectQuota(job, limit) {
        assert.equal(limit, 2);
        if (!admitted) { admitted = job; return { job, created: true }; }
        return { job: admitted, created: false };
      },
      async get() { return null; },
      async requestCancel() { return null; }
    },
    queue: { async enqueue(message) { queued.push(message); } },
    objectStore: { async createUploadTarget() { return {}; }, async createDownloadTarget() { return {}; } },
    projectActiveJobLimit: 2
  });
  const first = await services.createJob({ capability: "project-audit", ownerId, projectId: "product-core", idempotencyKey: "same-request", inputObjectKey, expiresAt: "2030-01-01T00:00:00.000Z" });
  const retry = await services.createJob({ capability: "project-audit", ownerId, projectId: "product-core", idempotencyKey: "same-request", inputObjectKey, expiresAt: "2030-01-01T00:00:00.000Z" });
  assert.equal(retry.id, first.id);
  assert.deepEqual(queued, [{ id: first.id, capability: "project-audit" }]);
  assert.throws(() => createTeamServices({ repository: { create() {}, get() {}, requestCancel() {} }, queue: { enqueue() {} }, objectStore: { createUploadTarget() {}, createDownloadTarget() {} }, projectActiveJobLimit: 2 }), /quota configuration/);
});

test("legacy owner-scoped Jobs retain queue delivery when project quotas are configured", async () => {
  const queued = [];
  const ownerId = "member-1";
  const inputObjectKey = `owners/${crypto.createHash("sha256").update(ownerId).digest("hex")}/inputs/legacy.tar.gz`;
  const services = createTeamServices({
    repository: {
      async create(job) { return job; },
      async createWithinProjectQuota() { throw new Error("legacy Job must not use project quota"); },
      async get() { return null; },
      async requestCancel() { return null; }
    },
    queue: { async enqueue(message) { queued.push(message); } },
    objectStore: { async createUploadTarget() { return {}; }, async createDownloadTarget() { return {}; } },
    projectActiveJobLimit: 2
  });
  const job = await services.createJob({ capability: "project-audit", ownerId, idempotencyKey: "legacy-request", inputObjectKey, expiresAt: "2030-01-01T00:00:00.000Z" });
  assert.deepEqual(queued, [{ id: job.id, capability: "project-audit" }]);
});

test("Postgres repository uses parameterized ownership and lease-constrained updates", async () => {
  const calls = [];
  const query = async (text, values) => { calls.push({ text, values }); return { rows: [] }; };
  const repository = new PostgresJobRepository({ query });
  await repository.get("job-1", "owner-1");
  await assert.rejects(() => repository.transition({ id: "job-1", workerId: "worker-1", from: "running", to: "succeeded" }), /lease is no longer valid/);
  await assert.rejects(() => repository.transition({ id: "job-1", workerId: "worker-1", from: "running", to: "succeeded", quality: { arbitrary: "must-not-persist" } }), /quality report/);
  assert.match(calls[0].text, /owner_id = \$2/);
  assert.deepEqual(calls[0].values, ["job-1", "owner-1"]);
  assert.match(calls[1].text, /lease_owner = \$2 AND lease_expires_at > NOW\(\)/);
  assert.equal(calls[1].values.includes("worker-1"), true);
  assert.equal(await repository.heartbeat("job-1", "worker-1", 90), false);
  assert.match(calls[2].text, /status IN \('running','cancel_requested'\)/);
  assert.deepEqual(calls[2].values, ["job-1", "worker-1", 90]);
  assert.equal(await repository.getInProject("job-1", "product-core"), null);
  assert.match(calls[3].text, /project_id = \$2/);
  assert.deepEqual(calls[3].values, ["job-1", "product-core"]);
});

test("project Job idempotency lookup remains in the same project partition", async () => {
  const calls = [];
  const repository = new PostgresJobRepository({ query: async (text, values) => { calls.push({ text, values }); return { rows: [] }; } });
  const owner = "member-1";
  const inputKey = `owners/${crypto.createHash("sha256").update(owner).digest("hex")}/inputs/project.tar.gz`;
  const traceParent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  const job = createTeamJob({ capability: "project-audit", ownerId: owner, projectId: "product-core", idempotencyKey: "same-key", inputObjectKey: inputKey, expiresAt: "2030-01-01T00:00:00.000Z", traceParent });
  await assert.rejects(() => repository.create(job), /could not create/);
  assert.match(calls[0].text, /trace_parent/);
  assert.equal(calls[0].values[15], traceParent);
  assert.match(calls[1].text, /project_id IS NOT DISTINCT FROM \$2/);
  assert.deepEqual(calls[1].values, [owner, "product-core", "project-audit", "same-key"]);
});

test("Postgres project admission holds a project lock before counting active Jobs", async () => {
  const owner = "member-1";
  const inputKey = `owners/${crypto.createHash("sha256").update(owner).digest("hex")}/inputs/project.tar.gz`;
  const job = createTeamJob({ capability: "project-audit", ownerId: owner, projectId: "product-core", idempotencyKey: "quota-key", inputObjectKey: inputKey, expiresAt: "2030-01-01T00:00:00.000Z" });
  const row = { id: job.id, capability: job.capability, owner_id: job.ownerId, project_id: job.projectId, idempotency_key: job.idempotencyKey, status: job.status, attempt: job.attempt, max_attempts: job.maxAttempts, input_object_key: job.inputObjectKey, output_prefix: job.outputPrefix, artifacts: [], created_at: job.createdAt, updated_at: job.updatedAt, expires_at: job.expiresAt };
  const calls = [];
  const repository = new PostgresJobRepository({ query: async (text, values) => {
    calls.push({ text, values });
    return calls.length === 1 ? { rows: [{ job: row, newly_created: true, active_count: 0 }] } : { rows: [] };
  } });
  const admitted = await repository.createWithinProjectQuota(job, 2);
  assert.equal(admitted.created, true);
  assert.equal(admitted.job.id, job.id);
  assert.match(calls[0].text, /pg_advisory_xact_lock/);
  assert.match(calls[0].text, /project_id = \$1/);
  assert.match(calls[0].text, /status IN \('queued','running','input_required','cancel_requested'\)/);
  assert.equal(calls[0].values[16], 2);
  assert.deepEqual(calls[1].values.slice(0, 3), [job.id, "created", owner]);
  const exhausted = new PostgresJobRepository({ query: async () => ({ rows: [{ job: null, newly_created: false, active_count: 2 }] }) });
  await assert.rejects(() => exhausted.createWithinProjectQuota(job, 2), /quota is exhausted/);
});

test("Postgres repository recovers only expired running leases with an auditable terminal fallback", async () => {
  const base = { id: "job-expired", capability: "project-audit", owner_id: "owner-1", idempotency_key: "key", status: "queued", attempt: 1, max_attempts: 2, input_object_key: "owners/a/inputs/source.tar.gz", output_prefix: "owners/a/jobs/job-expired/", artifacts: [], created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", expires_at: "2030-01-01T00:00:00.000Z" };
  const calls = [];
  const repository = new PostgresJobRepository({ query: async (text, values) => { calls.push({ text, values }); return calls.length === 1 ? { rows: [base] } : { rows: [] }; } });
  const jobs = await repository.recoverExpiredLeases("reaper-1", "project-audit");
  assert.equal(jobs[0].status, "queued");
  assert.match(calls[0].text, /lease_expires_at <= NOW\(\)/);
  assert.match(calls[0].text, /WORKER_LEASE_EXPIRED/);
  assert.match(calls[0].text, /capability = \$1/);
  assert.deepEqual(calls[0].values, ["project-audit"]);
  assert.equal(calls[1].values[1], "lease-expired-requeued");
  assert.deepEqual(calls[1].values.slice(0, 3), ["job-expired", "lease-expired-requeued", "reaper-1"]);
});

test("team retention expires only unclaimed jobs and records retention cleanup without exposing object keys", async () => {
  const owner = "member-1";
  const ownerHash = crypto.createHash("sha256").update(owner).digest("hex");
  const row = { id: "job-retention", capability: "project-audit", owner_id: owner, idempotency_key: "retention-key", status: "expired", attempt: 0, max_attempts: 1, input_object_key: `owners/${ownerHash}/inputs/source.tar.gz`, output_prefix: `owners/${ownerHash}/jobs/job-retention/`, artifacts: [{ name: "report.json", objectKey: `owners/${ownerHash}/jobs/job-retention/report.json`, mediaType: "application/json", sha256: "a".repeat(64) }], created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", expires_at: "2026-01-02T00:00:00.000Z" };
  const calls = [];
  const repository = new PostgresJobRepository({ query: async (text, values) => {
    calls.push({ text, values });
    if (text.startsWith("UPDATE capability_jobs SET status = 'expired'")) return { rows: [row] };
    if (text.startsWith("SELECT * FROM capability_jobs WHERE status IN")) return { rows: [] };
    if (text.startsWith("UPDATE capability_jobs SET artifacts")) return { rows: [row] };
    return { rows: [] };
  } });
  const expired = await repository.expireDueJobs("retention-1", "project-audit");
  assert.equal(expired[0].status, "expired");
  assert.match(calls[0].text, /status IN \('queued','input_required'\)/);
  assert.match(calls[0].text, /expires_at <= NOW\(\)/);
  assert.deepEqual(calls[0].values, ["project-audit"]);
  const candidates = await repository.listRetentionCandidates(30, 25);
  assert.equal(candidates.length, 0);
  const marked = await repository.markRetentionCleaned("job-retention", "retention-1");
  assert.equal(marked.status, "expired");
  assert.match(calls[3].text, /retention_cleaned_at = NOW\(\)/);
  assert.equal(calls[4].values[1], "retention-cleaned");
});

test("team retention deletes only validated owner/job-scoped keys and marks each job once", async () => {
  const owner = "member-1";
  const ownerHash = crypto.createHash("sha256").update(owner).digest("hex");
  const job = { id: "job-retention", capability: "project-audit", ownerId: owner, inputObjectKey: `owners/${ownerHash}/inputs/source.tar.gz`, outputPrefix: `owners/${ownerHash}/jobs/job-retention/`, artifacts: [{ name: "report.json", objectKey: `owners/${ownerHash}/jobs/job-retention/report.json`, mediaType: "application/json", sha256: "a".repeat(64) }] };
  assert.deepEqual(retentionObjectKeys(job), [job.inputObjectKey, job.artifacts[0].objectKey]);
  const deleted = [];
  const marked = [];
  const result = await runTeamRetention({
    repository: {
      async expireDueJobs(actor) { assert.equal(actor, "retention-1"); return [{ id: "expired-1" }]; },
      async listRetentionCandidates(days, limit) { assert.equal(days, 30); assert.equal(limit, 25); return [job]; },
      async markRetentionCleaned(id, actor) { marked.push([id, actor]); return job; }
    },
    objectStore: { async deleteObject({ objectKey }) { deleted.push(objectKey); } },
    actorId: "retention-1", retentionDays: 30, limit: 25
  });
  assert.deepEqual(result, { expired: 1, cleaned: 1 });
  assert.deepEqual(deleted, [job.inputObjectKey, job.artifacts[0].objectKey]);
  assert.deepEqual(marked, [[job.id, "retention-1"]]);
  const unsafe = { ...job, inputObjectKey: "owners/not-the-owner/inputs/source.tar.gz" };
  await assert.rejects(() => runTeamRetention({ repository: { async expireDueJobs() { return []; }, async listRetentionCandidates() { return [unsafe]; }, async markRetentionCleaned() { throw new Error("must not mark"); } }, objectStore: { async deleteObject() { throw new Error("must not delete"); } }, actorId: "retention-1", retentionDays: 30 }), /owner input prefix/);
});

test("team worker claims once, receives trace context, and only writes owner-scoped verified artifacts", async () => {
  const traceParent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  const job = createTeamJob({ capability: "project-audit", ownerId: "member-1", idempotencyKey: "request-2", inputObjectKey: `owners/${crypto.createHash("sha256").update("member-1").digest("hex")}/inputs/source.tar.gz`, expiresAt: "2030-01-01T00:00:00.000Z", traceParent });
  const transitions = [];
  const repository = {
    async claim(id, workerId, leaseSeconds) { assert.equal(id, job.id); assert.equal(workerId, "worker-1"); assert.equal(leaseSeconds, 90); return job; },
    async heartbeat() { return true; },
    async isCancellationRequested() { return false; },
    async transition(value) { transitions.push(value); return value; }
  };
  const worker = new TeamWorker({ repository, leaseSeconds: 90, handlers: { "project-audit": async ({ job: claimedJob }) => { assert.equal(claimedJob.traceParent, traceParent); return { artifacts: [{ name: "report.json", objectKey: `${job.outputPrefix}report.json`, mediaType: "application/json", sha256: "a".repeat(64) }], quality: { passed: true, checks: [{ name: "report-generated", passed: true }], metrics: { artifacts: 1 } } }; } } });
  const completed = await worker.process({ id: job.id }, "worker-1");
  assert.equal(completed.to, "succeeded");
  assert.equal(transitions[0].artifacts[0].objectKey, `${job.outputPrefix}report.json`);
  assert.deepEqual(transitions[0].quality, { passed: true, checks: [{ name: "report-generated", passed: true }], metrics: { artifacts: 1 } });
  const duplicate = new TeamWorker({ repository: { ...repository, claim: async () => null }, handlers: {} });
  assert.equal(await duplicate.process({ id: job.id }, "worker-2"), null);
});

test("team worker renews its lease during a slow handler and fails closed when renewal is rejected", async () => {
  const job = { id: "job-heartbeat", capability: "project-audit", outputPrefix: "owners/a/jobs/job-heartbeat/" };
  const transitions = [];
  const repository = {
    async claim() { return job; },
    async heartbeat() { return true; },
    async isCancellationRequested() { return false; },
    async transition(value) { transitions.push(value); return value; }
  };
  const handler = async () => { await new Promise((resolve) => setTimeout(resolve, 25)); return { artifacts: [], quality: { passed: true, checks: [{ name: "completed", passed: true }], metrics: {} } }; };
  const worker = new TeamWorker({ repository, handlers: { "project-audit": handler }, leaseSeconds: 30, heartbeatIntervalMs: 10 });
  const completed = await worker.process({ id: job.id }, "worker-1");
  assert.equal(completed.to, "succeeded");
  assert.equal(transitions[0].to, "succeeded");

  const rejectedTransitions = [];
  const rejected = new TeamWorker({ repository: { ...repository, async heartbeat() { return false; }, async transition(value) { rejectedTransitions.push(value); return value; } }, handlers: { "project-audit": handler }, leaseSeconds: 30, heartbeatIntervalMs: 10 });
  const failed = await rejected.process({ id: job.id }, "worker-1");
  assert.equal(failed.to, "failed");
  assert.equal(rejectedTransitions[0].error.code, "WORKER_FAILED");
});

test("team Workers persist only fixed quality reports and hide historic arbitrary quality JSON", async () => {
  const quality = assertQualityReport({ passed: true, checks: [{ name: "completed", passed: true }], metrics: { pages: 1 } });
  assert.deepEqual(quality, { passed: true, checks: [{ name: "completed", passed: true }], metrics: { pages: 1 } });
  assert.throws(() => assertQualityReport({ passed: true, checks: [{ name: "completed", passed: false }], metrics: {} }), /passed state/);
  assert.throws(() => assertQualityReport({ passed: true, checks: [{ name: "completed", passed: true, summary: "unbounded" }], metrics: {} }), /quality check/);
  const unsafeRow = { id: "historic-quality", capability: "project-audit", owner_id: "owner-1", idempotency_key: "key", status: "succeeded", attempt: 1, max_attempts: 1, input_object_key: "owners/a/inputs/source.tar.gz", output_prefix: "owners/a/jobs/historic-quality/", artifacts: [], quality: { secret: "must-not-escape" }, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", expires_at: "2030-01-01T00:00:00.000Z" };
  assert.equal(fromRow(unsafeRow).quality, null);
  const transitions = [];
  const worker = new TeamWorker({
    repository: {
      async claim() { return { id: "invalid-quality", capability: "project-audit", outputPrefix: "owners/a/jobs/invalid-quality/" }; },
      async heartbeat() { return true; },
      async isCancellationRequested() { return false; },
      async transition(value) { transitions.push(value); return value; }
    },
    handlers: {
      "project-audit": async () => ({
        artifacts: [],
        quality: { passed: true, checks: [{ name: "secret-summary", passed: true, summary: "must-not-persist" }], metrics: {} }
      })
    }
  });
  const completed = await worker.process({ id: "invalid-quality" }, "worker-1");
  assert.equal(completed.to, "failed");
  assert.equal(transitions[0].error.code, "WORKER_FAILED");
});

test("expired lease recovery atomically returns only matching pending deliveries to their capability queue", async () => {
  const queued = { id: "job-retry", capability: "image-to-editable", status: "queued" };
  const terminal = { id: "job-ended", capability: "image-to-editable", status: "failed" };
  const calls = [];
  const jobs = await recoverWorkerLeases({
    actorId: "reaper-1", capability: "image-to-editable",
    repository: { async recoverExpiredLeases(actor, capability) { assert.equal(actor, "reaper-1"); assert.equal(capability, "image-to-editable"); return [queued, terminal]; } },
    queue: { async recover(message) { calls.push(["recover", message]); return true; }, async enqueue(message) { calls.push(["enqueue", message]); } }
  });
  assert.deepEqual(jobs, [queued, terminal]);
  assert.deepEqual(calls, [["recover", { id: "job-retry", capability: "image-to-editable" }]]);

  await recoverWorkerLeases({
    actorId: "reaper-1", capability: "image-to-editable",
    repository: { async recoverExpiredLeases() { return [queued]; } },
    queue: { async recover() { return false; }, async enqueue(message) { calls.push(["fallback-enqueue", message]); } }
  });
  assert.deepEqual(calls[1], ["fallback-enqueue", { id: "job-retry", capability: "image-to-editable" }]);
});

test("team worker runner acks only completed database-backed deliveries", async () => {
  const message = { id: "job-1", capability: "project-audit" };
  const acknowledgements = [];
  const runner = new TeamWorkerRunner({
    queue: { reserve: async (seconds, capability) => { assert.equal(seconds, 3); assert.equal(capability, "project-audit"); return message; }, ack: async (value) => acknowledgements.push(value) },
    worker: { process: async (value, workerId) => { assert.equal(value, message); assert.equal(workerId, "worker-1"); return { status: "succeeded" }; } },
    workerId: "worker-1",
    capability: "project-audit", pollSeconds: 3
  });
  assert.deepEqual(await runner.processOne(), { status: "succeeded" });
  assert.deepEqual(acknowledgements, [message]);
  const failing = new TeamWorkerRunner({ queue: { reserve: async () => message, ack: async () => { throw new Error("must not acknowledge"); } }, worker: { process: async () => { throw new Error("database unavailable"); } }, workerId: "worker-1", capability: "project-audit" });
  await assert.rejects(() => failing.processOne(), /database unavailable/);
});
