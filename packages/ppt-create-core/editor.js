"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");
const { createDeckIr } = require("./layout");
const { MAX_SPEC_BYTES, parsePresentationSpec, validatePresentationSpec } = require("./spec");

const MAX_PATCH_BYTES = 256 * 1024;
const MAX_OPERATIONS = 500;
const REVISION_PATTERN = /^[a-f0-9]{64}$/u;

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, allowed, label) {
  if (!plainObject(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(`${label} is invalid`);
}
function revisionFor(spec) { return crypto.createHash("sha256").update(JSON.stringify(spec)).digest("hex"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function createEditorModel(rawSpec, suppliedIr) {
  const spec = validatePresentationSpec(rawSpec); const ir = suppliedIr || createDeckIr(spec);
  if (!ir || !Array.isArray(ir.pages) || ir.pages.length !== spec.slides.length) throw new TypeError("editor Deck IR is invalid");
  return Object.freeze({ version: "1.0", revision: revisionFor(spec), spec, ir });
}
function slideById(spec, slideId) {
  if (typeof slideId !== "string") throw new TypeError("editor slide id is invalid");
  const index = spec.slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) throw new TypeError("editor slide id is invalid");
  return { slide: spec.slides[index], index };
}
function applyOperation(spec, operation, index) {
  if (!plainObject(operation) || typeof operation.type !== "string") throw new TypeError(`editor operation ${index + 1} is invalid`);
  if (operation.type === "set-slide-text") {
    exactKeys(operation, ["type", "slideId", "field", "value"], `editor operation ${index + 1}`);
    if (!["title", "summary"].includes(operation.field) || typeof operation.value !== "string") throw new TypeError(`editor operation ${index + 1} is invalid`);
    const target = slideById(spec, operation.slideId).slide;
    if (operation.field === "summary" && operation.value.trim() === "") delete target.summary;
    else target[operation.field] = operation.value;
    return;
  }
  if (operation.type === "select-layout") {
    exactKeys(operation, ["type", "slideId", "layout"], `editor operation ${index + 1}`);
    if (operation.layout !== null && typeof operation.layout !== "string") throw new TypeError(`editor operation ${index + 1} is invalid`);
    const target = slideById(spec, operation.slideId).slide;
    if (operation.layout === null) delete target.layout; else target.layout = operation.layout;
    return;
  }
  if (operation.type === "move-slide") {
    exactKeys(operation, ["type", "slideId", "toIndex"], `editor operation ${index + 1}`);
    if (!Number.isSafeInteger(operation.toIndex) || operation.toIndex < 0 || operation.toIndex >= spec.slides.length) throw new TypeError(`editor operation ${index + 1} is invalid`);
    const target = slideById(spec, operation.slideId); const [slide] = spec.slides.splice(target.index, 1); spec.slides.splice(operation.toIndex, 0, slide);
    return;
  }
  throw new TypeError(`editor operation ${index + 1} is unsupported`);
}
function applyEditorPatch(rawSpec, patch) {
  const normalized = validatePresentationSpec(rawSpec); exactKeys(patch, ["version", "expectedRevision", "operations"], "editor patch");
  if (patch.version !== "1.0" || !REVISION_PATTERN.test(patch.expectedRevision || "") || patch.expectedRevision !== revisionFor(normalized)) throw new Error("editor patch revision does not match the presentation");
  if (!Array.isArray(patch.operations) || patch.operations.length < 1 || patch.operations.length > MAX_OPERATIONS) throw new TypeError("editor patch operations are invalid");
  const draft = clone(normalized); patch.operations.forEach((operation, index) => applyOperation(draft, operation, index));
  const spec = validatePresentationSpec(draft); return Object.freeze({ spec, revision: revisionFor(spec), operationCount: patch.operations.length });
}
function parseEditorPatch(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > MAX_PATCH_BYTES) throw new TypeError("editor patch file size is invalid");
  let parsed; try { parsed = JSON.parse(buffer.toString("utf8")); } catch { throw new TypeError("editor patch is invalid JSON"); }
  return parsed;
}
function checkedInput(workspaceRoot, value, extension, maximum, label) {
  const file = insideRoot(workspaceRoot, value); const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum || path.extname(file).toLowerCase() !== extension) throw new Error(`${label} is invalid`);
  return file;
}
function checkedOutput(workspaceRoot, value, extension, label) {
  const file = insideRoot(workspaceRoot, value); if (path.extname(file).toLowerCase() !== extension || fs.existsSync(file)) throw new Error(`${label} must be a new ${extension} file`);
  const parent = insideRoot(workspaceRoot, path.dirname(file)); if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw new Error(`${label} parent is unavailable`);
  return file;
}
function atomicWriteNew(file, body) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try { fs.writeFileSync(temporary, body, { flag: "wx", mode: 0o600 }); fs.linkSync(temporary, file); fs.rmSync(temporary, { force: true }); }
  catch (error) { try { fs.rmSync(temporary, { force: true }); } catch { /* retain original error */ } throw error; }
}
function persistEditorPatch({ workspaceRoot, input, patch, output }) {
  const inputFile = checkedInput(workspaceRoot, input, ".json", MAX_SPEC_BYTES, "editor input");
  const patchFile = checkedInput(workspaceRoot, patch, ".json", MAX_PATCH_BYTES, "editor patch");
  const outputFile = checkedOutput(workspaceRoot, output, ".json", "editor output");
  if (inputFile === outputFile || patchFile === outputFile) throw new Error("editor output must not overwrite an input");
  const spec = parsePresentationSpec(fs.readFileSync(inputFile)); const result = applyEditorPatch(spec, parseEditorPatch(fs.readFileSync(patchFile)));
  atomicWriteNew(outputFile, `${JSON.stringify(result.spec, null, 2)}\n`);
  return Object.freeze({ output: outputFile, revision: result.revision, operationCount: result.operationCount, pageCount: result.spec.slides.length });
}
function embeddedJson(value) { return JSON.stringify(value).replace(/[<>&]/gu, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" })[character]); }
function editorScript() {
  return `"use strict";
const model=JSON.parse(document.getElementById("editor-model").textContent);let draft=structuredClone(model.spec);let operations=[];let selected=draft.slides[0].id;
const byId=(id)=>draft.slides.find((slide)=>slide.id===id);const pageById=(id)=>model.ir.pages.find((page)=>page.intent.id===id);const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
function record(operation){operations.push(operation);localStorage.setItem("common-tools:ppt-create:"+model.revision,JSON.stringify({version:"1.0",expectedRevision:model.revision,operations}));render();}
function applyLocal(operation){const slide=byId(operation.slideId);if(operation.type==="set-slide-text"){if(operation.field==="summary"&&!operation.value.trim())delete slide.summary;else slide[operation.field]=operation.value;}if(operation.type==="select-layout"){if(operation.layout===null)delete slide.layout;else slide.layout=operation.layout;}if(operation.type==="move-slide"){const from=draft.slides.findIndex((item)=>item.id===operation.slideId);const moved=draft.slides.splice(from,1)[0];draft.slides.splice(operation.toIndex,0,moved);}}
function run(operation){applyLocal(operation);record(operation);}function field(label,value,onchange){const wrap=el("label","field");wrap.append(el("span","field-label",label));const input=el("input");input.value=value||"";input.addEventListener("change",()=>onchange(input.value));wrap.append(input);return wrap;}
function preview(page,slide){const canvas=el("div","slide-canvas");canvas.style.background=page.background&&page.background.fill||"#fff";for(const shape of page.shapes||[]){const node=el("div","shape");node.style.left=shape.box.x/2+"px";node.style.top=shape.box.y/2+"px";node.style.width=shape.box.w/2+"px";node.style.height=Math.max(1,shape.box.h/2)+"px";node.style.background=shape.style.fill==="none"?"transparent":shape.style.fill||"transparent";node.style.borderColor=shape.style.stroke||"transparent";node.style.borderRadius=shape.type==="ellipse"?"50%":shape.type==="roundRect"?"8px":"0";canvas.append(node);}for(const image of page.images||[]){const node=el("img","preview-image");node.src=image.assetPath;node.alt=image.alt||"";node.style.left=image.box.x/2+"px";node.style.top=image.box.y/2+"px";node.style.width=image.box.w/2+"px";node.style.height=image.box.h/2+"px";node.style.objectFit=image.style&&image.style.fit||"cover";canvas.append(node);}for(const item of page.textBoxes||[]){const node=el("div","text",item.role==="title"?slide.title:item.role==="summary"?(slide.summary||""):item.text);node.style.left=item.box.x/2+"px";node.style.top=item.box.y/2+"px";node.style.width=item.box.w/2+"px";node.style.height=item.box.h/2+"px";node.style.color=item.font.color;node.style.fontSize=Math.max(8,item.font.sizePt/2)+"px";node.style.fontWeight=item.font.weight||"normal";node.style.textAlign=item.font.align||"left";canvas.append(node);}for(const table of page.tables||[]){const tableNode=el("table","preview-table");tableNode.style.left=table.box.x/2+"px";tableNode.style.top=table.box.y/2+"px";tableNode.style.width=table.box.w/2+"px";tableNode.style.height=table.box.h/2+"px";for(const row of table.rows){const tr=el("tr");for(const cell of row)tr.append(el("td","",cell));tableNode.append(tr);}canvas.append(tableNode);}for(const chart of page.charts||[]){const chartNode=el("div","preview-chart");chartNode.style.left=chart.box.x/2+"px";chartNode.style.top=chart.box.y/2+"px";chartNode.style.width=chart.box.w/2+"px";chartNode.style.height=chart.box.h/2+"px";const values=chart.series&&chart.series[0]?chart.series[0].values:[];const max=Math.max(1,...values.map(Math.abs));values.forEach((value,index)=>{const bar=el("div","bar",chart.categories[index]);bar.style.height=Math.max(4,Math.abs(value)/max*80)+"%";chartNode.append(bar);});canvas.append(chartNode);}return canvas;}
function render(){const list=document.getElementById("slides");list.replaceChildren();draft.slides.forEach((slide,index)=>{const card=el("button",slide.id===selected?"thumb selected":"thumb");card.type="button";card.append(el("span","thumb-number",String(index+1).padStart(2,"0")),el("span","thumb-title",slide.title));card.addEventListener("click",()=>{selected=slide.id;render();});list.append(card);});const slide=byId(selected);const page=pageById(selected);const stage=document.getElementById("stage");stage.replaceChildren(preview(page,slide));const form=document.getElementById("fields");form.replaceChildren();form.append(field("标题",slide.title,(value)=>run({type:"set-slide-text",slideId:slide.id,field:"title",value})),field("摘要",slide.summary||"",(value)=>run({type:"set-slide-text",slideId:slide.id,field:"summary",value})));const select=el("select");for(const id of page.intent.candidateLayoutIds){const option=el("option","",id);option.value=id;option.selected=(slide.layout||page.intent.layoutId)===id;select.append(option);}select.addEventListener("change",()=>run({type:"select-layout",slideId:slide.id,layout:select.value}));const layoutField=el("label","field");layoutField.append(el("span","field-label","候选版式"),select);form.append(layoutField);const index=draft.slides.findIndex((item)=>item.id===slide.id);const controls=el("div","move-controls");for(const [label,delta] of [["上移",-1],["下移",1]]){const button=el("button","secondary",label);button.type="button";const next=index+delta;button.disabled=next<0||next>=draft.slides.length||slide.role==="cover"||slide.role==="closing"||draft.slides[next].role==="cover"||draft.slides[next].role==="closing";button.addEventListener("click",()=>run({type:"move-slide",slideId:slide.id,toIndex:next}));controls.append(button);}form.append(controls);document.getElementById("changes").textContent=operations.length+" 项待保存变更";}
function download(name,value){const blob=new Blob([JSON.stringify(value,null,2)+"\\n"],{type:"application/json"});const link=el("a");link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}document.getElementById("download-patch").addEventListener("click",()=>download("presentation-edit.patch.json",{version:"1.0",expectedRevision:model.revision,operations}));document.getElementById("download-spec").addEventListener("click",()=>download("presentation.edited.json",draft));
try{const saved=JSON.parse(localStorage.getItem("common-tools:ppt-create:"+model.revision)||"null");if(saved&&saved.expectedRevision===model.revision&&Array.isArray(saved.operations)){for(const operation of saved.operations)applyLocal(operation);operations=saved.operations;}}catch{}render();`;
}
function createPreviewHtml(rawSpec, suppliedIr) {
  const model = createEditorModel(rawSpec, suppliedIr);
  const css = `*{box-sizing:border-box}body{margin:0;background:#0b1220;color:#e5edf7;font-family:Inter,"Microsoft YaHei",sans-serif}.app{display:grid;grid-template-columns:240px 1fr 300px;height:100vh}.sidebar,.inspector{padding:18px;background:#111c2e;overflow:auto}.sidebar{border-right:1px solid #26364d}.inspector{border-left:1px solid #26364d}.brand{font-size:18px;font-weight:700;margin-bottom:16px}.hint{font-size:12px;color:#9fb0c7;line-height:1.5}.thumb{width:100%;display:flex;gap:10px;text-align:left;border:1px solid #31445f;background:#18263a;color:#dce7f5;border-radius:9px;padding:10px;margin:8px 0;cursor:pointer}.thumb.selected{border-color:#38bdf8;background:#123653}.thumb-number{font:700 11px Arial;color:#7dd3fc}.thumb-title{font-size:13px}.workspace{display:grid;place-items:center;padding:24px;overflow:auto}.slide-canvas{position:relative;width:480px;height:270px;box-shadow:0 20px 60px #0008;overflow:hidden}.shape,.preview-image,.text,.preview-table,.preview-chart{position:absolute}.preview-image{display:block}.shape{border:1px solid}.text{overflow:hidden;white-space:pre-wrap;line-height:1.18}.preview-table{border-collapse:collapse;font-size:7px;color:#111;background:#fff}.preview-table td{border:1px solid #9ca3af;padding:2px}.preview-chart{display:flex;align-items:end;gap:6px;padding:16px 12px 18px;background:#fff3}.bar{flex:1;min-height:4px;background:#38bdf8;color:#dce7f5;font-size:7px;text-align:center}.field{display:block;margin:14px 0}.field-label{display:block;color:#9fb0c7;font-size:12px;margin-bottom:6px}input,select{width:100%;border:1px solid #3a4c66;border-radius:7px;padding:9px;background:#0e1928;color:#fff}button{font:inherit}.actions,.move-controls{display:flex;gap:8px;flex-wrap:wrap}.primary,.secondary{border:0;border-radius:7px;padding:9px 12px;cursor:pointer}.primary{background:#38bdf8;color:#082033}.secondary{background:#263a55;color:#e5edf7}.secondary:disabled{opacity:.35}.status{margin:14px 0;color:#86efac;font-size:12px}@media(max-width:980px){.app{grid-template-columns:180px 1fr}.inspector{grid-column:1/-1;border-left:0;border-top:1px solid #26364d}.slide-canvas{transform-origin:center;transform:scale(.82)}}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Common Tools PPT Editor</title><style>${css}</style></head><body><main class="app"><aside class="sidebar"><div class="brand">PPT Preview Editor</div><p class="hint">项目自有预览与补丁编辑器。浏览器草稿保存在本机；持久化需用 CLI 校验补丁。</p><div id="slides"></div></aside><section class="workspace"><div id="stage"></div></section><aside class="inspector"><div class="brand">编辑当前页</div><div id="fields"></div><div id="changes" class="status"></div><div class="actions"><button id="download-patch" class="primary" type="button">下载校验补丁</button><button id="download-spec" class="secondary" type="button">下载草稿</button></div><p class="hint">正式保存：common-tools ppt apply-edit --input 原稿.json --patch 补丁.json --out 新稿.json</p></aside></main><script id="editor-model" type="application/json">${embeddedJson(model)}</script><script>${editorScript()}</script></body></html>`;
}
function writeEditorPreview({ workspaceRoot, input, output }) {
  const inputFile = checkedInput(workspaceRoot, input, ".json", MAX_SPEC_BYTES, "editor input"); const outputFile = checkedOutput(workspaceRoot, output, ".html", "editor preview output");
  const spec = parsePresentationSpec(fs.readFileSync(inputFile)); const model = createEditorModel(spec); atomicWriteNew(outputFile, createPreviewHtml(model.spec, model.ir));
  return Object.freeze({ output: outputFile, revision: model.revision, pageCount: model.spec.slides.length });
}

module.exports = { MAX_OPERATIONS, MAX_PATCH_BYTES, applyEditorPatch, createEditorModel, createPreviewHtml, parseEditorPatch, persistEditorPatch, revisionFor, writeEditorPreview };
