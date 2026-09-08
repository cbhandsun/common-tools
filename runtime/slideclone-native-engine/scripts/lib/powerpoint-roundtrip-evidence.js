"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_REPORT_BYTES = 256 * 1024;
const MODES = new Set(["auto", "shape-text", "smartart-text", "geometry"]);
const STAGES = new Set(["lock", "manifest", "application", "copy", "open", "find-target", "edit", "save", "close", "reopen", "verify", "complete"]);
const PROCESS_STATUSES = new Set(["succeeded", "failed", "terminated"]);
const FLAGS = ["opened", "saved", "reopened", "verified"];

function summarizeRoundTripReport(value, expectedCases, processStatus, invocationId = null) {
  if (!Number.isSafeInteger(expectedCases) || expectedCases < 1 || expectedCases > 64 || !PROCESS_STATUSES.has(processStatus)
    || (invocationId !== null && (typeof invocationId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(invocationId)))) {
    throw new TypeError("PowerPoint round-trip evidence arguments are invalid.");
  }
  const summary = { provider: "powerpoint-editable-roundtrip-summary-v1", invocationId, processStatus,
    reportStatus: "invalid", passed: false, expectedCases, reportedCases: 0, failedCases: null, results: [] };
  if (!value || typeof value !== "object" || Array.isArray(value) || value.provider !== "powerpoint-editable-roundtrip-v1"
    || (invocationId !== null && value.invocationId !== invocationId)
    || typeof value.passed !== "boolean" || !Number.isSafeInteger(value.failed) || !Array.isArray(value.results)
    || value.results.length < 1 || value.results.length > expectedCases + 1) return summary;
  if (value.results.some((item) => !item || typeof item !== "object" || Array.isArray(item)
    || FLAGS.some((flag) => typeof item[flag] !== "boolean")
    || (item.verified && FLAGS.some((flag) => item[flag] !== true)))) return summary;
  const failedCases = value.results.filter((item) => !item.verified).length;
  if (value.failed !== failedCases || value.passed !== (failedCases === 0)
    || (value.passed && value.results.length !== expectedCases)) return summary;
  return { ...summary, reportStatus: "valid", passed: processStatus === "succeeded" && value.passed,
    reportedCases: value.results.length, failedCases,
    results: value.results.map((item, index) => ({ index: index + 1, mode: MODES.has(item.mode) ? item.mode : "unknown",
      opened: item.opened, saved: item.saved, reopened: item.reopened, verified: item.verified,
      stage: STAGES.has(item.stage) ? item.stage : "unknown",
      hresult: typeof item.hresult === "string" && /^0x[0-9a-f]{8}$/iu.test(item.hresult) ? item.hresult.toUpperCase().replace(/^0X/u, "0x") : null })) };
}

function readBoundedReport(file) {
  let descriptor;
  try {
    const before = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!before) return { status: "missing", value: null };
    if (!before.isFile() || before.nlink !== 1 || before.size > MAX_REPORT_BYTES) return { status: "invalid", value: null };
    descriptor = fs.openSync(file, "r");
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.size > MAX_REPORT_BYTES
      || opened.dev !== before.dev || opened.ino !== before.ino) return { status: "invalid", value: null };
    const buffer = Buffer.alloc(MAX_REPORT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(descriptor, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > MAX_REPORT_BYTES) return { status: "invalid", value: null };
    try { return { status: "read", value: JSON.parse(buffer.subarray(0, length).toString("utf8").replace(/^\uFEFF/u, "")) }; }
    catch { return { status: "invalid", value: null }; }
  } catch { return { status: "unavailable", value: null }; }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function saveSummary(file, summary) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  let descriptor;
  let created = false;
  try {
    const current = fs.lstatSync(file, { throwIfNoEntry: false });
    if (current && (!current.isFile() || current.nlink !== 1)) throw new Error("unsafe evidence target");
    descriptor = fs.openSync(temporary, "wx", 0o600);
    created = true;
    fs.writeFileSync(descriptor, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    fs.closeSync(descriptor); descriptor = undefined;
    fs.renameSync(temporary, file);
  } catch { throw new Error("PowerPoint round-trip evidence could not be saved."); }
  finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (created && fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function recordRoundTripEvidence(reportFile, expectedCases, processStatus, invocationId = null) {
  let loaded;
  try { loaded = readBoundedReport(reportFile); }
  catch { loaded = { status: "unavailable", value: null }; }
  const summary = summarizeRoundTripReport(loaded.value, expectedCases, processStatus, invocationId);
  if (loaded.status !== "read") summary.reportStatus = loaded.status;
  const summaryFile = path.join(path.dirname(reportFile), "powerpoint-editable-roundtrip-summary.json");
  try { saveSummary(summaryFile, summary); }
  catch { throw new Error("PowerPoint round-trip evidence could not be saved."); }
  return { summary, report: summary.reportStatus === "valid" ? loaded.value : null };
}

module.exports = { recordRoundTripEvidence, summarizeRoundTripReport };
