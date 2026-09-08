"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { JobStore, insideRoot, sha256File } = require("../capability-runtime");
const { assertNonEmptyString, assertQualityReport } = require("../capability-contracts");
const { MAX_PPTX_BYTES, MAX_RELATIONSHIPS, MAX_SLIDES, MAX_TOTAL_XML_BYTES, crc32, extractEntry, inspectPptx, inspectRelationships, readCentralDirectory, unusedMediaEntries } = require("../ooxml-core");
const { QUALITY_REPORT_UI_CONTRIBUTION } = require("./ui-contribution");

const CAPABILITY = "ppt-quality";
const REGISTRATION = Object.freeze({ capability: CAPABILITY, toolNames: ["create_ppt_quality_job", "get_ppt_quality_report"], minimumRuntimeVersion: ">=0.1.0 <1.0.0", requiredWorkerProfile: "base" });
const MAX_REPORT_BYTES = 1024 * 1024;
const REPORT_JSON_NAME = "ppt-quality-report.json";
const REPORT_MARKDOWN_NAME = "ppt-quality-report.md";

function assertSafeExistingPptx(workspaceRoot, input) {
  const approved = insideRoot(workspaceRoot, input);
  if (path.extname(approved).toLowerCase() !== ".pptx") throw new Error("PPT quality input must be a .pptx file");
  const stat = fs.lstatSync(approved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 22 || stat.size > MAX_PPTX_BYTES) throw new Error("PPT quality input is invalid");
  const realWorkspace = fs.realpathSync.native(workspaceRoot);
  const realInput = fs.realpathSync.native(approved);
  const relative = path.relative(realWorkspace, realInput);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("PPT quality input is outside the approved workspace");
  return Object.freeze({ path: approved, bytes: stat.size, sha256: sha256File(approved) });
}

function ensureSafeOutputDirectory(workspaceRoot, output) {
  const realWorkspace = fs.realpathSync.native(workspaceRoot);
  const approved = insideRoot(realWorkspace, output);
  const relative = path.relative(realWorkspace, approved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("PPT quality output must be a child directory of the workspace");
  let current = realWorkspace;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("PPT quality output path is invalid");
    } else fs.mkdirSync(current, { mode: 0o700 });
  }
  return approved;
}

