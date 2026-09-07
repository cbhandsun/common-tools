// @ts-check
"use strict";

const { JOB_STATUSES } = require("../capability-contracts");
const { assertObjectKey, assertProjectId, assertTraceParent, ownerPrefix, ownedInputKey } = require("./job-input");

/** @param {unknown} value */
function identifier(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096
    || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new TypeError();
  return value;
}

/** Keep opaque historical IDs; UUID enforcement belongs to PostgreSQL's ID column.
 * @param {unknown} value @param {readonly string[]} capabilities */
function readJobRowIdentity(value, capabilities) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError();
    const row = /** @type {Record<string, unknown>} */ (value);
    const capability = identifier(row.capability);
    if (!capabilities.includes(capability)) throw new TypeError();
    const id = identifier(row.id);
    const ownerId = identifier(row.owner_id);
    const projectId = row.project_id;
    const outputPrefix = assertObjectKey(row.output_prefix, "output prefix");
    if (outputPrefix !== `${ownerPrefix(ownerId)}jobs/${id}/`) throw new TypeError();
    return Object.freeze({
      id, capability, ownerId, idempotencyKey: identifier(row.idempotency_key),
      projectId: projectId == null ? undefined : assertProjectId(projectId),
      inputObjectKey: ownedInputKey(ownerId, row.input_object_key), outputPrefix,
      traceParent: assertTraceParent(row.trace_parent)
    });
  } catch { throw new TypeError("database job identity is invalid"); }
}

/** @param {unknown} value */
function timestamp(value) {
  const milliseconds = value instanceof Date ? Date.prototype.getTime.call(value)
    : typeof value === "string" && value.length > 0 && value.length <= 64 ? Date.parse(value) : NaN;
  if (!Number.isFinite(milliseconds)) throw new TypeError("database job state is invalid");
  return new Date(milliseconds).toISOString();
}

/** Decode durable execution state without coercing arbitrary objects.
 * Historical timestamps can be in the past; expiry is handled by the repository.
 * @param {unknown} value */
function readJobRowState(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError();
    const row = /** @type {Record<string, unknown>} */ (value);
    const status = row.status;
    const attempt = row.attempt;
    const maxAttempts = row.max_attempts;
    const leaseOwner = row.lease_owner;
    const leaseExpiry = row.lease_expires_at;
    if (typeof status !== "string" || ![...JOB_STATUSES].some(item => item === status)
      || typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 0 || attempt > 2147483647
      || typeof maxAttempts !== "number" || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2147483647) throw new TypeError();
    if ((leaseOwner == null) !== (leaseExpiry == null)) throw new TypeError();
    if (leaseOwner != null && (typeof leaseOwner !== "string" || !leaseOwner.trim())) throw new TypeError();
    const lease = typeof leaseOwner === "string" ? Object.freeze({ workerId: leaseOwner, expiresAt: timestamp(leaseExpiry) }) : undefined;
    return Object.freeze({ status, attempt, maxAttempts, lease, createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at), expiresAt: timestamp(row.expires_at) });
  } catch { throw new TypeError("database job state is invalid"); }
}

module.exports = { readJobRowState, readJobRowIdentity };
