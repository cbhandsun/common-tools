"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const RUNTIME_IDENTITY_SCRIPT = [
  "import json, platform, sys, sysconfig",
  "print(json.dumps({'implementation': platform.python_implementation(), 'version': platform.python_version(), 'cacheTag': sys.implementation.cache_tag, 'platform': sysconfig.get_platform()}))"
].join("; ");

function resolvePythonToolLocation(options) {
  const workspaceRoot = path.resolve(requiredString(options.workspaceRoot, "workspaceRoot"));
  const fallbackDir = path.resolve(requiredString(options.fallbackDir, "fallbackDir"));
  const requirementsFile = path.resolve(requiredString(options.requirementsFile, "requirementsFile"));
  const toolName = boundedName(options.toolName);
  const runnerToolCache = optionalString(options.runnerToolCache);
  if (!runnerToolCache) {
    return Object.freeze({ managedRoot: path.dirname(fallbackDir), targetDir: fallbackDir, persistent: false });
  }
  if (!path.isAbsolute(runnerToolCache)) throw new Error("RUNNER_TOOL_CACHE must be an absolute path");
  const cacheRoot = path.resolve(runnerToolCache);
  if (cacheRoot === path.parse(cacheRoot).root) throw new Error("RUNNER_TOOL_CACHE must not be a filesystem root");
  if (!fs.existsSync(requirementsFile) || !fs.statSync(requirementsFile).isFile()) {
    throw new Error("Python dependency lock file is unavailable");
  }
  const runtimeIdentity = options.runtimeIdentity || readPythonRuntimeIdentity(
    requiredString(options.python, "python"),
    workspaceRoot,
    options.runIdentityCommand
  );
  const digest = crypto.createHash("sha256")
    .update("common-tools-python-cache-v2\0")
    .update(toolName)
    .update("\0")
    .update(process.platform)
    .update("\0")
    .update(process.arch)
    .update("\0")
    .update(runtimeIdentity)
    .update("\0")
    .update(fs.readFileSync(requirementsFile))
    .digest("hex");
  const cacheNamespace = toolName === "python-site" ? "p" : "o";
  const managedRoot = path.join(cacheRoot, "ct", cacheNamespace);
  const targetDir = path.join(managedRoot, digest.slice(0, 32));
  assertManagedCachePath(managedRoot, targetDir);
  return Object.freeze({ managedRoot, targetDir, persistent: true, digest });
}

function readPythonRuntimeIdentity(python, workspaceRoot, run = spawnSync) {
  const result = run(python, ["-c", RUNTIME_IDENTITY_SCRIPT], {
    cwd: workspaceRoot,
    windowsHide: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (!result || result.status !== 0 || typeof result.stdout !== "string") {
    throw new Error(`Unable to identify Python runtime (exit ${result?.status ?? "unknown"})`);
  }
  let identity;
  try {
    identity = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error("Python runtime identity is invalid");
  }
  const fields = ["implementation", "version", "cacheTag", "platform"];
  if (!identity || typeof identity !== "object" || fields.some((field) => !safeIdentityToken(identity[field]))) {
    throw new Error("Python runtime identity is invalid");
  }
  return fields.map((field) => identity[field]).join("|");
}

function exportGitHubEnvironment(name, value, environmentFile = process.env.GITHUB_ENV) {
  if (!environmentFile) return false;
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) throw new Error("GitHub environment variable name is invalid");
  if (typeof value !== "string" || !path.isAbsolute(value) || /[\r\n]/u.test(value)) {
    throw new Error("GitHub environment variable value must be an absolute single-line path");
  }
  fs.appendFileSync(environmentFile, `${name}=${path.resolve(value)}${require("os").EOL}`, "utf8");
  return true;
}

function assertManagedCachePath(managedRoot, targetDir) {
  const root = path.resolve(managedRoot);
  const target = path.resolve(targetDir);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to modify a path outside the managed Python cache");
  }
}

function boundedName(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(value)) {
    throw new Error("Python cache tool name is invalid");
  }
  return value;
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.length < 1 || value.length > 32_768 || /[\r\n\0]/u.test(value)) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function optionalString(value) {
  if (value === undefined || value === null || value === "") return null;
  return requiredString(value, "RUNNER_TOOL_CACHE");
}

function safeIdentityToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.+\-]{1,128}$/.test(value);
}

module.exports = {
  assertManagedCachePath,
  exportGitHubEnvironment,
  readPythonRuntimeIdentity,
  resolvePythonToolLocation
};
