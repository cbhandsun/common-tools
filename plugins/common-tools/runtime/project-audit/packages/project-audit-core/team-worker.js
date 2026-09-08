"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MAX_ARCHIVE_BYTES, extractProjectArchive } = require("../archive-core");
const { auditProject, renderMarkdown } = require(".");
const { assertQualityReport } = require("../capability-contracts");

const PROJECT_AUDIT_IGNORED_ARCHIVE_DIRECTORIES = Object.freeze(new Set([".claude", ".codex", ".git", ".common-tools", "node_modules", "bin", "obj", "dist", "build", "coverage"]));

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function assertObjectStore(objectStore) {
  if (!objectStore || typeof objectStore.readObject !== "function" || typeof objectStore.putObject !== "function") throw new TypeError("team object store does not support worker I/O");
  return objectStore;
}
function createProjectAuditArchiveHandler({ objectStore, temporaryRoot = os.tmpdir() }) {
  const store = assertObjectStore(objectStore);
  if (typeof temporaryRoot !== "string" || !path.isAbsolute(temporaryRoot)) throw new TypeError("temporaryRoot must be an absolute path");
  return async ({ job, isCancellationRequested }) => {
    if (!job || job.capability !== "project-audit" || typeof job.inputObjectKey !== "string" || typeof job.outputPrefix !== "string") throw new Error("project audit worker job is invalid");
    if (await isCancellationRequested()) throw new Error("project audit was cancelled");
    const archive = await store.readObject({ objectKey: job.inputObjectKey, maxBytes: MAX_ARCHIVE_BYTES });
    const root = fs.mkdtempSync(path.join(temporaryRoot, "common-tools-project-audit-"));
    try {
      extractProjectArchive(archive, root, { ignoredDirectories: PROJECT_AUDIT_IGNORED_ARCHIVE_DIRECTORIES });
      if (await isCancellationRequested()) throw new Error("project audit was cancelled");
      const report = { ...auditProject(root), root: "uploaded-project" };
      const artifacts = [
        { name: "project-audit-report.json", objectKey: `${job.outputPrefix}project-audit-report.json`, mediaType: "application/json", body: Buffer.from(`${JSON.stringify(report, null, 2)}\n`) },
        { name: "project-audit-report.md", objectKey: `${job.outputPrefix}project-audit-report.md`, mediaType: "text/markdown", body: Buffer.from(renderMarkdown(report)) }
      ];
      for (const artifact of artifacts) {
        if (await isCancellationRequested()) throw new Error("project audit was cancelled");
        await store.putObject({ objectKey: artifact.objectKey, body: artifact.body, contentType: artifact.mediaType });
      }
      return { artifacts: artifacts.map((artifact) => ({ name: artifact.name, objectKey: artifact.objectKey, mediaType: artifact.mediaType, sha256: sha256(artifact.body) })), quality: assertQualityReport({ passed: true, checks: [{ name: "archive-extracted", passed: true }, { name: "reports-generated", passed: true }], metrics: { "scanned-files": report.summary.scannedFiles, warnings: report.summary.warnings, artifacts: artifacts.length } }) };
    } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 }); }
  };
}

module.exports = { createProjectAuditArchiveHandler };
