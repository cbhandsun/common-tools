"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { assertQualityReport } = require("../capability-contracts");
const { auditPptx, inspectPptx, qualityFromReport, readCentralDirectory, renderMarkdown: renderQualityMarkdown } = require("../ppt-quality-core");
const { IMPROVED_PPTX_NAME, POST_QUALITY_REPORT_JSON_NAME, POST_QUALITY_REPORT_MARKDOWN_NAME, REPORT_JSON_NAME, REPORT_MARKDOWN_NAME, normalizeRepairProfile, rebuildZip } = require(".");

const MAX_PPTX_BYTES = 100 * 1024 * 1024;

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function assertObjectStore(objectStore) {
  if (!objectStore || typeof objectStore.readObject !== "function" || typeof objectStore.putObject !== "function") throw new TypeError("team object store does not support worker I/O");
  return objectStore;
}
function assertTemporaryRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError("temporaryRoot must be an absolute path");
  return value;
}
function improvementQuality(changed, removedMediaCount, artifactCount, postAuditGenerated) {
  const checks = [
    { name: "initial-quality-report-generated", passed: true },
    { name: "safe-repair-applied", passed: changed ? removedMediaCount > 0 : true },
    { name: "output-reaudited", passed: !changed || postAuditGenerated === true },
    { name: "reports-generated", passed: artifactCount >= 4 }
  ];
  return assertQualityReport({ passed: checks.every((check) => check.passed), checks, metrics: { "removed-media-count": removedMediaCount, changed: changed ? 1 : 0, "artifact-count": artifactCount } });
}
function renderImprovementMarkdown(report) {
  return `# PPT improvement report\n\n- Source SHA-256: \`${report.source.sha256}\`\n- Verified quality report SHA-256: \`${report.auditReport.sha256}\`\n- Safe changes applied: ${report.result.changed ? "yes" : "no"}\n- Removed orphaned media: ${report.result.removedMediaCount}\n${report.postAudit ? `- Post-improvement quality report: \`${POST_QUALITY_REPORT_JSON_NAME}\` (${report.postAudit.qualityPassed ? "pass" : "review"})\n` : ""}\n${report.result.changed ? "A new `improved.pptx` was created and independently re-audited." : "No safe automatic repair was applicable; the source PPTX was not copied or modified."}\n`;
}
function reportArtifact(name, mediaType, body, outputPrefix) {
  return Object.freeze({ name, mediaType, body, objectKey: `${outputPrefix}${name}` });
}

function createPptImproveHandler({ objectStore, temporaryRoot = os.tmpdir() } = {}) {
  const store = assertObjectStore(objectStore);
  const temporaryBase = assertTemporaryRoot(temporaryRoot);
  return async ({ job, isCancellationRequested }) => {
    if (!job || job.capability !== "ppt-improve" || typeof job.inputObjectKey !== "string" || typeof job.outputPrefix !== "string") throw new Error("PPT improvement worker job is invalid");
    if (typeof isCancellationRequested !== "function") throw new TypeError("PPT improvement cancellation check is invalid");
    if (await isCancellationRequested()) throw new Error("PPT improvement was cancelled");
    const input = await store.readObject({ objectKey: job.inputObjectKey, maxBytes: MAX_PPTX_BYTES });
    if (!Buffer.isBuffer(input) || input.length < 22) throw new Error("PPT improvement input is invalid");
    const root = fs.mkdtempSync(path.join(temporaryBase, "common-tools-ppt-improve-"));
    try {
      const sourceFile = path.join(root, "source.pptx");
      fs.writeFileSync(sourceFile, input, { flag: "wx", mode: 0o600 });
      const source = Object.freeze({ path: sourceFile, bytes: input.length, sha256: sha256(input) });
      if (await isCancellationRequested()) throw new Error("PPT improvement was cancelled");
      const initialReport = auditPptx(source);
      const initialQuality = qualityFromReport(initialReport, 2);
      const initialJson = Buffer.from(`${JSON.stringify({ ...initialReport, quality: initialQuality }, null, 2)}\n`);
      const initialMarkdown = Buffer.from(renderQualityMarkdown(initialReport, initialQuality));
      const inspection = inspectPptx(sourceFile);
      if (inspection.unusedMediaCount !== initialReport.summary.unusedMediaCount) throw new Error("PPT improvement initial audit is inconsistent");
      const repairProfile = normalizeRepairProfile(job.options?.repairProfile); const shouldRepair = repairProfile === "safe-package" && inspection.unusedMediaCount > 0;
      const report = { version: "0.2.0", capability: "ppt-improve", generatedAt: new Date().toISOString(), repairProfile, source: { sha256: source.sha256, bytes: source.bytes }, auditReport: { sha256: sha256(initialJson) }, result: { changed: shouldRepair, eligibleUnusedMediaCount: inspection.unusedMediaCount, removedMediaCount: shouldRepair ? inspection.unusedMediaCount : 0 } };
      const artifacts = [
        reportArtifact("ppt-quality-report.json", "application/json", initialJson, job.outputPrefix),
        reportArtifact("ppt-quality-report.md", "text/markdown", initialMarkdown, job.outputPrefix)
      ];
      if (shouldRepair) {
        const entries = readCentralDirectory(input);
        const removable = new Set(inspection.unusedMediaEntries.map((entry) => entry.name));
        const improved = rebuildZip(input, [...entries.values()].filter((entry) => !removable.has(entry.name)));
        const improvedFile = path.join(root, IMPROVED_PPTX_NAME);
        fs.writeFileSync(improvedFile, improved, { flag: "wx", mode: 0o600 });
        const improvedSource = Object.freeze({ path: improvedFile, bytes: improved.length, sha256: sha256(improved) });
        const postAudit = auditPptx(improvedSource);
        if (postAudit.summary.unusedMediaCount !== 0 || postAudit.summary.mediaCount + inspection.unusedMediaCount !== inspection.mediaCount) throw new Error("PPT improvement re-audit failed");
        const postQuality = qualityFromReport(postAudit, 2);
        report.postAudit = { sourceSha256: improvedSource.sha256, sourceBytes: improvedSource.bytes, unusedMediaCount: postAudit.summary.unusedMediaCount, qualityPassed: postQuality.passed };
        artifacts.push(
          reportArtifact(IMPROVED_PPTX_NAME, "application/vnd.openxmlformats-officedocument.presentationml.presentation", improved, job.outputPrefix),
          reportArtifact(POST_QUALITY_REPORT_JSON_NAME, "application/json", Buffer.from(`${JSON.stringify({ ...postAudit, quality: postQuality }, null, 2)}\n`), job.outputPrefix),
          reportArtifact(POST_QUALITY_REPORT_MARKDOWN_NAME, "text/markdown", Buffer.from(renderQualityMarkdown(postAudit, postQuality)), job.outputPrefix)
        );
      }
      const finalQuality = improvementQuality(report.result.changed, report.result.removedMediaCount, artifacts.length + 2, !!report.postAudit);
      artifacts.push(
        reportArtifact(REPORT_JSON_NAME, "application/json", Buffer.from(`${JSON.stringify(report, null, 2)}\n`), job.outputPrefix),
        reportArtifact(REPORT_MARKDOWN_NAME, "text/markdown", Buffer.from(renderImprovementMarkdown(report)), job.outputPrefix)
      );
      for (const artifact of artifacts) {
        if (await isCancellationRequested()) throw new Error("PPT improvement was cancelled");
        await store.putObject({ objectKey: artifact.objectKey, body: artifact.body, contentType: artifact.mediaType });
      }
      return { artifacts: artifacts.map((artifact) => ({ name: artifact.name, objectKey: artifact.objectKey, mediaType: artifact.mediaType, sha256: sha256(artifact.body) })), quality: finalQuality };
    } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 }); }
  };
}

module.exports = { MAX_PPTX_BYTES, createPptImproveHandler, improvementQuality, renderImprovementMarkdown };
