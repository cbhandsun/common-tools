"use strict";

const { createJobRowReader, storedQuality, validateArtifacts } = require("./job-row-reader");
const { resolveWorkerCompletion } = require("./worker-completion");
const { storedWorkerFailure } = require("./worker-failure");
const { assertRetentionPrefix, collectRetentionOutputKeys } = require("./retention-output-keys");
const { assertLeaseAttempt, assertLeaseSeconds } = require("./worker-lease");

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
const { loadTeamConfig, parseEnabledCapabilities, teamDeploymentPlan } = require("./team-config").createTeamConfiguration({
  capabilities: CAPABILITIES, defaultCapabilities: TEAM_DEFAULT_CAPABILITIES,
  deployments: TEAM_DEPLOYMENT_CAPABILITIES, retentionScheduleSettings
});
const TEAM_DEPLOYABLE_CAPABILITIES = Object.freeze(Object.keys(TEAM_DEPLOYMENT_CAPABILITIES).sort());
const { assertProjectId, assertTraceParent, ownerPrefix, ownedInputKey, normalizeTeamJobOptions, createJobFactory } = require("./job-input");
const createTeamJob = createJobFactory(TEAM_DEPLOYABLE_CAPABILITIES);
const fromRow = createJobRowReader(TEAM_DEPLOYABLE_CAPABILITIES);
const UPLOAD_MEDIA_TYPES = Object.freeze(Object.fromEntries(Object.entries(TEAM_CAPABILITY_DEFINITIONS).map(([capability, definition]) => [capability, new Set(definition.acceptedUploadMediaTypes)])));
const UPLOAD_MAX_BYTES = Object.freeze({ "ppt-create": Object.freeze({ "application/json": 1024 * 1024, "application/gzip": 100 * 1024 * 1024, "application/x-gzip": 100 * 1024 * 1024 }) });
const TERMINAL = new Set(["succeeded", "failed", "cancelled", "expired"]);

function validUploadRequest(capability, contentType, contentLength) {
  const allowed = UPLOAD_MEDIA_TYPES[capability];
  const normalizedType = typeof contentType === "string" ? contentType.trim().toLowerCase() : "";
  const configuredMaximum = UPLOAD_MAX_BYTES[capability];
  const maximum = typeof configuredMaximum === "number" ? configuredMaximum : configuredMaximum?.[normalizedType] || 100 * 1024 * 1024;
  return TEAM_DEPLOYABLE_CAPABILITIES.includes(capability) && !!allowed && allowed.has(normalizedType) && Number.isSafeInteger(contentLength) && contentLength >= 1 && contentLength <= maximum;
}
function requireQuery(query) { if (typeof query !== "function") throw new TypeError("query must be a function"); return query; }

