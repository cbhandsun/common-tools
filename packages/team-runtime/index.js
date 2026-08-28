"use strict";

const crypto = require("node:crypto");
const { assertNonEmptyString, assertPlainObject, assertQualityReport, assertTransition } = require("../capability-contracts");
const { TEAM_CAPABILITY_DEFINITIONS } = require("../capability-runtime");
const { retentionScheduleSettings } = require("./retention-scheduler");

const CAPABILITIES = new Set(Object.keys(TEAM_CAPABILITY_DEFINITIONS));
const TEAM_DEFAULT_CAPABILITIES = Object.freeze(["image-to-editable", "project-audit"]);
// Capability manifests are the single source of truth for bounded server-side
// workers. Local-only capabilities deliberately omit team.deployment.
const TEAM_DEPLOYMENT_CAPABILITIES = Object.freeze(Object.fromEntries(Object.entries(TEAM_CAPABILITY_DEFINITIONS)
  .filter(([, definition]) => definition.deployment)
  .map(([capability, definition]) => [capability, definition.deployment])));
const TEAM_DEPLOYABLE_CAPABILITIES = Object.freeze(Object.keys(TEAM_DEPLOYMENT_CAPABILITIES).sort());
const UPLOAD_MEDIA_TYPES = Object.freeze(Object.fromEntries(Object.entries(TEAM_CAPABILITY_DEFINITIONS).map(([capability, definition]) => [capability, new Set(definition.acceptedUploadMediaTypes)])));
const UPLOAD_MAX_BYTES = Object.freeze({ "ppt-create": 1024 * 1024 });
const OBJECT_KEY_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,511}$/;
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const TRACE_PARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;
const TERMINAL = new Set(["succeeded", "failed", "cancelled", "expired"]);

