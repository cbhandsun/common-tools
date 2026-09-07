"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { run } = require("./renderer-process");
const { readImageSize } = require("./image-size");
const { resolveLibreOffice, resolvePdfToPpm, fileUrl } = require("./libreoffice-tools");

module.exports = async function renderLibreOffice(input, context) {
  const pptxFile = input.pptx?.pptxFile;
  if (!pptxFile) {
    return {
      ok: false,
      error: "pptx.pptxFile is required for render-libreoffice"
    };
  }

  await throwIfCancelled(context.isCancellationRequested);
  const renderDir = createRenderDirectory(context.outputDir, input.iteration === undefined ? 0 : input.iteration);
  const soffice = resolveLibreOffice();
  const pdftoppm = resolvePdfToPpm();
  const dpi = String(context.config?.render?.dpi || process.env.SLIDECLONE_DPI || "144");
  const maxPages = Number(context.config?.render?.maxPages || 0);
  const pdf = path.join(renderDir, `${path.basename(pptxFile, path.extname(pptxFile))}.pdf`);
  const conversion = stageLibreOfficeConversion(pptxFile, renderDir);
  await withStagedResource(conversion, async () => {
    await run(soffice, [
      "--headless",
      "--nologo",
      "--nodefault",
      "--norestore",
      "--nolockcheck",
      `-env:UserInstallation=${fileUrl(conversion.profileDir)}`,
      "--convert-to",
      "pdf",
      "--outdir",
      conversion.renderDir,
      conversion.pptxFile
    ], { timeout: context.config?.render?.convertTimeoutMs || 120000, isCancellationRequested: context.isCancellationRequested });
    const convertedPdf = path.join(conversion.renderDir, `${path.basename(conversion.pptxFile, path.extname(conversion.pptxFile))}.pdf`);
    if (!fs.existsSync(convertedPdf)) throw new Error(`LibreOffice did not create expected PDF: ${convertedPdf}`);
    if (path.resolve(convertedPdf) !== path.resolve(pdf)) fs.copyFileSync(convertedPdf, pdf);
  });
  await waitForStableFile(pdf, {
    isCancellationRequested: context.isCancellationRequested,
    timeoutMs: context.config?.render?.pdfReadyTimeoutMs || 10_000,
    intervalMs: context.config?.render?.pdfReadyPollMs || 250
  });

  const prefix = path.join(renderDir, "page");
  const renderArgs = ["-png", "-r", dpi];
  if (Number.isFinite(maxPages) && maxPages > 0) renderArgs.push("-f", "1", "-l", String(Math.floor(maxPages)));
  const renderPdfInput = stagePdfForRenderer(pdf);
  renderArgs.push(renderPdfInput.file, prefix);
  await withStagedResource(renderPdfInput, () => runWithRetry(pdftoppm, renderArgs, {
    isCancellationRequested: context.isCancellationRequested,
    timeout: context.config?.render?.renderTimeoutMs || 120000,
    retries: context.config?.render?.pdfRenderRetries || 3,
    retryDelayMs: context.config?.render?.pdfRenderRetryDelayMs || 500
  }));
  const renderedPages = collectRenderedPages(renderDir);

  return {
    ok: true,
    provider: "render-libreoffice",
    renderDir,
    pdf,
    renderedPageCount: renderedPages.length,
    pages: renderedPages,
    data: {
      provider: "render-libreoffice",
      renderDir,
      pdf,
      renderedPages
    }
  };
};

function createRenderDirectory(outputDir, iteration) {
  if (!Number.isSafeInteger(iteration) || iteration < 0 || iteration > 10000) throw new TypeError("render iteration is invalid");
  const iterationDir = path.join(outputDir, "render", `iteration-${iteration}`);
  fs.mkdirSync(iterationDir, { recursive: true });
  return fs.mkdtempSync(path.join(iterationDir, "attempt-"));
}

function collectRenderedPages(renderDir) {
  return fs.readdirSync(renderDir)
    .filter((name) => /^page-\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name, pageIndex) => {
      const image = path.join(renderDir, name);
      return { pageIndex, image, ...readImageSize(image) };
    });
}

