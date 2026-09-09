#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const VALID_STATUS = new Set(["verified", "partial", "open"]);
const VALID_AREAS = new Set(["A", "B", "C", "D", "E", "F"]);
const DEFAULT_CONFIG = path.join("config", "architecture-closeout-checklist.json");

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

function summarizeCloseout({ repositoryRoot = path.resolve(__dirname, ".."), config = DEFAULT_CONFIG, requireComplete = false } = {}) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) throw new TypeError("repository root is invalid");
  const checklist = readJsonFile(repositoryRoot, config, "architecture closeout checklist");
  const items = validateChecklist(checklist);
  const itemSummaries = items.map((item) => {
    const missingEvidence = item.evidenceFiles.filter((file) => !fileExists(repositoryRoot, file));
    return Object.freeze({
      id: item.id,
      area: item.area,
      status: item.status,
      missingEvidence,
      remainingCount: Array.isArray(item.remaining) ? item.remaining.length : 0
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