function createPptQualityJob({ workspaceRoot, stateRoot, ownerId, input, output, idempotencyKey }) {
  const source = assertSafeExistingPptx(workspaceRoot, input);
  const approvedOutput = ensureSafeOutputDirectory(workspaceRoot, output);
  const key = idempotencyKey || crypto.createHash("sha256").update(`${source.sha256}\u0000${approvedOutput}`).digest("hex");
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.create({ id: crypto.randomUUID(), capability: CAPABILITY, idempotencyKey: assertNonEmptyString(key, "idempotencyKey"), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  if (!job.source) store.write({ ...job, source, output: { path: approvedOutput } });
  return store.get(job.id);
}

function qualityFromReport(report, artifactCount) {
  const metrics = { "archive-bytes": report.summary.archiveBytes, "slide-count": report.summary.slideCount, "media-count": report.summary.mediaCount, "unused-media-count": report.summary.unusedMediaCount, "notes-count": report.summary.notesCount, "text-shape-count": report.summary.textShapeCount, "picture-count": report.summary.pictureCount, "table-count": report.summary.tableCount, "empty-slide-count": report.summary.emptySlideCount, "relationship-count": report.summary.relationshipCount, "unresolved-relationship-count": report.summary.unresolvedRelationshipCount, "invalid-relationship-count": report.summary.invalidRelationshipCount, "artifact-count": artifactCount };
  const checks = [{ name: "pptx-structure", passed: true }, { name: "slides-present", passed: report.summary.slideCount > 0 }, { name: "slide-content", passed: report.summary.slideCount === 0 || report.summary.emptySlideCount < report.summary.slideCount }, { name: "internal-relationships", passed: report.summary.unresolvedRelationshipCount === 0 && report.summary.invalidRelationshipCount === 0 }, { name: "reports-generated", passed: artifactCount === 2 }];
  return assertQualityReport({ passed: checks.every((check) => check.passed), checks, metrics });
}

function auditPptx(source) {
  const inspected = inspectPptx(source.path);
  const summary = Object.fromEntries(Object.entries(inspected).filter(([key]) => key !== "unusedMediaEntries"));
  const findings = [];
  if (summary.emptySlideCount > 0) findings.push({ id: "empty-slides", severity: "warn", count: summary.emptySlideCount, message: "One or more slides contain no text shape, picture, or table." });
  if (summary.notesCount === 0) findings.push({ id: "speaker-notes", severity: "info", count: 0, message: "No speaker notes were detected." });
  if (summary.textShapeCount === 0) findings.push({ id: "editable-text", severity: "warn", count: 0, message: "No editable text shapes were detected." });
  if (summary.unusedMediaCount > 0) findings.push({ id: "orphaned-media", severity: "warn", count: summary.unusedMediaCount, message: "Unused media can be removed by the separate ppt-improve capability." });
  const brokenRelationships = summary.unresolvedRelationshipCount + summary.invalidRelationshipCount;
  if (brokenRelationships > 0) findings.push({ id: "broken-relationships", severity: "error", count: brokenRelationships, message: "One or more internal OOXML relationships do not resolve safely inside the package." });
  return Object.freeze({ version: "0.1.0", capability: CAPABILITY, generatedAt: new Date().toISOString(), source: { sha256: source.sha256, bytes: source.bytes }, summary, findings });
}

function writeAtomically(file, contents) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, contents, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, file);
}
function artifact(file, name, mediaType) { return { name, mediaType, uri: file, sha256: sha256File(file) }; }
function renderMarkdown(report, quality) {
  const rows = [["Slides", report.summary.slideCount], ["Empty slides", report.summary.emptySlideCount], ["Text shapes", report.summary.textShapeCount], ["Pictures", report.summary.pictureCount], ["Tables", report.summary.tableCount], ["Media files", report.summary.mediaCount], ["Unused media", report.summary.unusedMediaCount], ["Speaker notes", report.summary.notesCount], ["Internal relationships", report.summary.relationshipCount], ["Unresolved relationships", report.summary.unresolvedRelationshipCount], ["Invalid relationships", report.summary.invalidRelationshipCount]];
  const findings = report.findings.length ? report.findings.map((finding) => `| ${finding.id} | ${finding.severity} | ${finding.count} | ${finding.message} |`).join("\n") : "| none | info | 0 | No advisory findings. |";
  return `# PPT quality report\n\n- Source SHA-256: \`${report.source.sha256}\`\n- Quality gate: ${quality.passed ? "pass" : "review"}\n\n| Metric | Value |\n| --- | ---: |\n${rows.map(([name, value]) => `| ${name} | ${value} |`).join("\n")}\n\n| Finding | Severity | Count | Message |\n| --- | --- | ---: | --- |\n${findings}\n\nThis report is read-only. Use a separate improvement capability to create a new PPTX, then audit that new file again.\n`;
}
function writeReport(outputRoot, report) {
  const jsonFile = path.join(outputRoot, REPORT_JSON_NAME);
  const markdownFile = path.join(outputRoot, REPORT_MARKDOWN_NAME);
  const provisionalQuality = qualityFromReport(report, 2);
  writeAtomically(jsonFile, `${JSON.stringify({ ...report, quality: provisionalQuality }, null, 2)}\n`);
  writeAtomically(markdownFile, renderMarkdown(report, provisionalQuality));
  return [artifact(jsonFile, REPORT_JSON_NAME, "application/json"), artifact(markdownFile, REPORT_MARKDOWN_NAME, "text/markdown")];
}

function runPptQualityJob({ workspaceRoot, stateRoot, ownerId, id }) {
  const store = new JobStore({ root: stateRoot, ownerId });
  const job = store.get(id);
  if (!job) throw new Error("job not found");
  if (job.capability !== CAPABILITY || job.status !== "queued" || !job.source || !job.output?.path) throw new Error("PPT quality job is incomplete");
  store.transition(id, "running", { attempt: job.attempt + 1, lease: { workerId: `host-${process.pid}`, heartbeatAt: new Date().toISOString(), expiresAt: job.expiresAt } });
  try {
    const source = assertSafeExistingPptx(workspaceRoot, job.source.path);
    if (source.sha256 !== job.source.sha256 || source.bytes !== job.source.bytes) throw new Error("PPT quality input changed after the job was created");
    const output = ensureSafeOutputDirectory(workspaceRoot, job.output.path);
    const report = auditPptx(source);
    const artifacts = writeReport(output, report);
    return store.transition(id, "succeeded", { artifacts, quality: qualityFromReport(report, artifacts.length), lease: undefined });
  } catch (error) {
    return store.transition(id, "failed", { error: { code: "PPT_QUALITY_FAILED", message: error instanceof Error ? error.message.slice(0, 4096) : "PPT quality audit failed", retryable: false }, lease: undefined });
  }
}

