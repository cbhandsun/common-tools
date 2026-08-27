#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const budgetFile = path.join(root, "config", "architecture-budgets.json");
const sourceRoots = [
  "skills/pd-hifi-slideclone/scripts",
  "skills/pd-hifi-slideclone/dotnet",
  "scripts",
  "packages"
];

function verifyArchitectureBudgets(options = {}) {
  const config = validateConfig(readJson(options.budgetFile || budgetFile));
  const files = [
    ...sourceRoots.flatMap((directory) => listCodeFiles(path.join(root, directory))),
    ...listCodeFiles(path.join(root, "test"))
  ];
  const observed = new Map(files.map((file) => [relativePath(file), measureFile(file)]));
  const failures = [];
  for (const [file, metrics] of observed) {
    const category = file.startsWith("test/") ? "test" : "source";
    const defaults = config.defaults[category];
    const exception = config.legacyExceptions[file] || {};
    for (const metric of ["maxLines", "maxBytes", "maxRelativeImports"]) {
      const actualKey = metric.slice(3, 4).toLowerCase() + metric.slice(4);
      const limit = exception[metric] ?? defaults[metric];
      if (metrics[actualKey] > limit) failures.push(`${file} ${actualKey} ${metrics[actualKey]} exceeds ${limit}`);
      if (Object.hasOwn(exception, metric) && metrics[actualKey] < limit) {
        failures.push(`${file} ${actualKey} improved to ${metrics[actualKey]}; ratchet ${metric} down from ${limit}`);
      }
    }
  }
  for (const file of Object.keys(config.legacyExceptions)) {
    if (!observed.has(file)) failures.push(`legacy architecture exception references a missing file: ${file}`);
  }
  if (failures.length > 0) throw new Error(`architecture budget verification failed:\n- ${failures.join("\n- ")}`);
  return Object.freeze({ fileCount: observed.size, legacyExceptionCount: Object.keys(config.legacyExceptions).length });
}

function validateConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1
    || Object.keys(value).some((key) => !["version", "defaults", "legacyExceptions"].includes(key))) {
    throw new TypeError("architecture budget config is invalid");
  }
  const defaults = value.defaults;
  if (!defaults || Object.keys(defaults).sort().join(",") !== "source,test") throw new TypeError("architecture budget defaults are invalid");
  validateLimits(defaults.source, "source defaults", true);
  validateLimits(defaults.test, "test defaults", true);
  if (!value.legacyExceptions || typeof value.legacyExceptions !== "object" || Array.isArray(value.legacyExceptions)) {
    throw new TypeError("architecture budget exceptions are invalid");
  }
  for (const [file, limits] of Object.entries(value.legacyExceptions)) {
    if (!safeRelativePath(file)) throw new TypeError(`architecture budget exception path is invalid: ${file}`);
    validateLimits(limits, `architecture exception ${file}`, false);
  }
  return value;
}

function validateLimits(value, label, requireAll) {
  const allowed = ["maxBytes", "maxLines", "maxRelativeImports"];
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new TypeError(`${label} is invalid`);
  }
  if (requireAll && allowed.some((key) => !Object.hasOwn(value, key))) throw new TypeError(`${label} is incomplete`);
  for (const [key, limit] of Object.entries(value)) {
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 10_000_000) throw new TypeError(`${label} ${key} is invalid`);
  }
}

function measureFile(file) {
  const source = fs.readFileSync(file, "utf8");
  const relativeImports = file.endsWith(".js")
    ? new Set([...source.matchAll(/require\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/gu)].map((match) => match[1])).size
    : 0;
  return Object.freeze({
    lines: source.split(/\r?\n/u).length,
    bytes: Buffer.byteLength(source),
    relativeImports
  });
}

function listCodeFiles(directory) {
  if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["bin", "node_modules", "obj"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listCodeFiles(target));
    else if (entry.isFile() && /\.(?:cs|js)$/u.test(entry.name)) files.push(target);
  }
  return files;
}

function safeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || value.includes("\\") || path.isAbsolute(value)) return false;
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function relativePath(file) { return path.relative(root, file).replace(/\\/gu, "/"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, "")); }

if (require.main === module) {
  try {
    const result = verifyArchitectureBudgets();
    process.stdout.write(`verified architecture budgets for ${result.fileCount} files with ${result.legacyExceptionCount} decreasing-only exceptions\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { listCodeFiles, measureFile, validateConfig, verifyArchitectureBudgets };