function parseServiceUrl(value, label, protocols) {
  let url;
  try { url = new URL(assertNonEmptyString(value, label)); } catch { throw new Error(`${label} must be an absolute URL`); }
  if (!protocols.includes(url.protocol)) throw new Error(`${label} must use ${protocols.join(" or ")}`);
  if (url.username || url.password) throw new Error(`${label} must not embed credentials`);
  return url;
}
function parseEnabledCapabilities(value, name = "COMMON_TOOLS_TEAM_CAPABILITIES") {
  const source = value === undefined ? [...TEAM_DEFAULT_CAPABILITIES] : typeof value === "string" ? value.split(",").map((item) => item.trim()) : [];
  if (!source.length || source.some((capability) => !TEAM_DEPLOYABLE_CAPABILITIES.includes(capability)) || new Set(source).size !== source.length) throw new Error(`${name} is invalid`);
  return Object.freeze([...source].sort());
}
function teamDeploymentPlan(value) {
  const capabilities = parseEnabledCapabilities(value);
  return Object.freeze({
    capabilities,
    workerProfiles: Object.freeze(capabilities.map((capability) => TEAM_DEPLOYMENT_CAPABILITIES[capability].workerProfile)),
    workerServices: Object.freeze(capabilities.map((capability) => TEAM_DEPLOYMENT_CAPABILITIES[capability].workerService))
  });
}
function loadTeamConfig(environment = process.env) {
  const mode = environment.COMMON_TOOLS_TEAM_MODE || "production";
  if (!["development", "production"].includes(mode)) throw new Error("COMMON_TOOLS_TEAM_MODE is invalid");
  const databaseUrl = parseServiceUrl(environment.COMMON_TOOLS_DATABASE_URL, "COMMON_TOOLS_DATABASE_URL", ["postgres:", "postgresql:"]);
  const redisUrl = parseServiceUrl(environment.COMMON_TOOLS_REDIS_URL, "COMMON_TOOLS_REDIS_URL", ["redis:", "rediss:"]);
  const objectStoreEndpoint = parseServiceUrl(environment.COMMON_TOOLS_OBJECT_STORE_ENDPOINT, "COMMON_TOOLS_OBJECT_STORE_ENDPOINT", mode === "development" ? ["http:", "https:"] : ["https:"]);
  const publicObjectStoreEndpoint = environment.COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT === undefined || !String(environment.COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT).trim()
    ? undefined
    : parseServiceUrl(environment.COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT, "COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT", ["https:"]);
  if (mode === "production" && databaseUrl.searchParams.get("sslmode") !== "verify-full") throw new Error("production PostgreSQL must use sslmode=verify-full");
  if (mode === "production" && redisUrl.protocol !== "rediss:") throw new Error("production Redis must use rediss");
  if (objectStoreEndpoint.protocol === "http:" && !["127.0.0.1", "localhost", "minio"].includes(objectStoreEndpoint.hostname)) throw new Error("development object storage HTTP endpoint must be local");
  if (publicObjectStoreEndpoint && (publicObjectStoreEndpoint.pathname !== "/" || publicObjectStoreEndpoint.search || publicObjectStoreEndpoint.hash)) throw new Error("COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT must be an origin URL");
  const objectStoreBucket = assertNonEmptyString(environment.COMMON_TOOLS_OBJECT_STORE_BUCKET, "COMMON_TOOLS_OBJECT_STORE_BUCKET");
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(objectStoreBucket) || objectStoreBucket.includes("..")) throw new Error("COMMON_TOOLS_OBJECT_STORE_BUCKET is invalid");
  const workerLeaseSeconds = Number(environment.COMMON_TOOLS_WORKER_LEASE_SECONDS || 60);
  if (!Number.isSafeInteger(workerLeaseSeconds) || workerLeaseSeconds < 30 || workerLeaseSeconds > 600) throw new Error("COMMON_TOOLS_WORKER_LEASE_SECONDS must be between 30 and 600");
  const artifactRetentionDays = Number(environment.COMMON_TOOLS_ARTIFACT_RETENTION_DAYS || 30);
  if (!Number.isSafeInteger(artifactRetentionDays) || artifactRetentionDays < 1 || artifactRetentionDays > 3650) throw new Error("COMMON_TOOLS_ARTIFACT_RETENTION_DAYS must be between 1 and 3650");
  const retentionSchedule = retentionScheduleSettings(environment);
  const projectActiveJobLimit = Number(environment.COMMON_TOOLS_PROJECT_ACTIVE_JOB_LIMIT || 100);
  if (!Number.isSafeInteger(projectActiveJobLimit) || projectActiveJobLimit < 1 || projectActiveJobLimit > 10000) throw new Error("COMMON_TOOLS_PROJECT_ACTIVE_JOB_LIMIT must be between 1 and 10000");
  return Object.freeze({ mode, databaseUrl: databaseUrl.href, redisUrl: redisUrl.href, objectStoreEndpoint: objectStoreEndpoint.href, objectStorePublicEndpoint: publicObjectStoreEndpoint?.href, objectStoreBucket, workerLeaseSeconds, artifactRetentionDays, retentionIntervalSeconds: retentionSchedule.intervalSeconds, projectActiveJobLimit, enabledCapabilities: parseEnabledCapabilities(environment.COMMON_TOOLS_TEAM_CAPABILITIES) });
}

