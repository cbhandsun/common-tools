"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MAX_PDF_TEXT_BYTES = 2 * 1024 * 1024;

function resolvePdftotext(environment = process.env) {
  const configured = environment.COMMON_TOOLS_PDFTOTEXT_BIN;
  if (configured === undefined) return "pdftotext";
  if (typeof configured !== "string" || !configured.trim() || /[\r\n\0]/u.test(configured)) throw new Error("pdftotext executable configuration is invalid");
  return configured.trim();
}
function extractPdfText(inputFile, options = {}) {
  if (typeof inputFile !== "string" || !path.isAbsolute(inputFile) || path.extname(inputFile).toLowerCase() !== ".pdf") throw new TypeError("PDF text input must be an absolute PDF path");
  const temporaryRoot = options.temporaryRoot || os.tmpdir(); const directory = fs.mkdtempSync(path.join(temporaryRoot, "common-tools-pdf-text-")); const output = path.join(directory, "document.txt");
  try {
    const result = spawnSync(resolvePdftotext(options.environment), ["-layout", "-enc", "UTF-8", inputFile, output], { encoding: "utf8", timeout: options.timeoutMs || 120000, windowsHide: true });
    if (result.error || result.status !== 0 || !fs.existsSync(output)) throw new Error("PDF text extraction failed");
    const info = fs.lstatSync(output); if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > MAX_PDF_TEXT_BYTES) throw new Error("PDF text extraction produced invalid output");
    return fs.readFileSync(output, "utf8");
  } finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 2 }); }
}

module.exports = { MAX_PDF_TEXT_BYTES, extractPdfText, resolvePdftotext };
