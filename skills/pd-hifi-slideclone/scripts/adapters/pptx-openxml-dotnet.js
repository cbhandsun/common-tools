"use strict";

const { execFile, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { promoteNativeChartPayload, validateNativeChartPayload } = require("../lib/chart-native-payload");
const { expandRestrictedSvgGraphics } = require("../lib/restricted-svg");
const { createOpenXmlBuildCacheIdentity, readOpenXmlBuildCache, writeOpenXmlBuildCache } = require("../lib/openxml-build-cache");

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
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

module.exports = async function pptxOpenXmlDotnet(input, context) {
  const projectDir = path.join(context.skillRoot, "dotnet", "OpenXmlDeckBuilder");
  const outFile = path.join(context.outputDir, "pptx", "deck.pptx");
  await buildOpenXmlDecks([{ irFile: input.irFile, outFile }], context, projectDir);
  return {
    ok: true,
    data: {
      provider: "openxml-dotnet",
      pptxFile: outFile
    }
  };
};

async function buildOpenXmlDecks(jobs, context, projectDir = path.join(context.skillRoot, "dotnet", "OpenXmlDeckBuilder")) {
  const normalizedJobs = normalizeBuildJobs(jobs);
  const artifacts = createOpenXmlBuildArtifacts(normalizedJobs);
  try {
    const builder = resolveOpenXmlBuilderCommand(context, projectDir);
    const cache = resolveBuildCache(context);
    const cacheFileMemo = new Map();
    const misses = [];
    const cacheEntries = [];
    for (const safeJob of artifacts.safeJobs) {
      const key = cache ? createOpenXmlBuildCacheIdentity(safeJob, builder, projectDir, { fileMemo: cacheFileMemo }) : null;
      const hit = cache && readOpenXmlBuildCache(cache.dir, key, safeJob.outFile);
      cacheEntries.push({ job: safeJob, key, hit: Boolean(hit) });
      if (!hit) misses.push(safeJob);
    }
    if (misses.length > 0) {
      const builderArgs = createOpenXmlBuilderArgs(misses, artifacts, {
        concurrency: context.config?.openXmlBuilder?.batchConcurrency
      });
      await run(builder.command, [...builder.args, ...builderArgs], projectDir);
      if (cache) for (const entry of cacheEntries) if (!entry.hit) tryWriteOpenXmlBuildCache(cache.dir, entry.key, entry.job.outFile, context);
    }
    if (context.metrics && typeof context.metrics === "object") {
      context.metrics.openXmlBuildCache = { enabled: Boolean(cache), hits: cacheEntries.filter((entry) => entry.hit).length, misses: misses.length };
    }
    return normalizedJobs.map((job) => job.outFile);
  } finally {
    if (context.config?.openXmlBuilder?.retainBuildArtifacts !== true) {
      cleanupOpenXmlBuildArtifacts(artifacts);
    }
  }
}

function buildOpenXmlDecksSync(jobs, context, projectDir = path.join(context.skillRoot, "dotnet", "OpenXmlDeckBuilder"), options = {}) {
  const normalizedJobs = normalizeBuildJobs(jobs);
  const artifacts = createOpenXmlBuildArtifacts(normalizedJobs);
  try {
    const builder = resolveOpenXmlBuilderCommand(context, projectDir);
    const cache = resolveBuildCache(context);
    const fileMemo = new Map();
    const entries = artifacts.safeJobs.map((job) => {
      const key = cache ? createOpenXmlBuildCacheIdentity(job, builder, projectDir, { powerPointSafe: options.powerPointSafe, fileMemo }) : null;
      return { job, key, hit: Boolean(cache && readOpenXmlBuildCache(cache.dir, key, job.outFile)) };
    });
    const misses = entries.filter((entry) => !entry.hit).map((entry) => entry.job);
    if (misses.length) {
      const builderArgs = createOpenXmlBuilderArgs(misses, artifacts, options);
      if (options.powerPointSafe) builderArgs.push("--powerpoint-safe", "true");
      const result = spawnSync(builder.command, [...builder.args, ...builderArgs], {
        cwd: projectDir, encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024
      });
      if (result.status !== 0) {
        const details = [result.error?.message, result.stderr, result.stdout].filter(Boolean).join("\n").trim();
        throw new Error(`openxml build failed for ${misses.length} job(s): ${details || `exit status ${result.status}`}`);
      }
      if (cache) for (const entry of entries) if (!entry.hit) tryWriteOpenXmlBuildCache(cache.dir, entry.key, entry.job.outFile, context);
    }
    return normalizedJobs.map((job) => job.outFile);
  } finally {
    if (context.config?.openXmlBuilder?.retainBuildArtifacts !== true) cleanupOpenXmlBuildArtifacts(artifacts);
  }
}

function resolveBuildCache(context) {
  const config = context.config?.openXmlBuilder || {};
  if (config.cache === false || config.cache === "false") return null;
  const configured = typeof config.cacheDir === "string" && config.cacheDir.trim()
    ? config.cacheDir.trim()
    : "runs/slideclone-pptx-build-cache";
  return { dir: path.isAbsolute(configured) ? path.normalize(configured) : path.resolve(process.cwd(), configured) };
}

function tryWriteOpenXmlBuildCache(cacheDir, key, outFile, context) {
  try { return writeOpenXmlBuildCache(cacheDir, key, outFile, { maxBytes: context.config?.openXmlBuilder?.cacheMaxBytes }); }
  catch { return null; }
}

function normalizeBuildJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    throw new Error("buildOpenXmlDecks requires at least one job");
  }
  return jobs.map((job, index) => {
    const irFile = typeof job?.irFile === "string" ? job.irFile.trim() : "";
    const outFile = typeof job?.outFile === "string" ? job.outFile.trim() : "";
    if (!irFile || !outFile) {
      throw new Error(`buildOpenXmlDecks job ${index + 1} requires irFile and outFile`);
    }
    return {
      irFile: path.resolve(irFile),
      outFile: path.resolve(outFile),
      templatePptx: normalizeTemplatePptx(job?.templatePptx, index)
    };
  });
}