class PostgresJobRepository {
  constructor({ query }) { this.query = requireQuery(query); }
  async findActiveByIdempotency(job) {
    const candidate = createTeamJob(job);
    const result = await this.query("SELECT * FROM capability_jobs WHERE owner_id = $1 AND project_id IS NOT DISTINCT FROM $2 AND capability = $3 AND idempotency_key = $4 AND status NOT IN ('succeeded','failed','cancelled','expired') ORDER BY created_at DESC LIMIT 1", [candidate.ownerId, candidate.projectId || null, candidate.capability, candidate.idempotencyKey]);
    return result.rows.length ? fromRow(result.rows[0]) : null;
  }
  async create(job, actorId = job.ownerId) {
    const result = await this.query("INSERT INTO capability_jobs (id, capability, owner_id, project_id, idempotency_key, status, attempt, max_attempts, input_object_key, output_prefix, options, artifacts, created_at, updated_at, expires_at, trace_parent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::timestamptz,$14::timestamptz,$15::timestamptz,$16) ON CONFLICT DO NOTHING RETURNING *", [job.id, job.capability, job.ownerId, job.projectId || null, job.idempotencyKey, job.status, job.attempt, job.maxAttempts, job.inputObjectKey, job.outputPrefix, JSON.stringify(job.options), JSON.stringify(job.artifacts), job.createdAt, job.updatedAt, job.expiresAt, job.traceParent || null]);
    if (result.rows.length) { await this.event(job.id, "created", actorId, {}); return fromRow(result.rows[0]); }
    const existing = await this.query("SELECT * FROM capability_jobs WHERE owner_id = $1 AND project_id IS NOT DISTINCT FROM $2 AND capability = $3 AND idempotency_key = $4 AND status NOT IN ('succeeded','failed','cancelled','expired') ORDER BY created_at DESC LIMIT 1", [job.ownerId, job.projectId || null, job.capability, job.idempotencyKey]);
    if (!existing.rows.length) throw new Error("could not create an idempotent job");
    return fromRow(existing.rows[0]);
  }
  async createWithinProjectQuota(job, projectActiveJobLimit, actorId = job.ownerId) {
    const limit = Number(projectActiveJobLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new RangeError("project active Job limit must be between 1 and 10000");
    const projectId = assertProjectId(job?.projectId);
    const result = await this.query("WITH advisory_lock AS (SELECT pg_advisory_xact_lock(hashtextextended($1, 0))), existing AS (SELECT jobs.*, false AS newly_created FROM capability_jobs AS jobs CROSS JOIN advisory_lock WHERE jobs.owner_id = $2 AND jobs.project_id = $1 AND jobs.capability = $3 AND jobs.idempotency_key = $4 AND jobs.status NOT IN ('succeeded','failed','cancelled','expired') ORDER BY jobs.created_at DESC LIMIT 1), active_jobs AS (SELECT COUNT(*)::integer AS active_count FROM capability_jobs AS jobs CROSS JOIN advisory_lock WHERE jobs.project_id = $1 AND jobs.status IN ('queued','running','input_required','cancel_requested')), inserted AS (INSERT INTO capability_jobs (id, capability, owner_id, project_id, idempotency_key, status, attempt, max_attempts, input_object_key, output_prefix, options, artifacts, created_at, updated_at, expires_at, trace_parent) SELECT $5,$3,$2,$1,$4,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::timestamptz,$14::timestamptz,$15::timestamptz,$16 WHERE NOT EXISTS (SELECT 1 FROM existing) AND (SELECT active_count FROM active_jobs) < $17 ON CONFLICT DO NOTHING RETURNING *, true AS newly_created), selected AS (SELECT * FROM existing UNION ALL SELECT * FROM inserted) SELECT to_jsonb(selected) AS job, COALESCE((SELECT newly_created FROM selected LIMIT 1), false) AS newly_created, active_jobs.active_count FROM active_jobs LEFT JOIN selected ON TRUE", [projectId, job.ownerId, job.capability, job.idempotencyKey, job.id, job.status, job.attempt, job.maxAttempts, job.inputObjectKey, job.outputPrefix, JSON.stringify(job.options), JSON.stringify(job.artifacts), job.createdAt, job.updatedAt, job.expiresAt, job.traceParent || null, limit]);
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
    assertLeaseSeconds(leaseSeconds);
    const result = await this.query("UPDATE capability_jobs SET status = 'running', attempt = attempt + 1, lease_owner = $2, lease_expires_at = NOW() + ($3 * INTERVAL '1 second'), updated_at = NOW() WHERE id = $1 AND status = 'queued' AND expires_at > NOW() RETURNING *", [assertNonEmptyString(id, "job id"), assertNonEmptyString(workerId, "workerId"), leaseSeconds]);
    if (!result.rows.length) return null;
    await this.event(id, "claimed", workerId, {});
    return fromRow(result.rows[0]);
  }
  async transition({ id, workerId, attempt, from, to, artifacts = [], quality = null, error = null }) {
    assertLeaseAttempt(attempt);
    assertTransition(from, to);
    const normalizedQuality = quality == null ? null : assertQualityReport(quality);
    const result = await this.query("UPDATE capability_jobs SET status = $4, artifacts = $5::jsonb, quality = $6::jsonb, error = $7::jsonb, lease_owner = CASE WHEN $4 IN ('succeeded','failed','cancelled','expired') THEN NULL ELSE lease_owner END, lease_expires_at = CASE WHEN $4 IN ('succeeded','failed','cancelled','expired') THEN NULL ELSE lease_expires_at END, updated_at = NOW() WHERE id = $1 AND status = $3 AND lease_owner = $2 AND lease_expires_at > NOW() AND attempt = $8 RETURNING *", [assertNonEmptyString(id, "job id"), assertNonEmptyString(workerId, "workerId"), from, to, JSON.stringify(artifacts), JSON.stringify(normalizedQuality), JSON.stringify(error), attempt]);
    if (!result.rows.length) throw new Error("job transition was rejected because its lease is no longer valid");
    await this.event(id, `transitioned:${to}`, workerId, { from, to });
    return fromRow(result.rows[0]);
  }
  async heartbeat(id, workerId, leaseSeconds = 60, attempt) {
    assertLeaseSeconds(leaseSeconds);
    assertLeaseAttempt(attempt);
    const result = await this.query("UPDATE capability_jobs SET lease_expires_at = NOW() + ($3 * INTERVAL '1 second'), updated_at = NOW() WHERE id = $1 AND lease_owner = $2 AND status IN ('running','cancel_requested') AND lease_expires_at > NOW() AND attempt = $4 RETURNING id", [assertNonEmptyString(id, "job id"), assertNonEmptyString(workerId, "workerId"), leaseSeconds, attempt]);
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
  async listPendingDeliveries(capability, limit = 100) {
    if (!CAPABILITIES.has(capability)) throw new Error("delivery capability is invalid");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("delivery limit must be between 1 and 1000");
    const result = await this.query("SELECT d.job_id AS id, d.generation::text AS generation, j.capability FROM capability_job_deliveries d JOIN capability_jobs j ON j.id = d.job_id WHERE j.status = 'queued' AND j.capability = $1 AND d.available_at <= NOW() ORDER BY d.available_at, d.generation LIMIT $2", [capability, limit]);
    return result.rows;
  }
  async acknowledgeDelivery(id, generation) {
    if (typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new TypeError("delivery Job id is invalid");
    if (typeof generation !== "string" || !/^[1-9][0-9]{0,18}$/.test(generation) || BigInt(generation) > 9223372036854775807n) throw new TypeError("delivery generation is invalid");
    const result = await this.query("UPDATE capability_job_deliveries SET available_at = NOW() + INTERVAL '1 minute' WHERE job_id = $1 AND generation = $2::bigint RETURNING job_id", [id, generation]);
    return result.rows.length === 1;
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
    const result = await this.query("SELECT * FROM capability_jobs WHERE status IN ('succeeded','failed','cancelled','expired') AND ((retention_cleaned_at IS NULL AND updated_at <= NOW() - ($1 * INTERVAL '1 day')) OR (retention_cleaned_at IS NOT NULL AND COALESCE(retention_last_swept_at, retention_cleaned_at) <= NOW() - INTERVAL '1 hour')) ORDER BY CASE WHEN retention_cleaned_at IS NULL THEN updated_at + ($1 * INTERVAL '1 day') ELSE COALESCE(retention_last_swept_at, retention_cleaned_at) + INTERVAL '1 hour' END ASC, id ASC LIMIT $2", [retentionDays, limit]);
    return result.rows.map(fromRow);
  }
  async markRetentionCleaned(id, actorId) {
    const actor = assertNonEmptyString(actorId, "retention actorId");
    const result = await this.query("WITH cleaned AS (UPDATE capability_jobs SET artifacts = '[]'::jsonb, retention_cleaned_at = COALESCE(retention_cleaned_at, NOW()), retention_last_swept_at = NOW(), updated_at = CASE WHEN retention_cleaned_at IS NULL THEN NOW() ELSE updated_at END WHERE id = $1 AND status IN ('succeeded','failed','cancelled','expired') AND (retention_cleaned_at IS NULL OR COALESCE(retention_last_swept_at, retention_cleaned_at) <= NOW() - INTERVAL '1 hour') RETURNING *, retention_cleaned_at = retention_last_swept_at AS retention_initial_cleanup), logged AS (INSERT INTO capability_job_events (job_id, event_type, actor_id, details) SELECT id, 'retention-cleaned', $2, '{}'::jsonb FROM cleaned WHERE retention_initial_cleanup RETURNING job_id) SELECT cleaned.* FROM cleaned", [assertNonEmptyString(id, "job id"), actor]);
    if (!result.rows.length) return null;
    return fromRow(result.rows[0]);
  }
  async isCancellationRequested(id, workerId, attempt) {
    assertLeaseAttempt(attempt);
    const result = await this.query("SELECT status = 'cancel_requested' AS requested FROM capability_jobs WHERE id = $1 AND lease_owner = $2 AND lease_expires_at > NOW() AND attempt = $3", [assertNonEmptyString(id, "job id"), assertNonEmptyString(workerId, "workerId"), attempt]);
    return result.rows.length === 1 && (result.rows[0].requested === true || result.rows[0].requested === "t");
  }
  async event(jobId, eventType, actorId, details) { await this.query("INSERT INTO capability_job_events (job_id, event_type, actor_id, details) VALUES ($1,$2,$3,$4::jsonb)", [jobId, eventType, assertNonEmptyString(actorId, "actorId"), JSON.stringify(details)]); }
}

function retentionObjectKeys(job) {
  if (!job || typeof job !== "object") throw new TypeError("retention job is invalid");
  const inputObjectKey = ownedInputKey(job.ownerId, job.inputObjectKey);
  if (assertRetentionPrefix(job.outputPrefix) !== `${ownerPrefix(job.ownerId)}jobs/${job.id}/`) throw new Error("retention output prefix does not match its job");
  const artifactKeys = validateArtifacts(job, job.artifacts || []).map((artifact) => artifact.objectKey);
  return Object.freeze([...new Set([inputObjectKey, ...artifactKeys])]);
}
async function runTeamRetention({ repository, objectStore, actorId, retentionDays, limit = 100 } = {}) {
  if (!repository || typeof repository.expireDueJobs !== "function" || typeof repository.listRetentionCandidates !== "function" || typeof repository.markRetentionCleaned !== "function") throw new TypeError("retention repository is incomplete");
  if (!objectStore || typeof objectStore.deleteObject !== "function" || typeof objectStore.listObjects !== "function") throw new TypeError("retention object store is incomplete");
  const actor = assertNonEmptyString(actorId, "retention actorId");
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new RangeError("retentionDays must be between 1 and 3650");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new RangeError("retention limit must be between 1 and 1000");
  const expired = await repository.expireDueJobs(actor);
  const candidates = await repository.listRetentionCandidates(retentionDays, limit);
  let cleaned = 0;
  for (const job of candidates) {
    const keys = retentionObjectKeys(job);
    const outputs = await collectRetentionOutputKeys({ prefix: job.outputPrefix, listPage: (input) => objectStore.listObjects(input) });
    for (const objectKey of new Set([...keys, ...outputs])) await objectStore.deleteObject({ objectKey });
    if (await repository.markRetentionCleaned(job.id, actor)) cleaned += 1;
  }
  return Object.freeze({ expired: expired.length, cleaned });
}
const { createWorkerJob, createWorkerHandlerContext } = require("./worker-context");

class TeamWorker {
  constructor({ repository, handlers, leaseSeconds = 60, heartbeatIntervalMs } = {}) {
    if (!repository || typeof repository.claim !== "function" || typeof repository.transition !== "function" || typeof repository.isCancellationRequested !== "function" || typeof repository.heartbeat !== "function") throw new TypeError("worker repository is incomplete");
    if (!handlers || typeof handlers !== "object") throw new TypeError("worker handlers are required");
    assertLeaseSeconds(leaseSeconds);
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
    const claimedJob = await this.repository.claim(id, worker, this.leaseSeconds);
    if (!claimedJob) return null;
    const job = createWorkerJob(claimedJob);
    const attempt = job.attempt;
    const handler = this.handlers[job.capability];
    if (typeof handler !== "function") return this.repository.transition({ id: job.id, workerId: worker, attempt, from: "running", to: "failed", error: { code: "NO_CAPABILITY_HANDLER", message: "worker does not support this capability", retryable: false } });
    const isCancellationRequested = () => this.repository.isCancellationRequested(job.id, worker, attempt);
    let heartbeatFailure = null;
    let activeHeartbeat = null;
    const heartbeat = async () => {
      if (activeHeartbeat) return activeHeartbeat;
      activeHeartbeat = (async () => {
        try {
          if (!await this.repository.heartbeat(job.id, worker, this.leaseSeconds, attempt)) heartbeatFailure = new Error("worker lease heartbeat was rejected");
        } catch { heartbeatFailure = new Error("worker lease heartbeat failed"); }
        finally { activeHeartbeat = null; }
      })();
      return activeHeartbeat;
    };
    const heartbeatTimer = setInterval(() => { void heartbeat(); }, this.heartbeatIntervalMs);
    try {
      const output = await handler(createWorkerHandlerContext(job, isCancellationRequested));
      await heartbeat();
      if (heartbeatFailure) throw heartbeatFailure;
      if (await isCancellationRequested()) return this.repository.transition({ id: job.id, workerId: worker, attempt, from: "cancel_requested", to: "cancelled" });
      const artifacts = validateArtifacts(job, output?.artifacts || []);
      const quality = assertQualityReport(output?.quality);
      const completion = resolveWorkerCompletion(output, quality);
      return this.repository.transition({
        id: job.id,
        workerId: worker,
        attempt,
        from: "running",
        to: completion.status,
        artifacts,
        quality,
        ...(completion.error ? { error: completion.error } : {})
      });
    } catch (error) {
      if (await isCancellationRequested()) return this.repository.transition({ id: job.id, workerId: worker, attempt, from: "cancel_requested", to: "cancelled" });
      return this.repository.transition({ id: job.id, workerId: worker, attempt, from: "running", to: "failed", error: storedWorkerFailure(error) });
    } finally { clearInterval(heartbeatTimer); if (activeHeartbeat) await activeHeartbeat; }
  }
}

async function recoverWorkerLeases({ repository, queue, actorId, capability }) {
  if (!repository || typeof repository.recoverExpiredLeases !== "function") throw new TypeError("worker recovery repository is incomplete");
  if (typeof repository.listPendingDeliveries !== "function" || typeof repository.acknowledgeDelivery !== "function") throw new TypeError("worker delivery repository is incomplete");
  if (!queue || typeof queue.enqueue !== "function" || typeof queue.recover !== "function") throw new TypeError("worker recovery queue is incomplete");
  if (!CAPABILITIES.has(capability)) throw new Error("worker recovery capability is invalid");
  const jobs = await repository.recoverExpiredLeases(assertNonEmptyString(actorId, "recovery actorId"), capability);
  for (const job of jobs) {
    if (!job || job.capability !== capability) throw new Error("recovery returned a job for another capability");
  }
  const deliveries = await repository.listPendingDeliveries(capability);
  for (const job of deliveries) {
    if (!job || job.capability !== capability) throw new Error("delivery returned a job for another capability");
    const message = { id: job.id, capability: job.capability };
    // A lease can expire after a Redis delivery was already acknowledged (for
    // example, during an external worker crash). In that case enqueue is the
    // safe duplicate-tolerant fallback.
    if (!await queue.recover(message)) await queue.enqueue(message);
    // Keep intent for Redis loss repair; stale publishers cannot defer a newer generation.
    await repository.acknowledgeDelivery(job.id, job.generation);
  }
  return jobs;
}

const TeamWorkerRunner = require("./worker-runner").createWorkerRunner(CAPABILITIES);

function createTeamServices({ repository, queue, objectStore, projectActiveJobLimit } = {}) {
  if (!repository || typeof repository.create !== "function" || typeof repository.findActiveByIdempotency !== "function" || typeof repository.get !== "function" || typeof repository.requestCancel !== "function") throw new TypeError("repository is incomplete");
  if (!queue || typeof queue.enqueue !== "function") throw new TypeError("queue is incomplete");
  if (!objectStore || typeof objectStore.createUploadTarget !== "function" || typeof objectStore.createDownloadTarget !== "function" || typeof objectStore.waitForUpload !== "function") throw new TypeError("objectStore is incomplete");
  if (projectActiveJobLimit !== undefined && (!Number.isSafeInteger(projectActiveJobLimit) || projectActiveJobLimit < 1 || projectActiveJobLimit > 10000 || typeof repository.createWithinProjectQuota !== "function")) throw new TypeError("project active Job quota configuration is invalid");
  return Object.freeze({
    async createUploadTarget({ ownerId, capability, contentType, contentLength }) {
      if (!validUploadRequest(capability, contentType, contentLength)) throw new Error("upload request is invalid");
      const objectKey = `${ownerPrefix(ownerId)}inputs/${crypto.randomUUID()}`;
      return objectStore.createUploadTarget({ ownerId, capability, objectKey, contentType, contentLength });
    },
    async createJob(input) {
      const job = createTeamJob(input);
      const existing = await repository.findActiveByIdempotency(job);
      if (existing) return existing;
      await objectStore.waitForUpload({ objectKey: job.inputObjectKey });
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

module.exports = { CAPABILITIES, PostgresJobRepository, TEAM_DEFAULT_CAPABILITIES, TEAM_DEPLOYABLE_CAPABILITIES, TEAM_DEPLOYMENT_CAPABILITIES, TeamWorker, TeamWorkerRunner, assertProjectId, assertTraceParent, createTeamJob, createTeamServices, fromRow, loadTeamConfig, normalizeTeamJobOptions, ownedInputKey, parseEnabledCapabilities, recoverWorkerLeases, retentionObjectKeys, runTeamRetention, storedQuality, teamDeploymentPlan, validUploadRequest };
