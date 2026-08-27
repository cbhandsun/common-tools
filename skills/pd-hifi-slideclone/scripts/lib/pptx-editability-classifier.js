"use strict";

const { listZipEntries, readZipEntry } = require("./pptx-inventory");

function classifyPptxEditability(file, options = {}) {
  const maxSlides = positiveInt(options.maxSlides, 1000);
  const entries = listZipEntries(file)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => slideNumber(a.name) - slideNumber(b.name));
  if (entries.length === 0) throw new Error("PPTX contains no slide XML entries");
  if (entries.length > maxSlides) throw new Error(`PPTX slide count exceeds ${maxSlides}`);

  const slides = entries.map((entry, index) => classifySlideXml(
    String(readZipEntry(file, entry.name, { maxBytes: 16 * 1024 * 1024 }) || ""),
    index
  ));
  return classifyDeckFromSlides(slides);
}

function classifySlideXml(xml, pageIndex = 0) {
  const source = String(xml || "");
  const shapes = count(source, /<p:sp(?:\s|>)/g);
  const pictures = count(source, /<p:pic(?:\s|>)/g);
  const groups = count(source, /<p:grpSp(?:\s|>)/g);
  const graphicFrames = count(source, /<p:graphicFrame(?:\s|>)/g);
  const connectors = count(source, /<p:cxnSp(?:\s|>)/g);
  const textRuns = count(source, /<a:t(?:\s|>)/g);
  const nativeObjects = shapes + groups + graphicFrames + connectors;
  let classification = "mixed";
  if (nativeObjects === 0 && pictures === 0 && textRuns === 0) classification = "blank";
  else if (pictures > 0 && nativeObjects <= 2 && textRuns === 0) classification = "image-only";
  else if (textRuns >= 3 || nativeObjects >= 4) classification = "native-rich";
  return {
    pageIndex,
    classification,
    shapes,
    pictures,
    groups,
    graphicFrames,
    connectors,
    textRuns,
    nativeObjects
  };
}

function classifyDeckFromSlides(slides = []) {
  const safeSlides = Array.isArray(slides) ? slides : [];
  const counts = { "native-rich": 0, "image-only": 0, mixed: 0, blank: 0 };
  for (const slide of safeSlides) {
    const key = Object.hasOwn(counts, slide?.classification) ? slide.classification : "mixed";
    counts[key] += 1;
  }
  const contentSlides = safeSlides.length - counts.blank;
  let route = "mixed-rebuild";
  if (contentSlides > 0 && counts["native-rich"] === contentSlides && counts["image-only"] === 0) {
    route = "native-passthrough";
  } else if (contentSlides > 0 && counts["image-only"] === contentSlides && counts["native-rich"] === 0) {
    route = "raster-rebuild";
  }
  return {
    provider: "pptx-editability-classifier-v1",
    route,
    slideCount: safeSlides.length,
    contentSlideCount: contentSlides,
    counts,
    slides: safeSlides
  };
}

function count(value, pattern) {
  return Array.from(String(value || "").matchAll(pattern)).length;
}

function slideNumber(name) {
  return Number(String(name || "").match(/slide(\d+)\.xml$/i)?.[1] || 0);
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

module.exports = {
  classifyDeckFromSlides,
  classifyPptxEditability,
  classifySlideXml
};
