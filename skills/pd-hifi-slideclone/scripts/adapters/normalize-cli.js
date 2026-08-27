"use strict";

const fs = require("fs");
const path = require("path");
const { run } = require("../lib/exec");
const { readImageSize } = require("../lib/image-size");
const { resolveLibreOffice, resolvePdfToPpm, fileUrl } = require("../libreoffice-benchmark");

module.exports = async function normalizeCli(input, context = {}) {
  const normalizedDir = path.join(input.outputDir, "normalized");
  fs.mkdirSync(normalizedDir, { recursive: true });

  const requestedFiles = resolveRequestedFiles(input.inputDir, context.inputFiles);
  const files = requestedFiles || (fs.existsSync(input.inputDir)
    ? fs.readdirSync(input.inputDir)
      .map((name) => path.resolve(input.inputDir, name))
      .filter((file) => fs.statSync(file).isFile())
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }))
    : []);

  const pageImages = [];
  const warnings = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      const target = path.join(normalizedDir, `${String(pageImages.length + 1).padStart(3, "0")}${ext}`);
      fs.copyFileSync(file, target);
      pageImages.push({ sourceImage: target, originalSource: file, ...readImageSize(target) });
    } else if (ext === ".pdf") {
      pageImages.push(...await renderPdf(file, normalizedDir, pageImages.length, context));
    } else if ([".ppt", ".pptx"].includes(ext)) {
      const pdf = await convertOfficeToPdf(file, normalizedDir, context);
      pageImages.push(...await renderPdf(pdf, normalizedDir, pageImages.length, context));
    } else {
      warnings.push(`Skipped unsupported input: ${file}`);
    }
  }

  return {
    ok: true,
    data: {
      provider: "normalize-cli",
      pageImages,
      normalizedDir,
      warnings
    }
  };
};

function resolveRequestedFiles(inputDir, requestedFiles) {
  if (requestedFiles === undefined) return null;
  if (!Array.isArray(requestedFiles) || requestedFiles.length === 0 || requestedFiles.length > 10000) {
    throw new Error("requested input files are invalid");
  }
  const root = fs.realpathSync.native(inputDir);
  const approved = [];
  const seen = new Set();
  for (const requested of requestedFiles) {
    if (typeof requested !== "string" || !requested) throw new Error("requested input files are invalid");
    const candidate = path.resolve(requested);
    const relative = path.relative(root, candidate);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("requested input file is outside input directory");
    }
    const info = fs.lstatSync(candidate);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("requested input file is invalid");
    const actual = fs.realpathSync.native(candidate);
    const actualRelative = path.relative(root, actual);
    if (!actualRelative || actualRelative === ".." || actualRelative.startsWith(`..${path.sep}`) || path.isAbsolute(actualRelative)) {
      throw new Error("requested input file resolves outside input directory");
    }
    if (!seen.has(actual)) {
      seen.add(actual);
      approved.push(actual);
    }
  }
  return approved;
}

async function convertOfficeToPdf(file, outDir, context = {}) {
  const soffice = resolveLibreOffice();
  const stagedFile = stageOfficeInput(file, outDir);
  const pdf = path.join(outDir, `${path.basename(stagedFile, path.extname(stagedFile))}.pdf`);
  const configuredRetries = Number(context.config?.normalize?.convertRetries ?? 4);
  const attempts = Number.isFinite(configuredRetries) && configuredRetries > 0
    ? Math.floor(configuredRetries)
    : 4;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const profileDir = path.join(outDir, `lo-profile-${attempt}`);
    fs.mkdirSync(profileDir, { recursive: true });
    fs.rmSync(pdf, { force: true });
    try {
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
        outDir,
        stagedFile
      ], { timeout: context.config?.normalize?.convertTimeoutMs || 120000 });
    } catch (error) {
      lastError = error;
      if (fs.existsSync(pdf)) return pdf;
      continue;
    }
    if (fs.existsSync(pdf)) return pdf;
    lastError = new Error(`LibreOffice did not create expected PDF: ${pdf}`);
  }
  throw enrichLibreOfficeError(lastError, file, attempts);
}

function stageOfficeInput(file, outDir) {
  const ext = path.extname(file).toLowerCase() || ".pptx";
  const staged = path.join(outDir, `office-input${ext}`);
  if (path.resolve(file) !== path.resolve(staged)) {
    fs.copyFileSync(file, staged);
  }
  return staged;
}

function enrichLibreOfficeError(error, file, attempts) {
  const details = [
    `LibreOffice failed to convert ${file} after ${attempts} attempt(s).`,
    error?.message,
    error?.stderr ? `stderr: ${String(error.stderr).slice(0, 2000)}` : "",
    error?.stdout ? `stdout: ${String(error.stdout).slice(0, 2000)}` : ""
  ].filter(Boolean).join("\n");
  return new Error(details);
}

async function renderPdf(pdf, outDir, startIndex, context = {}) {
  const pdftoppm = resolvePdfToPpm();
  const prefix = path.join(outDir, `pdf-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const dpi = String(context.config?.normalize?.dpi || process.env.SLIDECLONE_DPI || "144");
  const maxPages = Number(context.config?.normalize?.maxPages || 0);
  const args = ["-png", "-r", dpi];
  if (Number.isFinite(maxPages) && maxPages > 0) args.push("-f", "1", "-l", String(Math.floor(maxPages)));
  args.push(pdf, prefix);
  await run(pdftoppm, args, { timeout: context.config?.normalize?.renderTimeoutMs || 120000 });
  return fs.readdirSync(outDir)
    .filter((name) => name.startsWith(path.basename(prefix)) && name.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name, index) => {
      const generated = path.join(outDir, name);
      const target = path.join(outDir, `${String(startIndex + index + 1).padStart(3, "0")}.png`);
      fs.rmSync(target, { force: true });
      fs.renameSync(generated, target);
      return { sourceImage: target, originalSource: pdf, ...readImageSize(target) };
    });
}