function normalizeTemplatePptx(value, index) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`buildOpenXmlDecks job ${index + 1} has an invalid templatePptx`);
  }
  const templatePptx = path.resolve(value.trim());
  if (!fs.existsSync(templatePptx) || !fs.statSync(templatePptx).isFile()) {
    throw new Error(`buildOpenXmlDecks job ${index + 1} template PPTX was not found: ${templatePptx}`);
  }
  return templatePptx;
}

function buildBatchArgs(jobs, artifacts, options = {}) {
  assertArtifactTracker(artifacts);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openxml-batch-"));
  const batchFile = path.join(tmp, "manifest.json");
  artifacts.directories.push(tmp);
  artifacts.files.push(batchFile);
  fs.writeFileSync(batchFile, `${JSON.stringify({
    ...(normalizeBatchConcurrency(options.concurrency) ? { concurrency: normalizeBatchConcurrency(options.concurrency) } : {}),
    jobs: jobs.map((job) => ({
      ir: job.irFile,
      out: job.outFile,
      ...(job.templatePptx ? { templatePptx: job.templatePptx } : {})
    }))
  }, null, 2)}\n`, "utf8");
  return ["--batch", batchFile];
}

function createOpenXmlBuildArtifacts(jobs) {
  const artifacts = createArtifactTracker();
  try {
    artifacts.safeJobs = prepareOpenXmlSafeJobs(jobs, artifacts);
    return artifacts;
  } catch (error) {
    cleanupOpenXmlBuildArtifacts(artifacts);
    throw error;
  }
}

function createArtifactTracker() {
  return { safeJobs: [], files: [], directories: [] };
}

function assertArtifactTracker(artifacts) {
  if (!artifacts || !Array.isArray(artifacts.files) || !Array.isArray(artifacts.directories)) {
    throw new TypeError("OpenXML build artifact tracker is required");
  }
}

function createOpenXmlBuilderArgs(safeJobs, artifacts, options = {}) {
  if (safeJobs.length !== 1) return buildBatchArgs(safeJobs, artifacts, { concurrency: options.concurrency ?? options.openXmlBuildConcurrency });
  const args = ["--ir", safeJobs[0].irFile, "--out", safeJobs[0].outFile];
  if (safeJobs[0].templatePptx) args.push("--template-pptx", safeJobs[0].templatePptx);
  return args;
}

function normalizeBatchConcurrency(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 8) throw new Error("OpenXML batch concurrency must be between 1 and 8");
  return number;
}

function prepareOpenXmlSafeJobs(jobs, artifacts) {
  assertArtifactTracker(artifacts);
  return jobs.map((job, index) => ({
    ...job,
    irFile: writeOpenXmlSafeIr(job.irFile, index, artifacts)
  }));
}

