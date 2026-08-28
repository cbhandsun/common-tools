"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { insideRoot } = require("../capability-runtime");
const { extractEntry, readCentralDirectory } = require("../ppt-quality-core");
const { planPresentation, validatePresentationBrief } = require("./planner");

const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_TEXT = 1_000_000;
const SUPPORTED_EXTENSIONS = Object.freeze([".docx", ".markdown", ".md", ".pdf"]);

function decodeXml(value) { return value.replace(/&#(x?[0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code.startsWith("x") || code.startsWith("X") ? code.slice(1) : code, code.startsWith("x") || code.startsWith("X") ? 16 : 10))).replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&"); }
function normalizeLine(value) { return value.replace(/\s+/gu, " ").trim(); }
function extractDocxOutline(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > MAX_DOCUMENT_BYTES) throw new Error("DOCX input size is invalid");
  const entries = readCentralDirectory(buffer); const types = entries.get("[Content_Types].xml"); const document = entries.get("word/document.xml");
  if (!types || !document || !extractEntry(buffer, types, 1024 * 1024).toString("utf8").includes("wordprocessingml.document.main+xml")) throw new Error("DOCX package is missing its main document");
  const xml = extractEntry(buffer, document, 8 * 1024 * 1024).toString("utf8"); const records = [];
  let extractedCharacters = 0;
  for (const match of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)) {
    const text = normalizeLine([...match[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)].map((item) => decodeXml(item[1])).join("")); if (!text) continue;
    extractedCharacters += text.length; if (extractedCharacters > MAX_EXTRACTED_TEXT) throw new Error("DOCX extracted text is too large");
    const style = /<w:pStyle\b[^>]*w:val=["']([^"']+)["']/u.exec(match[0])?.[1] || ""; const heading = /^Heading([1-6])$/iu.exec(style);
    records.push({ kind: heading ? "heading" : "paragraph", level: heading ? Number(heading[1]) : undefined, text });
    if (records.length > 5000) throw new Error("DOCX contains too many paragraphs");
  }
  return records;
}
function extractMarkdownOutline(text) {
  const records = []; let paragraph = [];
  const flush = () => { const value = normalizeLine(paragraph.join(" ")); if (value) records.push({ kind: "paragraph", text: value }); paragraph = []; };
  for (const raw of text.replace(/^\uFEFF/u, "").split(/\r?\n/u)) {
    const heading = /^(#{1,6})\s+(.+)$/u.exec(raw); const bullet = /^\s*(?:[-*+] |\d+[.)]\s+)(.+)$/u.exec(raw);
    if (heading) { flush(); records.push({ kind: "heading", level: heading[1].length, text: normalizeLine(heading[2]) }); }
    else if (bullet) { flush(); records.push({ kind: "paragraph", text: normalizeLine(bullet[1]) }); }
    else if (!raw.trim()) flush(); else paragraph.push(raw.trim());
    if (records.length > 5000) throw new Error("Markdown contains too many blocks");
  }
  flush(); return records;
}
function extractPlainOutline(text) {
  const lines = text.split(/\r?\n|\f/u).map(normalizeLine).filter(Boolean); if (lines.length > 10000) throw new Error("PDF contains too many text lines");
  return lines.map((value, index) => ({ kind: index === 0 || (value.length <= 80 && /[:：]$/u.test(value)) ? "heading" : "paragraph", ...(index === 0 ? { level: 1 } : value.endsWith(":") || value.endsWith("：") ? { level: 2 } : {}), text: value.replace(/[:：]$/u, "") }));
}
function boundedChunks(value, maximum = 240) {
  const chunks = []; let remaining = normalizeLine(value);
  while (remaining.length > maximum) { let split = remaining.lastIndexOf(" ", maximum); if (split < maximum / 2) split = maximum; chunks.push(remaining.slice(0, split).trim()); remaining = remaining.slice(split).trim(); }
  if (remaining) chunks.push(remaining); return chunks;
}
function safeTitle(value, fallback) { const normalized = normalizeLine(value || fallback); return normalized.slice(0, 160) || "Imported presentation"; }
function outlineToBrief(records, options) {
  if (!Array.isArray(records) || records.length < 1) throw new Error("document contains no extractable text");
  const firstHeading = records.find((record) => record.kind === "heading"); const title = safeTitle(firstHeading?.text, options.fallbackTitle); const sections = []; let current;
  const addSection = (sectionTitle) => { if (sections.length >= 24) throw new Error("document contains too many presentation sections"); current = { id: `section-${sections.length + 1}`, title: safeTitle(sectionTitle, `Section ${sections.length + 1}`).slice(0, 120), mode: "narrative", points: [] }; sections.push(current); };
  for (const record of records) {
    if (record === firstHeading) continue;
    if (record.kind === "heading") { addSection(record.text); continue; }
    if (!current) addSection(options.defaultSectionTitle || "核心内容");
    for (const chunk of boundedChunks(record.text)) {
      if (current.points.length >= 48) addSection(`${current.title.slice(0, 106)}（续）`);
      current.points.push({ id: `point-${current.points.length + 1}`, label: chunk.slice(0, 80), ...(chunk.length > 80 ? { detail: chunk } : {}), required: true });
    }
  }
  const populated = sections.filter((section) => section.points.length > 0); if (populated.length < 1) throw new Error("document contains no presentation points");
  return validatePresentationBrief({ version: "1.0", title, audience: options.audience, purpose: options.purpose, language: options.language || "zh-CN", theme: options.theme, maxSlides: options.maxSlides, sections: populated, closing: options.closing || [] });
}
function documentToPresentation(inputFile, options = {}) {
  const info = fs.lstatSync(inputFile); const extension = path.extname(inputFile).toLowerCase();
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_DOCUMENT_BYTES || !SUPPORTED_EXTENSIONS.includes(extension)) throw new Error("document input must be a bounded Markdown, DOCX, or PDF file");
  const bytes = fs.readFileSync(inputFile); let records; let sourceFormat;
  if ([".md", ".markdown"].includes(extension)) { const text = bytes.toString("utf8"); if (text.length > MAX_EXTRACTED_TEXT) throw new Error("Markdown extracted text is too large"); records = extractMarkdownOutline(text); sourceFormat = "markdown"; }
  else if (extension === ".docx") { records = extractDocxOutline(bytes); sourceFormat = "docx"; }
  else {
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) || !bytes.includes(Buffer.from("%%EOF")) || typeof options.extractPdfText !== "function") throw new Error("PDF input or extraction adapter is invalid");
    const text = options.extractPdfText(inputFile); if (typeof text !== "string" || text.length < 1 || text.length > MAX_EXTRACTED_TEXT) throw new Error("PDF extracted text is invalid"); records = extractPlainOutline(text); sourceFormat = "pdf";
  }
  const brief = outlineToBrief(records, { ...options, fallbackTitle: path.basename(inputFile, extension) }); const planned = options.outputFormat === "brief" ? null : planPresentation(brief);
  return Object.freeze({ document: planned ? planned.spec : brief, report: Object.freeze({ version: "1.0", sourceFormat, sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"), extractedBlocks: records.length, sections: brief.sections.length, points: brief.sections.reduce((sum, section) => sum + section.points.length, 0), outputFormat: planned ? "spec" : "brief", ...(planned ? { slideCount: planned.spec.slides.length, planningPassed: planned.report.passed } : {}) }) });
}
function persistDocumentPlan({ workspaceRoot, input, output, ...options }) {
  const inputFile = insideRoot(workspaceRoot, input); const outputFile = insideRoot(workspaceRoot, output);
  if (fs.existsSync(outputFile) || path.extname(outputFile).toLowerCase() !== ".json") throw new Error("document plan output must be a new JSON file");
  const parent = insideRoot(workspaceRoot, path.dirname(outputFile)); if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw new Error("document plan output parent is unavailable");
  if (options.outputFormat !== undefined && !["brief", "spec"].includes(options.outputFormat)) throw new Error("document plan outputFormat must be brief or spec");
  const result = documentToPresentation(inputFile, { ...options, outputFormat: options.outputFormat || "spec" }); fs.writeFileSync(outputFile, `${JSON.stringify(result.document, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return Object.freeze({ output: outputFile, report: result.report });
}

module.exports = { MAX_DOCUMENT_BYTES, MAX_EXTRACTED_TEXT, SUPPORTED_EXTENSIONS, documentToPresentation, extractDocxOutline, extractMarkdownOutline, extractPlainOutline, outlineToBrief, persistDocumentPlan };
