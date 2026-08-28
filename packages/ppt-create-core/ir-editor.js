"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");
const { createPrintableHtml, deckIrFingerprint, inspectHtml, inspectPdf, inspectPptx } = require("./export");
const { inspectImageAsset } = require("./assets");
const { createIrEditorClientSource } = require("./ir-editor-client");
const { applyObjectLifecycleOperation } = require("./ir-lifecycle");
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
    for (const collection of COLLECTIONS) {
      if (page[collection] !== undefined && !Array.isArray(page[collection])) throw new TypeError(`editable Deck IR ${collection} is invalid`);
      for (const item of page[collection] || []) {
        if (!plainObject(item) || typeof item.id !== "string" || !item.id || item.id.length > 256 || ids.has(`${pageIndex}\0${item.id}`)) throw new TypeError("editable Deck IR object id is invalid");
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
  const file = insideRoot(workspaceRoot, value); const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum || path.extname(file).toLowerCase() !== ".json") throw new Error(`${label} is invalid`);
  return file;
}
function checkedNewOutput(workspaceRoot, value) {
  const file = insideRoot(workspaceRoot, value);
  if (path.extname(file).toLowerCase() !== ".json" || fs.existsSync(file)) throw new Error("editable IR output must be a new JSON file");
  if (!fs.existsSync(path.dirname(file)) || !fs.statSync(path.dirname(file)).isDirectory()) throw new Error("editable IR output parent is unavailable");
  return file;
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
    const sourceFile = insideRoot(workspaceRoot, path.isAbsolute(image.assetPath) ? image.assetPath : path.resolve(path.dirname(inputFile), image.assetPath));
    const info = inspectImageAsset(sourceFile); const extension = path.extname(sourceFile).toLowerCase(); const name = `${info.sha256}${extension}`;
    if (!assets.has(name)) assets.set(name, sourceFile); image.assetPath = `assets/${name}`;
  }
  if (assets.size) { const directory = path.join(outputRoot, "assets"); fs.mkdirSync(directory); for (const [name, sourceFile] of assets) fs.copyFileSync(sourceFile, path.join(directory, name), fs.constants.COPYFILE_EXCL); }
  return ir;
}
function exportEditedIrArtifacts({ workspaceRoot, input, output, template, buildPptx, buildPdf }) {
  if (typeof buildPptx !== "function" || typeof buildPdf !== "function") throw new TypeError("editable IR export requires PPTX and PDF adapters");
  const inputFile = checkedInput(workspaceRoot, input, MAX_IR_BYTES, "editable IR input"); const outputRoot = insideRoot(workspaceRoot, output);
  if (fs.existsSync(outputRoot) || outputRoot === path.resolve(workspaceRoot)) throw new Error("editable IR export output must be a new child directory");
  const parent = insideRoot(workspaceRoot, path.dirname(outputRoot)); if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw new Error("editable IR export output parent is unavailable");
  let templateFile;
  if (template !== undefined) { templateFile = insideRoot(workspaceRoot, template); if (path.extname(templateFile).toLowerCase() !== ".pptx") throw new Error("editable IR export template must be PPTX"); inspectTemplate(templateFile); }
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
  const temporary = insideRoot(workspaceRoot, path.join(workspaceRoot, `.common-tools-ir-edit-${crypto.randomUUID()}.json`));
  try {
    const applied = persistIrEditorPatch({ workspaceRoot, input, patch, output: temporary });
    const exported = exportEditedIrArtifacts({ workspaceRoot, input: temporary, output, template, buildPptx, buildPdf });
    return Object.freeze({ output: exported.output, operationCount: applied.operationCount, revision: applied.revision, files: exported.files, report: exported.report });
  } finally { fs.rmSync(temporary, { force: true }); }
}
function embeddedJson(value) { return JSON.stringify(value).replace(/[<>&]/gu, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" })[character]); }
function createIrPreviewHtml(rawIr, options = {}) {
  const ir = validateEditableIr(rawIr); const revision = deckIrFingerprint(ir);
  const rendered = createPrintableHtml(ir, options).match(/<body[^>]*>([\s\S]*)<\/body>/u)?.[1] || "";
  const model = { version: "1.0", revision, slideSize: ir.slideSize, pages: ir.pages.map((page) => ({ pageIndex: page.pageIndex, objects: COLLECTIONS.flatMap((collection) => (page[collection] || []).map((item, index) => ({ id: item.id, collection, index, type: item.type, assetPath: item.assetPath, box: item.box, rotation: item.rotation || 0, font: item.font || {}, style: item.style || {}, text: item.text }))) })) };
  const nonce = crypto.randomBytes(18).toString("base64");
  const script = createIrEditorClientSource({ maxOperations: MAX_OPERATIONS, maxPatchBytes: MAX_PATCH_BYTES });
  const policy = `default-src 'none'; img-src 'self' data: blob:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="common-tools-deck-ir-sha256" content="${revision}"><meta name="common-tools-page-count" content="${ir.pages.length}"><title>Editable deck preview</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#0b1220;font-family:Arial,"Microsoft YaHei",sans-serif}.toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:8px;padding:10px 16px;background:#111c2ef5;color:#e5edf7;flex-wrap:wrap}.toolbar button,.toolbar input,.toolbar select{border:0;border-radius:6px;padding:7px 10px}.toolbar button{background:#38bdf8;color:#082033;cursor:pointer}.toolbar button:disabled{opacity:.35}.toolbar input[type=color]{width:42px;height:32px;padding:3px}.toolbar input[type=number]{width:70px}.toolbar input[type=text]{width:110px}.toolbar span,.toolbar label{font-size:12px;color:#a8bad0}.slide{position:relative;width:960px;height:540px;margin:24px auto;overflow:hidden;background:#fff;box-shadow:0 18px 50px #0008;background-image:linear-gradient(#94a3b822 1px,transparent 1px),linear-gradient(90deg,#94a3b822 1px,transparent 1px);background-size:4px 4px}.shape,.image,.text,.native,.chart{position:absolute;touch-action:none}.selected-object{outline:2px solid #38bdf8!important;outline-offset:2px}.resize-handle{display:none;position:absolute;width:12px;height:12px;border:2px solid #fff;background:#0284c7;cursor:nwse-resize;z-index:999}.resize-handle.active{display:block}.image{display:block}.text{white-space:pre-wrap;overflow:hidden;line-height:1.15}.text[contenteditable]:focus{outline:2px solid #38bdf8;background:#e0f2fe22}.native{border-collapse:collapse;background:#fff}.native td{border:1px solid #94a3b8;padding:6px}.chart{padding:18px;border:1px solid #94a3b8;background:#fff}</style></head><body><header class="toolbar"><strong>图片转 PPT · 可编辑预览</strong><span id="selection">第 1 页</span><span id="count">0 项待保存变更</span><button id="undo" type="button">撤销</button><button id="redo" type="button">重做</button><button id="addText" type="button">新增文字</button><button id="addShape" type="button">新增形状</button><button id="duplicateObject" type="button">复制对象</button><button id="deleteObject" type="button">删除对象</button><button id="replaceImage" type="button">替换图片</button><button id="addPage" type="button">新增页</button><button id="duplicatePage" type="button">复制页</button><button id="deletePage" type="button">删除页</button><button id="pageUp" type="button">页面前移</button><button id="pageDown" type="button">页面后移</button><button id="alignLeft" type="button">左对齐</button><button id="alignTop" type="button">顶对齐</button><button id="distribute" type="button">水平分布</button><button id="back" type="button">置底</button><button id="front" type="button">置顶</button><label>文字色 <input id="color" type="color" value="#111827"></label><label>填充 <input id="fill" type="color" value="#ffffff"></label><label>描边 <input id="stroke" type="color" value="#94a3b8"></label><label>透明度 <input id="opacity" type="number" min="0" max="1" step="0.05" value="1"></label><label>字号 <input id="size" type="number" min="6" max="200" value="16"></label><label>字体 <input id="family" type="text" maxlength="120" value="Arial"></label><label>字重 <select id="weight"><option value="normal">常规</option><option value="bold">粗体</option></select></label><label>对齐 <select id="align"><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></label><button id="style" type="button">应用样式</button><label>旋转 <input id="rotate" type="number" min="-360" max="360" value="0"></label><button id="download" type="button">下载校验补丁</button><span>推荐一步完成：common-tools ppt finalize-ir-edit；也可分步使用 common-tools ppt apply-ir-edit 与 common-tools ppt export-ir。图片路径必须位于工作区。</span></header>${rendered}<script id="ir-model" type="application/json" nonce="${nonce}">${embeddedJson(model)}</script><script nonce="${nonce}">${script}</script></body></html>`;
}

module.exports = { MAX_IR_BYTES, MAX_OPERATIONS, MAX_PATCH_BYTES, applyAndExportIrArtifacts, applyIrEditorPatch, createIrPreviewHtml, exportEditedIrArtifacts, materializeEditedIr, persistIrEditorPatch, validateEditableIr };
