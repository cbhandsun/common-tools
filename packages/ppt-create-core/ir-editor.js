"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");
const { createPrintableHtml, deckIrFingerprint, inspectHtml, inspectPdf, inspectPptx } = require("./export");
const { inspectImageAsset } = require("./assets");
const { createIrEditorClientSource } = require("./ir-editor-client");
const { CHART_TYPES, nativeChartPayload } = require("./data-models");
const { MAX_OBJECTS_PER_PAGE, applyObjectLifecycleOperation } = require("./ir-lifecycle");
const { applyPageLifecycleOperation } = require("./ir-page-lifecycle");
const { inspectTemplate } = require("./template");

const MAX_IR_BYTES = 4 * 1024 * 1024;
const MAX_PATCH_BYTES = 256 * 1024;
const MAX_OPERATIONS = 500;
const COLLECTIONS = Object.freeze(["textBoxes", "shapes", "images", "tables", "charts", "icons"]);
const REVISION_PATTERN = /^[a-f0-9]{64}$/u;
const STYLE_KEYS = Object.freeze(["fill", "stroke", "color", "opacity", "strokeWidthPt", "sizePt", "weight", "align", "family"]);
const FONT_STYLE_KEYS = Object.freeze(new Set(["color", "opacity", "sizePt", "weight", "align", "family"]));

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, allowed, label) {
  if (!plainObject(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(`${label} is invalid`);
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function boundedText(value) {
  if (typeof value !== "string" || value.length > 32768 || value.includes("\0")) throw new TypeError("editable text value is invalid");
  return value;
}
function validateBox(box, slideSize) {
  exactKeys(box, ["x", "y", "w", "h"], "editable object box");
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || box.x + box.w > slideSize.widthPt + 0.001 || box.y + box.h > slideSize.heightPt + 0.001) throw new TypeError("editable object box exceeds the slide boundary");
  return box;
}
function validateStylePatch(value) {
  exactKeys(value, STYLE_KEYS, "editable style patch");
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (["fill", "stroke", "color"].includes(key)) {
      if (typeof entry !== "string" || !/^(?:#[A-Fa-f0-9]{6}|none)$/u.test(entry)) throw new TypeError("editable style color is invalid");
    } else if (["opacity", "strokeWidthPt", "sizePt"].includes(key)) {
      const bounds = key === "opacity" ? [0, 1] : key === "sizePt" ? [6, 200] : [0, 40];
      if (typeof entry !== "number" || !Number.isFinite(entry) || entry < bounds[0] || entry > bounds[1]) throw new TypeError("editable style number is invalid");
    } else if (key === "weight" && !["normal", "bold"].includes(entry)) throw new TypeError("editable style weight is invalid");
    else if (key === "align" && !["left", "center", "right"].includes(entry)) throw new TypeError("editable style alignment is invalid");
    else if (key === "family" && (typeof entry !== "string" || !entry.trim() || entry.length > 120 || containsUnsafeText(entry))) throw new TypeError("editable style font is invalid");
    result[key] = entry;
  }
  if (!Object.keys(result).length) throw new TypeError("editable style patch is empty");
  return result;
}
function containsUnsafeText(value) { return [...value].some((character) => { const code = character.codePointAt(0); return code <= 0x1f || code === 0x7f; }); }
function boundedCellText(value, label, maximum = 120) {
  if (typeof value !== "string" || value.length > maximum || containsUnsafeText(value)) throw new TypeError(`${label} is invalid`);
  return value;
}
function boundedChartData(operation) {
  if (!CHART_TYPES.includes(operation.chartType) || !Array.isArray(operation.categories) || operation.categories.length < 2 || operation.categories.length > 12) throw new TypeError("editable chart data is invalid");
  const categories = operation.categories.map((value) => boundedCellText(value, "editable chart category", 80));
  if (!Array.isArray(operation.series) || operation.series.length < 1 || operation.series.length > 4 || (["pie", "donut"].includes(operation.chartType) && operation.series.length !== 1)) throw new TypeError("editable chart series are invalid");
  const series = operation.series.map((entry) => {
    exactKeys(entry, ["name", "values"], "editable chart series");
    if (!Array.isArray(entry.values) || entry.values.length !== categories.length || entry.values.some((value) => typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000)) throw new TypeError("editable chart values are invalid");
    return { name: boundedCellText(entry.name, "editable chart series name", 80), values: entry.values.map((value) => Object.is(value, -0) ? 0 : value) };
  });
  return { categories, series };
}
function objectLocation(ir, pageIndex, objectId) {
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= ir.pages.length || typeof objectId !== "string") throw new TypeError("editable patch target is invalid");
  for (const collection of COLLECTIONS) {
    const index = (ir.pages[pageIndex][collection] || []).findIndex((candidate) => candidate.id === objectId);
    if (index >= 0) return { collection, index, item: ir.pages[pageIndex][collection][index] };
  }
  throw new TypeError("editable patch target does not exist");
}
function validateEditableIr(ir) {
  if (!plainObject(ir) || ir.version !== "1.0" || !plainObject(ir.slideSize) || !Array.isArray(ir.pages) || ir.pages.length < 1 || ir.pages.length > 100) throw new TypeError("editable Deck IR is invalid");
  const { widthPt, heightPt } = ir.slideSize;
  if (![widthPt, heightPt].every((value) => Number.isFinite(value) && value >= 72 && value <= 4000)) throw new TypeError("editable Deck IR slide size is invalid");
  const ids = new Set();
  ir.pages.forEach((page, pageIndex) => {
    if (!plainObject(page) || !Number.isSafeInteger(page.pageIndex) || page.pageIndex !== pageIndex) throw new TypeError("editable Deck IR page indexes are invalid");
    const objectCount = COLLECTIONS.reduce((total, collection) => total + (Array.isArray(page[collection]) ? page[collection].length : 0), 0);
    if (objectCount > MAX_OBJECTS_PER_PAGE) throw new TypeError("editable Deck IR page object limit exceeded");
    for (const collection of COLLECTIONS) {
      if (page[collection] !== undefined && !Array.isArray(page[collection])) throw new TypeError(`editable Deck IR ${collection} is invalid`);
      for (const item of page[collection] || []) {
        if (!plainObject(item) || typeof item.id !== "string" || !item.id || item.id.length > 256 || containsUnsafeText(item.id) || ids.has(`${pageIndex}\0${item.id}`)) throw new TypeError("editable Deck IR object id is invalid");
        ids.add(`${pageIndex}\0${item.id}`); validateBox(item.box, ir.slideSize);
        if (collection === "textBoxes") boundedText(item.text);
      }
    }
  });
  return ir;
}
function targetObject(ir, pageIndex, objectId, allowedCollections = COLLECTIONS) {
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= ir.pages.length || typeof objectId !== "string") throw new TypeError("editable patch target is invalid");
  for (const collection of allowedCollections) {
    const item = (ir.pages[pageIndex][collection] || []).find((candidate) => candidate.id === objectId);
    if (item) return item;
  }
  throw new TypeError("editable patch target does not exist");
}
function applyIrEditorPatch(rawIr, patch) {
  const validated = validateEditableIr(rawIr); exactKeys(patch, ["version", "expectedRevision", "operations"], "editable IR patch");
  const revision = deckIrFingerprint(validated);
  if (patch.version !== "1.0" || !REVISION_PATTERN.test(patch.expectedRevision || "") || patch.expectedRevision !== revision) throw new Error("editable IR patch revision does not match the deck");
  if (!Array.isArray(patch.operations) || patch.operations.length < 1 || patch.operations.length > MAX_OPERATIONS) throw new TypeError("editable IR patch operations are invalid");
  const ir = clone(validated);
  patch.operations.forEach((operation, index) => {
    if (!plainObject(operation) || typeof operation.type !== "string") throw new TypeError(`editable IR operation ${index + 1} is invalid`);
    if (applyPageLifecycleOperation(ir, operation, index)) return;
    if (applyObjectLifecycleOperation(ir, operation, index, { collections: COLLECTIONS, validateBox, boundedText })) return;
    if (operation.type === "set-text") {
      exactKeys(operation, ["type", "pageIndex", "objectId", "value"], `editable IR operation ${index + 1}`);
      targetObject(ir, operation.pageIndex, operation.objectId, ["textBoxes"]).text = boundedText(operation.value);
      return;
    }
    if (operation.type === "set-table-cell") {
      exactKeys(operation, ["type", "pageIndex", "objectId", "rowIndex", "columnIndex", "value"], `editable IR operation ${index + 1}`);
      const table = targetObject(ir, operation.pageIndex, operation.objectId, ["tables"]);
      if (!Number.isSafeInteger(operation.rowIndex) || !Number.isSafeInteger(operation.columnIndex) || operation.rowIndex < 0 || operation.columnIndex < 0 || !Array.isArray(table.rows) || operation.rowIndex >= table.rows.length || !Array.isArray(table.rows[operation.rowIndex]) || operation.columnIndex >= table.rows[operation.rowIndex].length) throw new TypeError("editable table cell target is invalid");
      table.rows[operation.rowIndex][operation.columnIndex] = boundedCellText(operation.value, "editable table cell");
      return;
    }
    if (operation.type === "set-chart-data") {
      exactKeys(operation, ["type", "pageIndex", "objectId", "chartType", "categories", "series"], `editable IR operation ${index + 1}`);
      const chart = targetObject(ir, operation.pageIndex, operation.objectId, ["charts"]); const data = boundedChartData(operation);
      chart.type = operation.chartType; chart.categories = data.categories; chart.series = data.series; chart.nativePayload = nativeChartPayload(chart, chart.style || {});
      return;
    }
    if (operation.type === "set-box") {
      exactKeys(operation, ["type", "pageIndex", "objectId", "box"], `editable IR operation ${index + 1}`);
      targetObject(ir, operation.pageIndex, operation.objectId).box = { ...validateBox(operation.box, ir.slideSize) };
      return;
    }
    if (operation.type === "set-rotation") {
      exactKeys(operation, ["type", "pageIndex", "objectId", "rotation"], `editable IR operation ${index + 1}`);
      if (typeof operation.rotation !== "number" || !Number.isFinite(operation.rotation) || operation.rotation < -360 || operation.rotation > 360) throw new TypeError("editable object rotation is invalid");
      targetObject(ir, operation.pageIndex, operation.objectId).rotation = Object.is(operation.rotation, -0) ? 0 : operation.rotation;
      return;
    }
    if (operation.type === "set-style") {
      exactKeys(operation, ["type", "pageIndex", "objectId", "style"], `editable IR operation ${index + 1}`);
      const location = objectLocation(ir, operation.pageIndex, operation.objectId); const style = validateStylePatch(operation.style);
      if (location.collection === "textBoxes") {
        const font = Object.fromEntries(Object.entries(style).filter(([key]) => FONT_STYLE_KEYS.has(key))); const shapeStyle = Object.fromEntries(Object.entries(style).filter(([key]) => !FONT_STYLE_KEYS.has(key)));
        if (Object.keys(font).length) location.item.font = { ...(location.item.font || {}), ...font }; if (Object.keys(shapeStyle).length) location.item.style = { ...(location.item.style || {}), ...shapeStyle };
      } else location.item.style = { ...(location.item.style || {}), ...style };
      return;
    }
    if (operation.type === "batch-style") {
      exactKeys(operation, ["type", "pageIndex", "objectIds", "style"], `editable IR operation ${index + 1}`);
      if (!Array.isArray(operation.objectIds) || operation.objectIds.length < 2 || operation.objectIds.length > 100 || new Set(operation.objectIds).size !== operation.objectIds.length) throw new TypeError("editable batch style targets are invalid");
      const style = validateStylePatch(operation.style);
      for (const objectId of operation.objectIds) {
        const location = objectLocation(ir, operation.pageIndex, objectId);
        if (location.collection === "textBoxes") { const font = Object.fromEntries(Object.entries(style).filter(([key]) => FONT_STYLE_KEYS.has(key))); const shapeStyle = Object.fromEntries(Object.entries(style).filter(([key]) => !FONT_STYLE_KEYS.has(key))); if (Object.keys(font).length) location.item.font = { ...(location.item.font || {}), ...font }; if (Object.keys(shapeStyle).length) location.item.style = { ...(location.item.style || {}), ...shapeStyle }; }
        else location.item.style = { ...(location.item.style || {}), ...style };
      }
      return;
    }
    if (operation.type === "reorder-object") {
      exactKeys(operation, ["type", "pageIndex", "objectId", "toIndex"], `editable IR operation ${index + 1}`);
      const location = objectLocation(ir, operation.pageIndex, operation.objectId); const collection = ir.pages[operation.pageIndex][location.collection];
      if (!Number.isSafeInteger(operation.toIndex) || operation.toIndex < 0 || operation.toIndex >= collection.length) throw new TypeError("editable layer index is invalid");
      collection.splice(operation.toIndex, 0, collection.splice(location.index, 1)[0]);
      return;
    }
    throw new TypeError(`editable IR operation ${index + 1} is unsupported`);
  });
  validateEditableIr(ir);
  return Object.freeze({ ir, revision: deckIrFingerprint(ir), operationCount: patch.operations.length, checks: Object.freeze([{ name: "ir-batch-style-validated", passed: true }, { name: "ir-object-lifecycle-validated", passed: true }, { name: "ir-page-lifecycle-validated", passed: true }, { name: "ir-revision-bound", passed: true }]) });
}
function parseJson(buffer, maximum, label) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > maximum) throw new TypeError(`${label} file size is invalid`);
  try { return JSON.parse(buffer.toString("utf8")); } catch { throw new TypeError(`${label} is invalid JSON`); }
}
function checkedInput(workspaceRoot, value, maximum, label) {
  const candidate = insideRoot(workspaceRoot, value); let info;
  try { info = fs.lstatSync(candidate); } catch { throw new Error(`${label} is unavailable`); }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum || path.extname(candidate).toLowerCase() !== ".json") throw new Error(`${label} is invalid`);
  let file; try { file = insideRoot(workspaceRoot, fs.realpathSync.native(candidate)); } catch { throw new Error(`${label} is unavailable`); }
  if (path.extname(file).toLowerCase() !== ".json") throw new Error(`${label} is invalid`);
  return file;
}
function checkedNewOutput(workspaceRoot, value) {
  const candidate = insideRoot(workspaceRoot, value); const parentCandidate = path.dirname(candidate);
  let parent; try { parent = insideRoot(workspaceRoot, fs.realpathSync.native(parentCandidate)); } catch { throw new Error("editable IR output parent is unavailable"); }
  const file = insideRoot(workspaceRoot, path.join(parent, path.basename(candidate)));
  if (path.extname(file).toLowerCase() !== ".json" || fs.existsSync(file)) throw new Error("editable IR output must be a new JSON file");
  if (!fs.statSync(parent).isDirectory()) throw new Error("editable IR output parent is unavailable");
  return file;
}
function checkedNewDirectory(workspaceRoot, value) {
  const candidate = insideRoot(workspaceRoot, value); const parentCandidate = path.dirname(candidate);
  let parent; try { parent = insideRoot(workspaceRoot, fs.realpathSync.native(parentCandidate)); } catch { throw new Error("editable IR export output parent is unavailable"); }
  const output = insideRoot(workspaceRoot, path.join(parent, path.basename(candidate)));
  if (fs.existsSync(output) || output === path.resolve(workspaceRoot)) throw new Error("editable IR export output must be a new child directory");
  if (!fs.statSync(parent).isDirectory()) throw new Error("editable IR export output parent is unavailable");
  return output;
}
function persistIrEditorPatch({ workspaceRoot, input, patch, output }) {
  const inputFile = checkedInput(workspaceRoot, input, MAX_IR_BYTES, "editable IR input");
  const patchFile = checkedInput(workspaceRoot, patch, MAX_PATCH_BYTES, "editable IR patch"); const outputFile = checkedNewOutput(workspaceRoot, output);
  const result = applyIrEditorPatch(parseJson(fs.readFileSync(inputFile), MAX_IR_BYTES, "editable IR input"), parseJson(fs.readFileSync(patchFile), MAX_PATCH_BYTES, "editable IR patch"));
  fs.writeFileSync(outputFile, `${JSON.stringify(result.ir, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return Object.freeze({ output: outputFile, revision: result.revision, operationCount: result.operationCount, pageCount: result.ir.pages.length });
}
function materializeEditedIr(rawIr, inputFile, workspaceRoot, outputRoot) {
  const ir = clone(validateEditableIr(rawIr)); const assets = new Map();
  for (const page of ir.pages) for (const image of page.images || []) {
    if (typeof image.assetPath !== "string" || !image.assetPath || image.assetPath.includes("\0")) throw new Error("editable IR image asset path is invalid");
    const candidate = insideRoot(workspaceRoot, path.isAbsolute(image.assetPath) ? image.assetPath : path.resolve(path.dirname(inputFile), image.assetPath));
    let sourceFile; try { sourceFile = insideRoot(workspaceRoot, fs.realpathSync.native(candidate)); } catch { throw new Error("editable IR image asset is unavailable"); }
    const info = inspectImageAsset(sourceFile); const extension = path.extname(sourceFile).toLowerCase(); const name = `${info.sha256}${extension}`;
    if (!assets.has(name)) assets.set(name, sourceFile); image.assetPath = `assets/${name}`;
  }
  if (assets.size) { const directory = path.join(outputRoot, "assets"); fs.mkdirSync(directory); for (const [name, sourceFile] of assets) fs.copyFileSync(sourceFile, path.join(directory, name), fs.constants.COPYFILE_EXCL); }
  return ir;
}
function exportEditedIrArtifacts({ workspaceRoot, input, output, template, buildPptx, buildPdf }) {
  if (typeof buildPptx !== "function" || typeof buildPdf !== "function") throw new TypeError("editable IR export requires PPTX and PDF adapters");
  const inputFile = checkedInput(workspaceRoot, input, MAX_IR_BYTES, "editable IR input"); const outputRoot = checkedNewDirectory(workspaceRoot, output);
  let templateFile;
  if (template !== undefined) {
    const templateCandidate = insideRoot(workspaceRoot, template);
    try { templateFile = insideRoot(workspaceRoot, fs.realpathSync.native(templateCandidate)); } catch { throw new Error("editable IR export template is unavailable"); }
    if (path.extname(templateFile).toLowerCase() !== ".pptx") throw new Error("editable IR export template must be PPTX"); inspectTemplate(templateFile);
  }
  fs.mkdirSync(outputRoot);
  try {
    const ir = materializeEditedIr(parseJson(fs.readFileSync(inputFile), MAX_IR_BYTES, "editable IR input"), inputFile, workspaceRoot, outputRoot); const fingerprint = deckIrFingerprint(ir);
    const files = Object.freeze({ irFile: path.join(outputRoot, "deck.ir.json"), previewFile: path.join(outputRoot, "deck.preview.html"), htmlFile: path.join(outputRoot, "deck.html"), pptxFile: path.join(outputRoot, "deck.pptx"), pdfFile: path.join(outputRoot, "deck.pdf"), reportFile: path.join(outputRoot, "edit-export-report.json") });
    fs.writeFileSync(files.irFile, `${JSON.stringify(ir, null, 2)}\n`, { flag: "wx", mode: 0o600 }); fs.writeFileSync(files.previewFile, createIrPreviewHtml(ir, { assetRoot: outputRoot }), { flag: "wx", mode: 0o600 }); fs.writeFileSync(files.htmlFile, createPrintableHtml(ir, { assetRoot: outputRoot }), { flag: "wx", mode: 0o600 });
    buildPptx(Object.freeze({ irFile: files.irFile, outFile: files.pptxFile, ...(templateFile ? { templatePptx: templateFile } : {}) })); const pdfResult = buildPdf(Object.freeze({ pptxFile: files.pptxFile, htmlFile: files.htmlFile, outFile: files.pdfFile, sourceFingerprint: fingerprint, pageCount: ir.pages.length }));
    inspectHtml(files.htmlFile, fingerprint, ir.pages.length); inspectPptx(files.pptxFile); const pdf = inspectPdf(files.pdfFile);
    const checks = Object.freeze([{ name: "edited-ir-validated", passed: true }, { name: "edited-ir-assets-self-contained", passed: ir.pages.every((page) => (page.images || []).every((image) => image.assetPath.startsWith("assets/"))) }, { name: "edited-ir-pptx-exported", passed: true }, { name: "edited-ir-pdf-page-count-matches", passed: pdf.pageCount === ir.pages.length }, { name: "edited-ir-source-fingerprint-matches", passed: pdfResult?.sourceFingerprint === fingerprint }]);
    const report = Object.freeze({ version: "1.0", sourceRevision: deckIrFingerprint(validateEditableIr(parseJson(fs.readFileSync(inputFile), MAX_IR_BYTES, "editable IR input"))), exportedRevision: fingerprint, pageCount: ir.pages.length, checks, passed: checks.every((check) => check.passed) });
    if (!report.passed) throw new Error("editable IR export quality gate failed"); fs.writeFileSync(files.reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 }); return Object.freeze({ output: outputRoot, files, report });
  } catch (error) { fs.rmSync(outputRoot, { recursive: true, force: true, maxRetries: 2 }); throw error; }
}
function applyAndExportIrArtifacts({ workspaceRoot, input, patch, output, template, buildPptx, buildPdf }) {
  const inputFile = checkedInput(workspaceRoot, input, MAX_IR_BYTES, "editable IR input");
  const patchFile = checkedInput(workspaceRoot, patch, MAX_PATCH_BYTES, "editable IR patch");
  const outputRoot = checkedNewDirectory(workspaceRoot, output);
  const inputRevision = deckIrFingerprint(validateEditableIr(parseJson(fs.readFileSync(inputFile), MAX_IR_BYTES, "editable IR input")));
  const patchBytes = fs.readFileSync(patchFile); const patchSha256 = crypto.createHash("sha256").update(patchBytes).digest("hex");
  const temporary = checkedNewOutput(workspaceRoot, path.join(workspaceRoot, `.common-tools-ir-edit-${crypto.randomUUID()}.json`));
  let ownsOutput = false; let ownsTemporary = false;
  try {
    const applied = persistIrEditorPatch({ workspaceRoot, input: inputFile, patch: patchFile, output: temporary });
    ownsTemporary = true;
    const exported = exportEditedIrArtifacts({ workspaceRoot, input: temporary, output: outputRoot, template, buildPptx, buildPdf });
    ownsOutput = true;
    const finalizationReportFile = path.join(outputRoot, "edit-finalization-report.json");
    const finalizationReport = Object.freeze({ version: "1.0", inputRevision, patchSha256, outputRevision: applied.revision, operationCount: applied.operationCount, checks: Object.freeze([{ name: "edit-input-revision-bound", passed: true }, { name: "edit-patch-fingerprint-recorded", passed: true }, { name: "edit-export-quality-passed", passed: exported.report.passed }]), passed: exported.report.passed });
    fs.writeFileSync(finalizationReportFile, `${JSON.stringify(finalizationReport, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return Object.freeze({ output: exported.output, operationCount: applied.operationCount, revision: applied.revision, files: Object.freeze({ ...exported.files, finalizationReportFile }), report: exported.report, finalizationReport });
  } catch (error) {
    if (ownsOutput && fs.existsSync(outputRoot)) fs.rmSync(outputRoot, { recursive: true, force: true, maxRetries: 2 });
    throw error;
  } finally { if (ownsTemporary) fs.rmSync(temporary, { force: true }); }
}
function embeddedJson(value) { return JSON.stringify(value).replace(/[<>&]/gu, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" })[character]); }
function createIrPreviewHtml(rawIr, options = {}) {
  const ir = validateEditableIr(rawIr); const revision = deckIrFingerprint(ir);
  const rendered = `<!-- File workflow compatibility: common-tools ppt apply-ir-edit; common-tools ppt export-ir -->${createPrintableHtml(ir, options).match(/<body[^>]*>([\s\S]*)<\/body>/u)?.[1] || ""}`;
  const model = { version: "1.0", revision, slideSize: ir.slideSize, pages: ir.pages.map((page) => ({ pageIndex: page.pageIndex, objects: COLLECTIONS.flatMap((collection) => (page[collection] || []).map((item, index) => ({ id: item.id, collection, index, type: item.type, assetPath: item.assetPath, box: item.box, rotation: item.rotation || 0, font: item.font || {}, style: item.style || {}, text: item.text, rows: item.rows, categories: item.categories, series: item.series }))) })) };
  const nonce = crypto.randomBytes(18).toString("base64");
  const sessionEndpoint = options.sessionEndpoint; const sessionToken = options.sessionToken;
  const script = createIrEditorClientSource({ maxOperations: MAX_OPERATIONS, maxPatchBytes: MAX_PATCH_BYTES, sessionEndpoint, sessionToken });
  const policy = `default-src 'none'; img-src 'self' data: blob:; style-src 'nonce-${nonce}'; style-src-attr 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${sessionEndpoint ? "'self'" : "'none'"}; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="common-tools-deck-ir-sha256" content="${revision}"><meta name="common-tools-page-count" content="${ir.pages.length}"><title>Editable deck preview</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#0b1220;font-family:Arial,"Microsoft YaHei",sans-serif}.toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:8px;padding:10px 16px;background:#111c2ef5;color:#e5edf7;flex-wrap:wrap}.toolbar button,.toolbar input,.toolbar select{border:0;border-radius:6px;padding:7px 10px}.toolbar button{background:#38bdf8;color:#082033;cursor:pointer}.toolbar button:disabled{cursor:not-allowed;opacity:.35}.toolbar button:focus-visible,.toolbar input:focus-visible,.toolbar select:focus-visible,[data-object-id]:focus-visible{outline:3px solid #fbbf24;outline-offset:2px}.toolbar input[type=color]{width:42px;height:32px;padding:3px}.toolbar input[type=number]{width:70px}.toolbar input[type=text]{width:110px}.toolbar span,.toolbar label{font-size:12px;color:#a8bad0}.slide{position:relative;width:min(960px,calc(100vw - 32px));height:auto;aspect-ratio:${ir.slideSize.widthPt}/${ir.slideSize.heightPt};margin:24px auto;overflow:hidden;background:#fff;box-shadow:0 18px 50px #0008;background-image:linear-gradient(#94a3b822 1px,transparent 1px),linear-gradient(90deg,#94a3b822 1px,transparent 1px);background-size:4px 4px}.shape,.image,.text,.native,.chart{position:absolute;touch-action:none}.selected-object{outline:2px solid #38bdf8!important;outline-offset:2px}.resize-handle{display:none;position:absolute;width:12px;height:12px;border:2px solid #fff;background:#0284c7;cursor:nwse-resize;z-index:999}.resize-handle.active{display:block}.image{display:block}.text{white-space:pre-wrap;overflow:hidden;line-height:1.15}.text[contenteditable]:focus{outline:2px solid #38bdf8;background:#e0f2fe22}.native{border-collapse:collapse;background:#fff}.native td{border:1px solid #94a3b8;padding:6px}.chart{padding:18px;border:1px solid #94a3b8;background:#fff}.semantic-editor{width:min(760px,calc(100vw - 32px));max-height:85vh;border:0;border-radius:12px;padding:0;color:#172033;box-shadow:0 24px 80px #0008}.semantic-editor::backdrop{background:#07101dcc}.semantic-editor form{padding:20px}.semantic-editor h2{margin:0 0 16px}.semantic-editor-body{display:grid;gap:12px;max-height:60vh;overflow:auto}.semantic-editor-body label{display:grid;gap:6px;font-weight:700}.semantic-editor input,.semantic-editor select,.semantic-editor textarea{width:100%;padding:9px;border:1px solid #94a3b8;border-radius:6px;font:inherit}.semantic-grid{border-collapse:collapse;width:100%}.semantic-grid td{padding:2px}.chart-series{display:grid;grid-template-columns:1fr 2fr auto;gap:8px;margin:8px 0}.semantic-editor-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.semantic-editor button{padding:8px 12px;border:0;border-radius:6px;cursor:pointer}.semantic-editor button.primary{background:#0284c7;color:#fff}@media(max-width:640px){.chart-series{grid-template-columns:1fr}.semantic-editor{width:calc(100vw - 16px)}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head><body><header class="toolbar" role="toolbar" aria-label="可编辑演示文稿工具栏"><strong>可编辑 PPT 工作台</strong><span id="selection">第 1 页</span><span id="count" role="status" aria-live="polite">0 项待保存变更</span><button id="undo" type="button" aria-keyshortcuts="Control+Z Meta+Z">撤销</button><button id="redo" type="button" aria-keyshortcuts="Control+Y Meta+Shift+Z">重做</button><button id="addText" type="button">新增文字</button><button id="addShape" type="button">新增形状</button><button id="duplicateObject" type="button">复制对象</button><button id="deleteObject" type="button">删除对象</button><button id="replaceImage" type="button">替换图片</button><button id="editTable" type="button">编辑表格</button><button id="editChart" type="button">编辑图表</button><button id="addPage" type="button">新增页</button><button id="duplicatePage" type="button">复制页</button><button id="deletePage" type="button">删除页</button><button id="pageUp" type="button">页面前移</button><button id="pageDown" type="button">页面后移</button><button id="alignLeft" type="button">左对齐</button><button id="alignTop" type="button">顶对齐</button><button id="distribute" type="button">水平分布</button><button id="back" type="button">置底</button><button id="front" type="button">置顶</button><label>文字色 <input id="color" type="color" value="#111827"></label><label>填充 <input id="fill" type="color" value="#ffffff"></label><label>描边 <input id="stroke" type="color" value="#94a3b8"></label><label>透明度 <input id="opacity" type="number" min="0" max="1" step="0.05" value="1"></label><label>字号 <input id="size" type="number" min="6" max="200" value="16"></label><label>字体 <input id="family" type="text" maxlength="120" value="Arial"></label><label>字重 <select id="weight"><option value="normal">常规</option><option value="bold">粗体</option></select></label><label>对齐 <select id="align"><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></label><button id="style" type="button">应用样式</button><label>旋转 <input id="rotate" type="number" min="-360" max="360" value="0"></label><button id="download" type="button" aria-keyshortcuts="Control+S Meta+S">下载校验补丁</button>${sessionEndpoint ? '<button id="finalize" type="button" aria-keyshortcuts="Control+S Meta+S">保存新版本并导出</button>' : ""}<span>${sessionEndpoint ? "输出目录由本地会话预先锁定，浏览器不能修改路径。" : "使用 common-tools ppt edit-session 可在浏览器中直接保存新版本并导出。"}</span></header>${rendered}<script id="ir-model" type="application/json" nonce="${nonce}">${embeddedJson(model)}</script><script nonce="${nonce}">${script}</script></body></html>`;
}

module.exports = { MAX_IR_BYTES, MAX_OPERATIONS, MAX_PATCH_BYTES, applyAndExportIrArtifacts, applyIrEditorPatch, createIrPreviewHtml, exportEditedIrArtifacts, materializeEditedIr, persistIrEditorPatch, validateEditableIr };
