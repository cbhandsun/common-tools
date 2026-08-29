"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SLIDECLONE_TIMEOUT_MS = 30 * 60 * 1000;

function inspectBundledSlideclone({ repositoryRoot } = {}) {
  const requestedRoot = path.resolve(repositoryRoot || path.resolve(__dirname, "..", ".."));
  let root;
  try {
    root = fs.realpathSync.native(requestedRoot);
  } catch {
    return Object.freeze({ available: false, reason: "entry-point-missing" });
  }
  const script = path.join(root, "skills", "pd-hifi-slideclone", "scripts", "slideclone.js");
  let info;
  try {
    info = fs.lstatSync(script);
  } catch {
    return Object.freeze({ available: false, reason: "entry-point-missing" });
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1) return Object.freeze({ available: false, reason: "entry-point-invalid" });
  let realScript;
  try {
    realScript = fs.realpathSync.native(script);
  } catch {
    return Object.freeze({ available: false, reason: "entry-point-unresolvable" });
  }
  const relativeScript = path.relative(root, realScript);
  if (!relativeScript || relativeScript === ".." || relativeScript.startsWith(`..${path.sep}`) || path.isAbsolute(relativeScript)) {
    return Object.freeze({ available: false, reason: "entry-point-outside-runtime" });
  }
  return Object.freeze({ available: true, reason: null, root, script: realScript });
}

function createBundledSlidecloneRunner({ repositoryRoot, spawn = childProcess.spawnSync } = {}) {
  const inspection = inspectBundledSlideclone({ repositoryRoot });
  if (!inspection.available) throw new Error("bundled slideclone entry point is unavailable; install or upgrade the complete Common Tools Runtime");
  if (typeof spawn !== "function") throw new TypeError("slideclone process adapter must be a function");

  return function executeBundledSlideclone(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("slideclone execution request is invalid");
    const configPath = boundedAbsoluteFile(request.configPath, "configPath");
    const inputPath = boundedAbsoluteFile(request.inputPath, "inputPath");
    const inputPaths = request.inputPaths === undefined ? [inputPath] : request.inputPaths;
    if (!Array.isArray(inputPaths) || inputPaths.length < 1 || inputPaths.length > 20 || inputPaths[0] !== request.inputPath || inputPaths.some((file) => typeof file !== "string")) throw new TypeError("slideclone inputPaths must be a bounded ordered file list");
    const approvedInputs = inputPaths.map((file) => boundedAbsoluteFile(file, "inputPaths"));
    if (new Set(approvedInputs).size !== approvedInputs.length || approvedInputs[0] !== inputPath) throw new TypeError("slideclone inputPaths must be a unique ordered file list");
    const inputArguments = approvedInputs.flatMap((file) => ["--input-file", file]);
    return spawn(process.execPath, [inspection.script, "run", "--config", configPath, ...inputArguments], {
      encoding: "utf8",
      windowsHide: true,
      timeout: SLIDECLONE_TIMEOUT_MS
    });
  };
}

function boundedAbsoluteFile(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096 || !path.isAbsolute(value)) {
    throw new TypeError(`slideclone ${label} must be a bounded absolute path`);
  }
  const resolved = path.resolve(value);
  let info;
  try {
    info = fs.lstatSync(resolved);
  } catch {
    throw new TypeError(`slideclone ${label} must identify a file`);
  }
  if (!info.isFile() || info.isSymbolicLink()) throw new TypeError(`slideclone ${label} must identify a file`);
  return fs.realpathSync.native(resolved);
}

module.exports = { SLIDECLONE_TIMEOUT_MS, createBundledSlidecloneRunner, inspectBundledSlideclone };
