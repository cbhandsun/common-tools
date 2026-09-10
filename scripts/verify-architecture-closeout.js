#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { verifyLocalAcceptanceEvidence, walkForSecrets } = require("./verify-local-acceptance-evidence");

const VALID_STATUS = new Set(["verified", "partial", "open"]);
const VALID_AREAS = new Set(["A", "B", "C", "D", "E", "F"]);
const DEFAULT_CONFIG = path.join("config", "architecture-closeout-checklist.json");
const NATIVE_ENGINE_PAYLOAD_ROOT = path.join("packages", "slideclone-native-engine", "scripts");
const NATIVE_ENGINE_TARGET_MAX_LINES = 1500;
const NATIVE_ENGINE_COMPOSITION_ROOT_MAX_LINES = 4100;
const NATIVE_ENGINE_COMPOSITION_ROOTS = new Set(["rebuild-real-pptx-native.js"]);
const STRICT_INPUT_BOUNDARY_EVIDENCE = ".codex-tmp/strict-input-boundaries-current-evidence.json";

function parseArgs(argv) {
  const options = { config: DEFAULT_CONFIG, requireComplete: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--config") {
      const value = argv[index + 1];
      if (typeof value !== "string" || value.startsWith("--")) throw new Error("--config requires a value");
      options.config = value;
      index += 1;
    } else if (item === "--require-complete") {
      options.requireComplete = true;
    } else {
      throw new Error(`unexpected argument: ${item}`);
    }
  }
  return options;
}

function assertRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096 || value.includes("\0") || /[\r\n]/u.test(value)) throw new Error(`${label} is invalid`);
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized) || normalized.split("/").includes("..")) throw new Error(`${label} must be repository-relative`);
  return normalized;
}

function readJsonFile(repositoryRoot, relativeFile, label) {
  const normalized = assertRelativePath(relativeFile, label);
  const file = path.join(repositoryRoot, normalized);
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error(`${label} JSON is invalid`); }
  return parsed;
}

function fileExists(repositoryRoot, relativeFile) {
  const normalized = assertRelativePath(relativeFile, "evidence file");
  const file = path.join(repositoryRoot, normalized);
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`${label} is invalid`);
  return value.map((item) => item.trim());
}

function validateChecklist(checklist) {
  if (!checklist || typeof checklist !== "object" || Array.isArray(checklist)) throw new Error("architecture closeout checklist is invalid");
  if (checklist.version !== 1) throw new Error("architecture closeout checklist version is invalid");
  if (typeof checklist.objective !== "string" || !checklist.objective.trim()) throw new Error("architecture closeout objective is invalid");
  if (!Array.isArray(checklist.items) || checklist.items.length === 0) throw new Error("architecture closeout items are invalid");
  const ids = new Set();
  for (const [index, item] of checklist.items.entries()) {
    const label = `architecture closeout item ${index + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${label} is invalid`);
    if (typeof item.id !== "string" || !/^[a-z][a-z0-9-]{2,80}$/u.test(item.id) || ids.has(item.id)) throw new Error(`${label} id is invalid`);
    ids.add(item.id);
    if (!VALID_AREAS.has(item.area)) throw new Error(`${label} area is invalid`);
    if (!VALID_STATUS.has(item.status)) throw new Error(`${label} status is invalid`);
    if (typeof item.summary !== "string" || item.summary.trim().length < 12) throw new Error(`${label} summary is invalid`);
    assertStringArray(item.evidenceFiles, `${label} evidenceFiles`);
    assertStringArray(item.verificationCommands, `${label} verificationCommands`);
    for (const file of item.evidenceFiles) assertRelativePath(file, `${label} evidence file`);
    if (item.status !== "verified") assertStringArray(item.remaining, `${label} remaining`);
    if (item.status === "verified" && item.remaining !== undefined) assertStringArray(item.remaining, `${label} remaining`, { allowEmpty: true });
  }
  return checklist.items;
}

function localAcceptanceEvidenceStatus(repositoryRoot) {
  try {
    const result = verifyLocalAcceptanceEvidence({ repositoryRoot });
    return Object.freeze({
      available: true,
      passed: result.passed === true,
      evidenceFile: path.relative(repositoryRoot, result.evidenceFile).replaceAll("\\", "/"),
      failures: result.failures
    });
  } catch (error) {
    return Object.freeze({
      available: false,
      passed: false,
      evidenceFile: null,
      failures: [error instanceof Error ? error.message : "local acceptance evidence is unavailable"]
    });
  }
}

function readJsonEvidence(repositoryRoot, relativeFile, label) {
  const normalized = assertRelativePath(relativeFile, label);
  const file = path.join(repositoryRoot, normalized);
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size <= 0 || stat.size > 512 * 1024) throw new Error("invalid file");
    return { file: normalized, value: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return null;
  }
}