function pptQualitySummary(job, workspaceRoot) {
  try {
    if (!job || job.capability !== CAPABILITY || job.status !== "succeeded" || !job.output?.path) throw new Error("unavailable");
    const reportFile = insideRoot(workspaceRoot, path.join(job.output.path, REPORT_JSON_NAME));
    const artifactValue = Array.isArray(job.artifacts) ? job.artifacts.find((item) => item?.name === REPORT_JSON_NAME && item.mediaType === "application/json" && item.uri === reportFile && typeof item.sha256 === "string") : null;
    const stat = fs.lstatSync(reportFile);
    const realWorkspace = fs.realpathSync.native(workspaceRoot);
    const realReport = fs.realpathSync.native(reportFile);
    const relative = path.relative(realWorkspace, realReport);
    if (!artifactValue || !stat.isFile() || stat.isSymbolicLink() || !relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || stat.size < 2 || stat.size > MAX_REPORT_BYTES || sha256File(reportFile) !== artifactValue.sha256) throw new Error("unavailable");
    const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    const summary = report?.summary;
    if (!report || report.capability !== CAPABILITY || typeof report.generatedAt !== "string" || !report.source || !/^[a-f0-9]{64}$/.test(report.source.sha256 || "") || !Number.isSafeInteger(report.source.bytes) || report.source.bytes < 22 || report.source.bytes > MAX_PPTX_BYTES || !summary || typeof summary !== "object") throw new Error("unavailable");
    const fields = ["archiveBytes", "slideCount", "mediaCount", "unusedMediaCount", "notesCount", "textShapeCount", "pictureCount", "tableCount", "emptySlideCount", "xmlBytes", "relationshipCount", "unresolvedRelationshipCount", "invalidRelationshipCount"];
    const countFields = ["mediaCount", "unusedMediaCount", "notesCount", "textShapeCount", "pictureCount", "tableCount", "emptySlideCount", "relationshipCount", "unresolvedRelationshipCount", "invalidRelationshipCount"];
    if (!Number.isSafeInteger(summary.archiveBytes) || summary.archiveBytes < 22 || summary.archiveBytes > MAX_PPTX_BYTES || !Number.isSafeInteger(summary.slideCount) || summary.slideCount < 1 || summary.slideCount > MAX_SLIDES || countFields.some((field) => !Number.isSafeInteger(summary[field]) || summary[field] < 0 || summary[field] > MAX_RELATIONSHIPS) || !Number.isSafeInteger(summary.xmlBytes) || summary.xmlBytes < 0 || summary.xmlBytes > MAX_TOTAL_XML_BYTES || summary.unusedMediaCount > summary.mediaCount || summary.emptySlideCount > summary.slideCount || summary.unresolvedRelationshipCount + summary.invalidRelationshipCount > summary.relationshipCount || !Array.isArray(report.findings) || report.findings.length > 5 || !report.quality) throw new Error("unavailable");
    const quality = assertQualityReport(report.quality);
    return Object.freeze({ source: Object.freeze({ sha256: report.source.sha256, bytes: report.source.bytes }), summary: Object.freeze(Object.fromEntries(fields.map((field) => [field, summary[field]]))), quality, findings: Object.freeze(report.findings.map((finding) => {
      if (!finding || typeof finding !== "object" || !["empty-slides", "speaker-notes", "editable-text", "orphaned-media", "broken-relationships"].includes(finding.id) || !["info", "warn", "error"].includes(finding.severity) || !Number.isSafeInteger(finding.count) || finding.count < 0 || typeof finding.message !== "string" || finding.message.length > 160) throw new Error("unavailable");
      return Object.freeze({ id: finding.id, severity: finding.severity, count: finding.count, message: finding.message });
    })) });
  } catch { return null; }
}

const CAPABILITY_MODULE = Object.freeze({
  registration: REGISTRATION,
  createHandlers: Object.freeze({
    create_ppt_quality_job: (args, context) => createPptQualityJob({ ...context, input: args.input, output: args.output, idempotencyKey: args.idempotencyKey })
  }),
  reportHandlers: Object.freeze({
    get_ppt_quality_report: Object.freeze({ label: "PPT quality audit", key: "audit", summary: pptQualitySummary })
  }),
  uiContributions: Object.freeze([QUALITY_REPORT_UI_CONTRIBUTION])
});

module.exports = { CAPABILITY, CAPABILITY_MODULE, REGISTRATION, REPORT_JSON_NAME, REPORT_MARKDOWN_NAME, assertSafeExistingPptx, auditPptx, createPptQualityJob, crc32, ensureSafeOutputDirectory, extractEntry, inspectPptx, inspectRelationships, pptQualitySummary, qualityFromReport, readCentralDirectory, renderMarkdown, runPptQualityJob, unusedMediaEntries, writeReport };
