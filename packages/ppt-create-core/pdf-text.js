"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MAX_PDF_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_PDF_LAYOUT_BYTES = 8 * 1024 * 1024;

function resolvePdftotext(environment = process.env) {
  const configured = environment.COMMON_TOOLS_PDFTOTEXT_BIN;
  if (configured === undefined) return "pdftotext";
  if (typeof configured !== "string" || !configured.trim() || /[\r\n\0]/u.test(configured)) throw new Error("pdftotext executable configuration is invalid");
  return configured.trim();
}
function extractPdfText(inputFile, options = {}) {
  if (typeof inputFile !== "string" || !path.isAbsolute(inputFile) || path.extname(inputFile).toLowerCase() !== ".pdf") throw new TypeError("PDF text input must be an absolute PDF path");
  const temporaryRoot = options.temporaryRoot || os.tmpdir(); const directory = fs.mkdtempSync(path.join(temporaryRoot, "common-tools-pdf-text-")); const output = path.join(directory, "document.txt");
  try {
    const result = spawnSync(resolvePdftotext(options.environment), ["-layout", "-enc", "UTF-8", inputFile, output], { encoding: "utf8", timeout: options.timeoutMs || 120000, windowsHide: true });
    if (result.error || result.status !== 0 || !fs.existsSync(output)) throw new Error("PDF text extraction failed");
    const info = fs.lstatSync(output); if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_PDF_TEXT_BYTES) throw new Error("PDF text extraction produced invalid output");
    return fs.readFileSync(output, "utf8");
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 2 }); }
}

function decodeXml(value) { return value.replace(/&#(x?[0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(/^x/iu.test(code) ? code.slice(1) : code, /^x/iu.test(code) ? 16 : 10))).replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&"); }
function parsePdfBboxLayout(xml) {
  if (typeof xml !== "string" || xml.length < 1 || Buffer.byteLength(xml) > MAX_PDF_LAYOUT_BYTES || /<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new Error("PDF layout extraction output is invalid");
  const records = []; let pageIndex = 0;
  for (const pageMatch of xml.matchAll(/<page\b[^>]*\bwidth="([0-9.]+)"[^>]*\bheight="([0-9.]+)"[^>]*>([\s\S]*?)<\/page>/giu)) {
    pageIndex += 1; const width = Number(pageMatch[1]); const height = Number(pageMatch[2]); if (![width, height].every((value) => Number.isFinite(value) && value > 0 && value <= 100000)) throw new Error("PDF layout page dimensions are invalid");
    const lines = [];
    for (const lineMatch of pageMatch[3].matchAll(/<line\b[^>]*\bxMin="([0-9.]+)"[^>]*\byMin="([0-9.]+)"[^>]*\bxMax="([0-9.]+)"[^>]*\byMax="([0-9.]+)"[^>]*>([\s\S]*?)<\/line>/giu)) {
      const words = [...lineMatch[5].matchAll(/<word\b[^>]*>([\s\S]*?)<\/word>/giu)].map((match) => decodeXml(match[1]).replace(/<[^>]+>/gu, "").trim()).filter(Boolean); if (!words.length) continue;
      const box = { x: Number(lineMatch[1]), y: Number(lineMatch[2]), w: Number(lineMatch[3]) - Number(lineMatch[1]), h: Number(lineMatch[4]) - Number(lineMatch[2]) }; if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) continue; lines.push({ text: words.join(" "), box });
    }
    const heights = lines.map((line) => line.box.h).sort((a, b) => a - b); const median = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
    lines.forEach((line, lineIndex) => records.push({ kind: lineIndex === 0 || line.box.h >= median * 1.25 ? "heading" : "paragraph", ...(lineIndex === 0 ? { level: pageIndex === 1 ? 1 : 2 } : {}), text: line.text, page: pageIndex, box: { x: line.box.x / width, y: line.box.y / height, w: line.box.w / width, h: line.box.h / height }, column: line.box.x + line.box.w / 2 < width / 2 ? 1 : 2 }));
  }
  if (!records.length || pageIndex > 1000 || records.length > 20000) throw new Error("PDF layout extraction produced no bounded lines"); return records;
}
function extractPdfLayout(inputFile, options = {}) {
  if (typeof inputFile !== "string" || !path.isAbsolute(inputFile) || path.extname(inputFile).toLowerCase() !== ".pdf") throw new TypeError("PDF layout input must be an absolute PDF path");
  const directory = fs.mkdtempSync(path.join(options.temporaryRoot || os.tmpdir(), "common-tools-pdf-layout-")); const output = path.join(directory, "document.html");
  try {
    const result = spawnSync(resolvePdftotext(options.environment), ["-bbox-layout", "-enc", "UTF-8", inputFile, output], { encoding: "utf8", timeout: options.timeoutMs || 120000, windowsHide: true });
    if (result.error || result.status !== 0 || !fs.existsSync(output)) throw new Error("PDF layout extraction failed"); const info = fs.lstatSync(output); if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_PDF_LAYOUT_BYTES) throw new Error("PDF layout extraction produced invalid output"); return parsePdfBboxLayout(fs.readFileSync(output, "utf8"));
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 2 }); }
}

module.exports = { MAX_PDF_LAYOUT_BYTES, MAX_PDF_TEXT_BYTES, extractPdfLayout, extractPdfText, parsePdfBboxLayout, resolvePdftotext };