function sha256File(repositoryRoot, relativeFile) {
  const normalized = assertRelativePath(relativeFile, "strict input boundary evidence file entry");
  const file = path.join(repositoryRoot, normalized);
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("strict input boundary file entry is unavailable");
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function strictInputBoundaryEvidenceStatus(repositoryRoot) {
  const read = readJsonEvidence(repositoryRoot, STRICT_INPUT_BOUNDARY_EVIDENCE, "strict input boundary evidence file");
  if (!read) {
    return Object.freeze({
      available: false,
      passed: false,
      evidenceFile: null,
      failures: ["strict input boundary evidence is unavailable"]
    });
  }
  const evidence = read.value;
  const failures = [];
  if (evidence?.schemaVersion !== 1) failures.push("strict input boundary evidence schema is invalid");
  const checks = evidence?.checks && typeof evidence.checks === "object" && !Array.isArray(evidence.checks) ? evidence.checks : {};
  if (checks.targetedTests?.exitCode !== 0 || checks.targetedTests?.failed !== 0 || !Number.isSafeInteger(checks.targetedTests?.passed) || checks.targetedTests.passed < 40) failures.push("strict input boundary targeted tests did not pass");
  if (checks.typecheck?.exitCode !== 0) failures.push("strict input boundary typecheck did not pass");
  if (checks.workspaceBoundaries?.exitCode !== 0) failures.push("strict input boundary workspace check did not pass");
  if (checks.architectureBudgets?.exitCode !== 0) failures.push("strict input boundary architecture budget check did not pass");
  const files = Array.isArray(evidence?.files) ? evidence.files : [];
  if (files.length < 8) failures.push("strict input boundary evidence has insufficient file coverage");
  for (const entry of files) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.file !== "string" || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
      failures.push("strict input boundary evidence file entry is invalid");
      continue;
    }
    try {
      if (sha256File(repositoryRoot, entry.file) !== entry.sha256) failures.push(`strict input boundary evidence is stale for ${assertRelativePath(entry.file, "strict input boundary evidence file entry")}`);
    } catch {
      failures.push(`strict input boundary evidence file is unavailable: ${entry.file}`);
    }
  }
  const secretFindings = walkForSecrets(evidence).filter((finding) => !finding.endsWith(".sha256"));
  if (secretFindings.length > 0) failures.push(`strict input boundary evidence contains secret-shaped fields: ${secretFindings.slice(0, 8).join(", ")}`);
  return Object.freeze({ available: true, passed: failures.length === 0, evidenceFile: read.file, failures });
}

function listJavaScriptFiles(directory, base = directory) {
  const files = [];
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
  catch { return files; }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(file, base));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path.relative(base, file).replaceAll("\\", "/"));
  }
  return files;
}

function countLines(file) {
  const source = fs.readFileSync(file, "utf8");
  if (source.length === 0) return 0;
  return source.split(/\r\n|\r|\n/u).length;
}

function nativeEngineModularizationStatus(repositoryRoot) {
  const payloadRoot = path.join(repositoryRoot, NATIVE_ENGINE_PAYLOAD_ROOT);
  const files = listJavaScriptFiles(payloadRoot);
  if (files.length === 0) {
    return Object.freeze({
      available: false,
      passed: false,
      payloadRoot: NATIVE_ENGINE_PAYLOAD_ROOT.replaceAll("\\", "/"),
      failures: ["native engine payload JavaScript files are unavailable"]
    });
  }
  const measured = files.map((file) => Object.freeze({
    file: path.join(NATIVE_ENGINE_PAYLOAD_ROOT, file).replaceAll("\\", "/"),
    lines: countLines(path.join(payloadRoot, file))
  })).sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file));
  const oversized = measured.filter((item) => {
    const payloadRelativeFile = path.relative(payloadRoot, path.join(repositoryRoot, item.file)).replaceAll("\\", "/");
    if (NATIVE_ENGINE_COMPOSITION_ROOTS.has(payloadRelativeFile)) return item.lines > NATIVE_ENGINE_COMPOSITION_ROOT_MAX_LINES;
    return item.lines > NATIVE_ENGINE_TARGET_MAX_LINES;
  });
  const oversizedDomainModules = oversized.filter((item) => {
    const payloadRelativeFile = path.relative(payloadRoot, path.join(repositoryRoot, item.file)).replaceAll("\\", "/");
    return !NATIVE_ENGINE_COMPOSITION_ROOTS.has(payloadRelativeFile);
  });
  return Object.freeze({
    available: true,
    passed: oversized.length === 0,
    targetMaxLines: NATIVE_ENGINE_TARGET_MAX_LINES,
    compositionRootMaxLines: NATIVE_ENGINE_COMPOSITION_ROOT_MAX_LINES,
    compositionRoots: Object.freeze([...NATIVE_ENGINE_COMPOSITION_ROOTS].map((file) => path.join(NATIVE_ENGINE_PAYLOAD_ROOT, file).replaceAll("\\", "/"))),
    fileCount: measured.length,
    oversizedCount: oversized.length,
    oversizedDomainModuleCount: oversizedDomainModules.length,
    oversizedFiles: Object.freeze(oversized.slice(0, 10)),
    largestFiles: Object.freeze(measured.slice(0, 10))
  });
}