function assertObjectKey(value, label) {
  const key = assertNonEmptyString(value, label);
  if (!OBJECT_KEY_PATTERN.test(key) || key.includes("//") || key.startsWith("/") || key.includes("..")) throw new TypeError(`${label} is invalid`);
  return key;
}
function assertProjectId(value) {
  const projectId = assertNonEmptyString(value, "projectId");
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new TypeError("projectId is invalid");
  return projectId;
}
function assertTraceParent(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new TypeError("traceParent is invalid");
  const match = TRACE_PARENT_PATTERN.exec(value);
  if (!match || /^0{32}$/.test(match[1]) || /^0{16}$/.test(match[2])) throw new TypeError("traceParent is invalid");
  return value;
}
function withTraceParent(job, traceParent) {
  Object.defineProperty(job, "traceParent", { value: traceParent, enumerable: false, writable: false, configurable: false });
  return Object.freeze(job);
}
function ownerPrefix(ownerId) {
  const owner = assertNonEmptyString(ownerId, "ownerId");
  // Object names are externally observable in storage telemetry; never place a
  // raw subject identifier in them.
  return `owners/${crypto.createHash("sha256").update(owner).digest("hex")}/`;
}
function ownedInputKey(ownerId, inputObjectKey) {
  const key = assertObjectKey(inputObjectKey, "inputObjectKey");
  if (!key.startsWith(`${ownerPrefix(ownerId)}inputs/`)) throw new Error("input object does not belong to the owner input prefix");
  return key;
}
function validUploadRequest(capability, contentType, contentLength) {
  const allowed = UPLOAD_MEDIA_TYPES[capability];
  const normalizedType = typeof contentType === "string" ? contentType.trim().toLowerCase() : "";
  const maximum = UPLOAD_MAX_BYTES[capability] || 100 * 1024 * 1024;
  return TEAM_DEPLOYABLE_CAPABILITIES.includes(capability) && !!allowed && allowed.has(normalizedType) && Number.isSafeInteger(contentLength) && contentLength >= 1 && contentLength <= maximum;
}
function createTeamJob({ capability, ownerId, projectId, idempotencyKey, inputObjectKey, expiresAt, maxAttempts = 1, traceParent }) {
  if (!TEAM_DEPLOYABLE_CAPABILITIES.includes(capability)) throw new Error("unsupported capability");
  const owner = assertNonEmptyString(ownerId, "ownerId");
  const id = crypto.randomUUID();
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new Error("expiresAt must be in the future");
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new Error("maxAttempts must be between 1 and 5");
  return withTraceParent({ id, capability, ownerId: owner, projectId: projectId === undefined ? undefined : assertProjectId(projectId), idempotencyKey: assertNonEmptyString(idempotencyKey, "idempotencyKey"), status: "queued", attempt: 0, maxAttempts, inputObjectKey: ownedInputKey(owner, inputObjectKey), outputPrefix: `${ownerPrefix(owner)}jobs/${id}/`, artifacts: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: expiry.toISOString() }, assertTraceParent(traceParent));
}
function storedQuality(value) {
  if (value == null) return null;
  try { return assertQualityReport(value); }
  // Historic jobs may predate the fixed report contract. Do not expose their
  // arbitrary JSON to an MCP caller; new writes are rejected at the boundary.
  catch { return null; }
}
function fromRow(row) {
  assertPlainObject(row, "database job row");
  const json = (value, fallback) => typeof value === "string" ? JSON.parse(value) : value ?? fallback;
  return withTraceParent({ id: row.id, capability: row.capability, ownerId: row.owner_id, projectId: row.project_id || undefined, idempotencyKey: row.idempotency_key, status: row.status, attempt: row.attempt, maxAttempts: row.max_attempts, inputObjectKey: row.input_object_key, outputPrefix: row.output_prefix, artifacts: json(row.artifacts, []), quality: storedQuality(json(row.quality, null)), error: json(row.error, null), lease: row.lease_owner ? { workerId: row.lease_owner, expiresAt: new Date(row.lease_expires_at).toISOString() } : undefined, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString() }, assertTraceParent(row.trace_parent));
}
function requireQuery(query) { if (typeof query !== "function") throw new TypeError("query must be a function"); return query; }

