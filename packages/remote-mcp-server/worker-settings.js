"use strict";

const crypto = require("node:crypto");

/**
 * @typedef {{ readonly capabilities: ReadonlySet<string>, readonly pollSeconds: number, readonly workerId: string }} WorkerSettings
 * @typedef {{ readonly capability: string, readonly capabilityError: string, readonly workerIdPrefix: string, readonly allowDelimitedCapabilities?: boolean }} WorkerSettingsOptions
 */

/**
 * Reads the small, common environment surface used by production workers.
 * Values are accepted only as strings; this avoids coercing untrusted objects.
 *
 * @param {unknown} environment
 * @param {WorkerSettingsOptions} options
 * @returns {WorkerSettings}
 */
function readWorkerSettings(environment, options) {
  const capabilityValue = environmentString(environment, "COMMON_TOOLS_WORKER_CAPABILITIES");
  const pollValue = environmentString(environment, "COMMON_TOOLS_WORKER_POLL_SECONDS");
  const workerIdValue = environmentString(environment, "COMMON_TOOLS_WORKER_ID");
  const capabilities = parseCapabilities(capabilityValue, options);
  const pollSeconds = parsePollSeconds(pollValue);
  const workerId = parseWorkerId(workerIdValue, options.workerIdPrefix);
  return Object.freeze({ capabilities, pollSeconds, workerId });
}

/**
 * @param {unknown} environment
 * @param {string} name
 * @returns {string | undefined}
 */
function environmentString(environment, name) {
  if (typeof environment !== "object" || environment === null || Array.isArray(environment)) throw new Error("worker environment is invalid");
  const record = /** @type {Record<string, unknown>} */ (environment);
  let value;
  try { value = record[name]; } catch { throw new Error("worker environment is invalid"); }
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

/**
 * @param {string | undefined} value
 * @param {WorkerSettingsOptions} options
 * @returns {ReadonlySet<string>}
 */
function parseCapabilities(value, options) {
  if (value === undefined || value === "") return new Set([options.capability]);
  if (options.allowDelimitedCapabilities !== true) {
    if (value !== options.capability) throw new Error(options.capabilityError);
    return new Set([options.capability]);
  }
  const configured = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!configured.length || configured.some((capability) => capability !== options.capability)) throw new Error(options.capabilityError);
  return new Set(configured);
}

/**
 * @param {string | undefined} value
 * @returns {number}
 */
function parsePollSeconds(value) {
  const pollSeconds = Number(value === undefined || value === "" ? 5 : value);
  if (!Number.isSafeInteger(pollSeconds) || pollSeconds < 1 || pollSeconds > 60) throw new Error("COMMON_TOOLS_WORKER_POLL_SECONDS must be between 1 and 60");
  return pollSeconds;
}

/**
 * @param {string | undefined} value
 * @param {string} prefix
 * @returns {string}
 */
function parseWorkerId(value, prefix) {
  const workerId = value === undefined || value === "" ? `${prefix}${crypto.randomUUID()}` : value;
  if (!/^[a-zA-Z0-9._-]{3,128}$/.test(workerId)) throw new Error("COMMON_TOOLS_WORKER_ID is invalid");
  return workerId;
}

/** @param {unknown} environment @returns {string | undefined} */
function readOcrCheckpointRevision(environment) {
  const value = environmentString(environment, "COMMON_TOOLS_IMAGE_OCR_CHECKPOINT_REVISION");
  if (value === undefined || value === "") return undefined;
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("COMMON_TOOLS_IMAGE_OCR_CHECKPOINT_REVISION must be a lowercase SHA-256 digest");
  return value;
}

module.exports = { environmentString, parseCapabilities, parsePollSeconds, parseWorkerId, readWorkerSettings, readOcrCheckpointRevision };
