"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Pool } = require("pg");
const { createClient } = require("redis");
const { PostgresJobRepository, TEAM_DEFAULT_CAPABILITIES, createTeamServices } = require("../team-runtime");
const { TEAM_DEPLOYMENT_CAPABILITIES } = require("../team-runtime");
const { TEAM_CAPABILITY_DEFINITIONS } = require("../capability-runtime");
const { idempotencyStorageKey } = require("../siyuan-note-core");
const { withInputReadinessRetry } = require("./object-readiness");

const TEAM_CAPABILITIES = Object.freeze(Object.keys(TEAM_CAPABILITY_DEFINITIONS));
const JOB_STATUSES = Object.freeze(["queued", "running", "input_required", "cancel_requested", "succeeded", "failed", "cancelled", "expired"]);
const LEASE_RECOVERY_METRIC_WINDOW_SECONDS = 900;
const WORKER_ID_PATTERN = /^[a-zA-Z0-9._-]{3,128}$/;
const DELETE_OWNED_IDEMPOTENCY_LOCK = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

function secret(value, name) { if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`); return value; }
function secretFileRoot(root) {
  const value = root === undefined ? "/run/secrets" : root;
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error("secret file root is invalid");
  return path.resolve(value);
}
function secretFromEnvironment(environment, name, { fallback, secretRoot } = {}) {
  if (!environment || typeof environment !== "object" || typeof name !== "string" || !/^COMMON_TOOLS_[A-Z0-9_]+$/.test(name)) throw new TypeError("secret environment input is invalid");
  const direct = environment[name];
  const fileVariable = `${name}_FILE`;
  const file = environment[fileVariable];
  if (direct !== undefined && typeof direct !== "string") throw new Error(`${name} is invalid`);
  const hasDirectValue = typeof direct === "string" && direct.trim().length > 0;
  // Compose represents an overridden environment key as an empty string. It
  // is not a credential and must not block the corresponding mounted secret.
  if (hasDirectValue && file !== undefined) throw new Error(`${name} and ${fileVariable} are mutually exclusive`);
  if (file !== undefined) {
    if (typeof file !== "string" || !file.trim() || !path.isAbsolute(file)) throw new Error(`${fileVariable} is invalid`);
    const root = secretFileRoot(secretRoot);
    const resolved = path.resolve(file);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`${fileVariable} must be under the secret file root`);
    let content;
    try { content = fs.readFileSync(resolved, "utf8"); } catch { throw new Error(`${fileVariable} is unavailable`); }
    if (content.length > 16384 || content.includes("\0")) throw new Error(`${fileVariable} is invalid`);
    return secret(content.trim(), name);
  }
  return secret(hasDirectValue ? direct : fallback, name);
}
function optionalSecretFromEnvironment(environment, name, options) {
  if (!environment || typeof environment !== "object") throw new TypeError("secret environment input is invalid");
  const direct = environment[name];
  const file = environment[`${name}_FILE`];
  if ((direct === undefined || (typeof direct === "string" && !direct.trim())) && file === undefined) return undefined;
  return secretFromEnvironment(environment, name, options);
}
function loadTeamSecrets(environment = process.env, options) {
  return Object.freeze({
    databaseUser: secretFromEnvironment(environment, "COMMON_TOOLS_DATABASE_USER", { ...options, fallback: "common_tools" }),
    databasePassword: secretFromEnvironment(environment, "COMMON_TOOLS_DATABASE_PASSWORD", options),
    redisUsername: secretFromEnvironment(environment, "COMMON_TOOLS_REDIS_USERNAME", { ...options, fallback: "default" }),
    redisPassword: secretFromEnvironment(environment, "COMMON_TOOLS_REDIS_PASSWORD", options),
    objectStoreAccessKeyId: secretFromEnvironment(environment, "COMMON_TOOLS_OBJECT_STORE_ACCESS_KEY_ID", options),
    objectStoreSecretAccessKey: secretFromEnvironment(environment, "COMMON_TOOLS_OBJECT_STORE_SECRET_ACCESS_KEY", options)
  });
}
function createRedisQueue(client, prefix = "common-tools") {
  const moveExpiredDelivery = "local removed = redis.call('LREM', KEYS[1], 1, ARGV[1]); if removed > 0 then redis.call('LPUSH', KEYS[2], ARGV[1]); end; return removed;";
  function names(capability) {
    if (typeof capability !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(capability)) throw new Error("queue capability is invalid");
    return { queueName: `${prefix}:jobs:${capability}`, processingName: `${prefix}:jobs:${capability}:processing` };
  }
  return Object.freeze({
    async enqueue(message) { const { queueName } = names(message?.capability); await client.lPush(queueName, JSON.stringify(message)); },
    async reserve(timeoutSeconds = 5, capability) { const { queueName, processingName } = names(capability); const raw = await client.sendCommand(["BRPOPLPUSH", queueName, processingName, String(timeoutSeconds)]); return raw ? JSON.parse(raw) : null; },
    async ack(message) { const { processingName } = names(message?.capability); await client.lRem(processingName, 1, JSON.stringify(message)); },
    async recover(message) {
      const { queueName, processingName } = names(message?.capability);
      const moved = await client.sendCommand(["EVAL", moveExpiredDelivery, "2", processingName, queueName, JSON.stringify(message)]);
      return Number(moved) === 1;
    },
    async recoverOne(capability) { const { queueName, processingName } = names(capability); const raw = await client.rPopLPush(processingName, queueName); return raw ? JSON.parse(raw) : null; }
  });
}
function createRedisRateLimiter(client, { prefix = "common-tools", windowSeconds = 60, maxRequests = 60, clock = () => Date.now() } = {}) {
  if (!client || typeof client.sendCommand !== "function" || typeof prefix !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(prefix) || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 3600 || !Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 10000 || typeof clock !== "function") throw new TypeError("rate limiter configuration is invalid");
  const incrementWindow = "local current=redis.call('INCR', KEYS[1]); if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return current;";
  return Object.freeze({
    async consume(subject) {
      if (typeof subject !== "string" || !subject) throw new TypeError("rate limit subject is invalid");
      const window = Math.floor(clock() / (windowSeconds * 1000));
      const subjectHash = crypto.createHash("sha256").update(subject).digest("hex");
      const key = `${prefix}:ratelimit:${window}:${subjectHash}`;
      const current = Number(await client.sendCommand(["EVAL", incrementWindow, "1", key, String(windowSeconds)]));
      if (!Number.isSafeInteger(current) || current < 1) throw new Error("rate limiter response is invalid");
      return current <= maxRequests;
    }
  });
}
function createWorkerHeartbeats(client, { prefix = "common-tools", ttlSeconds = 45 } = {}) {
  if (!client || typeof client.sendCommand !== "function" || typeof prefix !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(prefix) || !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 15 || ttlSeconds > 300) throw new TypeError("worker heartbeat configuration is invalid");
  function key(capability, workerId) {
    if (!TEAM_CAPABILITIES.includes(capability) || typeof workerId !== "string" || !WORKER_ID_PATTERN.test(workerId)) throw new Error("worker heartbeat identity is invalid");
    return `${prefix}:workers:${capability}:${workerId}`;
  }
  return Object.freeze({
    async beat(capability, workerId) { await client.sendCommand(["SET", key(capability, workerId), "1", "EX", String(ttlSeconds)]); },
    async remove(capability, workerId) { await client.sendCommand(["DEL", key(capability, workerId)]); },
    async hasActive(capability) {
      if (!TEAM_CAPABILITIES.includes(capability)) throw new Error("worker heartbeat capability is invalid");
      const pattern = `${prefix}:workers:${capability}:*`;
      let cursor = "0";
      for (let attempts = 0; attempts < 256; attempts += 1) {
        const response = await client.sendCommand(["SCAN", cursor, "MATCH", pattern, "COUNT", "16"]);
        if (!Array.isArray(response) || response.length !== 2 || !Array.isArray(response[1]) || (typeof response[0] !== "string" && typeof response[0] !== "number")) throw new Error("worker heartbeat response is invalid");
        if (response[1].length > 0) return true;
        cursor = String(response[0]);
        if (cursor === "0") return false;
      }
      throw new Error("worker heartbeat scan exceeded its limit");
    }
  });
}
function createMaintenanceHeartbeat(client, { prefix = "common-tools", ttlSeconds = 172800, now = () => Date.now() } = {}) {
  if (!client || typeof client.sendCommand !== "function" || typeof prefix !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(prefix) || !Number.isSafeInteger(ttlSeconds) || ttlSeconds < 600 || ttlSeconds > 1209600 || typeof now !== "function") throw new TypeError("maintenance heartbeat configuration is invalid");
  const key = `${prefix}:maintenance:retention:last-success`;
  function timestampSeconds() {
    const milliseconds = now();
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new Error("maintenance heartbeat clock is invalid");
    return Math.floor(milliseconds / 1000);
  }
  return Object.freeze({
    async beat() { await client.sendCommand(["SET", key, String(timestampSeconds()), "EX", String(ttlSeconds)]); },
    async status() {
      const value = await client.sendCommand(["GET", key]);
      if (value === null) return Object.freeze({ healthy: false, lastSuccessAgeSeconds: null });
      if ((typeof value !== "string" && typeof value !== "number") || !/^[0-9]+$/.test(String(value))) throw new Error("maintenance heartbeat response is invalid");
      const observedAtSeconds = Number(value);
      const currentSeconds = timestampSeconds();
      // API and maintenance containers can have a small NTP convergence skew.
      // Treat at most one minute of future time as age zero, but reject values
      // that could hide stale state or malformed Redis data.
      if (!Number.isSafeInteger(observedAtSeconds) || observedAtSeconds > currentSeconds + 60 || currentSeconds - observedAtSeconds > ttlSeconds) throw new Error("maintenance heartbeat response is invalid");
      return Object.freeze({ healthy: true, lastSuccessAgeSeconds: Math.max(0, currentSeconds - observedAtSeconds) });
    }
  });
}
function startWorkerHeartbeat({ heartbeats, capability, workerId, intervalMs = 15000, reportFailure = () => {} } = {}) {
  if (!heartbeats || typeof heartbeats.beat !== "function" || typeof heartbeats.remove !== "function" || !TEAM_CAPABILITIES.includes(capability) || typeof workerId !== "string" || !WORKER_ID_PATTERN.test(workerId) || !Number.isSafeInteger(intervalMs) || intervalMs < 5000 || intervalMs > 30000 || typeof reportFailure !== "function") throw new TypeError("worker heartbeat loop configuration is invalid");
  let active = null;
  const beat = async (initial = false) => {
    if (active) return active;
    active = Promise.resolve().then(() => heartbeats.beat(capability, workerId)).catch((error) => {
      if (initial) throw error;
      reportFailure();
    }).finally(() => { active = null; });
    return active;
  };
  let timer;
  const ready = beat(true).catch((error) => { clearInterval(timer); throw error; });
  timer = setInterval(() => { void beat(); }, intervalMs);
  return Object.freeze({ ready, async stop() { clearInterval(timer); if (active) await active; try { await heartbeats.remove(capability, workerId); } catch { reportFailure(); } } });
}
function createObjectStore(client, bucket, expiresIn = 900, { presignClient = client, signer = getSignedUrl, readinessRetryDelaysMs, sleep } = {}) {
  if (!client || typeof client.send !== "function" || !presignClient || typeof presignClient.send !== "function" || typeof signer !== "function") throw new TypeError("object storage client is invalid");
  const readinessOptions = { retryDelaysMs: readinessRetryDelaysMs, sleep };
  async function readBody(body, maxBytes) {
    if (!body || typeof body[Symbol.asyncIterator] !== "function" || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("object storage response is invalid");
    const chunks = [];
    let total = 0;
    for await (const chunk of body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) throw new Error("object storage object exceeds worker limit");
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }
  return Object.freeze({
    async ensureBucket(allowCreate) {
      try { await client.send(new HeadBucketCommand({ Bucket: bucket })); }
      catch (error) { if (!allowCreate) throw error; await client.send(new CreateBucketCommand({ Bucket: bucket })); }
    },
    async createUploadTarget({ objectKey, contentType, contentLength }) {
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      const uploadUrl = await signer(presignClient, new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType, ContentLength: contentLength }), { expiresIn });
      return { objectKey, uploadUrl, expiresAt };
    },
    async createDownloadTarget({ objectKey }) {
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      const downloadUrl = await signer(presignClient, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn });
      return { objectKey, downloadUrl, expiresAt };
    },
    async waitForUpload({ objectKey }) {
      const response = await withInputReadinessRetry(() => client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey })), readinessOptions);
      if (!Number.isSafeInteger(response.ContentLength) || response.ContentLength < 1) throw new Error("uploaded object metadata is invalid");
      return Object.freeze({ contentLength: response.ContentLength });
    },
    async readObject({ objectKey, maxBytes }) {
      const response = await withInputReadinessRetry(() => client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey })), readinessOptions);
      if (Number.isFinite(response.ContentLength) && response.ContentLength > maxBytes) throw new Error("object storage object exceeds worker limit");
      return readBody(response.Body, maxBytes);
    },
    async putObject({ objectKey, body, contentType }) {
      if (!Buffer.isBuffer(body) || typeof contentType !== "string" || !contentType) throw new Error("worker object payload is invalid");
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: body, ContentType: contentType }));
    },
    async deleteObject({ objectKey }) {
      if (typeof objectKey !== "string" || !objectKey) throw new Error("retention object key is invalid");
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    }
  });
}
function createReadinessCheck({ pool, redis, objectStore, workerHeartbeats, requiredCapabilities = [] }) {
  if (!pool || typeof pool.query !== "function" || !redis || typeof redis.ping !== "function" || !objectStore || typeof objectStore.ensureBucket !== "function" || !Array.isArray(requiredCapabilities) || requiredCapabilities.some((capability) => !TEAM_CAPABILITIES.includes(capability)) || new Set(requiredCapabilities).size !== requiredCapabilities.length || (requiredCapabilities.length > 0 && (!workerHeartbeats || typeof workerHeartbeats.hasActive !== "function"))) throw new TypeError("team readiness dependencies are incomplete");
  return async function checkReadiness() {
    await pool.query("SELECT 1");
    if (await redis.ping() !== "PONG") throw new Error("Redis readiness check failed");
    await objectStore.ensureBucket(false);
    for (const capability of requiredCapabilities) if (!await workerHeartbeats.hasActive(capability)) throw new Error("capability worker is unavailable");
  };
}
function createRedisIdempotencyStore(redis, ownerId, { pendingTtlSeconds = 60, completedTtlSeconds = 604800 } = {}) {
  if (!redis || typeof redis.set !== "function" || typeof redis.get !== "function" || typeof redis.eval !== "function" || typeof ownerId !== "string" || !ownerId || !Number.isSafeInteger(pendingTtlSeconds) || pendingTtlSeconds < 10 || !Number.isSafeInteger(completedTtlSeconds) || completedTtlSeconds < pendingTtlSeconds) throw new TypeError("idempotency store configuration is invalid");
  return Object.freeze({
    async run(scope, key, operation) {
      if (typeof operation !== "function") throw new TypeError("idempotent operation is invalid");
      const storageKey = idempotencyStorageKey(ownerId, scope, key);
      const pending = `pending:${crypto.randomUUID()}`;
      const acquired = await redis.set(storageKey, pending, { NX: true, EX: pendingTtlSeconds });
      if (acquired !== "OK") {
        const existing = await redis.get(storageKey);
        if (typeof existing === "string" && existing.startsWith("done:")) {
          try { return Object.freeze({ replay: true, value: JSON.parse(existing.slice(5)) }); }
          catch { throw new Error("stored idempotency result is invalid"); }
        }
        throw new Error("idempotent request is already in progress");
      }
      try {
        const value = await operation();
        const encoded = JSON.stringify(value);
        if (typeof encoded !== "string" || Buffer.byteLength(encoded, "utf8") > 65536) throw new Error("idempotency result exceeds storage limit");
        if (await redis.set(storageKey, `done:${encoded}`, { EX: completedTtlSeconds }) !== "OK") throw new Error("idempotency result could not be stored");
        return Object.freeze({ replay: false, value });
      } catch (error) {
        await redis.eval(DELETE_OWNED_IDEMPOTENCY_LOCK, { keys: [storageKey], arguments: [pending] });
        throw error;
      }
    }
  });
}
function metricInteger(value) {
  if ((typeof value !== "string" && typeof value !== "number") || !/^[0-9]+$/.test(String(value))) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function createMetricsProvider({ pool, redis, workerHeartbeats: heartbeatProvider, maintenanceHeartbeat, queuePrefix = "common-tools", capabilities = TEAM_DEFAULT_CAPABILITIES }) {
  if (!pool || typeof pool.query !== "function" || !redis || typeof redis.lLen !== "function" || !heartbeatProvider || typeof heartbeatProvider.hasActive !== "function" || !maintenanceHeartbeat || typeof maintenanceHeartbeat.status !== "function" || typeof queuePrefix !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(queuePrefix) || !Array.isArray(capabilities) || capabilities.some((capability) => !TEAM_CAPABILITIES.includes(capability)) || new Set(capabilities).size !== capabilities.length) throw new TypeError("team metrics dependencies are incomplete");
  const enabledCapabilities = Object.freeze([...capabilities].sort());
  return async function collectMetrics() {
    const [jobResult, oldestQueuedResult, leaseRecoveryResult] = await Promise.all([
      pool.query("SELECT capability, status, COUNT(*)::bigint AS count FROM capability_jobs GROUP BY capability, status"),
      pool.query("SELECT capability, FLOOR(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))))::bigint AS age_seconds FROM capability_jobs WHERE status = 'queued' GROUP BY capability"),
      pool.query("SELECT jobs.capability, COUNT(*)::bigint AS count FROM capability_job_events AS events JOIN capability_jobs AS jobs ON jobs.id = events.job_id WHERE events.event_type IN ('lease-expired-requeued', 'lease-expired-failed') AND events.occurred_at > NOW() - INTERVAL '15 minutes' GROUP BY jobs.capability")
    ]);
    const jobs = enabledCapabilities.map((capability) => ({ capability, counts: Object.fromEntries(JOB_STATUSES.map((status) => [status, 0])) }));
    const byCapability = new Map(jobs.map((entry) => [entry.capability, entry]));
    for (const row of jobResult.rows || []) {
      const count = metricInteger(row?.count);
      if (!row || !byCapability.has(row.capability) || !JOB_STATUSES.includes(row.status) || count === null) continue;
      byCapability.get(row.capability).counts[row.status] = count;
    }
    const oldestQueuedSeconds = enabledCapabilities.map((capability) => ({ capability, seconds: 0 }));
    const oldestByCapability = new Map(oldestQueuedSeconds.map((entry) => [entry.capability, entry]));
    for (const row of oldestQueuedResult.rows || []) {
      const seconds = metricInteger(row?.age_seconds);
      if (!row || !oldestByCapability.has(row.capability) || seconds === null) continue;
      oldestByCapability.get(row.capability).seconds = seconds;
    }
    const leaseRecoveries = enabledCapabilities.map((capability) => ({ capability, count: 0 }));
    const recoveriesByCapability = new Map(leaseRecoveries.map((entry) => [entry.capability, entry]));
    for (const row of leaseRecoveryResult.rows || []) {
      const count = metricInteger(row?.count);
      if (!row || !recoveriesByCapability.has(row.capability) || count === null) continue;
      recoveriesByCapability.get(row.capability).count = count;
    }
    const queues = [];
    for (const capability of enabledCapabilities) {
      const [ready, processing] = await Promise.all([redis.lLen(`${queuePrefix}:jobs:${capability}`), redis.lLen(`${queuePrefix}:jobs:${capability}:processing`)]);
      if (!Number.isSafeInteger(ready) || ready < 0 || !Number.isSafeInteger(processing) || processing < 0) throw new Error("queue metrics are invalid");
      queues.push({ capability, ready, processing });
    }
    const [workerHeartbeats, retention] = await Promise.all([Promise.all(enabledCapabilities.map(async (capability) => {
      const active = await heartbeatProvider.hasActive(capability);
      if (typeof active !== "boolean") throw new Error("worker heartbeat metrics are invalid");
      return Object.freeze({ capability, active });
    })), maintenanceHeartbeat.status()]);
    if (!retention || typeof retention.healthy !== "boolean" || (retention.lastSuccessAgeSeconds !== null && (!Number.isSafeInteger(retention.lastSuccessAgeSeconds) || retention.lastSuccessAgeSeconds < 0))) throw new Error("maintenance heartbeat metrics are invalid");
    return Object.freeze({ jobs, queues, oldestQueuedSeconds, leaseRecoveries, leaseRecoveryWindowSeconds: LEASE_RECOVERY_METRIC_WINDOW_SECONDS, workerHeartbeats, retention });
  };
}
async function createTeamProviderBundle({ config, secrets, allowCreateBucket = false, rateLimit } = {}) {
  const databaseUrl = new URL(config.databaseUrl);
  const pool = new Pool({ host: databaseUrl.hostname, port: Number(databaseUrl.port || 5432), database: databaseUrl.pathname.slice(1), user: secrets.databaseUser, password: secrets.databasePassword, ssl: databaseUrl.searchParams.get("sslmode") === "verify-full" ? { rejectUnauthorized: true } : undefined, max: 10, idleTimeoutMillis: 30000 });
  const redis = createClient({ url: config.redisUrl, username: secrets.redisUsername, password: secrets.redisPassword });
  redis.on("error", () => {});
  await redis.connect();
  const s3Options = { forcePathStyle: true, region: "us-east-1", credentials: { accessKeyId: secrets.objectStoreAccessKeyId, secretAccessKey: secrets.objectStoreSecretAccessKey } };
  const s3 = new S3Client({ ...s3Options, endpoint: config.objectStoreEndpoint });
  const publicPresignClient = config.objectStorePublicEndpoint ? new S3Client({ ...s3Options, endpoint: config.objectStorePublicEndpoint }) : s3;
  const objectStore = createObjectStore(s3, config.objectStoreBucket, 900, { presignClient: publicPresignClient });
  try { await objectStore.ensureBucket(allowCreateBucket); }
  catch (error) { await redis.quit(); await pool.end(); throw error; }
  const repository = new PostgresJobRepository({ query: (text, values) => pool.query(text, values) });
  const queue = createRedisQueue(redis);
  const workerHeartbeats = createWorkerHeartbeats(redis);
  const maintenanceHeartbeat = createMaintenanceHeartbeat(redis, { ttlSeconds: Math.max(600, config.retentionIntervalSeconds * 2) });
  const workerCapabilities = config.enabledCapabilities.filter((capability) => Object.prototype.hasOwnProperty.call(TEAM_DEPLOYMENT_CAPABILITIES, capability));
  return Object.freeze({ services: createTeamServices({ repository, queue, objectStore, projectActiveJobLimit: config.projectActiveJobLimit }), repository, queue, objectStore, workerHeartbeats, maintenanceHeartbeat, readinessCheck: createReadinessCheck({ pool, redis, objectStore, workerHeartbeats, requiredCapabilities: workerCapabilities }), metricsProvider: createMetricsProvider({ pool, redis, workerHeartbeats, maintenanceHeartbeat, capabilities: workerCapabilities }), rateLimiter: createRedisRateLimiter(redis, rateLimit), createIdempotencyStore: (ownerId) => createRedisIdempotencyStore(redis, ownerId), async close() { await Promise.allSettled([redis.quit(), pool.end()]); } });
}

module.exports = { createMaintenanceHeartbeat, createMetricsProvider, createObjectStore, createReadinessCheck, createRedisIdempotencyStore, createRedisQueue, createRedisRateLimiter, createTeamProviderBundle, createWorkerHeartbeats, loadTeamSecrets, optionalSecretFromEnvironment, secretFromEnvironment, startWorkerHeartbeat };
