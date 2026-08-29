"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { inspectPptx } = require("../ppt-quality-core");

const EDITABLE_DOCUMENT_EXTENSIONS = new Set([".pdf", ".pptx"]);
const MAX_EDITABLE_DOCUMENT_BYTES = 60 * 1024 * 1024;
const MAX_EDITABLE_DOCUMENT_PAGES = 20;

function assertEditableInputDocument(file) {
  const info = fs.lstatSync(file);
  const extension = path.extname(file).toLowerCase();
  if (!info.isFile() || info.isSymbolicLink() || info.size < 22 || info.size > MAX_EDITABLE_DOCUMENT_BYTES || !EDITABLE_DOCUMENT_EXTENSIONS.has(extension)) throw new Error("image-to-editable document input must be a bounded PDF or PPTX file");
  if (extension === ".pptx") {
    const inspection = inspectPptx(file);
    if (inspection.slideCount > MAX_EDITABLE_DOCUMENT_PAGES) throw new Error("image-to-editable document input exceeds the twenty-page limit");
    return Object.freeze({ bytes: info.size, pages: inspection.slideCount, kind: "pptx", extension });
  }
  const descriptor = fs.openSync(file, "r");
  try {
    const header = Buffer.alloc(Math.min(1024, info.size));
    fs.readSync(descriptor, header, 0, header.length, 0);
    const trailerSize = Math.min(2048, info.size);
    const trailer = Buffer.alloc(trailerSize);
    fs.readSync(descriptor, trailer, 0, trailerSize, info.size - trailerSize);
    if (!header.includes(Buffer.from("%PDF-")) || !trailer.includes(Buffer.from("%%EOF"))) throw new Error("image-to-editable PDF input is invalid or incomplete");
  } finally { fs.closeSync(descriptor); }
  return Object.freeze({ bytes: info.size, pages: null, kind: "pdf", extension });
}

module.exports = { EDITABLE_DOCUMENT_EXTENSIONS, MAX_EDITABLE_DOCUMENT_BYTES, MAX_EDITABLE_DOCUMENT_PAGES, assertEditableInputDocument };
