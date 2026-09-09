"use strict";

const fs = require("node:fs");
const path = require("node:path");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function sourceNativeSlideMetadata(workDir) {
  const reportFile = path.join(workDir, "reports", "source-editability-report.json");
  if (!fs.existsSync(reportFile)) return new Map();
  try {
    const report = readJson(reportFile);
    return new Map((report?.slides || [])
      .filter((slide) => slide?.classification === "native-rich" && Number.isInteger(slide?.pageIndex))
      .map((slide) => [slide.pageIndex, slide]));
  } catch {
    // A malformed optional report must not block image-first reconstruction.
    return new Map();
  }
}

function sourceNativeSlideIndexes(workDir) {
  return new Set(sourceNativeSlideMetadata(workDir).keys());
}

function listWorkDirs(root, onlyName = null) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(".work"))
    .filter((entry) => !onlyName || entry.name === onlyName || entry.name === `${onlyName}.work`)
    .map((entry) => path.join(root, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

module.exports = {
  listWorkDirs,
  readJson,
  sourceNativeSlideIndexes,
  sourceNativeSlideMetadata
};
