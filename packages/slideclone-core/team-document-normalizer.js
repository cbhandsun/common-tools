"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { readRawImageDimensions } = require("./team-worker");

const MAX_DOCUMENT_PAGES = 20;
const MAX_DOCUMENT_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_DOCUMENT_TOTAL_PIXELS = 200_000_000;
const MAX_DOCUMENT_PAGE_PIXELS = 40_000_000;
const DOCUMENT_RENDER_DPI = 144;

function runFixedTool(executable, args, { cwd, timeoutMs, execFile = childProcess.execFile } = {}) {
  if (typeof executable !== "string" || !executable || !Array.isArray(args) || args.some((arg) => typeof arg !== "string") || typeof execFile !== "function") throw new TypeError("document normalizer process request is invalid");
  return new Promise((resolve, reject) => execFile(executable, args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024, shell: false }, (error) => error ? reject(new Error("document normalization tool failed")) : resolve()));
}

function numericRenderedPages(directory, prefix) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && new RegExp(`^${prefix}-[1-9]\\d*\\.png$`, "u").test(entry.name))
    .map((entry) => ({ entry, page: Number(new RegExp(`^${prefix}-([1-9]\\d*)\\.png$`, "u").exec(entry.name)[1]) }))
    .sort((left, right) => left.page - right.page);
}

function createTeamDocumentNormalizer({ sofficeExecutable = "soffice", pdfToPpmExecutable = "pdftoppm", execFile = childProcess.execFile, timeoutMs = 120_000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 300_000) throw new RangeError("document normalizer timeout is invalid");
  return async function normalizeTeamDocument({ root, metadata, isCancellationRequested }) {
    if (typeof root !== "string" || !path.isAbsolute(root) || !metadata || metadata.kind !== "raw-document" || typeof metadata.inputFile !== "string" || typeof isCancellationRequested !== "function") throw new TypeError("document normalization request is invalid");
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const work = path.join(root, ".document-normalized");
    fs.mkdirSync(work, { mode: 0o700 });
    let pdf = metadata.inputFile;
    if (metadata.documentKind === "pptx") {
      const profile = path.join(work, "libreoffice-profile");
      fs.mkdirSync(profile, { mode: 0o700 });
      await runFixedTool(sofficeExecutable, ["--headless", "--nologo", "--nodefault", "--norestore", "--nolockcheck", `-env:UserInstallation=${pathToFileURL(profile).href}`, "--convert-to", "pdf", "--outdir", work, metadata.inputFile], { cwd: work, timeoutMs, execFile });
      pdf = path.join(work, `${path.basename(metadata.inputFile, path.extname(metadata.inputFile))}.pdf`);
      if (!fs.existsSync(pdf) || !fs.lstatSync(pdf).isFile() || fs.lstatSync(pdf).isSymbolicLink()) throw new Error("document normalization did not produce a PDF");
    }
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const prefix = "page";
    await runFixedTool(pdfToPpmExecutable, ["-png", "-r", String(DOCUMENT_RENDER_DPI), "-f", "1", "-l", String(MAX_DOCUMENT_PAGES + 1), pdf, path.join(work, prefix)], { cwd: work, timeoutMs, execFile });
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const rendered = numericRenderedPages(work, prefix);
    if (rendered.length < 1) throw new Error("document normalization produced no pages");
    if (rendered.length > MAX_DOCUMENT_PAGES || rendered.some((item, index) => item.page !== index + 1)) throw new Error("document input exceeds the twenty-page limit or produced non-contiguous pages");
    let totalBytes = 0; let totalPixels = 0;
    const sources = rendered.map(({ entry }, pageIndex) => {
      const generated = path.join(work, entry.name);
      const assetPath = `assets/source-${String(pageIndex + 1).padStart(3, "0")}.png`;
      const target = path.join(root, ...assetPath.split("/"));
      fs.copyFileSync(generated, target, fs.constants.COPYFILE_EXCL);
      const dimensions = readRawImageDimensions(target, ".png");
      const bytes = fs.statSync(target).size; const pixels = dimensions.widthPx * dimensions.heightPx;
      totalBytes += bytes; totalPixels += pixels;
      if (!Number.isSafeInteger(pixels) || pixels > MAX_DOCUMENT_PAGE_PIXELS) throw new Error("normalized document page exceeds the pixel limit");
      return Object.freeze({ inputFile: target, assetPath, dimensions, pageIndex });
    });
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_DOCUMENT_TOTAL_BYTES || !Number.isSafeInteger(totalPixels) || totalPixels > MAX_DOCUMENT_TOTAL_PIXELS) throw new Error("normalized document pages exceed the batch processing limit");
    return Object.freeze({ sources: Object.freeze(sources), pages: sources.length, assets: sources.length });
  };
}

module.exports = { DOCUMENT_RENDER_DPI, MAX_DOCUMENT_PAGES, createTeamDocumentNormalizer, numericRenderedPages, runFixedTool };
