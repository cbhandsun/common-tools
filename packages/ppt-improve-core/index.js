"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { JobStore, insideRoot, sha256File } = require("../capability-runtime");
const { assertNonEmptyString, assertQualityReport } = require("../capability-contracts");
const { assertSafeExistingPptx, auditPptx, crc32, ensureSafeOutputDirectory, inspectPptx, qualityFromReport, readCentralDirectory, renderMarkdown: renderQualityMarkdown } = require("../ppt-quality-core");
const { planProfileRepairs } = require("./repair-profiles");

const CAPABILITY = "ppt-improve";
const REGISTRATION = Object.freeze({ capability: CAPABILITY, toolNames: ["create_ppt_improve_job", "get_ppt_improve_report"], minimumRuntimeVersion: ">=0.1.0 <1.0.0", requiredWorkerProfile: "base" });
const MAX_REPORT_BYTES = 1024 * 1024;
const REPORT_JSON_NAME = "ppt-improve-report.json";
const REPORT_MARKDOWN_NAME = "ppt-improve-report.md";
const IMPROVED_PPTX_NAME = "improved.pptx";
const POST_QUALITY_REPORT_JSON_NAME = "improved-ppt-quality-report.json";
const POST_QUALITY_REPORT_MARKDOWN_NAME = "improved-ppt-quality-report.md";
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const REPAIR_PROFILES = Object.freeze(["safe-package", "layout-safe", "typography-safe", "editability-safe", "audit-only"]);
function normalizeRepairProfile(value = "safe-package") { if (!REPAIR_PROFILES.includes(value)) throw new TypeError("PPT improvement repair profile is invalid"); return value; }

function safeReport(workspaceRoot, report) {
  const approved = insideRoot(workspaceRoot, report);
  if (path.extname(approved).toLowerCase() !== ".json") throw new Error("PPT quality report must be a JSON file");
  const stat = fs.lstatSync(approved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_REPORT_BYTES) throw new Error("PPT quality report is invalid");
  const realWorkspace = fs.realpathSync.native(workspaceRoot);
  const realReport = fs.realpathSync.native(approved);
  const relative = path.relative(realWorkspace, realReport);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("PPT quality report is outside the approved workspace");
  let value;
  try { value = JSON.parse(fs.readFileSync(approved, "utf8")); } catch { throw new Error("PPT quality report is invalid"); }
  if (!value || value.capability !== "ppt-quality" || !value.source || !/^[a-f0-9]{64}$/.test(value.source.sha256 || "") || !Number.isSafeInteger(value.source.bytes) || value.source.bytes < 22 || !value.summary || !Number.isSafeInteger(value.summary.unusedMediaCount) || value.summary.unusedMediaCount < 0) throw new Error("PPT quality report is invalid");
  return Object.freeze({ path: approved, sha256: sha256File(approved), sourceSha256: value.source.sha256, sourceBytes: value.source.bytes, unusedMediaCount: value.summary.unusedMediaCount });
}

