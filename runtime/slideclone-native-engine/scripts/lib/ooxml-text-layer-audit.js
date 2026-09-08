"use strict";

const fs = require("fs");
const { listZipEntries, readZipEntry } = require("./pptx-inventory");

function auditPptxTextLayers(pptxFile, ir = {}) {
  if (!pptxFile || !fs.existsSync(pptxFile)) return emptyAudit({ reason: "pptx-file-not-available" });
  const packageBuffer = fs.readFileSync(pptxFile);
  const slides = listZipEntries(packageBuffer)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((left, right) => slideNumber(left.name) - slideNumber(right.name));
  const pages = Array.isArray(ir?.pages) ? ir.pages : [];
  const pageAudits = slides.map((entry) => {
    const pageIndex = Math.max(0, slideNumber(entry.name) - 1);
    const xml = readZipEntry(packageBuffer, entry.name, { maxBytes: 16 * 1024 * 1024 }).toString("utf8");
    return auditSlideTextLayers({
      pageIndex,
      expectedTextBoxes: pages[pageIndex]?.textBoxes || [],
      actualShapeTexts: extractSlideShapeTexts(xml)
    });
  });
  const duplicateTextShapes = pageAudits.flatMap((page) => page.duplicateTextShapes);
  return {
    available: true,
    slideCount: slides.length,
    actualTextShapeCount: pageAudits.reduce((sum, page) => sum + page.actualTextShapeCount, 0),
    expectedVisibleTextShapeCount: pageAudits.reduce((sum, page) => sum + page.expectedVisibleTextShapeCount, 0),
    duplicateTextShapeCount: duplicateTextShapes.length,
    pagesWithDuplicateText: pageAudits.filter((page) => page.duplicateTextShapes.length > 0).length,
    duplicateTextShapes,
    pages: pageAudits
  };
}

function auditSlideTextLayers({ pageIndex = 0, expectedTextBoxes = [], actualShapeTexts = [] } = {}) {
  const expectedCounts = countCanonicalTexts(expectedTextBoxes.filter(isVisibleTextBox).map((textBox) => textBox?.text));
  const actualCounts = countCanonicalTexts(actualShapeTexts);
  const duplicateTextShapes = [];
  for (const [text, actualCount] of actualCounts) {
    const expectedCount = expectedCounts.get(text) || 0;
    if (expectedCount === 0 || actualCount <= expectedCount) continue;
    duplicateTextShapes.push({ pageIndex, text, expectedCount, actualCount, excessCount: actualCount - expectedCount });
  }
  return {
    pageIndex,
    expectedVisibleTextShapeCount: [...expectedCounts.values()].reduce((sum, count) => sum + count, 0),
    actualTextShapeCount: [...actualCounts.values()].reduce((sum, count) => sum + count, 0),
    duplicateTextShapes
  };
}

function extractSlideShapeTexts(xml = "") {
  const shapes = String(xml).match(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g) || [];
  return shapes.map((shape) => extractXmlText(shape)).filter(Boolean);
}

function extractXmlText(xml = "") {
  const chunks = [];
  const matcher = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  for (let match = matcher.exec(String(xml)); match; match = matcher.exec(String(xml))) chunks.push(decodeXmlText(match[1]));
  return chunks.join("").trim();
}

function countCanonicalTexts(values = []) {
  const counts = new Map();
  for (const value of values) {
    const text = canonicalText(value);
    // Short labels such as "AI" repeat legitimately and are too weak a signal.
    if (text.length < 4) continue;
    counts.set(text, (counts.get(text) || 0) + 1);
  }
  return counts;
}

function canonicalText(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

function isVisibleTextBox(textBox = {}) {
  return textBox?.style?.visibility !== "hidden"
    && textBox?.source?.overlayVisibility !== "hidden"
    && Boolean(canonicalText(textBox?.text));
}

function decodeXmlText(value) {
  return String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function slideNumber(name = "") {
  const match = String(name).match(/slide(\d+)\.xml$/i);
  return Number(match?.[1] || 0);
}

function emptyAudit(overrides = {}) {
  return {
    available: false,
    slideCount: 0,
    actualTextShapeCount: 0,
    expectedVisibleTextShapeCount: 0,
    duplicateTextShapeCount: 0,
    pagesWithDuplicateText: 0,
    duplicateTextShapes: [],
    pages: [],
    ...overrides
  };
}

module.exports = { auditPptxTextLayers, auditSlideTextLayers, canonicalText, extractSlideShapeTexts };
