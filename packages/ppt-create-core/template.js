"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { extractEntry, inspectPptx, readCentralDirectory } = require("../ppt-quality-core");
const { sourceRecord } = require("./assets");

const MAX_TEMPLATE_BYTES = 100 * 1024 * 1024;
const MAX_RELATIONSHIP_XML_BYTES = 32 * 1024 * 1024;
const MAX_LAYOUT_XML_BYTES = 4 * 1024 * 1024;
const FORBIDDEN_ENTRY = /(?:^|\/)(?:vbaProject\.bin|activeX\/|embeddings\/|customUI\/|_xmlsignatures\/)/iu;
const FORBIDDEN_CONTENT_TYPE = /(?:macroEnabled|vbaProject|activeX|oleObject|digital-signature)/iu;

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function normalizeTemplate(value) {
  if (value === undefined) return undefined;
  if (!plainObject(value) || Object.keys(value).some((key) => !["path", "sha256", "source", "mode"].includes(key))) throw new TypeError("presentation template is invalid");
  if (typeof value.path !== "string" || !value.path.trim() || value.path.length > 512 || value.path.includes("\\") || path.posix.isAbsolute(value.path) || path.posix.normalize(value.path) !== value.path || value.path.startsWith("../") || !/[.]pptx$/iu.test(value.path)) throw new TypeError("presentation template path is invalid");
  if (!/^[a-f0-9]{64}$/u.test(value.sha256 || "")) throw new TypeError("presentation template sha256 is invalid");
  if (value.mode !== undefined && value.mode !== "master-and-theme") throw new TypeError("presentation template mode is invalid");
  const source = sourceRecord(value.source, "presentation template source");
  if (!new Set(["customer-provided", "licensed", "original"]).has(source.kind)) throw new TypeError("presentation template source kind is invalid");
  return Object.freeze({ path: value.path, sha256: value.sha256, source, mode: "master-and-theme" });
}

