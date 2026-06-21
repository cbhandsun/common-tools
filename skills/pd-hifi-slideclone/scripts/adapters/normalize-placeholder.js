"use strict";

const fs = require("fs");
const path = require("path");
const { readImageSize } = require("../lib/image-size");

module.exports = async function normalizePlaceholder(input) {
  const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  const convertibleExtensions = new Set([".pdf", ".ppt", ".pptx"]);
  if (!fs.existsSync(input.inputDir)) {
    return {
      ok: true,
      data: {
        provider: "normalize-placeholder",
        pageImages: [],
        unsupportedSources: [],
        warning: `Input directory does not exist: ${input.inputDir}`
      }
    };
  }

  const files = fs.readdirSync(input.inputDir)
    .map((name) => path.resolve(input.inputDir, name))
    .filter((file) => fs.statSync(file).isFile())
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));

  const pageImages = files
    .filter((file) => imageExtensions.has(path.extname(file).toLowerCase()))
    .map((file) => ({
      sourceImage: file,
      ...readImageSize(file)
    }));
  const unsupportedSources = files.filter((file) => convertibleExtensions.has(path.extname(file).toLowerCase()));

  return {
    ok: true,
    data: {
      provider: "normalize-placeholder",
      pageImages,
      unsupportedSources,
      normalizedDir: path.join(input.outputDir, "normalized"),
      warning: unsupportedSources.length > 0
        ? "PDF/PPT/PPTX rendering is not implemented in the placeholder adapter. Replace normalize with a Poppler/LibreOffice/PowerPoint adapter."
        : null
    }
  };
};
