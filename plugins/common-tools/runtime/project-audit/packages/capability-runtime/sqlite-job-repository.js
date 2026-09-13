// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { assertJob, assertJobRepository, assertNonEmptyString, assertTransition, TERMINAL_JOB_STATUSES, validateJobListFilter } = require("../capability-contracts");

const DEFAULT_DB_FILE = "jobs.sqlite";

/**
 * @typedef {import("node:sqlite").DatabaseSync} DatabaseSync
 */

/**
 * @returns {{ DatabaseSync: new (file: string) => DatabaseSync } | null}
 */
function loadNodeSqlite() {
  try {
    return /** @type {{ DatabaseSync: new (file: string) => DatabaseSync }} */ (require("node:sqlite"));
  } catch {
    return null;
  }
}

/**
 * @returns {boolean}
 */
function isSqliteJobRepositoryAvailable() {
  return loadNodeSqlite() !== null;
}

class SqliteJobRepository {
  /**
   * @param {{ root: string, ownerId: string, filename?: string }} options
   */
  constructor(options) {
    if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("SqliteJobRepository options must be an object");
    const sqlite = loadNodeSqlite();
    if (!sqlite) throw new Error("node:sqlite is not available in this Node.js runtime");

    const requestedRoot = path.resolve(assertNonEmptyString(options.root, "root"));
    fs.mkdirSync(requestedRoot, { recursive: true, mode: 0o700 });
    this.root = insideRootLocal(requestedRoot, requestedRoot);
    this.ownerId = assertNonEmptyString(options.ownerId, "ownerId");
    const filename = options.filename === undefined ? DEFAULT_DB_FILE : assertNonEmptyString(options.filename, "filename");
    if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(filename) || !filename.endsWith(".sqlite")) throw new TypeError("filename must be a simple .sqlite filename");
    this.dbFile = insideRootLocal(this.root, path.join(this.root, filename));
    this.db = new sqlite.DatabaseSync(this.dbFile);
    initializeSchema(this.db);
  }

  /**
   * @param {{ id: string, capability: string, idempotencyKey: string, expiresAt?: string }} options
   * @returns {unknown}
   */
  create({ id, capability, idempotencyKey, expiresAt }) {
    const existing = this.findByIdempotency(capability, idempotencyKey);
    if (existing) return existing;
    const now = new Date().toISOString();
    const job = { id, capability, ownerId: this.ownerId, idempotencyKey, status: "queued", attempt: 0, maxAttempts: 1, createdAt: now, updatedAt: now, expiresAt, artifacts: /** @type {unknown[]} */ ([]) };
    this.write(job);
    return Object.freeze(job);
  }

  /**
   * @param {string} id
   * @returns {unknown | null}
   */
  get(id) {
    const row = this.db.prepare("SELECT payload FROM capability_jobs WHERE owner_id = ? AND id = ?").get(this.ownerId, assertNonEmptyString(id, "job id"));
    return row && typeof row === "object" ? parseJobPayload(/** @type {{ payload?: unknown }} */ (row).payload) : null;
  }

  /**
   * @param {string} capability
   * @param {string} idempotencyKey
   * @returns {unknown | null}
   */
  findByIdempotency(capability, idempotencyKey) {
    const placeholders = [...TERMINAL_JOB_STATUSES].map(() => "?").join(",");
    const row = this.db.prepare(
      `SELECT payload FROM capability_jobs WHERE owner_id = ? AND capability = ? AND idempotency_key = ? AND status NOT IN (${placeholders}) ORDER BY created_at DESC, id DESC LIMIT 1`
    ).get(this.ownerId, assertNonEmptyString(capability, "capability"), assertNonEmptyString(idempotencyKey, "idempotencyKey"), ...TERMINAL_JOB_STATUSES);
    return row && typeof row === "object" ? parseJobPayload(/** @type {{ payload?: unknown }} */ (row).payload) : null;
  }

  /**
   * @param {string} id
   * @param {import("../capability-contracts").JobStatus} status
   * @param {Record<string, unknown>} [extra]
   * @returns {unknown}
   */
  transition(id, status, extra = {}) {
    const job = this.get(id);
    if (!job || typeof job !== "object" || Array.isArray(job)) throw new Error("job not found");
    const current = /** @type {Record<string, unknown>} */ (job);
    assertTransition(/** @type {import("../capability-contracts").JobStatus} */ (current.status), status);
    const next = { ...current, ...extra, status, updatedAt: new Date().toISOString() };
    this.write(next);
    return Object.freeze(next);
  }

  /**
   * @param {unknown} [filter]
   * @returns {readonly unknown[]}
   */
  list(filter = {}) {
    const { capability, status, limit } = validateJobListFilter(filter, { defaultLimit: 100 });
    const conditions = ["owner_id = ?"];
    /** @type {Array<string | number>} */
    const params = [this.ownerId];
    if (capability !== null) {
      conditions.push("capability = ?");
      params.push(capability);
    }
    if (status !== null) {
      conditions.push("status = ?");
      params.push(status);
    }
    params.push(limit);
    const rows = this.db.prepare(
      `SELECT payload FROM capability_jobs WHERE ${conditions.join(" AND ")} ORDER BY created_at ASC, id ASC LIMIT ?`
    ).all(...params);
    return Object.freeze(rows.map((row) => parseJobPayload(/** @type {{ payload?: unknown }} */ (row).payload)));
  }

  /**
   * @param {unknown} job
   */
  write(job) {
    const validated = assertJob(job);
    const id = assertNonEmptyString(validated.id, "job.id");
    const ownerId = assertNonEmptyString(validated.ownerId, "job.ownerId");
    const capability = assertNonEmptyString(validated.capability, "job.capability");
    const idempotencyKey = assertNonEmptyString(validated.idempotencyKey, "job.idempotencyKey");
    const status = /** @type {import("../capability-contracts").JobStatus} */ (validated.status);
    const createdAt = typeof validated.createdAt === "string" && validated.createdAt.trim() ? validated.createdAt.trim() : new Date().toISOString();
    const updatedAt = typeof validated.updatedAt === "string" && validated.updatedAt.trim() ? validated.updatedAt.trim() : createdAt;
    if (ownerId !== this.ownerId) throw new Error("job owner does not match repository owner");
    const normalized = { ...validated, id, ownerId, capability, idempotencyKey, status, createdAt, updatedAt };
    const payload = JSON.stringify(normalized);
    this.db.prepare(
      "INSERT INTO capability_jobs (id, owner_id, capability, idempotency_key, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, id) DO UPDATE SET capability = excluded.capability, idempotency_key = excluded.idempotency_key, status = excluded.status, updated_at = excluded.updated_at, payload = excluded.payload"
    ).run(id, ownerId, capability, idempotencyKey, status, createdAt, updatedAt, payload);
  }

  /**
   * @returns {this}
   */
  asJobRepository() {
    const ensureJobRepository = /** @type {(value: unknown, label?: string) => void} */ (assertJobRepository);
    ensureJobRepository(this, "SqliteJobRepository");
    return this;
  }

  close() {
    this.db.close();
  }
}

