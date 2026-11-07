"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_PDF_BYTES = 100 * 1024 * 1024;

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function deckIrFingerprint(ir) {
  if (!ir || !Array.isArray(ir.pages) || ir.pages.length < 1) throw new TypeError("Deck IR must contain pages");
  return crypto.createHash("sha256").update(JSON.stringify(ir)).digest("hex");
}
function cssBox(box, slideSize = { widthPt: 960, heightPt: 540 }) {
  const width = Number(slideSize.widthPt) || 960; const height = Number(slideSize.heightPt) || 540;
  return `left:${box.x / width * 100}%;top:${box.y / height * 100}%;width:${box.w / width * 100}%;height:${box.h / height * 100}%`;
}
function cssLineBox(box, slideSize = { widthPt: 960, heightPt: 540 }) {
  const width = Number(slideSize.widthPt) || 960; const height = Number(slideSize.heightPt) || 540;
  const length = Math.hypot(box.w / width * 100, box.h / height * 100); const angle = Math.atan2(box.h / height, box.w / width) * 180 / Math.PI;
  return `left:${box.x / width * 100}%;top:${box.y / height * 100}%;width:${length}%;height:0;transform-origin:0 50%;transform:rotate(${angle}deg)`;
}
function cssColor(value, fallback) { return /^#[0-9A-F]{6}$/u.test(value || "") ? value : fallback; }
/** @param {unknown} value */
function cssFontFamily(value) {
  const family = typeof value === "string" && value.trim() && value.length <= 120 && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ? value : "Arial";
  return `"${family.replace(/["\\]/gu, (character) => `\\${character}`)}"`;
}
function estimateSingleLineEmWidth(text, weight) {
  let units = 0;
  for (const ch of String(text || "").trim()) {
    const code = ch.codePointAt(0) || 0;
    if (/\s/u.test(ch)) units += 0.34;
    else if (code > 0x2E7F || /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/u.test(ch)) units += 1.04;
    else if (/[.,:;!|'"`()[\]{}/\\-]/u.test(ch)) units += 0.42;
    else if (/[A-Z]/u.test(ch)) units += 0.68;
    else units += 0.58;
  }
  return Math.max(1, units * (weight === "bold" ? 1.10 : 1.05));
}
function validPositionedRuns(item) {
  if (!Array.isArray(item?.positionedRuns) || item.positionedRuns.length === 0) return [];
  return item.positionedRuns.filter(
    (run) =>
      run?.box &&
      [run.box.x, run.box.y, run.box.w, run.box.h].every((v) => typeof v === "number" && Number.isFinite(v)) &&
      run.box.w > 0 &&
      run.box.h > 0 &&
      String(run?.text || "").trim().length > 0
  );
}
function filteredPositionedRuns(item) {
  const validRuns = validPositionedRuns(item);
  if (validRuns.length < 2) return validRuns;
  const first = validRuns[0];
  const second = validRuns[1];
  const rest = validRuns.slice(1);
  const firstText = String(first.text || "").trim();
  const secondText = String(second.text || "").trim();
  const minRestH = Math.min(...rest.map((r) => r.box.h));
  const gap = second.box.x - (first.box.x + first.box.w);
  if (
    Array.from(firstText).length === 1 &&
    (first.box.h > minRestH * 1.18 || (gap > 5 && /^(\[\d+\]|\(\d+\)|\d+[.、])/u.test(secondText)))
  ) {
    return rest;
  }
  return validRuns;
}
function effectiveText(item) {
  const validRuns = validPositionedRuns(item);
  if (validRuns.length >= 2) {
    const filtered = filteredPositionedRuns(item);
    if (filtered.length > 0 && filtered.length < validRuns.length) {
      return filtered.map((run) => String(run.text || "")).join("").trim();
    }
  }
  return String(item?.text ?? "");
}
function effectiveTextRotation(item) {
  const rot = Number(item?.rotation) || 0;
  if (!Number.isFinite(rot)) return 0;
  if (item?.source?.ocrQuadrilateralProjected === true && Math.abs(rot) < 2.2) return 0;
  return Object.is(rot, -0) ? 0 : rot;
}
function effectiveTextBox(item) {
  const box = item?.box;
  if (!box) return box;
  const validRuns = filteredPositionedRuns(item);
  if (validRuns.length === 0) return box;
  const x1 = Math.min(...validRuns.map((run) => run.box.x));
  const y1 = Math.min(...validRuns.map((run) => run.box.y));
  const x2 = Math.max(...validRuns.map((run) => run.box.x + run.box.w));
  const y2 = Math.max(...validRuns.map((run) => run.box.y + run.box.h));
  if (!(x2 > x1 && y2 > y1)) return box;
  const rawW = x2 - x1;
  const rawH = y2 - y1;
  const origRight = (Number(box.x) || 0) + (Number(box.w) || 0);
  const w = Math.max(rawW, origRight > x1 ? origRight - x1 : rawW);
  const paddedH = Math.max(rawH, Math.min(Number(box.h) || rawH, rawH * 1.24));
  const cy = (y1 + y2) / 2;
  const y = Math.max(0, cy - paddedH / 2);
  return { x: x1, y, w, h: paddedH };
}
function effectiveTextSizePt(item) {
  const font = item?.font || {};
  const rawSizePt = Number(font.sizePt) || 16;
  if (item?.source?.portalNormalized === true) return rawSizePt;
  const text = effectiveText(item).trim();
  const singleLine = item?.wrap === false || item?.style?.wrap === false || Boolean(item?.source?.ocrProvider) || Array.isArray(item?.positionedRuns);
  const box = effectiveTextBox(item);
  if (!singleLine || !text || /[\r\n]/u.test(text) || !box) return rawSizePt;
  const boxW = Number(box.w); const boxH = Number(box.h);
  if (!Number.isFinite(boxW) || !Number.isFinite(boxH) || boxW <= 0 || boxH <= 0) return rawSizePt;
  let heightCap = boxH * 0.88;
  const filtered = filteredPositionedRuns(item);
  if (filtered.length > 0) {
    const impliedSizes = filtered
      .map((entry) => entry.box.h * (/[\u2E80-\u9FFF[\]()]/u.test(String(entry.text || "")) ? 0.84 : 0.88))
      .sort((a, b) => a - b);
    heightCap = Math.min(heightCap, impliedSizes[Math.floor((impliedSizes.length - 1) * 0.35)]);
  }
  const widthCap = boxW / estimateSingleLineEmWidth(text, font.weight);
  const fitted = Math.max(6, Math.min(rawSizePt, heightCap, widthCap));
  return Math.round(fitted * 100) / 100;
}
function textHtml(item, slideSize) {
  const font = item.font || {};
  const box = effectiveTextBox(item);
  const sizePt = effectiveTextSizePt(item);
  const text = effectiveText(item);
  const rot = effectiveTextRotation(item);
  const noWrap = item?.wrap === false || item?.style?.wrap === false || Boolean(item?.source?.ocrProvider) || Array.isArray(item?.positionedRuns);
  const rotCss = Math.abs(rot) > 0.01 ? `;transform:rotate(${rot}deg)` : "";
  const style = `${cssBox(box, slideSize)};z-index:3;--font-pt:${sizePt};font-family:${escapeHtml(cssFontFamily(font.family))};font-size:${sizePt}pt;font-weight:${font.weight === "bold" ? 700 : 400};color:${cssColor(font.color, "#111827")};text-align:${font.align === "center" || font.align === "right" ? font.align : "left"}${noWrap ? ";white-space:nowrap;overflow:visible" : ""}${rotCss}`;
  return `<div class="text" data-object-id="${escapeHtml(item.id)}" style="${style}">${escapeHtml(text)}</div>`;
}
function isBackgroundUnderlayShape(item) {
  return item?.source?.detector === "solid-region-native-background" || item?.source?.residualBackgroundFill === true || String(item?.id || "").startsWith("solid-region-native-background");
}
function shapeHtml(item, slideSize) {
  const style = item.style || {};
  const zIndex = isBackgroundUnderlayShape(item) ? 0 : 2;
  const lineStyle = style.dash === "dash" || style.dash === "dashed" || style.dash === "dot" ? "dashed" : "solid";
  const strokeColor = cssColor(style.stroke, "#0284C7");
  const strokeWidth = Number(style.strokeWidthPt) || 1.5;
  const opacity = Number.isFinite(style.opacity) ? style.opacity : 1;
  if (item.type === "line" || item.type === "connector") {
    const wPt = Number(item.box?.w) || 0;
    const hPt = Number(item.box?.h) || 0;
    const isVertical = hPt > wPt * 2 && wPt <= 2;
    const isHorizontal = wPt >= hPt * 2 && hPt <= 2;
    if (isVertical || isHorizontal) {
      const slideW = Number(slideSize?.widthPt) || 960;
      const slideH = Number(slideSize?.heightPt) || 540;
      const leftPct = (Number(item.box?.x) || 0) / slideW * 100;
      const topPct = (Number(item.box?.y) || 0) / slideH * 100;
      const widthPct = isVertical ? 0 : wPt / slideW * 100;
      const heightPct = isHorizontal ? 0 : hPt / slideH * 100;
      const borderProp = isVertical ? `border-left:${strokeWidth}px ${lineStyle} ${strokeColor}` : `border-top:${strokeWidth}px ${lineStyle} ${strokeColor}`;
      const arrows = [];
      const hasStart = style.startArrow && style.startArrow !== "none";
      const hasEnd = style.endArrow && style.endArrow !== "none";
      if (isHorizontal) {
        const leftArrow = (style.flipH ? hasEnd : hasStart);
        const rightArrow = (style.flipH ? hasStart : hasEnd);
        if (leftArrow) arrows.push(`<span style="position:absolute;left:-1px;top:${-4 - strokeWidth / 2}px;width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-right:7px solid ${strokeColor};pointer-events:none"></span>`);
        if (rightArrow) arrows.push(`<span style="position:absolute;right:-1px;top:${-4 - strokeWidth / 2}px;width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:7px solid ${strokeColor};pointer-events:none"></span>`);
      } else {
        const topArrow = (style.flipV ? hasEnd : hasStart);
        const bottomArrow = (style.flipV ? hasStart : hasEnd);
        if (topArrow) arrows.push(`<span style="position:absolute;top:-1px;left:${-4 - strokeWidth / 2}px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid ${strokeColor};pointer-events:none"></span>`);
        if (bottomArrow) arrows.push(`<span style="position:absolute;bottom:-1px;left:${-4 - strokeWidth / 2}px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:7px solid ${strokeColor};pointer-events:none"></span>`);
      }
      return `<div class="shape line" data-object-id="${escapeHtml(item.id)}" style="left:${leftPct}%;top:${topPct}%;width:${widthPct}%;height:${heightPct}%;z-index:${zIndex};background:transparent;border:0;${borderProp};opacity:${opacity}">${arrows.join("")}</div>`;
    }
    return `<div class="shape line" data-object-id="${escapeHtml(item.id)}" style="${cssLineBox(item.box, slideSize)};z-index:${zIndex};background:transparent;border:0;border-top:${strokeWidth}px ${lineStyle} ${strokeColor};opacity:${opacity}"></div>`;
  }
  const radius = item.type === "ellipse" ? "50%" : item.type === "roundRect" ? `${Number(style.radiusPt) || 12}px` : "0";
  return `<div class="shape" data-object-id="${escapeHtml(item.id)}" style="${cssBox(item.box, slideSize)};z-index:${zIndex};background:${cssColor(style.fill, "transparent")};border:${Number(style.strokeWidthPt) || 0}px ${lineStyle} ${cssColor(style.stroke, "transparent")};border-radius:${radius};opacity:${opacity}"></div>`;
}
function tableHtml(table, slideSize) {
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<table class="native" data-object-id="${escapeHtml(table.id)}" style="${cssBox(table.box, slideSize)};z-index:2">${body}</table>`;
}
function chartHtml(chart, slideSize) {
  const series = chart.series || [];
  const summary = series.map((item) => `${item.name}: ${item.values.join(", ")}`).join(" · ");
  return `<div class="chart" data-object-id="${escapeHtml(chart.id)}" style="${cssBox(chart.box, slideSize)};z-index:2"><strong>${escapeHtml(chart.title || "Chart")}</strong><span>${escapeHtml(summary)}</span></div>`;
}
function insideAssetRoot(assetRoot, value) {
  if (typeof value !== "string" || !value || value.includes("\0") || path.isAbsolute(value)) throw new Error("image asset path is invalid");
  const root = fs.realpathSync.native(path.resolve(assetRoot)); const file = path.resolve(root, value);
  const relative = path.relative(root, file);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("image asset escapes the approved root");
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 8 || info.size > 20 * 1024 * 1024 || fs.realpathSync.native(file) !== file) throw new Error("image asset is not a bounded regular file");
  return file;
}
function imageDataUri(assetRoot, value) {
  const file = insideAssetRoot(assetRoot, value); const bytes = fs.readFileSync(file); const extension = path.extname(file).toLowerCase();
  const png = extension === ".png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = [".jpg", ".jpeg"].includes(extension) && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  const gif = extension === ".gif" && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"));
  if (!png && !jpeg && !gif) throw new Error("image asset format is unsupported or invalid");
  return `data:${png ? "image/png" : jpeg ? "image/jpeg" : "image/gif"};base64,${bytes.toString("base64")}`;
}
function isFullSlideBackgroundImage(item) {
  return item?.id === "full-slide-residual" || item?.source?.fullSlideResidual === true;
}
function imageHtml(item, slideSize, assetRoot) {
  if (!assetRoot) return "";
  const source = imageDataUri(assetRoot, item.assetPath); const fit = item.style?.fit === "contain" ? "contain" : "cover"; const crop = item.style?.cropRect;
  const pointerStyle = isFullSlideBackgroundImage(item) ? "pointer-events:none;z-index:1;" : "z-index:2;cursor:move;";
  if (crop && [crop.left, crop.top, crop.right, crop.bottom].every((value) => typeof value === "number" && value >= 0 && value < 1) && crop.left + crop.right < 1 && crop.top + crop.bottom < 1) {
    const visibleWidth = 1 - crop.left - crop.right; const visibleHeight = 1 - crop.top - crop.bottom;
    return `<div class="image-clip" data-object-id="${escapeHtml(item.id)}" style="${pointerStyle}${cssBox(item.box, slideSize)}"><img class="image" alt="" src="${source}" style="pointer-events:none;left:${-crop.left / visibleWidth * 100}%;top:${-crop.top / visibleHeight * 100}%;width:${100 / visibleWidth}%;height:${100 / visibleHeight}%;object-fit:${fit}"></div>`;
  }
  return `<img class="image" data-object-id="${escapeHtml(item.id)}" alt="" src="${source}" style="${pointerStyle}${cssBox(item.box, slideSize)};object-fit:${fit}">`;
}
function createPrintableHtml(ir, options = {}) {
  const fingerprint = deckIrFingerprint(ir);
  const slideSize = ir.slideSize || { widthPt: 960, heightPt: 540 };
  const pages = ir.pages.map((page) => {
    const allShapes = page.shapes || [];
    const backgroundShapes = allShapes.filter((item) => isBackgroundUnderlayShape(item)).map((item) => shapeHtml(item, slideSize)).join("");
    const foregroundShapes = allShapes.filter((item) => !isBackgroundUnderlayShape(item)).map((item) => shapeHtml(item, slideSize)).join("");
    const images = (page.images || []).map((item) => imageHtml(item, slideSize, options.assetRoot)).join("");
    const text = (page.textBoxes || []).map((item) => textHtml(item, slideSize)).join("");
    const tables = (page.tables || []).map((item) => tableHtml(item, slideSize)).join("");
    const charts = (page.charts || []).map((item) => chartHtml(item, slideSize)).join("");
    const notes = page.speakerNotes ? `<aside class="speaker-notes" data-page-index="${page.pageIndex}" hidden>${escapeHtml(page.speakerNotes)}</aside>` : "";
    return `<section class="slide" data-page-index="${page.pageIndex}" style="background:${cssColor(page.background?.fill, "#FFFFFF")}">${backgroundShapes}${images}${foregroundShapes}${tables}${charts}${text}${notes}</section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="common-tools-deck-ir-sha256" content="${fingerprint}"><meta name="common-tools-page-count" content="${ir.pages.length}"><title>Presentation</title><style>*{box-sizing:border-box}body{margin:0;background:#d1d5db;font-family:Arial,sans-serif}.slide{position:relative;width:13.333in;height:7.5in;margin:20px auto;overflow:hidden;page-break-after:always}.shape,.image-clip,.image,.text,.native,.chart{position:absolute}.image-clip{overflow:hidden}.image{display:block}.text{white-space:pre-wrap;overflow:hidden;line-height:1.15}.native{border-collapse:collapse;font-size:14pt;background:#fff}.native td{border:1px solid #94a3b8;padding:6px}.chart{display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid #94a3b8;background:#fff;overflow:hidden}.chart span{font-size:13pt}@page{size:13.333in 7.5in;margin:0}@media print{body{background:#fff}.slide{margin:0}}</style></head><body data-source-fingerprint="${fingerprint}" data-page-count="${ir.pages.length}">${pages}</body></html>`;
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
  return Object.freeze({ notesCount: (html.match(/class="speaker-notes"/g) || []).length });
}
function inspectPptx(file) {
  const info = fs.lstatSync(file); const header = Buffer.alloc(4); const descriptor = fs.openSync(file, "r");
  try { fs.readSync(descriptor, header, 0, 4, 0); } finally { fs.closeSync(descriptor); }
  if (!info.isFile() || info.isSymbolicLink() || info.size < 22 || !header.equals(Buffer.from("PK\u0003\u0004"))) throw new Error("OpenXML builder did not create a valid PPTX artifact");
}
function multiFormatQuality(ir, files, adapterResult) {
  const fingerprint = deckIrFingerprint(ir);
  if (!files || typeof files !== "object") throw new TypeError("multi-format files are required");
  const html = inspectHtml(files.htmlFile, fingerprint, ir.pages.length);
  inspectPptx(files.pptxFile);
  const pdf = inspectPdf(files.pdfFile);
  const checks = [
    { name: "multi-format-artifacts-present", passed: true },
    { name: "multi-format-page-count-matches", passed: pdf.pageCount === ir.pages.length },
    { name: "multi-format-source-fingerprint-matches", passed: adapterResult?.sourceFingerprint === fingerprint },
    { name: "html-speaker-notes-match", passed: html.notesCount === ir.pages.filter((page) => page.speakerNotes).length }
  ];
  return Object.freeze({ fingerprint, pdfPageCount: pdf.pageCount, checks: Object.freeze(checks), passed: checks.every((check) => check.passed) });
}

module.exports = { MAX_PDF_BYTES, createPrintableHtml, deckIrFingerprint, effectiveText, effectiveTextBox, effectiveTextRotation, effectiveTextSizePt, escapeHtml, filteredPositionedRuns, inspectHtml, inspectPdf, inspectPptx, multiFormatQuality };
