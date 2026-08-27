#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { readImageSize } = require("./lib/image-size");
const { countPptxSlides } = require("./lib/pptx-inventory");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pptxFile = path.resolve(args.pptx || path.join(process.cwd(), "runs", "openxml-sample-deck", "deck.pptx"));
  if (!fs.existsSync(pptxFile)) {
    throw new Error(`PPTX file not found: ${pptxFile}`);
  }
  const outputDir = path.resolve(args.out || path.join(process.cwd(), "runs", "libreoffice-benchmark"));
  const renderDir = path.join(outputDir, "render");
  const profileDir = path.join(outputDir, "lo-profile");
  fs.mkdirSync(renderDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });

  const soffice = resolveLibreOffice(args.soffice);
  const pdftoppm = resolvePdfToPpm(args.pdftoppm);
  const maxPages = parsePositiveInt(args["max-pages"], 2);
  const startedAt = Date.now();
  const stagedPptxFile = stageOfficeInput(pptxFile, renderDir);
  const pdf = await convertToPdf({
    soffice,
    pptxFile: stagedPptxFile,
    renderDir,
    profileDir,
    timeoutMs: parsePositiveInt(args["convert-timeout-ms"], 120000),
    retries: parsePositiveInt(args["convert-retries"], 4)
  });
  const convertElapsedMs = Date.now() - startedAt;
  const renderStartedAt = Date.now();
  const renderedPages = await renderPdf({ pdftoppm, pdf, renderDir, maxPages, dpi: parsePositiveInt(args.dpi, 144), timeoutMs: parsePositiveInt(args["render-timeout-ms"], 120000) });
  const renderElapsedMs = Date.now() - renderStartedAt;
  const report = {
    provider: "libreoffice-benchmark",
    pptxFile,
    sourceSizeBytes: fs.statSync(pptxFile).size,
    slideCount: countPptxSlides(pptxFile),
    stagedPptxFile,
    soffice,
    pdftoppm,
    pdf,
    maxPages,
    renderedPageCount: renderedPages.length,
    convertElapsedMs,
    renderElapsedMs,
    totalElapsedMs: Date.now() - startedAt,
    renderedPages,
    passed: renderedPages.length > 0 && renderedPages.length <= maxPages
  };
  const reportFile = path.join(outputDir, "libreoffice-benchmark.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...report, reportFile }, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

async function convertToPdf({ soffice, pptxFile, renderDir, profileDir, timeoutMs, retries }) {
  const pdf = path.join(renderDir, `${path.basename(pptxFile, path.extname(pptxFile))}.pdf`);
  let lastError = null;
  for (let attempt = 1; attempt <= Math.max(1, retries); attempt += 1) {
    const attemptProfileDir = attempt === 1 ? profileDir : `${profileDir}-${attempt}`;
    fs.mkdirSync(attemptProfileDir, { recursive: true });
    fs.rmSync(pdf, { force: true });
    try {
      await runTool(soffice, [
        "--headless",
        "--nologo",
        "--nodefault",
        "--norestore",
        "--nolockcheck",
        `-env:UserInstallation=${fileUrl(attemptProfileDir)}`,
        "--convert-to",
        "pdf",
        "--outdir",
        renderDir,
        pptxFile
      ], { timeout: timeoutMs });
    } catch (error) {
      lastError = error;
      if (fs.existsSync(pdf)) return pdf;
      continue;
    }
    if (fs.existsSync(pdf)) return pdf;
    lastError = new Error(`LibreOffice did not create expected PDF: ${pdf}`);
  }
  throw enrichLibreOfficeError(lastError, pptxFile, retries);
}

function enrichLibreOfficeError(error, pptxFile, retries) {
  const details = [
    `LibreOffice failed to convert ${pptxFile} after ${retries} attempt(s).`,
    error?.message,
    error?.stderr ? `stderr: ${String(error.stderr).slice(0, 2000)}` : "",
    error?.stdout ? `stdout: ${String(error.stdout).slice(0, 2000)}` : ""
  ].filter(Boolean).join("\n");
  return new Error(details);
}

function stageOfficeInput(file, renderDir) {
  const ext = path.extname(file).toLowerCase() || ".pptx";
  const staged = path.join(renderDir, `office-input${ext}`);
  if (path.resolve(file) !== path.resolve(staged)) {
    fs.copyFileSync(file, staged);
  }
  return staged;
}

async function renderPdf({ pdftoppm, pdf, renderDir, maxPages, dpi, timeoutMs }) {
  const prefix = path.join(renderDir, "lo-page");
  await runTool(pdftoppm, ["-png", "-r", String(dpi), "-f", "1", "-l", String(maxPages), pdf, prefix], { timeout: timeoutMs });
  return fs.readdirSync(renderDir)
    .filter((name) => /^lo-page-\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name, index) => {
      const image = path.join(renderDir, name);
      return { pageIndex: index, image, ...readImageSize(image) };
    });
}

function runTool(command, args, options = {}) {
  const useCmd = process.platform === "win32" && /\.cmd$/i.test(command);
  const actualCommand = useCmd ? "cmd.exe" : command;
  const actualArgs = useCmd ? ["/d", "/s", "/c", command, ...args] : args;
  return new Promise((resolve, reject) => {
    execFile(actualCommand, actualArgs, {
      windowsHide: true,
      timeout: options.timeout,
      maxBuffer: 20 * 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function resolveLibreOffice(value) {
  const candidates = [
    value,
    process.env.LIBREOFFICE_BIN,
    "C:\\Program Files\\LibreOffice\\program\\soffice.com",
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "soffice.com",
    "soffice"
  ].filter(Boolean);
  return candidates.find((candidate) => !path.isAbsolute(candidate) || fs.existsSync(candidate)) || "soffice";
}

function resolvePdfToPpm(value) {
  const bundled = path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "bin", "pdftoppm.cmd");
  const bundledExe = path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "poppler", "Library", "bin", "pdftoppm.exe");
  const bundledNativeCmd = path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "native", "poppler", "bin", "pdftoppm.cmd");
  const candidates = [
    value,
    process.env.PDFTOPPM_BIN,
    bundledExe,
    bundledNativeCmd,
    bundled,
    "pdftoppm"
  ].filter(Boolean);
  return candidates.find((candidate) => !path.isAbsolute(candidate) || fs.existsSync(candidate)) || "pdftoppm";
}

function fileUrl(file) {
  return `file:///${path.resolve(file).replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1:")}`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  fileUrl,
  resolveLibreOffice,
  resolvePdfToPpm
};
