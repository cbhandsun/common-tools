#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

const ALWAYS_RUN_EVENTS = new Set(["schedule", "workflow_dispatch"]);
const OFFICE_PATHS = Object.freeze([
  ".github/workflows/ppt-office-regression.yml",
  "package-lock.json",
  "package.json",
  "packages/ppt-create-core/",
  "packages/ppt-improve-core/",
  "packages/remote-mcp-server/bin/common-tools-team-ppt-create-worker.js",
  "scripts/cross-renderer-corpus-audit.js",
  "scripts/lib/office-regression-evidence.js",
  "scripts/office-regression-scope.js",
  "scripts/ppt-create-office-smoke.js",
  "scripts/run-office-ppt-regression.js",
  "skills/pd-hifi-slideclone/"
]);

function normalizeChangedPath(value) {
  if (typeof value !== "string") throw new TypeError("changed path must be a string");
  const normalized = value.trim().replace(/\\/gu, "/");
  if (!normalized) return "";
  if (normalized.length > 1024 || normalized.startsWith("/") || normalized.includes("\0")
    || normalized.split("/").some((part) => part === "..")) {
    throw new TypeError("changed path is invalid");
  }
  return normalized.replace(/^\.\//u, "");
}

function requiresOfficeRegression(eventName, changedPaths) {
  if (typeof eventName !== "string" || !/^[a-z_]+$/u.test(eventName)) throw new TypeError("event name is invalid");
  if (ALWAYS_RUN_EVENTS.has(eventName)) return true;
  if (!["pull_request", "push"].includes(eventName)) throw new TypeError("event is unsupported");
  if (!Array.isArray(changedPaths) || changedPaths.length > 10000) throw new TypeError("changed paths are invalid");
  return changedPaths.some((value) => {
    const file = normalizeChangedPath(value);
    return file && OFFICE_PATHS.some((candidate) => candidate.endsWith("/") ? file.startsWith(candidate) : file === candidate);
  });
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!["--event", "--github-output"].includes(option) || !value || value.startsWith("--")) {
      throw new Error("Usage: node scripts/office-regression-scope.js --event <event> --github-output <file>");
    }
    parsed[option.slice(2)] = value;
  }
  if (!parsed.event || !parsed["github-output"]) throw new Error("event and github-output are required");
  return parsed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = fs.readFileSync(0, "utf8");
  if (Buffer.byteLength(input, "utf8") > 2 * 1024 * 1024) throw new Error("changed path input is too large");
  const changedPaths = input.split(/\r?\n/u).filter(Boolean);
  const runOffice = requiresOfficeRegression(args.event, changedPaths);
  fs.appendFileSync(args["github-output"], `run_office=${runOffice}\n`, { encoding: "utf8" });
  process.stdout.write(`${JSON.stringify({ event: args.event, changedFileCount: changedPaths.length, runOffice })}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { normalizeChangedPath, requiresOfficeRegression };
