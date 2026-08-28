"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");
const { createPrintableHtml, deckIrFingerprint, inspectHtml, inspectPdf, inspectPptx } = require("./export");
const { inspectImageAsset } = require("./assets");
const { applyObjectLifecycleOperation } = require("./ir-lifecycle");
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
  return Object.freeze({ ir, revision: deckIrFingerprint(ir), operationCount: patch.operations.length, checks: Object.freeze([{ name: "ir-batch-style-validated", passed: true }, { name: "ir-object-lifecycle-validated", passed: true }, { name: "ir-revision-bound", passed: true }]) });
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
function embeddedJson(value) { return JSON.stringify(value).replace(/[<>&]/gu, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" })[character]); }
function createIrPreviewHtml(rawIr, options = {}) {
  const ir = validateEditableIr(rawIr); const revision = deckIrFingerprint(ir);
  const rendered = createPrintableHtml(ir, options).match(/<body[^>]*>([\s\S]*)<\/body>/u)?.[1] || "";
  const model = { version: "1.0", revision, slideSize: ir.slideSize, pages: ir.pages.map((page) => ({ pageIndex: page.pageIndex, objects: COLLECTIONS.flatMap((collection) => (page[collection] || []).map((item, index) => ({ id: item.id, collection, index, box: item.box, rotation: item.rotation || 0, font: item.font || {}, style: item.style || {}, text: item.text }))) })) };
  const nonce = crypto.randomBytes(18).toString("base64");
  const script = `"use strict";
const model=JSON.parse(document.getElementById("ir-model").textContent),history=[],future=[],selected=new Set();
const nodes=()=>[...document.querySelectorAll("[data-object-id]")],byId=id=>nodes().find(node=>node.dataset.objectId===id),source=(page,id)=>model.pages[page].objects.find(item=>item.id===id),snap=value=>Math.round(value/4)*4;
function syncHandle(node){const handle=node._resizeHandle;if(!handle)return;handle.style.left="calc("+node.style.left+" + "+node.style.width+" - 6px)";handle.style.top="calc("+node.style.top+" + "+node.style.height+" - 6px)"}
function pageOf(node){return Number(node.closest(".slide").dataset.pageIndex)}
function refresh(){const total=history.flatMap(item=>item.operations).length;document.getElementById("count").textContent=total+" 项待保存变更";document.getElementById("selection").textContent=selected.size?selected.size+" 个对象":"未选择";document.getElementById("undo").disabled=!history.length;document.getElementById("redo").disabled=!future.length}
function apply(operation){const node=byId(operation.objectId);if(!node)return;const page=operation.pageIndex===undefined?pageOf(node):operation.pageIndex,state=source(page,operation.objectId);
if(operation.type==="set-box"){const box=operation.box;Object.assign(state,{box:{...box}});node.style.left=box.x/model.slideSize.widthPt*100+"%";node.style.top=box.y/model.slideSize.heightPt*100+"%";node.style.width=box.w/model.slideSize.widthPt*100+"%";node.style.height=box.h/model.slideSize.heightPt*100+"%";syncHandle(node)}
else if(operation.type==="set-text"){state.text=operation.value;node.textContent=operation.value}
else if(operation.type==="set-rotation"){state.rotation=operation.rotation;node.style.transform="rotate("+operation.rotation+"deg)"}
else if(operation.type==="set-style"||operation.type==="batch-style"){for(const id of operation.objectIds||[operation.objectId]){const target=byId(id),targetState=source(page,id),style=operation.style;if(!target)continue;targetState.font={...targetState.font,...style};targetState.style={...targetState.style,...style};if(style.fill!==undefined)target.style.background=style.fill==="none"?"transparent":style.fill;if(style.stroke!==undefined)target.style.borderColor=style.stroke==="none"?"transparent":style.stroke;if(style.color!==undefined)target.style.color=style.color;if(style.opacity!==undefined)target.style.opacity=style.opacity;if(style.sizePt!==undefined)target.style.fontSize=style.sizePt+"pt";if(style.weight!==undefined)target.style.fontWeight=style.weight==="bold"?"700":"400";if(style.align!==undefined)target.style.textAlign=style.align;if(style.family!==undefined)target.style.fontFamily=style.family}}
else if(operation.type==="reorder-object"){operation.toIndex===0?node.parentNode.prepend(node):node.parentNode.append(node)}}
function record(operations,inverses){operations.forEach(apply);history.push({operations,inverses});future.length=0;refresh()}
function clearSelection(){selected.clear();document.querySelectorAll(".selected-object").forEach(node=>node.classList.remove("selected-object"));document.querySelectorAll(".resize-handle").forEach(node=>node.classList.remove("active"));refresh()}
function select(node,add){if(!add)clearSelection();if(add&&selected.has(node.dataset.objectId)){selected.delete(node.dataset.objectId);node.classList.remove("selected-object");node._resizeHandle?.classList.remove("active")}else{selected.add(node.dataset.objectId);node.classList.add("selected-object");node._resizeHandle?.classList.add("active")}refresh()}
function entries(){return [...selected].map(id=>{const node=byId(id),pageIndex=pageOf(node);return{node,pageIndex,item:source(pageIndex,id)}})}
for(const slide of document.querySelectorAll(".slide"))slide.addEventListener("click",clearSelection);
for(const node of nodes()){node.tabIndex=0;node.addEventListener("click",event=>{event.stopPropagation();select(node,event.ctrlKey||event.metaKey||event.shiftKey)});
node.addEventListener("pointerdown",event=>{if(event.target.classList.contains("resize-handle")||(node.classList.contains("text")&&event.detail>1))return;event.preventDefault();if(!selected.has(node.dataset.objectId))select(node,false);const slide=node.closest(".slide"),pageIndex=pageOf(node),starts=entries().filter(entry=>entry.pageIndex===pageIndex).map(entry=>({id:entry.item.id,box:{...entry.item.box}}));
const move=current=>{const dx=(current.clientX-event.clientX)*model.slideSize.widthPt/slide.clientWidth,dy=(current.clientY-event.clientY)*model.slideSize.heightPt/slide.clientHeight;for(const start of starts){const box={...start.box,x:snap(Math.max(0,Math.min(model.slideSize.widthPt-start.box.w,start.box.x+dx))),y:snap(Math.max(0,Math.min(model.slideSize.heightPt-start.box.h,start.box.y+dy)))};apply({type:"set-box",pageIndex,objectId:start.id,box});byId(start.id).dataset.pendingBox=JSON.stringify(box)}};
node.setPointerCapture(event.pointerId);node.addEventListener("pointermove",move);node.addEventListener("pointerup",()=>{node.removeEventListener("pointermove",move);const operations=[],inverses=[];for(const start of starts){const target=byId(start.id);if(target.dataset.pendingBox){operations.push({type:"set-box",pageIndex,objectId:start.id,box:JSON.parse(target.dataset.pendingBox)});inverses.push({type:"set-box",pageIndex,objectId:start.id,box:start.box});delete target.dataset.pendingBox}}if(operations.length){history.push({operations,inverses});future.length=0;refresh()}},{once:true})});
const handle=document.createElement("span");handle.className="resize-handle";handle.title="拖动缩放";node.closest(".slide").append(handle);node._resizeHandle=handle;syncHandle(node);handle.addEventListener("pointerdown",event=>{event.stopPropagation();event.preventDefault();const pageIndex=pageOf(node),item=source(pageIndex,node.dataset.objectId),old={...item.box},slide=node.closest(".slide");const move=current=>{const box={...old,w:snap(Math.max(8,Math.min(model.slideSize.widthPt-old.x,old.w+(current.clientX-event.clientX)*model.slideSize.widthPt/slide.clientWidth))),h:snap(Math.max(8,Math.min(model.slideSize.heightPt-old.y,old.h+(current.clientY-event.clientY)*model.slideSize.heightPt/slide.clientHeight)))};apply({type:"set-box",pageIndex,objectId:item.id,box});node.dataset.resizeBox=JSON.stringify(box)};handle.setPointerCapture(event.pointerId);handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",()=>{handle.removeEventListener("pointermove",move);if(node.dataset.resizeBox){const box=JSON.parse(node.dataset.resizeBox);history.push({operations:[{type:"set-box",pageIndex,objectId:item.id,box}],inverses:[{type:"set-box",pageIndex,objectId:item.id,box:old}]});future.length=0;delete node.dataset.resizeBox;refresh()}},{once:true})})}
for(const node of document.querySelectorAll(".text")){node.contentEditable="plaintext-only";node.addEventListener("focus",()=>node.dataset.originalText=node.textContent);node.addEventListener("blur",()=>{if(node.textContent===node.dataset.originalText)return;const pageIndex=pageOf(node);record([{type:"set-text",pageIndex,objectId:node.dataset.objectId,value:node.textContent}],[{type:"set-text",pageIndex,objectId:node.dataset.objectId,value:node.dataset.originalText||""}])})}
document.getElementById("undo").addEventListener("click",()=>{const item=history.pop();if(item){[...item.inverses].reverse().forEach(apply);future.push(item);refresh()}});document.getElementById("redo").addEventListener("click",()=>{const item=future.pop();if(item){item.operations.forEach(apply);history.push(item);refresh()}});
for(const [button,axis] of [["alignLeft","x"],["alignTop","y"]])document.getElementById(button).addEventListener("click",()=>{const chosen=entries();if(chosen.length<2||new Set(chosen.map(entry=>entry.pageIndex)).size>1)return;const target=Math.min(...chosen.map(entry=>entry.item.box[axis]));record(chosen.map(entry=>({type:"set-box",pageIndex:entry.pageIndex,objectId:entry.item.id,box:{...entry.item.box,[axis]:target}})),chosen.map(entry=>({type:"set-box",pageIndex:entry.pageIndex,objectId:entry.item.id,box:{...entry.item.box}}))) });
document.getElementById("distribute").addEventListener("click",()=>{const chosen=entries().sort((a,b)=>a.item.box.x-b.item.box.x);if(chosen.length<3||new Set(chosen.map(entry=>entry.pageIndex)).size>1)return;const first=chosen[0].item.box.x,last=chosen.at(-1).item.box.x,step=(last-first)/(chosen.length-1);record(chosen.map((entry,index)=>({type:"set-box",pageIndex:entry.pageIndex,objectId:entry.item.id,box:{...entry.item.box,x:snap(first+step*index)}})),chosen.map(entry=>({type:"set-box",pageIndex:entry.pageIndex,objectId:entry.item.id,box:{...entry.item.box}}))) });
document.getElementById("style").addEventListener("click",()=>{const chosen=entries();if(!chosen.length||new Set(chosen.map(entry=>entry.pageIndex)).size>1)return;const style={color:document.getElementById("color").value,fill:document.getElementById("fill").value,stroke:document.getElementById("stroke").value,opacity:Number(document.getElementById("opacity").value),sizePt:Number(document.getElementById("size").value),family:document.getElementById("family").value,weight:document.getElementById("weight").value,align:document.getElementById("align").value},operation=chosen.length>1?{type:"batch-style",pageIndex:chosen[0].pageIndex,objectIds:chosen.map(entry=>entry.item.id),style}:{type:"set-style",pageIndex:chosen[0].pageIndex,objectId:chosen[0].item.id,style};record([operation],chosen.map(entry=>({type:"set-style",pageIndex:entry.pageIndex,objectId:entry.item.id,style:{color:entry.item.font.color||"#111827",fill:entry.item.style.fill||"none",stroke:entry.item.style.stroke||"none",opacity:entry.item.style.opacity??entry.item.font.opacity??1,sizePt:entry.item.font.sizePt||16,family:entry.item.font.family||"Arial",weight:entry.item.font.weight||"normal",align:entry.item.font.align||"left"}})))});
document.getElementById("rotate").addEventListener("change",event=>{const chosen=entries();if(chosen.length!==1)return;const entry=chosen[0];record([{type:"set-rotation",pageIndex:entry.pageIndex,objectId:entry.item.id,rotation:Number(event.target.value)}],[{type:"set-rotation",pageIndex:entry.pageIndex,objectId:entry.item.id,rotation:entry.item.rotation||0}])});
for(const [button,front] of [["back",false],["front",true]])document.getElementById(button).addEventListener("click",()=>{const chosen=entries();if(chosen.length!==1)return;const entry=chosen[0],collection=model.pages[entry.pageIndex].objects.filter(item=>item.collection===entry.item.collection),target=front?collection.length-1:0;record([{type:"reorder-object",pageIndex:entry.pageIndex,objectId:entry.item.id,toIndex:target}],[{type:"reorder-object",pageIndex:entry.pageIndex,objectId:entry.item.id,toIndex:entry.item.index}])});
document.getElementById("download").addEventListener("click",()=>{const operations=history.flatMap(item=>item.operations),body=JSON.stringify({version:"1.0",expectedRevision:model.revision,operations},null,2)+"\\n";if(!operations.length||operations.length>${MAX_OPERATIONS}||new TextEncoder().encode(body).byteLength>${MAX_PATCH_BYTES}){document.getElementById("count").textContent="补丁为空或超出安全限制";return}const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([body],{type:"application/json"}));link.download="deck-edit.patch.json";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)});refresh();`;
  const policy = `default-src 'none'; img-src 'self' data: blob:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="common-tools-deck-ir-sha256" content="${revision}"><meta name="common-tools-page-count" content="${ir.pages.length}"><title>Editable deck preview</title><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#0b1220;font-family:Arial,"Microsoft YaHei",sans-serif}.toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:8px;padding:10px 16px;background:#111c2ef5;color:#e5edf7;flex-wrap:wrap}.toolbar button,.toolbar input,.toolbar select{border:0;border-radius:6px;padding:7px 10px}.toolbar button{background:#38bdf8;color:#082033;cursor:pointer}.toolbar button:disabled{opacity:.35}.toolbar input[type=color]{width:42px;height:32px;padding:3px}.toolbar input[type=number]{width:70px}.toolbar input[type=text]{width:110px}.toolbar span,.toolbar label{font-size:12px;color:#a8bad0}.slide{position:relative;width:960px;height:540px;margin:24px auto;overflow:hidden;background:#fff;box-shadow:0 18px 50px #0008;background-image:linear-gradient(#94a3b822 1px,transparent 1px),linear-gradient(90deg,#94a3b822 1px,transparent 1px);background-size:4px 4px}.shape,.image,.text,.native,.chart{position:absolute;touch-action:none}.selected-object{outline:2px solid #38bdf8!important;outline-offset:2px}.resize-handle{display:none;position:absolute;width:12px;height:12px;border:2px solid #fff;background:#0284c7;cursor:nwse-resize;z-index:999}.resize-handle.active{display:block}.image{display:block}.text{white-space:pre-wrap;overflow:hidden;line-height:1.15}.text[contenteditable]:focus{outline:2px solid #38bdf8;background:#e0f2fe22}.native{border-collapse:collapse;background:#fff}.native td{border:1px solid #94a3b8;padding:6px}.chart{padding:18px;border:1px solid #94a3b8;background:#fff}</style></head><body><header class="toolbar"><strong>图片转 PPT · 可编辑预览</strong><span id="selection">未选择</span><span id="count">0 项待保存变更</span><button id="undo" type="button">撤销</button><button id="redo" type="button">重做</button><button id="alignLeft" type="button">左对齐</button><button id="alignTop" type="button">顶对齐</button><button id="distribute" type="button">水平分布</button><button id="back" type="button">置底</button><button id="front" type="button">置顶</button><label>文字色 <input id="color" type="color" value="#111827"></label><label>填充 <input id="fill" type="color" value="#ffffff"></label><label>描边 <input id="stroke" type="color" value="#94a3b8"></label><label>透明度 <input id="opacity" type="number" min="0" max="1" step="0.05" value="1"></label><label>字号 <input id="size" type="number" min="6" max="200" value="16"></label><label>字体 <input id="family" type="text" maxlength="120" value="Arial"></label><label>字重 <select id="weight"><option value="normal">常规</option><option value="bold">粗体</option></select></label><label>对齐 <select id="align"><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></label><button id="style" type="button">应用样式</button><label>旋转 <input id="rotate" type="number" min="-360" max="360" value="0"></label><button id="download" type="button">下载校验补丁</button><span>Ctrl/Shift 多选；拖动与缩放吸附 4pt；保存：common-tools ppt apply-ir-edit；导出：common-tools ppt export-ir</span></header>${rendered}<script id="ir-model" type="application/json" nonce="${nonce}">${embeddedJson(model)}</script><script nonce="${nonce}">${script}</script></body></html>`;
}

module.exports = { MAX_IR_BYTES, MAX_OPERATIONS, MAX_PATCH_BYTES, applyIrEditorPatch, createIrPreviewHtml, exportEditedIrArtifacts, materializeEditedIr, persistIrEditorPatch, validateEditableIr };
