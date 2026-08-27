"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { run } = require("../lib/exec");
const { readImageSize } = require("../lib/image-size");
const { resolveLibreOffice, resolvePdfToPpm, fileUrl } = require("../libreoffice-benchmark");

module.exports = async function renderLibreOffice(input, context) {
  const pptxFile = input.pptx?.pptxFile;
  if (!pptxFile) {
    return {
      ok: false,
      error: "pptx.pptxFile is required for render-libreoffice"
    };
  }

  const renderDir = path.join(context.outputDir, "render", `iteration-${input.iteration || 0}`);
  fs.mkdirSync(renderDir, { recursive: true });
  const soffice = resolveLibreOffice();
  const pdftoppm = resolvePdfToPpm();
  const profileDir = path.join(renderDir, "lo-profile");
  fs.mkdirSync(profileDir, { recursive: true });
  const dpi = String(context.config?.render?.dpi || process.env.SLIDECLONE_DPI || "144");
  const maxPages = Number(context.config?.render?.maxPages || 0);

  await run(soffice, [
    "--headless",
    "--nologo",
    "--nodefault",
    "--norestore",
    "--nolockcheck",
    `-env:UserInstallation=${fileUrl(profileDir)}`,
    "--convert-to",
    "pdf",
    "--outdir",
    renderDir,
    pptxFile
  ], { timeout: context.config?.render?.convertTimeoutMs || 120000 });
  const pdf = path.join(renderDir, `${path.basename(pptxFile, path.extname(pptxFile))}.pdf`);
  if (!fs.existsSync(pdf)) throw new Error(`LibreOffice did not create expected PDF: ${pdf}`);
  await waitForStableFile(pdf, {
    timeoutMs: context.config?.render?.pdfReadyTimeoutMs || 10_000,
    intervalMs: context.config?.render?.pdfReadyPollMs || 250
  });

  const prefix = path.join(renderDir, "page");
  const renderArgs = ["-png", "-r", dpi];
  if (Number.isFinite(maxPages) && maxPages > 0) renderArgs.push("-f", "1", "-l", String(Math.floor(maxPages)));
  const renderPdfInput = stagePdfForRenderer(pdf);
  renderArgs.push(renderPdfInput.file, prefix);
  await runWithRetry(pdftoppm, renderArgs, {
    timeout: context.config?.render?.renderTimeoutMs || 120000,
    retries: context.config?.render?.pdfRenderRetries || 3,
    retryDelayMs: context.config?.render?.pdfRenderRetryDelayMs || 500
  });
  cleanupStagedPdf(renderPdfInput);
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
  fs.copyFileSync(resolved, file);
  return { file, cleanupDir };
}

function cleanupStagedPdf(staged) {
  if (!staged?.cleanupDir) return;
  try {
    fs.rmSync(staged.cleanupDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup only; render outputs are already written elsewhere.
  }
}

async function runWithRetry(command, args, options = {}) {
  let lastError = null;
  const retries = Math.max(1, Number(options.retries || 1));
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await run(command, args, { timeout: options.timeout });
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryablePdfReadError(error)) throw error;
      await delay(Number(options.retryDelayMs || 250) * attempt);
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
    await delay(intervalMs);
  }
  throw new Error(`Timed out waiting for stable file: ${file}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports.collectRenderedPages = collectRenderedPages;
module.exports._private = {
  isRetryablePdfReadError,
  stagePdfForRenderer,
  waitForStableFile
};
