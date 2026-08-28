"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { extractEntry, inspectPptx, readCentralDirectory } = require("../ppt-quality-core");
const { sourceRecord } = require("./assets");

const MAX_TEMPLATE_BYTES = 100 * 1024 * 1024;
const MAX_RELATIONSHIP_XML_BYTES = 32 * 1024 * 1024;
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
  const inspected = inspectPptx(file);
  if (inspected.unresolvedRelationshipCount > 0 || inspected.invalidRelationshipCount > 0) throw new Error("presentation template relationships are invalid");
  return Object.freeze({ bytes: info.size, entryCount: entries.size, slideCount: inspected.slideCount, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
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
  return Object.freeze({ mode: template.mode, sha256: template.sha256, bytes: template.bytes, entryCount: template.entryCount, slideCount: template.slideCount, source: template.source });
}

module.exports = { FORBIDDEN_CONTENT_TYPE, FORBIDDEN_ENTRY, MAX_TEMPLATE_BYTES, inspectTemplate, materializeTemplate, normalizeTemplate, resolveTemplate, templateRecord };
