"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

/** @param {string|undefined} candidate @param {string} platform */
function isUsableExecutableCandidate(candidate, platform) {
  if (!candidate) return false;
  const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(candidate);
  if (windowsAbsolute && platform !== "win32") return false;
  const pathLike = windowsAbsolute || path.isAbsolute(candidate) || candidate.includes("/") || candidate.includes("\\");
  return !pathLike || fs.existsSync(candidate);
}

/** @param {string} [value] @param {{environment?:NodeJS.ProcessEnv,platform?:string}} [options] */
function resolveLibreOffice(value, { environment = process.env, platform = process.platform } = {}) {
  const candidates = [
    value,
    environment.LIBREOFFICE_BIN,
    ...(platform === "win32" ? [
      "C:\\Program Files\\LibreOffice\\program\\soffice.com",
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "soffice.com"
    ] : []),
    "soffice"
  ].filter(Boolean);
  return candidates.find((candidate) => isUsableExecutableCandidate(candidate, platform)) || "soffice";
}

/** @param {string} [value] @param {{environment?:NodeJS.ProcessEnv,platform?:string}} [options] */
function resolvePdfToPpm(value, { environment = process.env, platform = process.platform } = {}) {
  const runtimeRoot = platform === "win32" && environment.USERPROFILE
    ? path.join(environment.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies")
    : "";
  const candidates = [
    value,
    environment.PDFTOPPM_BIN,
    ...(runtimeRoot ? [
      path.join(runtimeRoot, "native", "poppler", "Library", "bin", "pdftoppm.exe"),
      path.join(runtimeRoot, "native", "poppler", "bin", "pdftoppm.cmd"),
      path.join(runtimeRoot, "bin", "pdftoppm.cmd")
    ] : []),
    "pdftoppm"
  ].filter(Boolean);
  return candidates.find((candidate) => isUsableExecutableCandidate(candidate, platform)) || "pdftoppm";
}

/** Text extraction is a distinct capability; a pdftoppm installation need not include it.
 * @param {string} [value] @param {{environment?:NodeJS.ProcessEnv,platform?:string}} [options] */
function resolvePdfToText(value, {environment=process.env,platform=process.platform}={}) {
  const ppm=resolvePdfToPpm(undefined,{environment,platform});
  const sibling=path.isAbsolute(ppm)?path.join(path.dirname(ppm),platform==="win32"?"pdftotext.exe":"pdftotext"):undefined;
  return [value,environment.PDFTOTEXT_BIN,sibling,"pdftotext"].find(candidate=>isUsableExecutableCandidate(candidate,platform))||"pdftotext";
}

/** @param {unknown} file */
function fileUrl(file) {
  if (typeof file !== "string" || !file || file.length > 32768 || file.includes("\0")) {
    throw new TypeError("LibreOffice profile path is invalid");
  }
  return pathToFileURL(path.resolve(file)).href;
}

module.exports = { resolveLibreOffice, resolvePdfToPpm, resolvePdfToText, fileUrl };
