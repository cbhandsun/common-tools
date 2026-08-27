"use strict";

const fs = require("node:fs");
const path = require("node:path");

const EXECUTION_MODES = Object.freeze(["local-preferred", "remote-only", "local-only"]);
const LOCAL_CAPABILITIES = Object.freeze(["project-audit"]);
const RUNTIME_CONFIG_FILE = "runtime.json";

function normalizeExecutionMode(value) {
  if (value === undefined || value === null) return "local-preferred";
  if (typeof value !== "string" || !EXECUTION_MODES.includes(value.trim())) throw new TypeError("execution mode must be local-preferred, remote-only, or local-only");
  return value.trim();
}

function runtimeConfigDirectory(environment = process.env, platform = process.platform) {
  const base = platform === "win32"
    ? environment.LOCALAPPDATA
    : (environment.XDG_STATE_HOME || (environment.HOME ? path.join(environment.HOME, ".local", "state") : undefined));
  if (typeof base !== "string" || !base.trim()) throw new Error("local runtime configuration directory is unavailable");
  return path.resolve(base, "CommonTools");
}

function runtimeConfigPath(environment = process.env, platform = process.platform) {
  return path.join(runtimeConfigDirectory(environment, platform), RUNTIME_CONFIG_FILE);
}

function normalizeRuntimeConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "executionMode,installedRuntimeVersion,schemaVersion" || value.schemaVersion !== 1 || typeof value.installedRuntimeVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(value.installedRuntimeVersion)) throw new Error("local runtime configuration is invalid");
  return Object.freeze({ schemaVersion: 1, executionMode: normalizeExecutionMode(value.executionMode), installedRuntimeVersion: value.installedRuntimeVersion });
}

function readRuntimeConfig(environment = process.env, platform = process.platform, fileSystem = fs) {
  const file = runtimeConfigPath(environment, platform);
  if (!fileSystem.existsSync(file)) return Object.freeze({ source: "default", executionMode: "local-preferred", installedRuntimeVersion: null, file });
  const stat = fileSystem.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024) throw new Error("local runtime configuration is invalid");
  let value;
  try { value = JSON.parse(fileSystem.readFileSync(file, "utf8")); } catch { throw new Error("local runtime configuration is invalid"); }
  return Object.freeze({ source: "user", ...normalizeRuntimeConfig(value), file });
}

function resolveExecutionRoute({ capability, executionMode, requestedExecution } = {}) {
  if (typeof capability !== "string" || !capability.trim()) throw new TypeError("capability is required");
  const configured = normalizeExecutionMode(executionMode);
  if (requestedExecution !== undefined && requestedExecution !== "local" && requestedExecution !== "remote") throw new TypeError("requested execution must be local or remote");
  const locallySupported = LOCAL_CAPABILITIES.includes(capability);
  if (requestedExecution === "remote") return Object.freeze({ execution: "remote", reason: "explicit-remote-request", locallySupported });
  if (requestedExecution === "local") {
    if (!locallySupported) throw new Error(`capability requires remote execution: ${capability}`);
    return Object.freeze({ execution: "local", reason: "explicit-local-request", locallySupported });
  }
  if (configured === "remote-only") return Object.freeze({ execution: "remote", reason: "configured-remote-only", locallySupported });
  if (locallySupported) return Object.freeze({ execution: "local", reason: configured === "local-only" ? "configured-local-only" : "local-capability-default", locallySupported });
  if (configured === "local-only") throw new Error(`capability is unavailable in local-only mode: ${capability}`);
  return Object.freeze({ execution: "remote", reason: "capability-requires-remote-runtime", locallySupported });
}

module.exports = { EXECUTION_MODES, LOCAL_CAPABILITIES, normalizeExecutionMode, normalizeRuntimeConfig, readRuntimeConfig, resolveExecutionRoute, runtimeConfigDirectory, runtimeConfigPath };
