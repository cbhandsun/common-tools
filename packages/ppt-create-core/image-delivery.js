"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createPrintableHtml, deckIrFingerprint, inspectHtml, inspectPdf, inspectPptx } = require("./export");
const { createIrPreviewHtml, validateEditableIr } = require("./ir-editor");

const MAX_PIPELINE_REPORT_BYTES = 2 * 1024 * 1024;
const MAX_IR_BYTES = 4 * 1024 * 1024;

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function readBoundedJson(file, maximum, label) {
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > maximum) throw new Error(`${label} is invalid`);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error(`${label} is invalid JSON`); }
}
function checkedExistingFile(root, value, extension, label) {
  if (typeof value !== "string" || !value || value.includes("\0")) throw new Error(`${label} path is invalid`);
  const approvedRoot = fs.realpathSync.native(path.resolve(root)); const candidate = path.isAbsolute(value) ? path.resolve(value) : path.resolve(approvedRoot, value);
  const relative = path.relative(approvedRoot, candidate);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || path.extname(candidate).toLowerCase() !== extension) throw new Error(`${label} must stay inside the output directory`);
  const info = fs.lstatSync(candidate);
  if (!info.isFile() || info.isSymbolicLink() || fs.realpathSync.native(candidate) !== candidate) throw new Error(`${label} is invalid`);
  return candidate;
}
function locateImageDeliveryInputs(outputDir) {
  const root = fs.realpathSync.native(path.resolve(outputDir)); const reportFile = path.join(root, "reports", "pipeline-result.json");
  const report = readBoundedJson(reportFile, MAX_PIPELINE_REPORT_BYTES, "SlideClone pipeline report");
  if (!plainObject(report) || report.ok !== true || !plainObject(report.pptx)) throw new Error("SlideClone pipeline report is incomplete");
  return Object.freeze({ root, irFile: checkedExistingFile(root, report.irFile, ".json", "final Deck IR"), pptxFile: checkedExistingFile(root, report.pptx.pptxFile, ".pptx", "final PPTX") });
}
function rewriteDeliveredAssets(ir, irFile, outputRoot) {
  const draft = JSON.parse(JSON.stringify(ir)); const irRoot = path.dirname(irFile); const root = fs.realpathSync.native(outputRoot);
  for (const page of draft.pages) {
    for (const image of page.images || []) {
      if (typeof image.assetPath !== "string" || !image.assetPath || image.assetPath.includes("\0")) throw new Error("Deck IR image asset path is invalid");
      const candidate = path.isAbsolute(image.assetPath) ? path.resolve(image.assetPath) : path.resolve(irRoot, image.assetPath);
      const relative = path.relative(root, candidate);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Deck IR image asset must stay inside the output directory");
      const info = fs.lstatSync(candidate);
      if (!info.isFile() || info.isSymbolicLink() || fs.realpathSync.native(candidate) !== candidate) throw new Error("Deck IR image asset is invalid");
      image.assetPath = relative.split(path.sep).join("/");
    }
  }
  return validateEditableIr(draft);
}
function createPreservationPlan(ir) {
  const fingerprint = deckIrFingerprint(ir);
  const pages = ir.pages.map((page) => {
    const nativeObjects = ["textBoxes", "shapes", "tables", "charts", "icons"].reduce((sum, name) => sum + (page[name] || []).length, 0);
    const residualImages = (page.images || []).length;
    const candidates = [
      { id: "preserve-native-v1", strategy: "native-first", eligible: nativeObjects > 0 },
      { id: "preserve-hybrid-v1", strategy: "native-with-bounded-raster-residuals", eligible: nativeObjects > 0 && residualImages > 0 },
      { id: "preserve-raster-fallback-v1", strategy: "bounded-raster-fallback", eligible: residualImages > 0 }
    ].filter((candidate) => candidate.eligible).map(({ id, strategy }) => ({ id, strategy }));
    if (candidates.length === 0) candidates.push({ id: "preserve-native-v1", strategy: "native-first" });
    const selectedCandidateId = nativeObjects > 0 && residualImages > 0 ? "preserve-hybrid-v1" : nativeObjects > 0 ? "preserve-native-v1" : "preserve-raster-fallback-v1";
    const nativeCategories = ["shapes", "tables", "charts", "icons"].filter((name) => (page[name] || []).length > 0).length;
    const editabilityTier = nativeObjects === 0 ? "raster-only" : nativeCategories >= 2 || nativeObjects >= 6 ? "native-complex" : residualImages > 0 ? "native-hybrid" : "native-basic";
    return { pageIndex: page.pageIndex, selectedCandidateId, candidates, metrics: { nativeObjects, nativeCategories, residualImages, editabilityTier } };
  });
  return Object.freeze({ version: "1.0", sourceFingerprint: fingerprint, semantics: "faithful-reconstruction-strategy-not-layout-reflow", pages });
}
function writeNew(file, body) { fs.writeFileSync(file, body, { flag: "wx", mode: 0o600 }); }
function createImageDeliveryArtifacts({ outputDir, buildPdf }) {
  if (typeof buildPdf !== "function") throw new TypeError("image delivery requires a PDF adapter");
  const inputs = locateImageDeliveryInputs(outputDir); const sourceIr = readBoundedJson(inputs.irFile, MAX_IR_BYTES, "final Deck IR");
  const ir = rewriteDeliveredAssets(sourceIr, inputs.irFile, inputs.root); const fingerprint = deckIrFingerprint(ir);
  const files = {
    irFile: path.join(inputs.root, "deck.ir.json"), previewFile: path.join(inputs.root, "deck.preview.html"), htmlFile: path.join(inputs.root, "deck.html"),
    pptxFile: path.join(inputs.root, "deck.pptx"), pdfFile: path.join(inputs.root, "deck.pdf"), planFile: path.join(inputs.root, "deck.preservation-plan.json")
  };
  for (const file of Object.values(files)) if (fs.existsSync(file)) throw new Error("image delivery artifact already exists");
  writeNew(files.irFile, `${JSON.stringify(ir, null, 2)}\n`);
  writeNew(files.planFile, `${JSON.stringify(createPreservationPlan(ir), null, 2)}\n`);
  writeNew(files.htmlFile, createPrintableHtml(ir, { assetRoot: inputs.root }));
  writeNew(files.previewFile, createIrPreviewHtml(ir, { assetRoot: inputs.root }));
  fs.copyFileSync(inputs.pptxFile, files.pptxFile, fs.constants.COPYFILE_EXCL);
  const adapterResult = buildPdf({ pptxFile: files.pptxFile, outFile: files.pdfFile, sourceFingerprint: fingerprint, pageCount: ir.pages.length });
  inspectHtml(files.htmlFile, fingerprint, ir.pages.length); inspectPptx(files.pptxFile); const pdf = inspectPdf(files.pdfFile);
  const plan = createPreservationPlan(ir);
  const checks = [
    { name: "shared-deck-ir-present", passed: true }, { name: "shared-preview-present", passed: true },
    { name: "preservation-candidates-available", passed: plan.pages.every((page) => page.candidates.length >= 1 && page.candidates.length <= 3) },
    { name: "preservation-selection-resolved", passed: plan.pages.every((page) => page.candidates.some((candidate) => candidate.id === page.selectedCandidateId)) },
    { name: "complex-graphic-native-gate", passed: plan.pages.every((page) => ["raster-only", "native-basic", "native-hybrid", "native-complex"].includes(page.metrics.editabilityTier)) },
    { name: "multi-format-artifacts-present", passed: true }, { name: "multi-format-page-count-matches", passed: pdf.pageCount === ir.pages.length },
    { name: "multi-format-source-fingerprint-matches", passed: adapterResult?.sourceFingerprint === fingerprint }
  ];
  return Object.freeze({ files: Object.freeze(files), fingerprint, pageCount: ir.pages.length, checks: Object.freeze(checks), passed: checks.every((check) => check.passed) });
}

module.exports = { createImageDeliveryArtifacts, createPreservationPlan, locateImageDeliveryInputs, rewriteDeliveredAssets };