/**
 * @param {DatabaseSync} db
 */
function initializeSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS capability_jobs (
      owner_id TEXT NOT NULL,
      id TEXT NOT NULL,
      capability TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (owner_id, id)
    );
    CREATE INDEX IF NOT EXISTS capability_jobs_idempotency_idx ON capability_jobs (owner_id, capability, idempotency_key, status, created_at);
    CREATE INDEX IF NOT EXISTS capability_jobs_filter_idx ON capability_jobs (owner_id, capability, status, created_at, id);
  `);
}

/**
 * @param {string} root
 * @param {string} candidate
 * @returns {string}
 */
function insideRootLocal(root, candidate) {
  const resolvedRoot = fs.realpathSync.native(root);
  const resolvedCandidate = resolveFromRealAncestorLocal(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) return resolvedCandidate;
  throw new Error("path is outside the approved root");
}

/**
 * @param {string} candidate
 * @returns {string}
 */
function resolveFromRealAncestorLocal(candidate) {
  let cursor = path.resolve(candidate);
  const missingSegments = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error("path has no resolvable ancestor");
    missingSegments.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.resolve(fs.realpathSync.native(cursor), ...missingSegments);
}

/**
 * @param {unknown} payload
 * @returns {unknown}
 */
function parseJobPayload(payload) {
  if (typeof payload !== "string") throw new Error("job payload is invalid");
  return Object.freeze(assertJob(JSON.parse(payload)));
}

module.exports = {
  SqliteJobRepository,
  insideRootLocal,
  isSqliteJobRepositoryAvailable,
  loadNodeSqlite
};
