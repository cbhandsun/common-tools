"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MAX_ARCHIVE_BYTES } = require("../project-audit-core/team-worker");
const { ARTIFACT_NAMES, CAPABILITY, PDF_MEDIA_TYPE, PPTX_MEDIA_TYPE, creationReport, qualityFor, renderMarkdown } = require(".");
const { materializeAssetPack } = require("./assets");
const { createPrintableHtml, deckIrFingerprint, multiFormatQuality } = require("./export");
const { createDeckVariants } = require("./layout");
const { createPreviewHtml } = require("./editor");
const { MAX_SPEC_BYTES, parsePresentationSpec } = require("./spec");
const { admitPptCreateArchive } = require("./team-archive");
const { materializeTemplate, templateRecord } = require("./template");
const { describeVariants, variantManifest, variantNames } = require("./variants");

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
    const input = await store.readObject({ objectKey: job.inputObjectKey, maxBytes: MAX_ARCHIVE_BYTES });
    const root = fs.mkdtempSync(path.join(temporaryRoot, "common-tools-ppt-create-"));
    try {
      const sourceRoot = path.join(root, "source"); const deliveryRoot = path.join(root, "delivery"); fs.mkdirSync(deliveryRoot, { mode: 0o700 });
      let spec; let specBytes; let resolvedAssets = []; let resolvedTemplate;
      if (input[0] === 0x1f && input[1] === 0x8b) {
        fs.mkdirSync(sourceRoot, { mode: 0o700 });
        const admitted = admitPptCreateArchive(input, sourceRoot); ({ spec, specBytes, assets: resolvedAssets, template: resolvedTemplate } = admitted);
      } else {
        if (input.length > MAX_SPEC_BYTES) throw new Error("remote ppt-create JSON input exceeds the spec limit");
        specBytes = input; spec = parsePresentationSpec(input);
        if (spec.assets?.length || spec.template) throw new Error("remote ppt-create JSON cannot resolve local asset or template paths; upload a ppt-create archive");
      }
      const assetPack = materializeAssetPack(resolvedAssets, deliveryRoot); const materializedTemplate = materializeTemplate(resolvedTemplate, deliveryRoot); const assetInfo = Object.fromEntries(assetPack.records.map((asset) => [asset.id, asset]));
      const deckVariants = createDeckVariants(spec, { assetPaths: assetPack.paths, assetInfo }); const records = describeVariants(deckVariants); const bodies = {}; const mediaTypes = {}; const uploadNames = []; const deliveries = [];
      for (const variant of deckVariants) {
        const names = variantNames(variant.variantIndex); const files = Object.fromEntries(Object.entries(names).map(([key, name]) => [key, path.join(deliveryRoot, name)]));
        fs.writeFileSync(files.ir, `${JSON.stringify(variant.ir, null, 2)}\n`, { flag: "wx", mode: 0o600 }); fs.writeFileSync(files.html, createPrintableHtml(variant.ir, { assetRoot: deliveryRoot }), { flag: "wx", mode: 0o600 });
        if (await isCancellationRequested()) throw new Error("PPT creation was cancelled");
        buildPptx(Object.freeze({ irFile: files.ir, outFile: files.pptx, ...(materializedTemplate ? { templatePptx: materializedTemplate } : {}) })); const pptx = fs.readFileSync(files.pptx); if (pptx.length < 22) throw new Error("OpenXML builder did not create a valid PPTX artifact");
        const sourceFingerprint = deckIrFingerprint(variant.ir); const pdfResult = await buildPdf(Object.freeze({ pptxFile: files.pptx, htmlFile: files.html, outFile: files.pdf, sourceFingerprint, pageCount: variant.ir.pages.length })); const formats = multiFormatQuality(variant.ir, { htmlFile: files.html, pptxFile: files.pptx, pdfFile: files.pdf }, pdfResult);
        deliveries.push(Object.freeze({ ...records[variant.variantIndex], formats }));
        Object.assign(bodies, { [names.ir]: Buffer.from(`${JSON.stringify(variant.ir, null, 2)}\n`), [names.preview]: Buffer.from(createPreviewHtml(spec, variant.ir)), [names.html]: fs.readFileSync(files.html), [names.pptx]: pptx, [names.pdf]: fs.readFileSync(files.pdf) });
        Object.assign(mediaTypes, { [names.ir]: "application/json", [names.preview]: "text/html", [names.html]: "text/html", [names.pptx]: PPTX_MEDIA_TYPE, [names.pdf]: PDF_MEDIA_TYPE }); uploadNames.push(names.ir, names.preview, names.html, names.pptx, names.pdf);
      }
      if (materializedTemplate) fs.rmSync(materializedTemplate, { force: true });
      const primary = deliveries[0]; const ir = deckVariants[0].ir; const primaryNames = variantNames(0); const quality = qualityFor(spec, ir, primary.formats, assetPack.records, resolvedTemplate, deliveries);
      if (!quality.passed) throw new Error("multi-format consistency gate failed");
      const report = creationReport(spec, quality, sha256(specBytes), sha256(bodies[primaryNames.pptx]), primary.formats, resolvedTemplate, deliveries);
      const assetManifest = Buffer.from(`${JSON.stringify({ version: "1.0", assets: assetPack.records }, null, 2)}\n`); const templateManifest = resolvedTemplate ? Buffer.from(`${JSON.stringify({ version: "1.0", template: templateRecord(resolvedTemplate) }, null, 2)}\n`) : undefined;
      Object.assign(bodies, { [ARTIFACT_NAMES.assetManifest]: assetManifest, ...(templateManifest ? { [ARTIFACT_NAMES.templateManifest]: templateManifest } : {}), ...(deckVariants.length > 1 ? { [ARTIFACT_NAMES.variants]: Buffer.from(`${JSON.stringify(variantManifest(records), null, 2)}\n`) } : {}), [ARTIFACT_NAMES.json]: Buffer.from(`${JSON.stringify(report, null, 2)}\n`), [ARTIFACT_NAMES.markdown]: Buffer.from(renderMarkdown(report)) });
      Object.assign(mediaTypes, { [ARTIFACT_NAMES.assetManifest]: "application/json", ...(templateManifest ? { [ARTIFACT_NAMES.templateManifest]: "application/json" } : {}), ...(deckVariants.length > 1 ? { [ARTIFACT_NAMES.variants]: "application/json" } : {}), [ARTIFACT_NAMES.json]: "application/json", [ARTIFACT_NAMES.markdown]: "text/markdown" }); uploadNames.push(ARTIFACT_NAMES.assetManifest, ...(templateManifest ? [ARTIFACT_NAMES.templateManifest] : []), ...(deckVariants.length > 1 ? [ARTIFACT_NAMES.variants] : []), ARTIFACT_NAMES.json, ARTIFACT_NAMES.markdown);
      const artifacts = [];
      for (const name of uploadNames) {
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
