"use strict";

module.exports = async function ocrPlaceholder(input) {
  return {
    ok: true,
    provider: "placeholder",
    data: {
      pageIndex: input.pageIndex,
      sourceImage: input.sourceImage,
      words: [],
      lines: [],
      paragraphs: [],
      warning: "No OCR provider configured. Replace this adapter with Azure AI Vision, Tesseract, PaddleOCR, or ABBYY."
    }
  };
};

module.exports.maxConcurrency = 4;