function stagePdfForRenderer(pdf) {
  const resolved = path.resolve(pdf);
  if (resolved.length < 180) return { file: resolved, cleanupDir: "" };
  const cleanupDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-pdf-"));
  const file = path.join(cleanupDir, "input.pdf");
  try {
    fs.copyFileSync(resolved, file);
  } catch (error) {
    cleanupStagedResource({ cleanupDir }, [error]);
    throw error;
  }
  return { file, cleanupDir };
}

function stageLibreOfficeConversion(pptxFile, _renderDir) {
  const resolvedPptx = path.resolve(pptxFile);
  // Every attempt needs a fresh profile and output, even for short paths.
  // A successful process exit must never validate a PDF from an earlier run.
  const cleanupDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-lo-"));
  const stagedRenderDir = path.join(cleanupDir, "out");
  const profileDir = path.join(cleanupDir, "profile");
  const stagedPptx = path.join(cleanupDir, `input${path.extname(resolvedPptx) || ".pptx"}`);
  try {
    fs.mkdirSync(stagedRenderDir, { recursive: true });
    fs.mkdirSync(profileDir, { recursive: true });
    fs.copyFileSync(resolvedPptx, stagedPptx);
  } catch (error) {
    cleanupStagedResource({ cleanupDir }, [error]);
    throw error;
  }
  return { pptxFile: stagedPptx, renderDir: stagedRenderDir, profileDir, cleanupDir };
}

function cleanupStagedConversion(conversion) {
  cleanupStagedResource(conversion);
}

function cleanupStagedResource(staged, operationErrors = []) {
  if (!staged?.cleanupDir) return;
  try {
    fs.rmSync(staged.cleanupDir, { recursive: true, force: true });
  } catch (error) {
    if (operationErrors.length) throw new AggregateError([...operationErrors, error], "renderer operation and temporary cleanup failed", { cause: error });
    throw error;
  }
}

async function withStagedResource(staged, action) {
  let result;
  try {
    result = await action();
  } catch (error) {
    cleanupStagedResource(staged, [error]);
    throw error;
  }
  cleanupStagedResource(staged);
  return result;
}

async function runWithRetry(command, args, options = {}) {
  let lastError = null;
  const retries = Math.max(1, Number(options.retries || 1));
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await throwIfCancelled(options.isCancellationRequested);
      return await run(command, args, { timeout: options.timeout, isCancellationRequested: options.isCancellationRequested });
    } catch (error) {
      lastError = error;
      if (error?.message === "editable job was cancelled") throw error;
      if (attempt >= retries || !isRetryablePdfReadError(error)) throw error;
      await cancellableDelay(Number(options.retryDelayMs || 250) * attempt, options.isCancellationRequested);
    }
  }
  throw lastError;
}

function isRetryablePdfReadError(error) {
  const text = `${error?.message || ""}\n${error?.stderr || ""}\n${error?.stdout || ""}`;
  return /couldn'?t open file|i\/o error|permission denied|being used by another process|no error/i.test(text);
}

async function waitForStableFile(file, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs || 10_000));
  const intervalMs = Math.max(20, Number(options.intervalMs || 250));
  const startedAt = Date.now();
  let previousSize = -1;
  let stableCount = 0;
  while (Date.now() - startedAt <= timeoutMs) {
    await throwIfCancelled(options.isCancellationRequested);
    try {
      const stat = fs.statSync(file);
      if (stat.size > 0 && stat.size === previousSize) {
        stableCount += 1;
        if (stableCount >= 2) return true;
      } else {
        previousSize = stat.size;
        stableCount = 0;
      }
    } catch {
      stableCount = 0;
    }
    await cancellableDelay(intervalMs, options.isCancellationRequested);
  }
  throw new Error(`Timed out waiting for stable file: ${file}`);
}

async function throwIfCancelled(check) {
  if (typeof check !== "function") return;
  let cancelled;
  try { cancelled = await check(); } catch { cancelled = true; }
  if (cancelled) throw new Error("editable job was cancelled");
}

async function cancellableDelay(ms, check) {
  const end = Date.now() + ms;
  do {
    await throwIfCancelled(check);
    await delay(Math.min(250, Math.max(0, end - Date.now())));
  } while (Date.now() < end);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports.collectRenderedPages = collectRenderedPages;
module.exports._private = {
  createRenderDirectory,
  cleanupStagedConversion,
  isRetryablePdfReadError,
  stageLibreOfficeConversion,
  stagePdfForRenderer,
  runWithRetry,
  waitForStableFile
};
