"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readZipEntryText, rewriteZipEntries } = require("./pptx-zip");

const LINE_END_TYPES = new Set(["triangle", "stealth", "arrow", "diamond", "oval"]);
const LINE_END_SIZES = new Set(["sm", "med", "lg"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$()|[\]\\{}]/gu, "\\$&");
}

function escapeXmlAttribute(value) {
  return value.replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function attachNativeLineEndsToArcShapes(input) {
  if (!isRecord(input)) throw new TypeError("arc line-end input must be an object");
  const { xml, shapeNames } = input;
  const end = input.end ?? "tail";
  const type = input.type ?? "triangle";
  const width = input.width ?? "med";
  const length = input.length ?? "med";

  if (typeof xml !== "string" || xml.length === 0) throw new TypeError("slide XML must be a non-empty string");
  if (!Array.isArray(shapeNames) || shapeNames.length === 0 || shapeNames.length > 100) {
    throw new RangeError("shapeNames must contain between 1 and 100 names");
  }
  if (end !== "head" && end !== "tail") throw new TypeError("line end must be head or tail");
  if (!LINE_END_TYPES.has(type)) throw new TypeError("line-end type is invalid");
  if (!LINE_END_SIZES.has(width) || !LINE_END_SIZES.has(length)) throw new TypeError("line-end size is invalid");

  const uniqueNames = new Set();
  let nextXml = xml;
  let modifiedCount = 0;

  for (const rawName of shapeNames) {
    if (typeof rawName !== "string" || rawName.length === 0 || rawName.length > 128) {
      throw new TypeError("shape name must be a non-empty string of at most 128 characters");
    }
    if (uniqueNames.has(rawName)) throw new TypeError("duplicate shape name: " + rawName);
    uniqueNames.add(rawName);

    const escapedName = escapeRegExp(escapeXmlAttribute(rawName));
    const namePattern = new RegExp("<p:cNvPr\\b[^>]*\\bname=(?:\"" + escapedName + "\"|'" + escapedName + "')", "u");
    const shapeBlocks = [...nextXml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/gu)].filter((match) => namePattern.test(match[0]));
    if (shapeBlocks.length !== 1 || !/<a:prstGeom\b[^>]*\bprst=(?:"arc"|'arc')/u.test(shapeBlocks[0][0])) {
      throw new Error("expected exactly one named arc shape: " + rawName);
    }
    const shapeBlock = shapeBlocks[0][0];
    const lineMatches = [...shapeBlock.matchAll(/<a:ln\b[^>]*>[\s\S]*?<\/a:ln>/gu)];
    if (lineMatches.length !== 1) throw new Error("expected exactly one outline for named arc shape: " + rawName);
    if (/<a:(?:headEnd|tailEnd)\b/u.test(lineMatches[0][0])) {
      throw new Error("arc " + rawName + " already contains a native line end");
    }

    const lineEnd = "<a:" + end + "End type=\"" + type + "\" w=\"" + width
      + "\" len=\"" + length + "\" />";
    const patchedBlock = shapeBlock.replace(/<\/a:ln>/u, lineEnd + "</a:ln>");
    nextXml = nextXml.slice(0, shapeBlocks[0].index) + patchedBlock + nextXml.slice(shapeBlocks[0].index + shapeBlock.length);
    modifiedCount += 1;
  }

  return { xml: nextXml, modifiedCount };
}

function attachNativeLineEndsToPptx(input) {
  if (!isRecord(input)) throw new TypeError("PPTX arc line-end input must be an object");
  const sourcePptx = safePptxPath(input.sourcePptx, "sourcePptx");
  const outputPptx = safePptxPath(input.outputPptx, "outputPptx");
  if (sourcePptx === outputPptx) throw new Error("PPTX arc line-end output must not overwrite the source");
  const sourceInfo = safeLstat(sourcePptx, "PPTX arc line-end source is unavailable");
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() || sourceInfo.size < 22 || sourceInfo.size > 64 * 1024 * 1024) {
    throw new Error("PPTX arc line-end source must be a bounded regular file");
  }
  if (fs.existsSync(outputPptx)) throw new Error("PPTX arc line-end output already exists");
  const outputParent = safeLstat(path.dirname(outputPptx), "PPTX arc line-end output directory is invalid");
  if (!outputParent.isDirectory() || outputParent.isSymbolicLink()) throw new Error("PPTX arc line-end output directory is invalid");
  if (!Array.isArray(input.slides) || input.slides.length < 1 || input.slides.length > 100) {
    throw new RangeError("PPTX arc line-end slides must contain between 1 and 100 entries");
  }

  const replacements = {};
  const seenSlides = new Set();
  let modifiedShapes = 0;
  for (const [index, slide] of input.slides.entries()) {
    if (!isRecord(slide) || !Number.isSafeInteger(slide.slideNumber) || slide.slideNumber < 1 || slide.slideNumber > 1000) {
      throw new TypeError(`PPTX arc line-end slide ${index + 1} is invalid`);
    }
    if (seenSlides.has(slide.slideNumber)) throw new TypeError(`duplicate PPTX slide number: ${slide.slideNumber}`);
    seenSlides.add(slide.slideNumber);
    const entryName = `ppt/slides/slide${slide.slideNumber}.xml`;
    const xml = readZipEntryText(sourcePptx, entryName, { maxArchiveBytes: 64 * 1024 * 1024, maxBytes: 8 * 1024 * 1024 });
    if (xml === null) throw new Error(`PPTX arc line-end slide entry was not found: ${entryName}`);
    const result = attachNativeLineEndsToArcShapes({
      xml,
      shapeNames: slide.shapeNames,
      ...(slide.end === undefined ? {} : { end: slide.end }),
      ...(slide.type === undefined ? {} : { type: slide.type }),
      ...(slide.width === undefined ? {} : { width: slide.width }),
      ...(slide.length === undefined ? {} : { length: slide.length }),
    });
    replacements[entryName] = Buffer.from(result.xml, "utf8");
    modifiedShapes += result.modifiedCount;
  }
  const rewrite = rewriteZipEntries(sourcePptx, outputPptx, replacements, {
    maxArchiveBytes: 64 * 1024 * 1024,
    maxExpandedBytes: 128 * 1024 * 1024,
  });
  return { outputPptx, modifiedSlides: seenSlides.size, modifiedShapes, entries: rewrite.entries };
}

function safePptxPath(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 1000 || /[\0\r\n]/u.test(value)) {
    throw new TypeError(`${label} must be a bounded PPTX path`);
  }
  const resolved = path.resolve(value);
  if (!/[.]pptx$/iu.test(resolved)) throw new TypeError(`${label} must be a PPTX path`);
  return resolved;
}

function safeLstat(targetPath, message) {
  try {
    return fs.lstatSync(targetPath);
  } catch {
    throw new Error(message);
  }
}

module.exports = { attachNativeLineEndsToArcShapes, attachNativeLineEndsToPptx };
