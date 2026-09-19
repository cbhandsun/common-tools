"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");

const MAX_JSON_CAPTURE_BYTES = 512 * 1024;

function createExperienceDiagnostics(projectRoot, scenarios) {
  if (!Array.isArray(scenarios)) throw new TypeError("experience diagnostic scenarios are invalid");
  const issues = [];
  const summary = {
    domSnapshotFailures: 0,
    overflowCandidates: 0,
    hitTargetMismatches: 0,
    hiddenInteractiveCandidates: 0,
    consoleErrors: 0,
    consoleWarnings: 0,
    failedRequests: 0,
    clientErrors: 0,
    serverErrors: 0
  };
  for (const scenario of scenarios) {
    if (!scenario || typeof scenario !== "object" || typeof scenario.id !== "string" || !Array.isArray(scenario.evidence)) continue;
    for (const evidence of scenario.evidence) {
      if (!evidence || typeof evidence.file !== "string" || typeof evidence.rule !== "string") continue;
      if (evidence.rule === "experience-dom-snapshot") inspectDomSnapshot(projectRoot, scenario.id, evidence, summary, issues);
      if (evidence.rule === "experience-console") inspectConsole(projectRoot, scenario.id, evidence, summary, issues);
      if (evidence.rule === "experience-network") inspectNetwork(projectRoot, scenario.id, evidence, summary, issues);
    }
  }
  return Object.freeze({
    summary: Object.freeze(summary),
    issues: Object.freeze(issues.slice(0, 25))
  });
}

function inspectDomSnapshot(projectRoot, scenarioId, evidence, summary, issues) {
  const value = readCaptureJson(projectRoot, evidence.file);
  if (!value) return;
  if (value.status === "failed") {
    summary.domSnapshotFailures += 1;
    issues.push(issue("experience-dom-snapshot-failed", scenarioId, "P2", "DOM snapshot capture failed; runtime geometry, focus and overflow evidence is incomplete.", evidence, "Repeat browser evidence collection after confirming the page reaches a stable loaded state."));
    return;
  }
  const overflowCandidates = actionableOverflowCandidates(value).length;
  if (overflowCandidates > 0) {
    summary.overflowCandidates += overflowCandidates;
    issues.push(issue("experience-overflow-candidates", scenarioId, "P2", `${overflowCandidates} element(s) extend outside the captured viewport.`, evidence, "Inspect the referenced DOM snapshot and screenshot, then verify responsive and zoomed layouts."));
  }
  const candidates = Array.isArray(value.candidates) ? value.candidates : [];
  const mismatches = candidates.filter((candidate) => candidate && candidate.visible === true && candidate.hitMatchesElement === false).length;
  if (mismatches > 0) {
    summary.hitTargetMismatches += mismatches;
    issues.push(issue("experience-hit-target-mismatch", scenarioId, "P2", `${mismatches} visible interactive candidate(s) did not match their center hit target.`, evidence, "Confirm with elementFromPoint and fix overlay, z-index, pointer-events, or geometry issues before accepting the interaction path."));
  }
  const hidden = candidates.filter((candidate) => candidate && candidate.visible === false).length;
  if (hidden > 0) {
    summary.hiddenInteractiveCandidates += hidden;
    issues.push(issue("experience-hidden-interactive-candidates", scenarioId, "P3", `${hidden} interactive candidate(s) were hidden or had zero geometry in the captured state.`, evidence, "Inspect whether hidden controls are expected state, stale UI, or inaccessible interactive remnants."));
  }
}