function createPptImproveJob({ workspaceRoot, stateRoot, ownerId, input, report, output, idempotencyKey, profile }) {
  const source = assertSafeExistingPptx(workspaceRoot, input);
  const auditReport = safeReport(workspaceRoot, report);
  if (auditReport.sourceSha256 !== source.sha256 || auditReport.sourceBytes !== source.bytes) throw new Error("PPT quality report does not match the source file");
  const approvedOutput = ensureSafeOutputDirectory(workspaceRoot, output);
  const repairProfile = normalizeRepairProfile(profile); const key = idempotencyKey || crypto.createHash("sha256").update(`${source.sha256}\u0000${auditReport.sha256}\u0000${approvedOutput}\u0000${repairProfile}`).digest("hex");
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.create({ id: crypto.randomUUID(), capability: CAPABILITY, idempotencyKey: assertNonEmptyString(key, "idempotencyKey"), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  if (!job.source) store.write({ ...job, source, auditReport, repairProfile, output: { path: approvedOutput } });
  return store.get(job.id);
}

function compressedData(buffer, entry) {
  if (entry.localOffset + 30 > buffer.length || buffer.readUInt32LE(entry.localOffset) !== ZIP_LOCAL_SIGNATURE) throw new Error("PPTX ZIP data entry is invalid");
  const nameBytes = buffer.readUInt16LE(entry.localOffset + 26);
  const extraBytes = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameBytes + extraBytes;
  const end = start + entry.compressedBytes;
  if (end > buffer.length) throw new Error("PPTX ZIP data entry is truncated");
  return buffer.subarray(start, end);
}

function rebuildZip(buffer, entries, replacements = new Map()) {
  const localEntries = [];
  const centralEntries = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const replacement = replacements.get(entry.name);
    const uncompressed = replacement === undefined ? undefined : Buffer.from(replacement);
    const compression = replacement === undefined ? entry.compression : entry.compression === 8 ? 8 : 0;
    const data = replacement === undefined ? compressedData(buffer, entry) : compression === 8 ? zlib.deflateRawSync(uncompressed) : uncompressed;
    const checksum = replacement === undefined ? entry.crc32 : crc32(uncompressed);
    const uncompressedBytes = replacement === undefined ? entry.uncompressedBytes : uncompressed.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(ZIP_LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags & ~0x0008, 6);
    local.writeUInt16LE(compression, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(uncompressedBytes, 22);
    local.writeUInt16LE(name.length, 26);
    const localEntry = Buffer.concat([local, name, data]);
    localEntries.push(localEntry);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(ZIP_CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.flags & ~0x0008, 8);
    central.writeUInt16LE(compression, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(uncompressedBytes, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralEntries.push(Buffer.concat([central, name]));
    offset += localEntry.length;
  }
  const directory = Buffer.concat(centralEntries);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(ZIP_EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localEntries, directory, eocd]);
}

function writeAtomically(file, data, createdFiles) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, data, { flag: "wx", mode: 0o600 });
  try {
    fs.linkSync(temporary, file);
    if (Array.isArray(createdFiles)) createdFiles.push(file);
  } catch (error) {
    if (error && error.code === "EEXIST") throw new Error("PPT improvement output already exists", { cause: error });
    throw error;
  } finally { fs.rmSync(temporary, { force: true }); }
}
function artifact(file, name, mediaType) { return { name, mediaType, uri: file, sha256: sha256File(file) }; }
function removeCreatedOutputs(files) {
  for (const file of [...files].reverse()) {
    try {
      const stat = fs.lstatSync(file);
      if (stat.isFile() && !stat.isSymbolicLink()) fs.unlinkSync(file);
    } catch { /* A missing or replaced output must not block job failure. */ }
  }
}

function quality(changed, repairActionCount, removedMediaCount, artifactCount, postAuditGenerated) {
  const checks = [{ name: "audit-report-verified", passed: true }, { name: "safe-repair-applied", passed: changed ? repairActionCount > 0 : true }, { name: "output-reaudited", passed: !changed || postAuditGenerated === true }, { name: "reports-generated", passed: artifactCount >= 2 }];
  return assertQualityReport({ passed: checks.every((check) => check.passed), checks, metrics: { "repair-action-count": repairActionCount, "removed-media-count": removedMediaCount, "changed": changed ? 1 : 0, "artifact-count": artifactCount } });
}
function renderMarkdown(report) { return `# PPT improvement report\n\n- Source SHA-256: \`${report.source.sha256}\`\n- Verified quality report SHA-256: \`${report.auditReport.sha256}\`\n- Safe changes applied: ${report.result.changed ? "yes" : "no"}\n- Repair actions: ${report.result.repairActionCount}\n- Removed orphaned media: ${report.result.removedMediaCount}\n${report.postAudit ? `- Post-improvement quality report: \`${POST_QUALITY_REPORT_JSON_NAME}\` (${report.postAudit.qualityPassed ? "pass" : "review"})\n` : ""}\n${report.result.changed ? "A new `improved.pptx` was created and independently re-audited." : "No safe automatic repair was applicable; the source PPTX was not copied or modified."}\n`; }
function writeReports(output, report, includeDeck, createdFiles) {
  const jsonFile = path.join(output, REPORT_JSON_NAME);
  const markdownFile = path.join(output, REPORT_MARKDOWN_NAME);
  const artifacts = includeDeck ? [artifact(path.join(output, IMPROVED_PPTX_NAME), IMPROVED_PPTX_NAME, "application/vnd.openxmlformats-officedocument.presentationml.presentation")] : [];
  if (report.postAudit) {
    const postQuality = qualityFromReport(report.postAudit.report, 2);
    const postJsonFile = path.join(output, POST_QUALITY_REPORT_JSON_NAME);
    const postMarkdownFile = path.join(output, POST_QUALITY_REPORT_MARKDOWN_NAME);
    writeAtomically(postJsonFile, `${JSON.stringify({ ...report.postAudit.report, quality: postQuality }, null, 2)}\n`, createdFiles);
    writeAtomically(postMarkdownFile, renderQualityMarkdown(report.postAudit.report, postQuality), createdFiles);
    artifacts.push(artifact(postJsonFile, POST_QUALITY_REPORT_JSON_NAME, "application/json"), artifact(postMarkdownFile, POST_QUALITY_REPORT_MARKDOWN_NAME, "text/markdown"));
  }
  const persisted = report.postAudit ? { ...report, postAudit: { ...report.postAudit, report: undefined } } : report;
  writeAtomically(jsonFile, `${JSON.stringify(persisted, null, 2)}\n`, createdFiles);
  writeAtomically(markdownFile, renderMarkdown(persisted), createdFiles);
  artifacts.push(artifact(jsonFile, REPORT_JSON_NAME, "application/json"), artifact(markdownFile, REPORT_MARKDOWN_NAME, "text/markdown"));
  return artifacts;
}

function runPptImproveJob({ workspaceRoot, stateRoot, ownerId, id }) {
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.get(id);
  if (!job) throw new Error("job not found");
  if (job.capability !== CAPABILITY || job.status !== "queued" || !job.source || !job.auditReport || !job.output?.path) throw new Error("PPT improvement job is incomplete");
  store.transition(id, "running", { attempt: job.attempt + 1, lease: { workerId: `host-${process.pid}`, heartbeatAt: new Date().toISOString(), expiresAt: job.expiresAt } });
  const createdFiles = [];
  try {
    const source = assertSafeExistingPptx(workspaceRoot, job.source.path);
    const auditReport = safeReport(workspaceRoot, job.auditReport.path);
    if (source.sha256 !== job.source.sha256 || source.bytes !== job.source.bytes || auditReport.sha256 !== job.auditReport.sha256 || auditReport.sourceSha256 !== source.sha256 || auditReport.sourceBytes !== source.bytes) throw new Error("PPT improvement inputs changed after the job was created");
    const output = ensureSafeOutputDirectory(workspaceRoot, job.output.path);
    const inspection = inspectPptx(source.path);
    if (inspection.unusedMediaCount !== auditReport.unusedMediaCount) throw new Error("PPT quality report is stale for the current source file");
    const repairProfile = normalizeRepairProfile(job.repairProfile);
    const original = fs.readFileSync(source.path); const entries = readCentralDirectory(original);
    const repairPlan = planProfileRepairs({ profile: repairProfile, input: original, entries, inspection });
    const report = { version: "0.3.0", capability: CAPABILITY, generatedAt: new Date().toISOString(), repairProfile, source: { sha256: source.sha256, bytes: source.bytes }, auditReport: { sha256: auditReport.sha256 }, result: { changed: repairPlan.changed, eligibleUnusedMediaCount: inspection.unusedMediaCount, removedMediaCount: repairPlan.repairCounts.removedMedia, repairActionCount: repairPlan.actionCount, repairCounts: repairPlan.repairCounts } };
    if (repairPlan.changed) {
      const destination = path.join(output, IMPROVED_PPTX_NAME);
      writeAtomically(destination, rebuildZip(original, [...entries.values()].filter((entry) => !repairPlan.removableNames.has(entry.name)), repairPlan.replacements), createdFiles);
      const improvedSource = assertSafeExistingPptx(workspaceRoot, destination);
      const improvedReport = auditPptx(improvedSource);
      if (improvedReport.summary.unusedMediaCount !== 0 || improvedReport.summary.mediaCount + inspection.unusedMediaCount !== inspection.mediaCount) throw new Error("PPT improvement re-audit failed");
      const improvedQuality = qualityFromReport(improvedReport, 2);
      report.postAudit = { report: improvedReport, sourceSha256: improvedSource.sha256, sourceBytes: improvedSource.bytes, unusedMediaCount: improvedReport.summary.unusedMediaCount, qualityPassed: improvedQuality.passed };
    }
    const artifacts = writeReports(output, report, report.result.changed, createdFiles);
    return store.transition(id, "succeeded", { artifacts, quality: quality(report.result.changed, report.result.repairActionCount, report.result.removedMediaCount, artifacts.length, !!report.postAudit), lease: undefined });
  } catch (error) {
    removeCreatedOutputs(createdFiles);
    return store.transition(id, "failed", { error: { code: "PPT_IMPROVE_FAILED", message: error instanceof Error ? error.message.slice(0, 4096) : "PPT improvement failed", retryable: false }, lease: undefined });
  }
}

function pptImproveSummary(job, workspaceRoot) {
  try {
    if (!job || job.capability !== CAPABILITY || job.status !== "succeeded" || !job.output?.path) throw new Error("unavailable");
    const file = insideRoot(workspaceRoot, path.join(job.output.path, REPORT_JSON_NAME));
    const declared = Array.isArray(job.artifacts) ? job.artifacts.find((item) => item?.name === REPORT_JSON_NAME && item.mediaType === "application/json" && item.uri === file && typeof item.sha256 === "string") : null;
    const stat = fs.lstatSync(file);
    if (!declared || !stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_REPORT_BYTES || sha256File(file) !== declared.sha256) throw new Error("unavailable");
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    const repairActionCount = report?.result?.repairActionCount ?? report?.result?.removedMediaCount;
    if (!report || report.capability !== CAPABILITY || !REPAIR_PROFILES.includes(report.repairProfile || "safe-package") || !report.source || !/^[a-f0-9]{64}$/.test(report.source.sha256 || "") || !Number.isSafeInteger(report.source.bytes) || !report.auditReport || !/^[a-f0-9]{64}$/.test(report.auditReport.sha256 || "") || !report.result || typeof report.result.changed !== "boolean" || !Number.isSafeInteger(repairActionCount) || repairActionCount < 0 || repairActionCount > 100000 || !Number.isSafeInteger(report.result.removedMediaCount) || report.result.removedMediaCount < 0 || report.result.removedMediaCount > 4096) throw new Error("unavailable");
    const postAudit = report.postAudit;
    if (report.result.changed !== !!postAudit || (postAudit && (!/^[a-f0-9]{64}$/.test(postAudit.sourceSha256 || "") || !Number.isSafeInteger(postAudit.sourceBytes) || postAudit.sourceBytes < 22 || !Number.isSafeInteger(postAudit.unusedMediaCount) || postAudit.unusedMediaCount !== 0 || typeof postAudit.qualityPassed !== "boolean"))) throw new Error("unavailable");
    return Object.freeze({ repairProfile: report.repairProfile || "safe-package", source: Object.freeze({ sha256: report.source.sha256, bytes: report.source.bytes }), auditReport: Object.freeze({ sha256: report.auditReport.sha256 }), result: Object.freeze({ changed: report.result.changed, repairActionCount, removedMediaCount: report.result.removedMediaCount }), postAudit: postAudit ? Object.freeze({ sourceSha256: postAudit.sourceSha256, sourceBytes: postAudit.sourceBytes, unusedMediaCount: postAudit.unusedMediaCount, qualityPassed: postAudit.qualityPassed }) : null });
  } catch { return null; }
}

module.exports = { CAPABILITY, IMPROVED_PPTX_NAME, POST_QUALITY_REPORT_JSON_NAME, POST_QUALITY_REPORT_MARKDOWN_NAME, REGISTRATION, REPAIR_PROFILES, REPORT_JSON_NAME, REPORT_MARKDOWN_NAME, createPptImproveJob, normalizeRepairProfile, pptImproveSummary, rebuildZip, runPptImproveJob };
