"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");

function resolveLibreOffice(environment = process.env, platform = process.platform) {
  const configured = environment.COMMON_TOOLS_LIBREOFFICE_BIN || environment.LIBREOFFICE_BIN;
  if (configured !== undefined) {
    if (typeof configured !== "string" || !configured.trim() || /[\r\n\0]/u.test(configured)) throw new Error("LibreOffice executable configuration is invalid");
    return configured.trim();
  }
  if (platform !== "win32") return "soffice";
  const candidates = ["C:\\Program Files\\LibreOffice\\program\\soffice.com", "C:\\Program Files\\LibreOffice\\program\\soffice.exe"];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "soffice.com";
}
function buildPdfWithLibreOffice({ pptxFile, outFile, sourceFingerprint }, options = {}) {
  if (typeof pptxFile !== "string" || !path.isAbsolute(pptxFile) || path.extname(pptxFile).toLowerCase() !== ".pptx") throw new TypeError("pptxFile must be an absolute PPTX path");
  if (typeof outFile !== "string" || !path.isAbsolute(outFile) || path.extname(outFile).toLowerCase() !== ".pdf" || fs.existsSync(outFile)) throw new TypeError("outFile must be a new absolute PDF path");
  if (!/^[a-f0-9]{64}$/u.test(sourceFingerprint || "")) throw new TypeError("sourceFingerprint must be SHA-256");
  const profile = fs.mkdtempSync(path.join(options.temporaryRoot || os.tmpdir(), "common-tools-lo-profile-"));
  try {
    const executable = resolveLibreOffice(options.environment);
    const result = spawnSync(executable, ["--headless", `-env:UserInstallation=${pathToFileURL(profile).href}`, "--convert-to", "pdf", "--outdir", path.dirname(outFile), pptxFile], { encoding: "utf8", timeout: options.timeoutMs || 120000, windowsHide: true });
    if (result.error || result.status !== 0 || !fs.existsSync(outFile)) throw new Error("LibreOffice PDF conversion failed");
    return Object.freeze({ sourceFingerprint });
  } finally { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 2 }); }
}

module.exports = { buildPdfWithLibreOffice, resolveLibreOffice };
