"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");
const { createPrintableHtml, deckIrFingerprint, inspectHtml, inspectPdf, inspectPptx } = require("./export");
const { createIrPreviewHtml, validateEditableIr } = require("./ir-editor");

const MAX_PIPELINE_REPORT_BYTES = 2 * 1024 * 1024;
const MAX_IR_BYTES = 4 * 1024 * 1024;
const DEFAULT_EDITABILITY_POLICY = Object.freeze({ minNativeAreaRatio: 0.08, maxResidualAreaRatio: 0.45, maxLargestResidualAreaRatio: 0.4, minNativeObjects: 1 });

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function readBoundedJson(file, maximum, label) {
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 2 || info.size > maximum) throw new Error(`${label} is invalid`);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error(`${label} is invalid JSON`); }
}
function checkedExistingFile(root, value, extension, label) {
  if (typeof value !== "string" || !value || value.includes("\0")) throw new Error(`${label} path is invalid`);
  const approvedRoot = fs.realpathSync.native(path.resolve(root));
  const requested = path.isAbsolute(value) ? path.resolve(value) : path.resolve(approvedRoot, value);
  let candidate;
  try { candidate = insideRoot(approvedRoot, requested); }
  catch { throw new Error(`${label} must stay inside the output directory`); }
  if (candidate === approvedRoot || path.extname(candidate).toLowerCase() !== extension) throw new Error(`${label} must stay inside the output directory`);
  const requestedInfo = fs.lstatSync(requested);
  if (!requestedInfo.isFile() || requestedInfo.isSymbolicLink()) throw new Error(`${label} is invalid`);
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
      const requested = path.isAbsolute(image.assetPath) ? path.resolve(image.assetPath) : path.resolve(irRoot, image.assetPath);
      let candidate;
      try { candidate = insideRoot(root, requested); } catch { throw new Error("Deck IR image asset must stay inside the output directory"); }
      const requestedInfo = fs.lstatSync(requested);
      if (!requestedInfo.isFile() || requestedInfo.isSymbolicLink()) throw new Error("Deck IR image asset is invalid");
      const relative = path.relative(root, candidate);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Deck IR image asset must stay inside the output directory");
      image.assetPath = relative.split(path.sep).join("/");
    }
  }
  return validateEditableIr(draft);
}
function clippedBox(box, slideSize) {
  if (!plainObject(box) || ![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) return null;
  const left = Math.max(0, box.x); const top = Math.max(0, box.y); const right = Math.min(slideSize.widthPt, box.x + box.w); const bottom = Math.min(slideSize.heightPt, box.y + box.h);
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}
function unionArea(boxes, slideSize) {
  const rectangles = boxes.map((box) => clippedBox(box, slideSize)).filter(Boolean); const xs = [...new Set(rectangles.flatMap((box) => [box.left, box.right]))].sort((a, b) => a - b); let area = 0;
  for (let index = 0; index < xs.length - 1; index += 1) {
    const left = xs[index]; const right = xs[index + 1]; const spans = rectangles.filter((box) => box.left < right && box.right > left).map((box) => [box.top, box.bottom]).sort((a, b) => a[0] - b[0]);
    let covered = 0; let start; let end;
    for (const [top, bottom] of spans) { if (start === undefined || top > end) { if (start !== undefined) covered += end - start; start = top; end = bottom; } else end = Math.max(end, bottom); }
    if (start !== undefined) covered += end - start; area += (right - left) * covered;
  }
  return area;
}
function normalizeEditabilityPolicy(value = {}) {
  if (!plainObject(value) || Object.keys(value).some((key) => !Object.hasOwn(DEFAULT_EDITABILITY_POLICY, key))) throw new TypeError("image editability policy is invalid");
  const policy = { ...DEFAULT_EDITABILITY_POLICY, ...value };
  for (const key of ["minNativeAreaRatio", "maxResidualAreaRatio", "maxLargestResidualAreaRatio"]) if (typeof policy[key] !== "number" || !Number.isFinite(policy[key]) || policy[key] < 0 || policy[key] > 1) throw new TypeError("image editability ratio is invalid");
  if (!Number.isSafeInteger(policy.minNativeObjects) || policy.minNativeObjects < 1 || policy.minNativeObjects > 10000) throw new TypeError("image editability object threshold is invalid");
  return Object.freeze(policy);
}
function createPreservationPlan(ir, rawPolicy = {}) {
  const policy = normalizeEditabilityPolicy(rawPolicy);
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
    const slideArea = ir.slideSize.widthPt * ir.slideSize.heightPt;
    const nativeBoxes = ["textBoxes", "shapes", "tables", "charts", "icons"].flatMap((name) => (page[name] || []).map((item) => item.box));
    const residualBoxes = (page.images || []).map((item) => item.box); const nativeAreaRatio = unionArea(nativeBoxes, ir.slideSize) / slideArea; const residualAreaRatio = unionArea(residualBoxes, ir.slideSize) / slideArea;
    const largestResidualAreaRatio = residualBoxes.reduce((maximum, box) => { const clipped = clippedBox(box, ir.slideSize); return Math.max(maximum, clipped ? (clipped.right - clipped.left) * (clipped.bottom - clipped.top) / slideArea : 0); }, 0);
    const rasterBackgroundException = page.intent?.rasterBackgroundAllowed === true && nativeObjects >= policy.minNativeObjects && nativeAreaRatio >= policy.minNativeAreaRatio;
    const nativeGatePassed = nativeObjects >= policy.minNativeObjects && nativeAreaRatio >= policy.minNativeAreaRatio && (rasterBackgroundException || (residualAreaRatio <= policy.maxResidualAreaRatio && largestResidualAreaRatio <= policy.maxLargestResidualAreaRatio));
    const deliveryStatus = residualImages === 0 && nativeGatePassed ? "fully-editable" : nativeGatePassed ? "partially-editable" : "not-editable-enough";
    return { pageIndex: page.pageIndex, selectedCandidateId, candidates, metrics: { nativeObjects, nativeCategories, residualImages, editabilityTier, nativeAreaRatio, residualAreaRatio, largestResidualAreaRatio }, decision: { passed: nativeGatePassed, deliveryStatus, rasterBackgroundException, reasons: [...(nativeObjects < policy.minNativeObjects ? ["insufficient-native-objects"] : []), ...(nativeAreaRatio < policy.minNativeAreaRatio ? ["insufficient-native-area"] : []), ...(!rasterBackgroundException && residualAreaRatio > policy.maxResidualAreaRatio ? ["excessive-raster-residual-area"] : []), ...(!rasterBackgroundException && largestResidualAreaRatio > policy.maxLargestResidualAreaRatio ? ["oversized-raster-residual"] : [])] } };
  });
  return Object.freeze({ version: "1.1", sourceFingerprint: fingerprint, semantics: "faithful-reconstruction-strategy-not-layout-reflow", policy, pages });
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
    { name: "complex-graphic-native-gate", passed: plan.pages.every((page) => page.decision.passed) },
    { name: "editability-result-explicit", passed: plan.pages.every((page) => ["fully-editable", "partially-editable", "not-editable-enough"].includes(page.decision.deliveryStatus)) },
    { name: "multi-format-artifacts-present", passed: true }, { name: "multi-format-page-count-matches", passed: pdf.pageCount === ir.pages.length },
    { name: "multi-format-source-fingerprint-matches", passed: adapterResult?.sourceFingerprint === fingerprint }
  ];
  return Object.freeze({ files: Object.freeze(files), fingerprint, pageCount: ir.pages.length, checks: Object.freeze(checks), passed: checks.every((check) => check.passed) });
}

module.exports = { DEFAULT_EDITABILITY_POLICY, createImageDeliveryArtifacts, createPreservationPlan, locateImageDeliveryInputs, normalizeEditabilityPolicy, rewriteDeliveredAssets, unionArea };