function productionAcceptanceEvidenceStatus(repositoryRoot) {
  const candidates = [
    ".codex-tmp/production-acceptance-evidence/acceptance-summary.json",
    "artifacts/production-acceptance/acceptance-summary.json"
  ];
  for (const candidate of candidates) {
    const read = readJsonEvidence(repositoryRoot, candidate, "production acceptance evidence file");
    if (!read) continue;
    const summary = read.value;
    const checks = Array.isArray(summary?.checks) ? summary.checks : [];
    const passedChecks = new Set(checks.filter((check) => check?.status === "passed").map((check) => check.name));
    const failures = [];
    if (summary?.status !== "ready-for-controlled-apply") failures.push("production acceptance summary is not ready for controlled apply");
    if (!passedChecks.has("production-preflight")) failures.push("production preflight evidence did not pass");
    if (!passedChecks.has("migration-status")) failures.push("migration status evidence did not pass");
    const secretFindings = walkForSecrets(summary).filter((finding) => finding !== "credentialMode");
    if (secretFindings.length > 0) failures.push(`production acceptance summary contains secret-shaped fields: ${secretFindings.slice(0, 8).join(", ")}`);
    return Object.freeze({ available: true, passed: failures.length === 0, evidenceFile: read.file, failures });
  }
  return Object.freeze({
    available: false,
    passed: false,
    evidenceFile: null,
    failures: ["production acceptance evidence summary is unavailable"]
  });
}

function currentItemState(item, repositoryRoot) {
  if (item.id === "native-engine-core-modularization") {
    const evidenceCheck = nativeEngineModularizationStatus(repositoryRoot);
    if (evidenceCheck.passed) return Object.freeze({ status: "verified", remainingCount: 0, evidenceCheck });
    return Object.freeze({ status: item.status, remainingCount: Array.isArray(item.remaining) ? item.remaining.length : 0, evidenceCheck });
  }
  if (item.id === "local-authenticated-acceptance") {
    const evidenceCheck = localAcceptanceEvidenceStatus(repositoryRoot);
    if (evidenceCheck.passed) return Object.freeze({ status: "verified", remainingCount: 0, evidenceCheck });
    return Object.freeze({ status: item.status, remainingCount: Array.isArray(item.remaining) ? item.remaining.length : 0, evidenceCheck });
  }
  if (item.id === "strict-input-boundaries") {
    const evidenceCheck = strictInputBoundaryEvidenceStatus(repositoryRoot);
    if (evidenceCheck.passed) return Object.freeze({ status: "verified", remainingCount: 0, evidenceCheck });
    return Object.freeze({ status: item.status, remainingCount: Array.isArray(item.remaining) ? item.remaining.length : 0, evidenceCheck });
  }
  if (item.id === "production-remote-acceptance") {
    const evidenceCheck = productionAcceptanceEvidenceStatus(repositoryRoot);
    if (evidenceCheck.passed) return Object.freeze({ status: "partial", remainingCount: Math.max(1, Array.isArray(item.remaining) ? item.remaining.length - 1 : 1), evidenceCheck });
    return Object.freeze({ status: item.status, remainingCount: Array.isArray(item.remaining) ? item.remaining.length : 0, evidenceCheck });
  }
  return Object.freeze({ status: item.status, remainingCount: Array.isArray(item.remaining) ? item.remaining.length : 0 });
}

function summarizeCloseout({ repositoryRoot = path.resolve(__dirname, ".."), config = DEFAULT_CONFIG, requireComplete = false } = {}) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) throw new TypeError("repository root is invalid");
  const checklist = readJsonFile(repositoryRoot, config, "architecture closeout checklist");
  const items = validateChecklist(checklist);
  const itemSummaries = items.map((item) => {
    const missingEvidence = item.evidenceFiles.filter((file) => !fileExists(repositoryRoot, file));
    const current = currentItemState(item, repositoryRoot);
    return Object.freeze({
      id: item.id,
      area: item.area,
      configuredStatus: item.status,
      status: current.status,
      missingEvidence,
      remainingCount: current.remainingCount,
      ...(current.evidenceCheck ? { evidenceCheck: current.evidenceCheck } : {})
    });
  });
  const counts = Object.freeze({
    verified: itemSummaries.filter((item) => item.status === "verified").length,
    partial: itemSummaries.filter((item) => item.status === "partial").length,
    open: itemSummaries.filter((item) => item.status === "open").length
  });
  const failures = [];
  for (const item of itemSummaries) {
    if (item.status === "verified" && item.missingEvidence.length > 0) failures.push(`${item.id} is marked verified but evidence is missing: ${item.missingEvidence.join(", ")}`);
    if (requireComplete && item.status !== "verified") failures.push(`${item.id} is not verified`);
  }
  return Object.freeze({
    objective: checklist.objective,
    itemCount: itemSummaries.length,
    counts,
    complete: failures.length === 0 && counts.partial === 0 && counts.open === 0,
    requireComplete,
    failures,
    items: itemSummaries
  });
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = summarizeCloseout(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.failures.length === 0 ? 0 : 2;
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "architecture closeout verification failed"}\n`);
    process.exitCode = 2;
  }
}

module.exports = { parseArgs, validateChecklist, summarizeCloseout };