class PostgresJobRepository {
  constructor({ query }) { this.query = requireQuery(query); }
  async create(job, actorId = job.ownerId) {
    const result = await this.query("INSERT INTO capability_jobs (id, capability, owner_id, project_id, idempotency_key, status, attempt, max_attempts, input_object_key, output_prefix, artifacts, created_at, updated_at, expires_at, trace_parent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::timestamptz,$13::timestamptz,$14::timestamptz,$15) ON CONFLICT DO NOTHING RETURNING *", [job.id, job.capability, job.ownerId, job.projectId || null, job.idempotencyKey, job.status, job.attempt, job.maxAttempts, job.inputObjectKey, job.outputPrefix, JSON.stringify(job.artifacts), job.createdAt, job.updatedAt, job.expiresAt, job.traceParent || null]);
    if (result.rows.length) { await this.event(job.id, "created", actorId, {}); return fromRow(result.rows[0]); }
    const existing = await this.query("SELECT * FROM capability_jobs WHERE owner_id = $1 AND project_id IS NOT DISTINCT FROM $2 AND capability = $3 AND idempotency_key = $4 AND status NOT IN ('succeeded','failed','cancelled','expired') ORDER BY created_at DESC LIMIT 1", [job.ownerId, job.projectId || null, job.capability, job.idempotencyKey]);
    if (!existing.rows.length) throw new Error("could not create an idempotent job");
    return fromRow(existing.rows[0]);
  }
  async createWithinProjectQuota(job, projectActiveJobLimit, actorId = job.ownerId) {
    const limit = Number(projectActiveJobLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new RangeError("project active Job limit must be between 1 and 10000");
    const projectId = assertProjectId(job?.projectId);
    const result = await this.query("WITH advisory_lock AS (SELECT pg_advisory_xact_lock(hashtextextended($1, 0))), existing AS (SELECT jobs.*, false AS newly_created FROM capability_jobs AS jobs CROSS JOIN advisory_lock WHERE jobs.owner_id = $2 AND jobs.project_id = $1 AND jobs.capability = $3 AND jobs.idempotency_key = $4 AND jobs.status NOT IN ('succeeded','failed','cancelled','expired') ORDER BY jobs.created_at DESC LIMIT 1), active_jobs AS (SELECT COUNT(*)::integer AS active_count FROM capability_jobs AS jobs CROSS JOIN advisory_lock WHERE jobs.project_id = $1 AND jobs.status IN ('queued','running','input_required','cancel_requested')), inserted AS (INSERT INTO capability_jobs (id, capability, owner_id, project_id, idempotency_key, status, attempt, max_attempts, input_object_key, output_prefix, artifacts, created_at, updated_at, expires_at, trace_parent) SELECT $5,$3,$2,$1,$4,$6,$7,$8,$9,$10,$11::jsonb,$12::timestamptz,$13::timestamptz,$14::timestamptz,$15 WHERE NOT EXISTS (SELECT 1 FROM existing) AND (SELECT active_count FROM active_jobs) < $16 ON CONFLICT DO NOTHING RETURNING *, true AS newly_created), selected AS (SELECT * FROM existing UNION ALL SELECT * FROM inserted) SELECT to_jsonb(selected) AS job, COALESCE((SELECT newly_created FROM selected LIMIT 1), false) AS newly_created, active_jobs.active_count FROM active_jobs LEFT JOIN selected ON TRUE", [projectId, job.ownerId, job.capability, job.idempotencyKey, job.id, job.status, job.attempt, job.maxAttempts, job.inputObjectKey, job.outputPrefix, JSON.stringify(job.artifacts), job.createdAt, job.updatedAt, job.expiresAt, job.traceParent || null, limit]);
    const row = result.rows?.[0];
    if (!row || !row.job) {
      const activeCount = Number(row?.active_count);
      if (Number.isSafeInteger(activeCount) && activeCount >= limit) throw new Error("project active Job quota is exhausted");
      throw new Error("could not create an idempotent project job");
    }
    const created = row.newly_created === true || row.newly_created === "t";
    const createdJob = fromRow(row.job);
    if (created) await this.event(createdJob.id, "created", actorId, { projectId });
    return Object.freeze({ job: createdJob, created });
  }
  async get(id, ownerId) {
    const result = await this.query("SELECT * FROM capability_jobs WHERE id = $1 AND owner_id = $2", [assertNonEmptyString(id, "job id"), assertNonEmptyString(ownerId, "ownerId")]);
    return result.rows.length ? fromRow(result.rows[0]) : null;
  }
  async getInProject(id, projectId) {
    const result = await this.query("SELECT * FROM capability_jobs WHERE id = $1 AND project_id = $2", [assertNonEmptyString(id, "job id"), assertProjectId(projectId)]);
    return result.rows.length ? fromRow(result.rows[0]) : null;
  }
  async claim(id, workerId, leaseSeconds = 60) {
    const result = await this.query("UPDATE capability_jobs SET status = 'running', attempt = attempt + 1, lease_owner = $2, lease_expires_at = NOW() + ($3 * INTERVAL '1 second'), updated_at = NOW() WHERE id = $1 AND status = 'queued' AND expires_at > NOW() RETURNING *", [assertNonEmptyString(id, "job id"), assertNonEmptyString(workerId, "workerId"), leaseSeconds]);
    if (!result.rows.length) return null;
    await this.event(id, "claimed", workerId, {});
    return fromRow(result.rows[0]);
  }
  async transition({ id, workerId, from, to, artifacts = [], quality = null, error = null }) {
    assertTransition(from, to);
    const normalizedQuality = quality == null ? null : assertQualityReport(quality);
    const result = await this.query("UPDATE capability_jobs SET status = $4, artifacts = $5::jsonb, quality = $6::jsonb, error = $7::jsonb, lease_owner = CASE WHEN $4 IN ('succeeded','failed','cancelled','expired') THEN NULL ELSE lease_owner END, lease_expires_at = CASE WHEN $4 IN ('succeeded','failed','cancelled','expired') THEN NULL ELSE lease_expires_at END, updated_at = NOW() WHERE id = $1 AND status = $3 AND lease_owner = $2 AND lease_expires_at > NOW() RETURNING *", [assertNonEmptyString(id, "job id"), assertNonEmptyString(workerId, "workerId"), from, to, JSON.stringify(artifacts), JSON.stringify(normalizedQuality), JSON.stringify(error)]);
    if (!result.rows.length) throw new Error("job transition was rejected because its lease is no longer valid");
    await this.event(id, `transitioned:${to}`, workerId, { from, to });
    return fromRow(result.rows[0]);
  }
  async heartbeat(id, workerId, leaseSeconds = 60) {
    if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 600) throw new RangeError("worker leaseSeconds must be between 30 and 600");
    const result = await this.query("UPDATE capability_jobs SET lease_expires_at = NOW() + ($3 * INTERVAL '1 second'), updated_at = NOW() WHERE id = $1 AND lease_owner = $2 AND status IN ('running','cancel_requested') AND lease_expires_at > NOW() RETURNING id", [assertNonEmptyString(id, "job id"), assertNonEmptyString(workerId, "workerId"), leaseSeconds]);
    return result.rows.length === 1;
  }
  async requestCancel(id, ownerId) {
    const result = await this.query("UPDATE capability_jobs SET status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE 'cancel_requested' END, updated_at = NOW() WHERE id = $1 AND owner_id = $2 AND status IN ('queued','running','input_required') RETURNING *", [assertNonEmptyString(id, "job id"), assertNonEmptyString(ownerId, "ownerId")]);
    if (!result.rows.length) return this.get(id, ownerId);
    await this.event(id, "cancel-requested", ownerId, {});
    return fromRow(result.rows[0]);
  }
  async requestProjectCancel(id, projectId, actorId) {
    const project = assertProjectId(projectId);
    const actor = assertNonEmptyString(actorId, "actorId");
    const result = await this.query("UPDATE capability_jobs SET status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE 'cancel_requested' END, updated_at = NOW() WHERE id = $1 AND project_id = $2 AND status IN ('queued','running','input_required') RETURNING *", [assertNonEmptyString(id, "job id"), project]);
    if (!result.rows.length) return this.getInProject(id, project);
    await this.event(id, "cancel-requested", actor, { projectId: project });
    return fromRow(result.rows[0]);
  }
  async recoverExpiredLeases(actorId, capability) {
    const actor = assertNonEmptyString(actorId, "recovery actorId");
    const scopedCapability = capability === undefined ? null : capability;
    if (scopedCapability !== null && !CAPABILITIES.has(scopedCapability)) throw new Error("recovery capability is invalid");
    const result = await this.query("UPDATE capability_jobs SET status = CASE WHEN attempt < max_attempts THEN 'queued' ELSE 'failed' END, lease_owner = NULL, lease_expires_at = NULL, error = CASE WHEN attempt < max_attempts THEN error ELSE jsonb_build_object('code','WORKER_LEASE_EXPIRED','message','worker lease expired','retryable',false) END, updated_at = NOW() WHERE status = 'running' AND lease_expires_at <= NOW() AND ($1::text IS NULL OR capability = $1) RETURNING *", [scopedCapability]);
    const jobs = result.rows.map(fromRow);
    for (const job of jobs) await this.event(job.id, job.status === "queued" ? "lease-expired-requeued" : "lease-expired-failed", actor, {});
    return jobs;
  }
  async expireDueJobs(actorId, capability) {
    const actor = assertNonEmptyString(actorId, "expiry actorId");
    const scopedCapability = capability === undefined ? null : capability;
    if (scopedCapability !== null && !CAPABILITIES.has(scopedCapability)) throw new Error("expiry capability is invalid");
    // Do not race an active Worker: jobs that were already claimed retain their
    // lease-based terminal path. Unclaimed and interactive jobs have no worker
    // that can safely finish them after their declared deadline.
    const result = await this.query("UPDATE capability_jobs SET status = 'expired', lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW() WHERE status IN ('queued','input_required') AND expires_at <= NOW() AND ($1::text IS NULL OR capability = $1) RETURNING *", [scopedCapability]);
    const jobs = result.rows.map(fromRow);
    for (const job of jobs) await this.event(job.id, "expired", actor, {});
    return jobs;
  }
  async listRetentionCandidates(retentionDays, limit = 100) {
    if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new RangeError("retentionDays must be between 1 and 3650");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("retention limit must be between 1 and 1000");
    const result = await this.query("SELECT * FROM capability_jobs WHERE status IN ('succeeded','failed','cancelled','expired') AND retention_cleaned_at IS NULL AND updated_at <= NOW() - ($1 * INTERVAL '1 day') ORDER BY updated_at ASC LIMIT $2", [retentionDays, limit]);
    return result.rows.map(fromRow);
  }
  async markRetentionCleaned(id, actorId) {
    const actor = assertNonEmptyString(actorId, "retention actorId");
    const result = await this.query("UPDATE capability_jobs SET artifacts = '[]'::jsonb, retention_cleaned_at = NOW(), updated_at = NOW() WHERE id = $1 AND status IN ('succeeded','failed','cancelled','expired') AND retention_cleaned_at IS NULL RETURNING *", [assertNonEmptyString(id, "job id")]);
    if (!result.rows.length) return null;
    await this.event(id, "retention-cleaned", actor, {});
    return fromRow(result.rows[0]);
  }
  async isCancellationRequested(id, workerId) {
    const result = await this.query("SELECT status = 'cancel_requested' AS requested FROM capability_jobs WHERE id = $1 AND lease_owner = $2 AND lease_expires_at > NOW()", [assertNonEmptyString(id, "job id"), assertNonEmptyString(workerId, "workerId")]);
    return result.rows.length === 1 && (result.rows[0].requested === true || result.rows[0].requested === "t");
  }
  async event(jobId, eventType, actorId, details) { await this.query("INSERT INTO capability_job_events (job_id, event_type, actor_id, details) VALUES ($1,$2,$3,$4::jsonb)", [jobId, eventType, assertNonEmptyString(actorId, "actorId"), JSON.stringify(details)]); }
}