function writeOpenXmlSafeIr(irFile, jobIndex = 0, artifacts) {
  assertArtifactTracker(artifacts);
  const raw = fs.readFileSync(irFile, "utf8");
  const parsed = JSON.parse(raw);
  const ir = expandRestrictedSvgGraphics(parsed, { baseDir: path.dirname(irFile) });
  validateImageAssets(ir, path.dirname(irFile));
  sanitizeOpenXmlIr(ir, path.basename(irFile, path.extname(irFile)) || `deck-${jobIndex + 1}`);
  prepareNativeCharts(ir);
  const suffix = `${process.pid}-${Date.now().toString(36)}-${cryptoRandomSuffix()}`;
  const safeFile = path.join(path.dirname(irFile), `.openxml-safe-${suffix}-${path.basename(irFile)}`);
  fs.writeFileSync(safeFile, `${JSON.stringify(ir, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  artifacts.files.push(safeFile);
  return safeFile;
}

function cryptoRandomSuffix() {
  return crypto.randomBytes(6).toString("hex");
}

function cleanupOpenXmlBuildArtifacts(artifacts) {
  const files = Array.isArray(artifacts?.files) ? [...artifacts.files].reverse() : [];
  const directories = Array.isArray(artifacts?.directories) ? [...artifacts.directories].reverse() : [];
  for (const file of files) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // Cleanup is best-effort and must not hide the builder result or original failure.
    }
  }
  for (const directory of directories) {
    try {
      fs.rmdirSync(directory);
    } catch {
      // The adapter creates empty, single-use directories; never recursively remove an unexpected directory.
    }
  }
}

function validateImageAssets(ir, irDir) {
  const pages = Array.isArray(ir?.pages) ? ir.pages : [];
  const invalid = [];
  const missing = [];
  let checked = 0;

  pages.forEach((page, pageIndex) => {
    const images = Array.isArray(page?.images) ? page.images : [];
    images.forEach((image, imageIndex) => {
      const label = `page ${pageIndex + 1} image ${image?.id || imageIndex + 1}`;
      const assetPath = image?.assetPath;
      if (typeof assetPath !== "string" || !assetPath.trim() || assetPath.length > 32_768 || assetPath.includes("\0")) {
        invalid.push(label);
        return;
      }

      let resolved;
      try {
        resolved = path.isAbsolute(assetPath) ? path.normalize(assetPath) : path.resolve(irDir, assetPath);
      } catch {
        invalid.push(label);
        return;
      }
      checked += 1;
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        missing.push(`${label}: ${assetPath}`);
      }
    });
  });

  if (invalid.length > 0) {
    throw new Error(`OpenXML IR contains invalid image asset paths: ${invalid.slice(0, 10).join("; ")}`);
  }
  if (missing.length > 0) {
    const suffix = missing.length > 10 ? `; and ${missing.length - 10} more` : "";
    throw new Error(`OpenXML IR references ${missing.length} missing image asset(s): ${missing.slice(0, 10).join("; ")}${suffix}`);
  }
  return { checked };
}

function sanitizeOpenXmlIr(ir, deckName = "deck") {
  const pages = Array.isArray(ir?.pages) ? ir.pages : [];
  pages.forEach((page, pageIndex) => {
    ensureElementIds(page?.shapes, `${deckName}-p${pageIndex + 1}-shape`);
    ensureElementIds(page?.images, `${deckName}-p${pageIndex + 1}-image`);
    ensureElementIds(page?.tables, `${deckName}-p${pageIndex + 1}-table`);
    ensureElementIds(page?.textBoxes, `${deckName}-p${pageIndex + 1}-text`);
    ensureElementIds(page?.charts, `${deckName}-p${pageIndex + 1}-chart`);
  });
  return ir;
}

function prepareNativeCharts(ir) {
  for (const [pageIndex, page] of (Array.isArray(ir?.pages) ? ir.pages : []).entries()) {
    for (const [chartIndex, chart] of (Array.isArray(page?.charts) ? page.charts : []).entries()) {
      if (!chart || typeof chart !== "object" || Array.isArray(chart)) throw new Error(`page ${pageIndex + 1} chart ${chartIndex + 1} is invalid`);
      if (chart.nativePayload === undefined) chart.nativePayload = promoteNativeChartPayload(chart);
      const validation = validateNativeChartPayload(chart, `page ${pageIndex + 1} chart ${chart.id || chartIndex + 1}`);
      if (!validation.ok) throw new Error(validation.errors.join("; "));
    }
  }
  return ir;
}

function ensureElementIds(items, prefix) {
  if (!Array.isArray(items)) return;
  items.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const id = safeOpenXmlName(item.id);
    item.id = id || `${prefix}-${index + 1}`;
  });
}

function safeOpenXmlName(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "_")
    .trim();
}

function resolveOpenXmlBuilderCommand(context, projectDir) {
  const configured = context.config?.openXmlBuilder?.exePath || process.env.OPENXML_BUILDER_EXE;
  if (typeof configured === "string" && configured.trim()) {
    return {
      command: path.isAbsolute(configured) ? configured : path.resolve(projectDir, configured),
      args: []
    };
  }

  const configuration = normalizeBuildConfiguration(context.config?.openXmlBuilder?.configuration);
  const targetFramework = normalizeTargetFramework(context.config?.openXmlBuilder?.targetFramework);
  const binaryDir = path.join(projectDir, "bin", configuration, targetFramework);
  const exe = path.join(binaryDir, process.platform === "win32" ? "OpenXmlDeckBuilder.exe" : "OpenXmlDeckBuilder");
  if (fs.existsSync(exe) && !isBuildArtifactStale(exe, projectDir)) return { command: exe, args: [] };

  const dll = path.join(binaryDir, "OpenXmlDeckBuilder.dll");
  if (fs.existsSync(dll) && !isBuildArtifactStale(dll, projectDir)) return { command: resolveDotnet(context), args: [dll] };

  return {
    command: resolveDotnet(context),
    args: [
      "run",
      "--project",
      path.join(projectDir, "OpenXmlDeckBuilder.csproj"),
      "--"
    ]
  };
}

function isBuildArtifactStale(artifact, projectDir) {
  if (!fs.existsSync(artifact)) return true;
  const artifactMtime = fs.statSync(artifact).mtimeMs;
  return sourceFilesForBuildFreshness(projectDir)
    .filter((file) => fs.existsSync(file))
    .some((file) => fs.statSync(file).mtimeMs > artifactMtime);
}

function sourceFilesForBuildFreshness(projectDir) {
  const sources = fs.readdirSync(projectDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".cs") || entry.name.endsWith(".csproj")))
    .map((entry) => path.join(projectDir, entry.name));
  return sources.sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

function resolveDotnet(context) {
  if (process.env.DOTNET_BIN) return process.env.DOTNET_BIN;
  const local = path.resolve(context.skillRoot, "..", "..", ".tools", "dotnet", "dotnet.exe");
  if (fs.existsSync(local)) return local;
  return "dotnet";
}

function normalizeBuildConfiguration(value) {
  return typeof value === "string" && /^(Debug|Release)$/i.test(value.trim())
    ? value.trim().replace(/^./, (letter) => letter.toUpperCase())
    : "Debug";
}

function normalizeTargetFramework(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]+$/.test(value.trim())
    ? value.trim()
    : "net8.0";
}

module.exports.resolveOpenXmlBuilderCommand = resolveOpenXmlBuilderCommand;
module.exports.resolveDotnet = resolveDotnet;
module.exports.buildBatchArgs = buildBatchArgs;
module.exports.buildOpenXmlDecks = buildOpenXmlDecks;
module.exports.buildOpenXmlDecksSync = buildOpenXmlDecksSync;
module.exports.cleanupOpenXmlBuildArtifacts = cleanupOpenXmlBuildArtifacts;
module.exports.createOpenXmlBuildArtifacts = createOpenXmlBuildArtifacts;
module.exports.createOpenXmlBuilderArgs = createOpenXmlBuilderArgs;
module.exports.ensureElementIds = ensureElementIds;
module.exports.normalizeBuildJobs = normalizeBuildJobs;
module.exports.normalizeBatchConcurrency = normalizeBatchConcurrency;
module.exports.prepareOpenXmlSafeJobs = prepareOpenXmlSafeJobs;
module.exports.safeOpenXmlName = safeOpenXmlName;
module.exports.sanitizeOpenXmlIr = sanitizeOpenXmlIr;
module.exports.validateImageAssets = validateImageAssets;
module.exports.isBuildArtifactStale = isBuildArtifactStale;
module.exports.sourceFilesForBuildFreshness = sourceFilesForBuildFreshness;
module.exports.prepareNativeCharts = prepareNativeCharts;
module.exports.expandRestrictedSvgGraphics = expandRestrictedSvgGraphics;
module.exports.resolveBuildCache = resolveBuildCache;