function inspectConsole(projectRoot, scenarioId, evidence, summary, issues) {
  const value = readCaptureJson(projectRoot, evidence.file);
  if (!value) return;
  const errors = safeCount(value.errors);
  const warnings = safeCount(value.warnings);
  summary.consoleErrors += errors;
  summary.consoleWarnings += warnings;
  if (errors > 0) issues.push(issue("experience-console-errors", scenarioId, "P1", `${errors} console error(s) occurred during the scenario.`, evidence, "Inspect the bounded console aggregate with the matching screenshot and fix runtime errors before accepting the scenario."));
  else if (warnings > 0) issues.push(issue("experience-console-warnings", scenarioId, "P3", `${warnings} console warning(s) occurred during the scenario.`, evidence, "Review whether warnings indicate deprecated APIs, failed assets, hydration mismatch, or non-blocking noise."));
}

function inspectNetwork(projectRoot, scenarioId, evidence, summary, issues) {
  const value = readCaptureJson(projectRoot, evidence.file);
  if (!value) return;
  const failedRequests = safeCount(value.failedRequests);
  const statusCounts = value.statusCounts && typeof value.statusCounts === "object" && !Array.isArray(value.statusCounts) ? value.statusCounts : {};
  const clientErrors = statusTotal(statusCounts, 400, 499);
  const serverErrors = statusTotal(statusCounts, 500, 599);
  summary.failedRequests += failedRequests;
  summary.clientErrors += clientErrors;
  summary.serverErrors += serverErrors;
  if (failedRequests > 0) issues.push(issue("experience-network-failures", scenarioId, "P1", `${failedRequests} network request(s) failed during the scenario.`, evidence, "Inspect the bounded network aggregate and verify retry, timeout, and recovery behavior."));
  if (serverErrors > 0) issues.push(issue("experience-network-server-errors", scenarioId, "P1", `${serverErrors} server error response(s) occurred during the scenario.`, evidence, "Trace the failing request class in the application and add a regression covering the recovery path."));
  else if (clientErrors > 0) issues.push(issue("experience-network-client-errors", scenarioId, "P2", `${clientErrors} client error response(s) occurred during the scenario.`, evidence, "Confirm whether the response is expected; if not, fix routing, authorization, or request contract handling."));
}

function readCaptureJson(projectRoot, relativeFile) {
  try {
    const file = insideRoot(projectRoot, path.resolve(projectRoot, relativeFile));
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_JSON_CAPTURE_BYTES) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function statusTotal(statusCounts, low, high) {
  let total = 0;
  for (const [status, count] of Object.entries(statusCounts)) {
    const numericStatus = Number(status);
    const numericCount = safeCount(count);
    if (Number.isSafeInteger(numericStatus) && numericStatus >= low && numericStatus <= high) total += numericCount;
  }
  return total;
}

function actionableOverflowCandidates(value) {
  if (!Array.isArray(value.overflowCandidates)) return [];
  return value.overflowCandidates.filter((candidate) => {
    const rect = candidate && typeof candidate === "object" ? candidate.rect : null;
    if (!rect || typeof rect !== "object") return false;
    const left = numberValue(rect.left ?? rect.x);
    const top = numberValue(rect.top ?? rect.y);
    const right = numberValue(rect.right ?? (Number.isFinite(left) && Number.isFinite(numberValue(rect.width)) ? left + numberValue(rect.width) : undefined));
    const viewportWidth = numberValue(value.viewport && value.viewport.width);
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right)) return false;
    return left < -1 || top < -1 || (Number.isFinite(viewportWidth) && right > viewportWidth + 1);
  });
}

function numberValue(value) { return typeof value === "number" && Number.isFinite(value) ? value : NaN; }

function safeCount(value) { return Number.isSafeInteger(value) && value > 0 && value < 100000 ? value : 0; }

function issue(id, scenarioId, priority, signal, evidence, recommendation) {
  return Object.freeze({
    id,
    scenarioId,
    priority,
    classification: "suspected-issue",
    confidence: "medium",
    signal,
    evidence: Object.freeze([{ file: evidence.file, line: evidence.line || 1, rule: evidence.rule }]),
    recommendation,
    verification: "Inspect the referenced capture artifact and keep the scenario failed or not-verified until the behavior is reproduced or ruled out."
  });
}

module.exports = { createExperienceDiagnostics };