function validateArtifacts(job, artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length > 32) throw new Error("worker artifacts are invalid");
  return artifacts.map((artifact) => {
    assertPlainObject(artifact, "worker artifact");
    const name = assertNonEmptyString(artifact.name, "worker artifact name");
    const objectKey = assertObjectKey(artifact.objectKey, "worker artifact objectKey");
    if (!objectKey.startsWith(job.outputPrefix) || typeof artifact.mediaType !== "string" || !artifact.mediaType || !/^[a-f0-9]{64}$/.test(artifact.sha256 || "")) throw new Error("worker artifact is invalid");
    return { name, objectKey, mediaType: artifact.mediaType, sha256: artifact.sha256 };
  });
}
function retentionObjectKeys(job) {
  if (!job || typeof job !== "object") throw new TypeError("retention job is invalid");
  const inputObjectKey = ownedInputKey(job.ownerId, job.inputObjectKey);
  const artifactKeys = validateArtifacts(job, job.artifacts || []).map((artifact) => artifact.objectKey);
  return Object.freeze([...new Set([inputObjectKey, ...artifactKeys])]);
}
async function runTeamRetention({ repository, objectStore, actorId, retentionDays, limit = 100 } = {}) {
  if (!repository || typeof repository.expireDueJobs !== "function" || typeof repository.listRetentionCandidates !== "function" || typeof repository.markRetentionCleaned !== "function") throw new TypeError("retention repository is incomplete");
  if (!objectStore || typeof objectStore.deleteObject !== "function") throw new TypeError("retention object store is incomplete");
  const actor = assertNonEmptyString(actorId, "retention actorId");
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new RangeError("retentionDays must be between 1 and 3650");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("retention limit must be between 1 and 1000");
  const expired = await repository.expireDueJobs(actor);
  const candidates = await repository.listRetentionCandidates(retentionDays, limit);
  let cleaned = 0;
  for (const job of candidates) {
    const keys = retentionObjectKeys(job);
    for (const objectKey of keys) await objectStore.deleteObject({ objectKey });
    if (await repository.markRetentionCleaned(job.id, actor)) cleaned += 1;
  }
  return Object.freeze({ expired: expired.length, cleaned });
}
class TeamWorker {
  constructor({ repository, handlers, leaseSeconds = 60, heartbeatIntervalMs } = {}) {
    if (!repository || typeof repository.claim !== "function" || typeof repository.transition !== "function" || typeof repository.isCancellationRequested !== "function" || typeof repository.heartbeat !== "function") throw new TypeError("worker repository is incomplete");
    if (!handlers || typeof handlers !== "object") throw new TypeError("worker handlers are required");
    if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 600) throw new RangeError("worker leaseSeconds must be between 30 and 600");
    this.repository = repository;
    this.handlers = handlers;
    this.leaseSeconds = leaseSeconds;
    const defaultHeartbeatIntervalMs = Math.min(30000, Math.max(5000, Math.floor(leaseSeconds * 1000 / 3)));
    if (heartbeatIntervalMs !== undefined && (!Number.isSafeInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 10 || heartbeatIntervalMs >= leaseSeconds * 1000)) throw new RangeError("worker heartbeatIntervalMs is invalid");
    this.heartbeatIntervalMs = heartbeatIntervalMs || defaultHeartbeatIntervalMs;
  }
  async process(message, workerId) {
    assertPlainObject(message, "queue message");
    const id = assertNonEmptyString(message.id, "queue message id");
    const worker = assertNonEmptyString(workerId, "workerId");
    const job = await this.repository.claim(id, worker, this.leaseSeconds);
    if (!job) return null;
    const handler = this.handlers[job.capability];
    if (typeof handler !== "function") return this.repository.transition({ id: job.id, workerId: worker, from: "running", to: "failed", error: { code: "NO_CAPABILITY_HANDLER", message: "worker does not support this capability", retryable: false } });
    const isCancellationRequested = () => this.repository.isCancellationRequested(job.id, worker);
    let heartbeatFailure = null;
    let activeHeartbeat = null;
    const heartbeat = async () => {
      if (activeHeartbeat) return activeHeartbeat;
      activeHeartbeat = (async () => {
        try {
          if (!await this.repository.heartbeat(job.id, worker, this.leaseSeconds)) heartbeatFailure = new Error("worker lease heartbeat was rejected");
        } catch { heartbeatFailure = new Error("worker lease heartbeat failed"); }
        finally { activeHeartbeat = null; }
      })();
      return activeHeartbeat;
    };
    const heartbeatTimer = setInterval(() => { void heartbeat(); }, this.heartbeatIntervalMs);
    try {
      const output = await handler(Object.freeze({ job, isCancellationRequested }));
      await heartbeat();
      if (heartbeatFailure) throw heartbeatFailure;
      if (await isCancellationRequested()) return this.repository.transition({ id: job.id, workerId: worker, from: "cancel_requested", to: "cancelled" });
      return this.repository.transition({ id: job.id, workerId: worker, from: "running", to: "succeeded", artifacts: validateArtifacts(job, output?.artifacts || []), quality: assertQualityReport(output?.quality) });
    } catch {
      if (await isCancellationRequested()) return this.repository.transition({ id: job.id, workerId: worker, from: "cancel_requested", to: "cancelled" });
      return this.repository.transition({ id: job.id, workerId: worker, from: "running", to: "failed", error: { code: "WORKER_FAILED", message: "capability worker failed", retryable: false } });
    } finally { clearInterval(heartbeatTimer); if (activeHeartbeat) await activeHeartbeat; }
  }
}

