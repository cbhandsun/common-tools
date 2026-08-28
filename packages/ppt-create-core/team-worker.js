"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ARTIFACT_NAMES, CAPABILITY, PDF_MEDIA_TYPE, PPTX_MEDIA_TYPE, creationReport, qualityFor, renderMarkdown } = require(".");
const { createPrintableHtml, deckIrFingerprint, multiFormatQuality } = require("./export");
const { createDeckIr } = require("./layout");
const { createPreviewHtml } = require("./editor");
const { MAX_SPEC_BYTES, parsePresentationSpec } = require("./spec");

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function assertObjectStore(value) {
  if (!value || typeof value.readObject !== "function" || typeof value.putObject !== "function") throw new TypeError("team object store does not support ppt-create worker I/O");
  return value;
}
function createPptCreateHandler({ objectStore, buildPptx, buildPdf, temporaryRoot = os.tmpdir() } = {}) {
  const store = assertObjectStore(objectStore);
  if (typeof buildPptx !== "function") throw new TypeError("ppt-create team worker requires an OpenXML build adapter");
  if (typeof buildPdf !== "function") throw new TypeError("ppt-create team worker requires a PDF build adapter");
  if (typeof temporaryRoot !== "string" || !path.isAbsolute(temporaryRoot)) throw new TypeError("temporaryRoot must be an absolute path");
  return async ({ job, isCancellationRequested }) => {
    if (!job || job.capability !== CAPABILITY || typeof job.inputObjectKey !== "string" || typeof job.outputPrefix !== "string") throw new Error("ppt-create worker job is invalid");
    if (await isCancellationRequested()) throw new Error("PPT creation was cancelled");
    const input = await store.readObject({ objectKey: job.inputObjectKey, maxBytes: MAX_SPEC_BYTES });
    const spec = parsePresentationSpec(input);
    if (spec.assets?.length || spec.template) throw new Error("remote ppt-create does not accept local asset or template paths; use the local Runtime for these inputs");
    const root = fs.mkdtempSync(path.join(temporaryRoot, "common-tools-ppt-create-"));
    try {
      const ir = createDeckIr(spec);
      const irFile = path.join(root, ARTIFACT_NAMES.ir);
      const htmlFile = path.join(root, ARTIFACT_NAMES.html);
      const pptxFile = path.join(root, ARTIFACT_NAMES.pptx);
      const pdfFile = path.join(root, ARTIFACT_NAMES.pdf);
      fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      fs.writeFileSync(htmlFile, createPrintableHtml(ir), { flag: "wx", mode: 0o600 });
      if (await isCancellationRequested()) throw new Error("PPT creation was cancelled");
      buildPptx(Object.freeze({ irFile, outFile: pptxFile }));
      const pptx = fs.readFileSync(pptxFile);
      if (pptx.length < 22) throw new Error("OpenXML builder did not create a valid PPTX artifact");
      const sourceFingerprint = deckIrFingerprint(ir);
      const pdfResult = await buildPdf(Object.freeze({ pptxFile, htmlFile, outFile: pdfFile, sourceFingerprint, pageCount: ir.pages.length }));
      const formats = multiFormatQuality(ir, { htmlFile, pptxFile, pdfFile }, pdfResult);
      const quality = qualityFor(spec, ir, formats);
      if (!quality.passed) throw new Error("multi-format consistency gate failed");
      const pdf = fs.readFileSync(pdfFile);
      const report = creationReport(spec, quality, sha256(input), sha256(pptx), formats);
      const assetManifest = Buffer.from(`${JSON.stringify({ version: "1.0", assets: [] }, null, 2)}\n`);
      const bodies = Object.freeze({
        [ARTIFACT_NAMES.ir]: Buffer.from(`${JSON.stringify(ir, null, 2)}\n`),
        [ARTIFACT_NAMES.preview]: Buffer.from(createPreviewHtml(spec, ir)),
        [ARTIFACT_NAMES.html]: fs.readFileSync(htmlFile),
        [ARTIFACT_NAMES.pptx]: pptx,
        [ARTIFACT_NAMES.pdf]: pdf,
        [ARTIFACT_NAMES.assetManifest]: assetManifest,
        [ARTIFACT_NAMES.json]: Buffer.from(`${JSON.stringify(report, null, 2)}\n`),
        [ARTIFACT_NAMES.markdown]: Buffer.from(renderMarkdown(report))
      });
      const mediaTypes = Object.freeze({ [ARTIFACT_NAMES.ir]: "application/json", [ARTIFACT_NAMES.preview]: "text/html", [ARTIFACT_NAMES.html]: "text/html", [ARTIFACT_NAMES.pptx]: PPTX_MEDIA_TYPE, [ARTIFACT_NAMES.pdf]: PDF_MEDIA_TYPE, [ARTIFACT_NAMES.assetManifest]: "application/json", [ARTIFACT_NAMES.json]: "application/json", [ARTIFACT_NAMES.markdown]: "text/markdown" });
      const artifacts = [];
      for (const name of [ARTIFACT_NAMES.ir, ARTIFACT_NAMES.preview, ARTIFACT_NAMES.html, ARTIFACT_NAMES.pptx, ARTIFACT_NAMES.pdf, ARTIFACT_NAMES.assetManifest, ARTIFACT_NAMES.json, ARTIFACT_NAMES.markdown]) {
        if (await isCancellationRequested()) throw new Error("PPT creation was cancelled");
        const objectKey = `${job.outputPrefix}${name}`;
        await store.putObject({ objectKey, body: bodies[name], contentType: mediaTypes[name] });
        artifacts.push(Object.freeze({ name, objectKey, mediaType: mediaTypes[name], sha256: sha256(bodies[name]) }));
      }
      return Object.freeze({ artifacts: Object.freeze(artifacts), quality });
    } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 }); }
  };
}

module.exports = { createPptCreateHandler };
