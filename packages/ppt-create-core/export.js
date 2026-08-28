"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

const MAX_PDF_BYTES = 100 * 1024 * 1024;

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function deckIrFingerprint(ir) {
  if (!ir || !Array.isArray(ir.pages) || ir.pages.length < 1) throw new TypeError("Deck IR must contain pages");
  return crypto.createHash("sha256").update(JSON.stringify(ir)).digest("hex");
}
function cssBox(box) {
  return `left:${box.x / 9.6}%;top:${box.y / 5.4}%;width:${box.w / 9.6}%;height:${box.h / 5.4}%`;
}
function cssColor(value, fallback) { return /^#[0-9A-F]{6}$/u.test(value || "") ? value : fallback; }
function textHtml(item) {
  const font = item.font || {};
  const style = `${cssBox(item.box)};font-family:${escapeHtml(font.family || "Arial")};font-size:${Number(font.sizePt) || 16}pt;font-weight:${font.weight === "bold" ? 700 : 400};color:${cssColor(font.color, "#111827")};text-align:${font.align === "center" || font.align === "right" ? font.align : "left"}`;
  return `<div class="text" data-object-id="${escapeHtml(item.id)}" style="${style}">${escapeHtml(item.text)}</div>`;
}
function shapeHtml(item) {
  const style = item.style || {};
  const radius = item.type === "ellipse" ? "50%" : item.type === "roundRect" ? "12px" : "0";
  return `<div class="shape" data-object-id="${escapeHtml(item.id)}" style="${cssBox(item.box)};background:${cssColor(style.fill, "transparent")};border:${Number(style.strokeWidthPt) || 0}px solid ${cssColor(style.stroke, "transparent")};border-radius:${radius};opacity:${Number.isFinite(style.opacity) ? style.opacity : 1}"></div>`;
}
function tableHtml(table) {
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<table class="native" data-object-id="${escapeHtml(table.id)}" style="${cssBox(table.box)}">${body}</table>`;
}
function chartHtml(chart) {
  const series = chart.series || [];
  const summary = series.map((item) => `${item.name}: ${item.values.join(", ")}`).join(" · ");
  return `<div class="chart" data-object-id="${escapeHtml(chart.id)}" style="${cssBox(chart.box)}"><strong>${escapeHtml(chart.title || "Chart")}</strong><span>${escapeHtml(summary)}</span></div>`;
}
function createPrintableHtml(ir) {
  const fingerprint = deckIrFingerprint(ir);
  const pages = ir.pages.map((page) => {
    const shapes = (page.shapes || []).map(shapeHtml).join("");
    const text = (page.textBoxes || []).map(textHtml).join("");
    const tables = (page.tables || []).map(tableHtml).join("");
    const charts = (page.charts || []).map(chartHtml).join("");
    return `<section class="slide" data-page-index="${page.pageIndex}" style="background:${cssColor(page.background?.fill, "#FFFFFF")}">${shapes}${tables}${charts}${text}</section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="common-tools-deck-ir-sha256" content="${fingerprint}"><meta name="common-tools-page-count" content="${ir.pages.length}"><title>Presentation</title><style>*{box-sizing:border-box}body{margin:0;background:#d1d5db;font-family:Arial,sans-serif}.slide{position:relative;width:13.333in;height:7.5in;margin:20px auto;overflow:hidden;page-break-after:always}.shape,.text,.native,.chart{position:absolute}.text{white-space:pre-wrap;overflow:hidden;line-height:1.15}.native{border-collapse:collapse;font-size:14pt;background:#fff}.native td{border:1px solid #94a3b8;padding:6px}.chart{display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid #94a3b8;background:#fff;overflow:hidden}.chart span{font-size:13pt}@page{size:13.333in 7.5in;margin:0}@media print{body{background:#fff}.slide{margin:0}}</style></head><body data-source-fingerprint="${fingerprint}" data-page-count="${ir.pages.length}">${pages}</body></html>`;
}
function inspectPdf(file) {
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 32 || info.size > MAX_PDF_BYTES) throw new Error("PDF adapter did not create a bounded regular file");
  const bytes = fs.readFileSync(file);
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) || !bytes.includes(Buffer.from("%%EOF"))) throw new Error("PDF adapter did not create a valid PDF artifact");
  const pageCount = (bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
  if (pageCount < 1 || pageCount > 100) throw new Error("PDF page count is unavailable or out of range");
  return Object.freeze({ pageCount });
}
function inspectHtml(file, fingerprint, pageCount) {
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 100 || info.size > 10 * 1024 * 1024) throw new Error("HTML exporter did not create a bounded regular file");
  const html = fs.readFileSync(file, "utf8");
  if (!html.includes(`<meta name="common-tools-deck-ir-sha256" content="${fingerprint}">`) || !html.includes(`<meta name="common-tools-page-count" content="${pageCount}">`) || (html.match(/class="slide"/g) || []).length !== pageCount) throw new Error("HTML export metadata is inconsistent");
}
function inspectPptx(file) {
  const info = fs.lstatSync(file); const header = Buffer.alloc(4); const descriptor = fs.openSync(file, "r");
  try { fs.readSync(descriptor, header, 0, 4, 0); } finally { fs.closeSync(descriptor); }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 22 || !header.equals(Buffer.from("PK\u0003\u0004"))) throw new Error("OpenXML builder did not create a valid PPTX artifact");
}
function multiFormatQuality(ir, files, adapterResult) {
  const fingerprint = deckIrFingerprint(ir);
  if (!files || typeof files !== "object") throw new TypeError("multi-format files are required");
  inspectHtml(files.htmlFile, fingerprint, ir.pages.length);
  inspectPptx(files.pptxFile);
  const pdf = inspectPdf(files.pdfFile);
  const checks = [
    { name: "multi-format-artifacts-present", passed: true },
    { name: "multi-format-page-count-matches", passed: pdf.pageCount === ir.pages.length },
    { name: "multi-format-source-fingerprint-matches", passed: adapterResult?.sourceFingerprint === fingerprint }
  ];
  return Object.freeze({ fingerprint, pdfPageCount: pdf.pageCount, checks: Object.freeze(checks), passed: checks.every((check) => check.passed) });
}

module.exports = { MAX_PDF_BYTES, createPrintableHtml, deckIrFingerprint, escapeHtml, inspectHtml, inspectPdf, inspectPptx, multiFormatQuality };