async function recoverWorkerLeases({ repository, queue, actorId, capability }) {
  if (!repository || typeof repository.recoverExpiredLeases !== "function") throw new TypeError("worker recovery repository is incomplete");
  if (!queue || typeof queue.enqueue !== "function" || typeof queue.recover !== "function") throw new TypeError("worker recovery queue is incomplete");
  if (!CAPABILITIES.has(capability)) throw new Error("worker recovery capability is invalid");
  const jobs = await repository.recoverExpiredLeases(assertNonEmptyString(actorId, "recovery actorId"), capability);
  for (const job of jobs) {
    if (!job || job.capability !== capability) throw new Error("recovery returned a job for another capability");
    if (job.status !== "queued") continue;
    const message = { id: job.id, capability: job.capability };
    // A lease can expire after a Redis delivery was already acknowledged (for
    // example, during an external worker crash). In that case enqueue is the
    // safe duplicate-tolerant fallback.
    if (!await queue.recover(message)) await queue.enqueue(message);
  }
  return jobs;
}

// The runner owns queue acknowledgement. It acknowledges only after the
// database-backed worker has made a terminal transition (or found a duplicate
// delivery), so a database/queue outage leaves the delivery recoverable.
class TeamWorkerRunner {
  constructor({ queue, worker, workerId, capability, pollSeconds = 5 }) {
    if (!queue || typeof queue.reserve !== "function" || typeof queue.ack !== "function") throw new TypeError("worker queue is incomplete");
    if (!worker || typeof worker.process !== "function") throw new TypeError("worker processor is incomplete");
    this.workerId = assertNonEmptyString(workerId, "workerId");
    if (!CAPABILITIES.has(capability)) throw new Error("worker runner capability is invalid");
    this.capability = capability;
    if (!Number.isSafeInteger(pollSeconds) || pollSeconds < 1 || pollSeconds > 60) throw new RangeError("worker pollSeconds must be between 1 and 60");
    this.queue = queue;
    this.worker = worker;
    this.pollSeconds = pollSeconds;
  }
  async processOne() {
    const message = await this.queue.reserve(this.pollSeconds, this.capability);
    if (!message) return null;
    if (message.capability !== this.capability) throw new Error("queue delivery capability is invalid");
    const completed = await this.worker.process(message, this.workerId);
    await this.queue.ack(message);
    return completed;
  }
}