function inspectTemplate(file) {
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 22 || info.size > MAX_TEMPLATE_BYTES) throw new Error("presentation template is not a bounded regular PPTX file");
  const bytes = fs.readFileSync(file);
  const entries = readCentralDirectory(bytes);
  const names = [...entries.keys()];
  if (names.some((name) => FORBIDDEN_ENTRY.test(name))) throw new Error("presentation template contains executable or embedded package content");
  const contentTypes = extractEntry(bytes, entries.get("[Content_Types].xml")).toString("utf8");
  if (FORBIDDEN_CONTENT_TYPE.test(contentTypes)) throw new Error("presentation template contains a forbidden content type");
  if (!names.some((name) => /^ppt\/slideMasters\/slideMaster[1-9]\d*[.]xml$/u.test(name)) || !names.some((name) => /^ppt\/slideLayouts\/slideLayout[1-9]\d*[.]xml$/u.test(name))) throw new Error("presentation template must contain a slide master and layout");
  let externalRelationships = 0;
  let relationshipXmlBytes = 0;
  for (const entry of entries.values()) {
    if (!entry.name.endsWith(".rels")) continue;
    relationshipXmlBytes += entry.uncompressedBytes;
    if (!Number.isSafeInteger(relationshipXmlBytes) || relationshipXmlBytes > MAX_RELATIONSHIP_XML_BYTES) throw new Error("presentation template relationship XML is too large");
    const xml = extractEntry(bytes, entry).toString("utf8");
    externalRelationships += [...xml.matchAll(/<Relationship\b[^>]*\bTargetMode=(['"])External\1[^>]*>/gu)].length;
  }
  if (externalRelationships > 0) throw new Error("presentation template contains external relationships");
  const layouts = names.filter((name) => /^ppt\/slideLayouts\/slideLayout[1-9]\d*[.]xml$/u.test(name)).sort().map((name) => {
    const entry = entries.get(name);
    if (entry.uncompressedBytes > MAX_LAYOUT_XML_BYTES) throw new Error("presentation template layout XML is too large");
    const xml = extractEntry(bytes, entry).toString("utf8");
    const displayName = /<p:cSld\b[^>]*\bname=(['"])(.*?)\1/u.exec(xml)?.[2] || path.basename(name, ".xml");
    const placeholders = [...xml.matchAll(/<p:ph\b([^>]*)\/?\s*>/gu)].map((match, index) => Object.freeze({ type: /\btype=(['"])(.*?)\1/u.exec(match[1])?.[2] || "body", index: Number(/\bidx=(['"])(\d+)\1/u.exec(match[1])?.[2] || index) })).slice(0, 32);
    const placeholderTypes = placeholders.map((item) => item.type);
    const bodyCapacity = placeholderTypes.filter((type) => ["body", "obj", "subTitle", "chart", "tbl", "pic"].includes(type)).length;
    const roles = new Set();
    if (placeholderTypes.some((type) => ["ctrTitle", "subTitle"].includes(type))) roles.add("cover");
    if (placeholderTypes.includes("title")) roles.add("section");
    if (bodyCapacity >= 1) { roles.add("content"); roles.add("process"); roles.add("metrics"); }
    if (bodyCapacity >= 2) roles.add("comparison");
    if (placeholderTypes.length === 0) { roles.add("content"); roles.add("closing"); }
    return Object.freeze({ id: path.basename(name, ".xml"), name: displayName.slice(0, 160), placeholders: Object.freeze(placeholders), placeholderTypes: Object.freeze(placeholderTypes), bodyCapacity, flexibleCanvas: placeholderTypes.length === 0, roles: Object.freeze([...roles]) });
  });
  const inspected = inspectPptx(file);
  if (inspected.unresolvedRelationshipCount > 0 || inspected.invalidRelationshipCount > 0) throw new Error("presentation template relationships are invalid");
  return Object.freeze({ bytes: info.size, entryCount: entries.size, slideCount: inspected.slideCount, layoutMap: Object.freeze(layouts), sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
}

function resolveTemplate(specFile, template) {
  if (!template) return undefined;
  const root = fs.realpathSync.native(path.dirname(specFile));
  const candidate = path.resolve(root, ...template.path.split("/"));
  const file = fs.realpathSync.native(candidate);
  const relative = path.relative(root, file);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("presentation template escapes the spec directory");
  const inspected = inspectTemplate(file);
  if (inspected.sha256 !== template.sha256) throw new Error("presentation template hash does not match its manifest");
  return Object.freeze({ ...template, file, ...inspected });
}

function materializeTemplate(template, output) {
  if (!template) return undefined;
  const target = path.join(output, ".template-input.pptx");
  fs.copyFileSync(template.file, target, fs.constants.COPYFILE_EXCL);
  const inspected = inspectTemplate(target);
  if (inspected.sha256 !== template.sha256) { fs.rmSync(target, { force: true }); throw new Error("presentation template changed while it was being materialized"); }
  return target;
}

function templateRecord(template) {
  if (!template) return undefined;
  return Object.freeze({ mode: template.mode, sha256: template.sha256, bytes: template.bytes, entryCount: template.entryCount, slideCount: template.slideCount, semanticLayouts: template.layoutMap?.length || 0, layoutMap: template.layoutMap || [], source: template.source });
}

const NON_CONTENT_TEXT_ROLES = new Set(["page-number", "section-number", "citation"]);

function bindingCandidates(page, pageRole) {
  const textBoxes = page.textBoxes || [];
  const candidates = [];
  const appendText = (predicate, placeholderTypes) => {
    for (const item of textBoxes.filter(predicate)) candidates.push(Object.freeze({ objectId: item.id, collection: "textBoxes", role: item.role, placeholderTypes }));
  };
  appendText((item) => item.role === "title", pageRole === "cover" ? ["ctrTitle", "title"] : ["title", "ctrTitle"]);
  appendText((item) => item.role === "summary", pageRole === "cover" ? ["subTitle", "body", "obj"] : ["body", "obj", "subTitle"]);
  for (const item of page.tables || []) candidates.push(Object.freeze({ objectId: item.id, collection: "tables", placeholderTypes: ["tbl", "obj"] }));
  for (const item of page.charts || []) candidates.push(Object.freeze({ objectId: item.id, collection: "charts", placeholderTypes: ["chart", "obj"] }));
  for (const item of page.images || []) candidates.push(Object.freeze({ objectId: item.id, collection: "images", placeholderTypes: ["pic", "obj"] }));
  appendText((item) => item.role !== "title" && item.role !== "summary" && !NON_CONTENT_TEXT_ROLES.has(item.role), ["body", "obj"]);
  return candidates;
}

function bindTemplatePlaceholders(page, layout, pageRole) {
  if (layout.flexibleCanvas === true) return [];
  const available = (layout.placeholders || []).map((placeholder, order) => ({ ...placeholder, order, used: false }));
  const bindings = [];
  for (const candidate of bindingCandidates(page, pageRole)) {
    let selected;
    for (const placeholderType of candidate.placeholderTypes) {
      selected = available.find((placeholder) => !placeholder.used && placeholder.type === placeholderType);
      if (selected) break;
    }
    if (!selected) continue;
    selected.used = true;
    bindings.push(Object.freeze({ objectId: candidate.objectId, collection: candidate.collection, ...(candidate.role ? { role: candidate.role } : {}), placeholderType: selected.type, placeholderIndex: selected.index }));
  }
  return bindings;
}

function applyTemplateLayoutMap(rawIr, template) {
  if (!template?.layoutMap?.length) return rawIr;
  const ir = JSON.parse(JSON.stringify(rawIr));
  for (const page of ir.pages) {
    const role = page.intent?.role;
    const candidates = template.layoutMap.filter((layout) => layout.roles.includes(role));
    const contentCandidates = template.layoutMap.filter((layout) => layout.roles.includes("content"));
    const pool = candidates.length ? candidates : contentCandidates.length ? contentCandidates : template.layoutMap;
    const hasBodyText = (page.textBoxes || []).some((item) => !["title", "page-number", "section-number", "citation"].includes(item.role));
    const nativeRegions = (page.tables?.length || 0) + (page.charts?.length || 0) + (page.images?.length || 0);
    const demand = Math.max(role === "comparison" ? 2 : 0, nativeRegions, hasBodyText ? 1 : 0);
    const fitting = pool.filter((layout) => layout.flexibleCanvas === true || layout.bodyCapacity >= demand);
    const candidatePool = fitting.length ? fitting : pool;
    const candidate = [...candidatePool].sort((left, right) => Math.abs((left.flexibleCanvas ? demand : left.bodyCapacity) - demand) - Math.abs((right.flexibleCanvas ? demand : right.bodyCapacity) - demand) || left.id.localeCompare(right.id))[0];
    const placeholderBindings = bindTemplatePlaceholders(page, candidate, role);
    page.intent = { ...(page.intent || {}), templateLayoutId: candidate.id, templateLayoutName: candidate.name, templatePlaceholderCapacity: candidate.bodyCapacity, templateLayoutDemand: demand, templateLayoutFit: candidate.flexibleCanvas === true || candidate.bodyCapacity >= demand ? "fit" : "overflow", templateLayoutMode: candidate.flexibleCanvas === true ? "freeform" : "placeholder", templatePlaceholderBindings: placeholderBindings };
  }
  return Object.freeze(ir);
}

module.exports = { FORBIDDEN_CONTENT_TYPE, FORBIDDEN_ENTRY, MAX_TEMPLATE_BYTES, applyTemplateLayoutMap, bindTemplatePlaceholders, inspectTemplate, materializeTemplate, normalizeTemplate, resolveTemplate, templateRecord };
