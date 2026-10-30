// @ts-check
"use strict";

const { readZipEntryText } = require("../../ooxml-core/pptx-zip");
const { parseSlideSize } = require("../slide-size");
const PRESENTATION_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/presentationml/2006/main",
  "http://purl.oclc.org/ooxml/presentationml/main"
]);

/** Read only the bounded presentation part; never resolve DTDs or entities.
 * @param {unknown} xml
 * @returns {{widthPt:number,heightPt:number}}
 */
function parsePresentationFrame(xml) {
  if (typeof xml !== "string" || xml.length > 1_048_576 || !xml.trim() || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Invalid presentation frame XML");
  const source = xml.replace(/^\uFEFF/, "").replace(/^\s*<\?xml\s[^?]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
  /** @type {{name:string, namespaces:Map<string,string>}[]} */
  const stack = [];
  /** @type {{widthPt:number,heightPt:number}|null} */
  let frame = null;
  let offset = 0, elements = 0, roots = 0;
  const tags = /<[^<>]*>/g;
  for (const match of source.matchAll(tags)) {
    if (source.slice(offset, match.index).trim()) throw new Error("Invalid presentation frame XML content");
    offset = match.index + match[0].length;
    const closing = /^<\/([\w:.-]+)\s*>$/.exec(match[0]);
    if (closing) {
      if (stack.pop()?.name !== closing[1]) throw new Error("Invalid presentation frame XML nesting");
      continue;
    }
    const opening = /^<([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)(\s[\s\S]*?)?\s*(\/?)>$/.exec(match[0]);
    if (!opening || ++elements > 100_000 || stack.length >= 64) throw new Error("Invalid presentation frame XML element");
    const name = opening[1] || "", attributes = parseAttributes(opening[2] || "");
    const namespaces = new Map(stack.at(-1)?.namespaces);
    for (const [key, value] of attributes) {
      if (key === "xmlns" || key.startsWith("xmlns:")) {
        if (value.includes("&")) throw new Error("Invalid presentation frame namespace");
        namespaces.set(key === "xmlns" ? "" : key.slice(6), value);
      }
    }
    const parts = name.split(":"), local = parts.at(-1), namespace = namespaces.get(parts.length === 2 ? parts[0] || "" : "");
    if (!stack.length) {
      if (++roots !== 1 || local !== "presentation" || !PRESENTATION_NAMESPACES.has(namespace || "")) throw new Error("Invalid presentation frame root");
    }
    if (local === "sldSz" && PRESENTATION_NAMESPACES.has(namespace || "")) {
      if (stack.length !== 1 || frame) throw new Error("Ambiguous presentation frame");
      const widthPt = emuDimension(attributes.get("cx")), heightPt = emuDimension(attributes.get("cy"));
      frame = { widthPt, heightPt };
    }
    if (!opening[3]) stack.push({ name, namespaces });
  }
  if (source.slice(offset).trim() || stack.length || roots !== 1 || !frame) throw new Error("Missing or invalid presentation frame");
  return frame;
}

/** @param {string} source @returns {Map<string,string>} */
function parseAttributes(source) {
  const attributes = new Map();
  let remaining = source;
  while (remaining.trim()) {
    const match = /^\s+([A-Za-z_][\w:.-]*)\s*=\s*(["'])([^<>]*?)\2/.exec(remaining);
    if (!match || !match[1] || attributes.has(match[1])) throw new Error("Invalid presentation frame attributes");
    attributes.set(match[1], match[3] || "");
    remaining = remaining.slice(match[0].length);
  }
  return attributes;
}

/** @param {string|undefined} value */
function emuDimension(value) {
  if (!value || !/^\d{1,10}$/.test(value)) throw new Error("Invalid presentation frame dimension");
  const emu = Number(value);
  if (!Number.isSafeInteger(emu) || emu <= 0 || emu > 1_270_000_000) throw new Error("Invalid presentation frame dimension");
  return emu / 12700;
}

/** @param {string} pptxFile @param {unknown} dpiInput @param {unknown} [expectedSize] */
function readPresentationRasterFrame(pptxFile, dpiInput, expectedSize) {
  const frame = parsePresentationFrame(readZipEntryText(pptxFile, "ppt/presentation.xml", { maxEntryBytes: 1_048_576 }));
  const dpi = typeof dpiInput === "number" ? dpiInput : typeof dpiInput === "string" && /^\d+(?:\.\d+)?$/.test(dpiInput) ? Number(dpiInput) : NaN;
  if (!Number.isFinite(dpi) || dpi <= 0) throw new Error("Invalid presentation render DPI");
  if (expectedSize !== undefined) {
    const expected = parseSlideSize(expectedSize);
    if (!expected || Math.abs(expected.widthPt - frame.widthPt) > 1 / 12700 || Math.abs(expected.heightPt - frame.heightPt) > 1 / 12700) throw new Error("Presentation and IR frame mismatch");
  }
  const widthPx = Math.round(frame.widthPt * dpi / 72), heightPx = Math.round(frame.heightPt * dpi / 72);
  if (!Number.isSafeInteger(widthPx) || !Number.isSafeInteger(heightPx) || widthPx < 1 || heightPx < 1 || widthPx > 32768 || heightPx > 32768 || widthPx * heightPx > 40_000_000) throw new Error("Presentation raster exceeds image processing boundary");
  return { widthPx, heightPx };
}

module.exports = { parsePresentationFrame, readPresentationRasterFrame };