function createTeamServices({ repository, queue, objectStore, projectActiveJobLimit } = {}) {
  if (!repository || typeof repository.create !== "function" || typeof repository.get !== "function" || typeof repository.requestCancel !== "function") throw new TypeError("repository is incomplete");
  if (!queue || typeof queue.enqueue !== "function") throw new TypeError("queue is incomplete");
  if (!objectStore || typeof objectStore.createUploadTarget !== "function" || typeof objectStore.createDownloadTarget !== "function") throw new TypeError("objectStore is incomplete");
  if (projectActiveJobLimit !== undefined && (!Number.isSafeInteger(projectActiveJobLimit) || projectActiveJobLimit < 1 || projectActiveJobLimit > 10000 || typeof repository.createWithinProjectQuota !== "function")) throw new TypeError("project active Job quota configuration is invalid");
  return Object.freeze({
    async createUploadTarget({ ownerId, capability, contentType, contentLength }) {
      if (!validUploadRequest(capability, contentType, contentLength)) throw new Error("upload request is invalid");
      const objectKey = `${ownerPrefix(ownerId)}inputs/${crypto.randomUUID()}`;
      return objectStore.createUploadTarget({ ownerId, capability, objectKey, contentType, contentLength });
    },
    async createJob(input) {
      const job = createTeamJob(input);
      let admission;
      if (projectActiveJobLimit !== undefined && job.projectId !== undefined) admission = await repository.createWithinProjectQuota(job, projectActiveJobLimit);
      else {
        const persisted = await repository.create(job);
        admission = Object.freeze({ job: persisted, created: persisted.id === job.id });
      }
      const created = admission.job;
      if (admission.created) await queue.enqueue({ id: created.id, capability: created.capability });
      return created;
    },
    getJob: (id, ownerId) => repository.get(id, ownerId),
    cancelJob: (id, ownerId) => repository.requestCancel(id, ownerId),
    getProjectJob: (id, projectId) => {
      if (typeof repository.getInProject !== "function") throw new TypeError("repository does not support project jobs");
      return repository.getInProject(id, projectId);
    },
    cancelProjectJob: (id, projectId, actorId) => {
      if (typeof repository.requestProjectCancel !== "function") throw new TypeError("repository does not support project jobs");
      return repository.requestProjectCancel(id, projectId, actorId);
    },
    async getArtifactTarget({ id, ownerId, name }) {
      const job = await repository.get(id, ownerId);
      if (!job || !TERMINAL.has(job.status)) throw new Error("completed job was not found");
      const artifact = job.artifacts.find((item) => item && item.name === name && typeof item.objectKey === "string");
      if (!artifact) throw new Error("artifact was not found");
      return objectStore.createDownloadTarget({ ownerId, objectKey: artifact.objectKey });
    },
    async getProjectArtifactTarget({ id, projectId, name }) {
      if (typeof repository.getInProject !== "function") throw new TypeError("repository does not support project jobs");
      const job = await repository.getInProject(id, projectId);
      if (!job || !TERMINAL.has(job.status)) throw new Error("completed job was not found");
      const artifact = job.artifacts.find((item) => item && item.name === name && typeof item.objectKey === "string");
      if (!artifact) throw new Error("artifact was not found");
      return objectStore.createDownloadTarget({ objectKey: artifact.objectKey });
    }
  });
}

module.exports = { CAPABILITIES, PostgresJobRepository, TEAM_DEFAULT_CAPABILITIES, TEAM_DEPLOYABLE_CAPABILITIES, TEAM_DEPLOYMENT_CAPABILITIES, TeamWorker, TeamWorkerRunner, assertProjectId, assertTraceParent, createTeamJob, createTeamServices, fromRow, loadTeamConfig, ownedInputKey, parseEnabledCapabilities, recoverWorkerLeases, retentionObjectKeys, runTeamRetention, storedQuality, teamDeploymentPlan, validUploadRequest };
