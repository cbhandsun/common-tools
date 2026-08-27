"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { auditPptx, qualityFromReport, renderMarkdown } = require(".");

const MAX_PPTX_BYTES = 100 * 1024 * 1024;

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function assertObjectStore(objectStore) {
  if (!objectStore || typeof objectStore.readObject !== "function" || typeof objectStore.putObject !== "function") throw new TypeError("team object store does not support worker I/O");
  return objectStore;
}
function createPptQualityHandler({ objectStore, temporaryRoot = os.tmpdir() } = {}) {
  const store = assertObjectStore(objectStore);
  if (typeof temporaryRoot !== "string" || !path.isAbsolute(temporaryRoot)) throw new TypeError("temporaryRoot must be an absolute path");
  return async ({ job, isCancellationRequested }) => {
    if (!job || job.capability !== "ppt-quality" || typeof job.inputObjectKey !== "string" || typeof job.outputPrefix !== "string") throw new Error("PPT quality worker job is invalid");
    if (await isCancellationRequested()) throw new Error("PPT quality was cancelled");
    const input = await store.readObject({ objectKey: job.inputObjectKey, maxBytes: MAX_PPTX_BYTES });
    if (!Buffer.isBuffer(input) || input.length < 22) throw new Error("PPT quality input is invalid");
    const root = fs.mkdtempSync(path.join(temporaryRoot, "common-tools-ppt-quality-"));
    try {
      const sourceFile = path.join(root, "source.pptx");
      fs.writeFileSync(sourceFile, input, { flag: "wx", mode: 0o600 });
      if (await isCancellationRequested()) throw new Error("PPT quality was cancelled");
      const report = auditPptx({ path: sourceFile, bytes: input.length, sha256: sha256(input) });
      const quality = qualityFromReport(report, 2);
      const artifacts = [
        { name: "ppt-quality-report.json", objectKey: `${job.outputPrefix}ppt-quality-report.json`, mediaType: "application/json", body: Buffer.from(`${JSON.stringify({ ...report, quality }, null, 2)}\n`) },
        { name: "ppt-quality-report.md", objectKey: `${job.outputPrefix}ppt-quality-report.md`, mediaType: "text/markdown", body: Buffer.from(renderMarkdown(report, quality)) }
      ];
      for (const artifact of artifacts) {
        if (await isCancellationRequested()) throw new Error("PPT quality was cancelled");
        await store.putObject({ objectKey: artifact.objectKey, body: artifact.body, contentType: artifact.mediaType });
      }
      return { artifacts: artifacts.map((artifact) => ({ name: artifact.name, objectKey: artifact.objectKey, mediaType: artifact.mediaType, sha256: sha256(artifact.body) })), quality };
    } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 }); }
  };
}

module.exports = { MAX_PPTX_BYTES, createPptQualityHandler };
