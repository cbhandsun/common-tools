#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  appendQualitySnapshot,
  evaluateQualityTrend,
  extractQualitySnapshot,
  validateHistory
} = require("./lib/quality-trend");

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === true) { process.stdout.write(`${usage()}\n`); return; }
  if (!args.current) throw new Error("--current is required");
  if (!args.history) throw new Error("--history is required");
  const currentFile = path.resolve(args.current);
  const historyFile = path.resolve(args.history);
  const currentReport = readJson(currentFile);
  const environmentEvidence = args.environment ? readEnvironmentEvidence(path.resolve(args.environment)) : null;
  const history = fs.existsSync(historyFile) ? readJson(historyFile) : { version: 1, snapshots: [] };
  validateHistory(history);
  const snapshot = extractQualitySnapshot(currentReport, {
    id: args["snapshot-id"],
    targetId: args["target-id"],
    environmentFingerprint: environmentEvidence?.fingerprint
  });
  const result = evaluateQualityTrend(snapshot, history, {
    windowSize: numberArg(args["window-size"], 5),
    minimumHistory: numberArg(args["minimum-history"], 1),
    requiredTargetRatio: ratioArg(args["required-target-ratio"], 1),
    thresholds: thresholdArgs(args)
  });
  const outFile = path.resolve(args.out || path.join(path.dirname(currentFile), "quality-trend-report.json"));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const report = {
    provider: "quality-trend-gate",
    generatedAt: new Date().toISOString(),
    currentFile,
    historyFile,
    environmentFingerprint: environmentEvidence?.fingerprint || null,
    ...result
  };
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const shouldRecord = truthy(args.record) && (result.passed || truthy(args["record-failed"]));
  if (shouldRecord) {
    const updated = appendQualitySnapshot(history, snapshot, { maximumSnapshots: numberArg(args["maximum-snapshots"], 50) });
    fs.mkdirSync(path.dirname(historyFile), { recursive: true });
    fs.writeFileSync(historyFile, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify({ passed: result.passed, reportFile: outFile, recorded: shouldRecord, targetCount: result.targetCount, comparedTargets: result.comparedTargets, failureCount: result.failureCount }, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected positional argument: ${item}`);
    const key = item.slice(2);
    if (["help", "record", "record-failed"].includes(key)) { args[key] = true; continue; }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = next;
    index += 1;
  }
  return args;
}

function thresholdArgs(args) {
  const mapping = {
    pixelDiffRatio: "max-pixel-diff-increase",
    foregroundMissingRatio: "max-foreground-missing-increase",
    editableObjectRatio: "max-editable-ratio-drop",
    largestResidualAreaRatio: "max-largest-residual-increase"
  };
  const thresholds = Object.fromEntries(Object.entries(mapping).filter(([, key]) => args[key] != null).map(([metric, key]) => [metric, ratioArg(args[key], null)]));
  if (args["max-elapsed-increase-ms"] != null) thresholds.elapsedMs = boundedNumberArg(args["max-elapsed-increase-ms"], 0, 10000000);
  return thresholds;
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, "")); }
function readEnvironmentEvidence(file) {
  const evidence = readJson(file);
  if (evidence?.provider !== "office-regression-environment-v1" || !/^[a-f0-9]{64}$/u.test(String(evidence.fingerprint || ""))) {
    throw new TypeError("environment evidence is invalid");
  }
  return evidence;
}
function truthy(value) { return value === true || String(value).toLowerCase() === "true"; }
function numberArg(value, fallback) { if (value == null) return fallback; const number = Number(value); if (!Number.isSafeInteger(number) || number < 0 || number > 1000) throw new TypeError("integer option is outside the supported range"); return number; }
function ratioArg(value, fallback) { if (value == null) return fallback; const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError("ratio option must be between 0 and 1"); return number; }
function boundedNumberArg(value, minimum, maximum) { const number = Number(value); if (!Number.isFinite(number) || number < minimum || number > maximum) throw new TypeError("numeric option is outside the supported range"); return number; }
function usage() { return "Usage: node quality-trend-gate.js --current <report.json> --history <history.json> [--environment <environment.json>] [--snapshot-id <id>] [--record] [--out <report.json>]"; }

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
}

module.exports = { parseArgs, readEnvironmentEvidence, thresholdArgs };
