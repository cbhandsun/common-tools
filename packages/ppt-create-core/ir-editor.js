"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");
const { createPrintableHtml, deckIrFingerprint } = require("./export");

const MAX_IR_BYTES = 4 * 1024 * 1024;
const MAX_PATCH_BYTES = 256 * 1024;
const MAX_OPERATIONS = 500;
const COLLECTIONS = Object.freeze(["textBoxes", "shapes", "images", "tables", "charts", "icons"]);
const REVISION_PATTERN = /^[a-f0-9]{64}$/u;

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
    throw new TypeError(`editable IR operation ${index + 1} is unsupported`);
  });
  validateEditableIr(ir);
  return Object.freeze({ ir, revision: deckIrFingerprint(ir), operationCount: patch.operations.length });
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
function embeddedJson(value) { return JSON.stringify(value).replace(/[<>&]/gu, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" })[character]); }
function createIrPreviewHtml(rawIr, options = {}) {
  const ir = validateEditableIr(rawIr); const revision = deckIrFingerprint(ir);
  const rendered = createPrintableHtml(ir, options).match(/<body[^>]*>([\s\S]*)<\/body>/u)?.[1] || "";
  const model = { version: "1.0", revision, pages: ir.pages.map((page) => ({ pageIndex: page.pageIndex, textBoxes: page.textBoxes || [] })) };
  const script = `"use strict";const model=JSON.parse(document.getElementById("ir-model").textContent);const operations=[];for(const node of document.querySelectorAll(".text")){node.contentEditable="plaintext-only";node.title="双击并编辑文本";node.addEventListener("blur",()=>{const pageIndex=Number(node.closest(".slide").dataset.pageIndex);operations.push({type:"set-text",pageIndex,objectId:node.dataset.objectId,value:node.textContent});document.getElementById("count").textContent=operations.length+" 项待保存变更";});}document.getElementById("download").addEventListener("click",()=>{const body=JSON.stringify({version:"1.0",expectedRevision:model.revision,operations},null,2)+"\\n";const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([body],{type:"application/json"}));link.download="deck-edit.patch.json";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);});`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="common-tools-deck-ir-sha256" content="${revision}"><meta name="common-tools-page-count" content="${ir.pages.length}"><title>Editable deck preview</title><style>*{box-sizing:border-box}body{margin:0;background:#0b1220;font-family:Arial,"Microsoft YaHei",sans-serif}.toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:16px;padding:12px 20px;background:#111c2eee;color:#e5edf7}.toolbar button{border:0;border-radius:7px;padding:8px 12px;background:#38bdf8;color:#082033;cursor:pointer}.toolbar span{font-size:13px;color:#a8bad0}.slide{position:relative;width:960px;height:540px;margin:24px auto;overflow:hidden;background:#fff;box-shadow:0 18px 50px #0008}.shape,.image,.text,.native,.chart{position:absolute}.image{display:block}.text{white-space:pre-wrap;overflow:hidden;line-height:1.15}.text[contenteditable]:focus{outline:2px solid #38bdf8;background:#e0f2fe22}.native{border-collapse:collapse;background:#fff}.native td{border:1px solid #94a3b8;padding:6px}.chart{padding:18px;border:1px solid #94a3b8;background:#fff}</style></head><body><header class="toolbar"><strong>图片转 PPT · 可编辑预览</strong><span id="count">0 项待保存变更</span><button id="download" type="button">下载校验补丁</button><span>保存：common-tools editable apply-edit</span></header>${rendered}<script id="ir-model" type="application/json">${embeddedJson(model)}</script><script>${script}</script></body></html>`;
}

module.exports = { MAX_IR_BYTES, MAX_OPERATIONS, MAX_PATCH_BYTES, applyIrEditorPatch, createIrPreviewHtml, persistIrEditorPatch, validateEditableIr };
