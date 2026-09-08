"use strict";

const fs = require("node:fs");
const { createProgressReporter } = require("./progress-reporter");

const STAGES = Object.freeze(["lock", "com-start", "warmup", "open", "slide-count", "saved-state", "save-copy", "close", "quit", "session-detach", "finalizers", "cleanup"]);
const MAX_BYTES = 32768;
const MAX_MS = 86400000;
const MAX_COUNT = 100000;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const bounded = (value, maximum) => Number.isSafeInteger(value) && value >= 0 && value <= maximum;

function readOpenGateEvidence(file, invocationId) {
  if (typeof invocationId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(invocationId)) return { status: "invalid" };
  let descriptor;
  try {
    const details = fs.lstatSync(file);
    if (!details.isFile() || details.isSymbolicLink()) return { status: "invalid" };
    descriptor = fs.openSync(file, "r");
    if (fs.fstatSync(descriptor).size > MAX_BYTES) return { status: "invalid" };
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    const size = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
    if (size > MAX_BYTES) return { status: "invalid" };
    const value = JSON.parse(bytes.subarray(0, size).toString("utf8").replace(/^\uFEFF/, ""));
    if (!record(value) || value.version !== 1 || value.invocationId !== invocationId
      || typeof value.finished !== "boolean" || !record(value.stages)
      || (value.activeStage !== null && !STAGES.includes(value.activeStage))
      || (value.failedStage !== null && !STAGES.includes(value.failedStage))
      || (value.finished && value.activeStage !== null)) return { status: "invalid" };
    const stages = {};
    for (const stage of STAGES) {
      const metrics = value.stages[stage];
      if (!record(metrics) || !bounded(metrics.attempts, MAX_COUNT) || !bounded(metrics.retries, MAX_COUNT)
        || !bounded(metrics.elapsedMs, MAX_MS) || !bounded(metrics.retryDelayMs, MAX_MS)) return { status: "invalid" };
      stages[stage] = { attempts: metrics.attempts, elapsedMs: metrics.elapsedMs, retries: metrics.retries, retryDelayMs: metrics.retryDelayMs };
    }
    return { status: "valid", finished: value.finished, activeStage: value.activeStage, failedStage: value.failedStage, stages };
  } catch (error) {
    return { status: error.code === "ENOENT" ? "missing" : "invalid" };
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function emitOpenGateEvidence(evidence, attempt, stream = process.stderr) {
  if (!bounded(attempt.launchAttempt, 3) || attempt.launchAttempt < 1
    || !bounded(attempt.elapsedMs, MAX_MS) || !bounded(attempt.retryDelayMs ?? 0, MAX_MS) || typeof attempt.succeeded !== "boolean") {
    throw new TypeError("PowerPoint open attempt metrics are invalid");
  }
  const progress = createProgressReporter({ stream, context: { scope: "powerpoint-open-gate", launchAttempt: attempt.launchAttempt } });
  progress.emit({ phase: "attempt", status: attempt.succeeded ? "done" : "failed", elapsedMs: attempt.elapsedMs, retryDelayMs: attempt.retryDelayMs ?? 0 });
  if (evidence.status !== "valid") {
    progress.emit({ phase: "evidence", status: evidence.status === "missing" ? "missing" : "invalid" });
    return;
  }
  for (const stage of STAGES) {
    const metrics = evidence.stages[stage];
    if (metrics.attempts === 0) continue;
    progress.emit({ phase: stage, status: evidence.failedStage === stage ? "failed" : evidence.activeStage === stage ? "interrupted" : "measured", ...metrics });
  }
}

function powerPointOpenEvidenceScript() {
  return String.raw`
$script:openGateEvidence = [ordered]@{ version = 1; invocationId = $InvocationId; finished = $false; activeStage = $null; failedStage = $null; stages = [ordered]@{} }
$script:lastOpenGateStage = $null
foreach ($stage in @(${STAGES.map(stage => `'${stage}'`).join(", ")})) {
  $script:openGateEvidence.stages[$stage] = [ordered]@{ attempts = 0; elapsedMs = 0; retries = 0; retryDelayMs = 0 }
}
function Write-OpenGateEvidence {
  $json = $script:openGateEvidence | ConvertTo-Json -Depth 5 -Compress
  # Read only after process completion; interrupted writes are invalid evidence.
  [IO.File]::WriteAllText($EvidenceFile, $json, [Text.UTF8Encoding]::new($false))
}
function Start-OpenGateStep([string]$Stage) {
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $metrics = $script:openGateEvidence.stages[$Stage]
  $metrics.attempts = [Math]::Min(100000, $metrics.attempts + 1)
  $script:openGateEvidence.activeStage = $Stage
  $script:lastOpenGateStage = $Stage
  Write-OpenGateEvidence
  return $timer
}
function Complete-OpenGateStep([string]$Stage, $Timer) {
  $Timer.Stop()
  $metrics = $script:openGateEvidence.stages[$Stage]
  $metrics.elapsedMs = [Math]::Min(86400000, $metrics.elapsedMs + $Timer.ElapsedMilliseconds)
  $script:openGateEvidence.activeStage = $null
  Write-OpenGateEvidence
}
function Wait-OpenGateRetry([string]$Stage, [int]$Milliseconds) {
  $metrics = $script:openGateEvidence.stages[$Stage]
  $metrics.retries = [Math]::Min(100000, $metrics.retries + 1)
  $metrics.retryDelayMs = [Math]::Min(86400000, $metrics.retryDelayMs + $Milliseconds)
  $script:openGateEvidence.activeStage = $Stage
  Write-OpenGateEvidence
  Start-Sleep -Milliseconds $Milliseconds
}
function Set-OpenGateFailure {
  if ($null -eq $script:openGateEvidence.failedStage) { $script:openGateEvidence.failedStage = $script:lastOpenGateStage }
  Write-OpenGateEvidence
}
Write-OpenGateEvidence
`;
}

module.exports = { STAGES, emitOpenGateEvidence, powerPointOpenEvidenceScript, readOpenGateEvidence };
