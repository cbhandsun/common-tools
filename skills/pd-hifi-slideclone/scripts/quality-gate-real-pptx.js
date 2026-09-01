#!/usr/bin/env node
"use strict";
const { countLogicalNativeShapes, countLogicalNativeTextBoxes, isAllowedDecorativeBackgroundImage, isIntentionalRasterImage } = require("./lib/logical-native-object-count");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { readPng, writePng } = require("./lib/png");
const { summarizeLayerProfile } = require("./lib/layer-classifier");
const { summarizeComponentStrategyProfile } = require("./lib/component-strategy-profile");
const { summarizeNativeObjectConflicts } = require("./lib/native-object-conflict-audit");
const { fingerprintOoxmlPackage } = require("./lib/ooxml-package-fingerprint");
const { auditPptxTextLayers } = require("./lib/ooxml-text-layer-audit");
const { validateReconstructionContracts } = require("./lib/reconstruction-contract");
const { evaluateDeckReconstructionBudget } = require("./lib/reconstruction-quality-budget");
const {
  DEFAULT_OCR_ADAPTER,
  boundedHeartbeatMs,
  consumePaddleOcrBrokerEnvironment,
  readPaddleOcrConfig,
  readReconstructionBudgetConfig,
  readUmiOcrConfig,
  summarizeQualityGateStatus: summarizeQualityGateStatusCore
} = require("./lib/quality-gate-policy");
const { buildQualityGateOutput, readQualityGateOutputFormat } = require("./lib/quality-gate-output");
const { auditSourceMediaExclusion } = require("./lib/source-media-exclusion");
const renderPowerPointCom = require("./adapters/render-powerpoint-com");
const { createQualityEvidenceIdentity, loadOrComputeQualityEvidence, qualityEvidenceConfig, qualityEvidenceImplementationFiles, tryWriteQualityEvidenceCache } = require("./lib/quality-evidence-cache");

const RENDER_CACHE_METADATA = ".slideclone-render-cache.json";

const DEFAULT_THRESHOLDS = { acceptPixelDiffRatio: 0.22, acceptForegroundMissingRatio: 0.3, reviewPixelDiffRatio: 0.38, reviewForegroundMissingRatio: 0.5, maxRasterImageAreaRatio: 0.65, fullPageWidthRatio: 0.92, fullPageHeightRatio: 0.92 };

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const brokerConfig = consumePaddleOcrBrokerEnvironment(process.env);
  const outputFormat = readQualityGateOutputFormat(args);
  const progress = createProgressReporter(args);
  const timings = {};
  progress({ phase: "run", status: "start" });
  if (!args.ir) throw new Error("--ir is required");
  const irFile = path.resolve(args.ir);
  const pptxFile = args.pptx ? path.resolve(args.pptx) : null;
  const outputDir = path.resolve(args.out || path.join(process.cwd(), "runs", "real-pptx-quality-gate", path.basename(irFile, ".json")));
  ensureDir(outputDir);
  ensureDir(path.join(outputDir, "diff"));

  const thresholds = readThresholds(args);
  const sourceIr = readJson(irFile);
  const ir = hydrateSourceImages(sourceIr, path.dirname(irFile));
  const qualityIrFile = path.join(outputDir, "quality-input.ir.json");
  fs.writeFileSync(qualityIrFile, `${JSON.stringify(ir, null, 2)}\n`, "utf8");

  const requestedRenderer = normalizeRenderer(args.renderer || args.render || "libreoffice");
  const rendererSelection = selectRendererForIr(requestedRenderer, ir);
  const renderer = rendererSelection.effectiveRenderer;
  const renderOutputDir = resolveRenderOutputDir(args, outputDir, irFile);
  const renderCacheIdentity = pptxFile ? createRenderCacheIdentity({
    pptxFile,
    renderer,
    expectedPages: expectedRenderPageCount({ args, irFile }),
    dpi: Number(args.dpi || 144)
  }) : null;
  const reusableRenderDir = resolveReusableRenderDir({
    args,
    outputDir,
    irFile,
    pptxFile,
    renderOutputDir,
    renderer,
    cacheIdentity: renderCacheIdentity
  });
  const renderStartedAt = Date.now();
  progress({ phase: "render", status: "start", cached: Boolean(reusableRenderDir), renderer });
  const render = reusableRenderDir
    ? readRenderedPages(reusableRenderDir, {
      renderer,
      expectedPages: expectedRenderPageCount({ args, irFile })
    })
    : await renderWithEngine({
      renderer,
      pptxFile,
      outputDir: renderOutputDir,
      maxPages: Number(args["max-pages"] || 999),
      progress,
      heartbeatMs: boundedHeartbeatMs(args["heartbeat-ms"])
    });
  timings.renderMs = Date.now() - renderStartedAt;
  progress({ phase: "render", status: "done", cached: Boolean(reusableRenderDir), renderer, elapsedMs: timings.renderMs });
  if (!reusableRenderDir && renderCacheIdentity && render?.renderDir) {
    writeRenderCacheMetadata(render.renderDir, renderCacheIdentity);
  }
  const alignedRender = {
    ...alignRenderedPageIndexesToIr(render, ir),
    rendererSelection
  };
  const context = {
    outputDir,
    config: {
      diff: {
        foregroundTolerancePx: Number(args.foregroundTolerancePx || 2),
        foregroundToleranceDelta: Number(args.foregroundToleranceDelta || 54)
      },
      thresholds: {
        pixelDiffRatio: thresholds.acceptPixelDiffRatio,
        foregroundMissingRatio: thresholds.acceptForegroundMissingRatio,
        maxRasterImageAreaRatio: thresholds.maxRasterImageAreaRatio,
        ...(typeof thresholds.textCoverage === "number" ? { textCoverage: thresholds.textCoverage } : {})
      },
      textOcr: readTextOcrConfig(args),
      umiOcr: readUmiOcrConfig(args),
      paddleOcr: { ...readPaddleOcrConfig(args), ...brokerConfig }
    },
    skillRoot: path.resolve(__dirname, ".."),
    onProgress: progress
  };
  const evidenceCacheDir = String(args["no-evidence-cache"] || "").toLowerCase() === "true"
    ? ""
    : path.resolve(args["evidence-cache-dir"] || path.join("runs", "slideclone-quality-evidence-cache"));
  const evidenceIdentity = evidenceCacheDir ? createQualityEvidenceIdentity({
    ir,
    irFile,
    render: alignedRender,
    config: qualityEvidenceConfig(context),
    thresholds,
    implementationFiles: qualityEvidenceImplementationFiles(context, __filename)
  }) : null;
  const evidence = await loadOrComputeQualityEvidence({ cacheDir: evidenceCacheDir, identity: evidenceIdentity, outputDir, qualityIrFile, ir, render: alignedRender, thresholds: context.config.thresholds, context, progress });
  const { cachedEvidence, diff, compare } = evidence;
  Object.assign(timings, evidence.timings);

  const auditStartedAt = Date.now();
  progress({ phase: "audit", status: "start" });
  const raster = summarizeRasterImages(ir, thresholds);
  const pages = assessPages({
    ir,
    render: alignedRender,
    diff: diff.data,
    compare: compare.data,
    raster,
    thresholds
  });
  const summary = summarizePages(pages);
  const editabilityProfile = summarizeEditabilityProfile({
    ir,
    raster,
    editability: compare.data?.editability || null
  });
  const nativeComponentProfile = summarizeNativeComponentProfile(ir);
  const componentTemplateCropStatus = summarizeComponentTemplateCropStatus(ir);
  const layerProfile = summarizeLayerProfile(ir);
  const componentStrategyProfile = summarizeComponentStrategyProfile(ir);
  const visualUnitDecisionProfile = summarizeVisualUnitDecisionProfile(ir);
  const nativeObjectConflictProfile = summarizeNativeObjectConflicts(ir);
  const pptxTextLayerAudit = auditPptxTextLayers(pptxFile, ir);
  const reconstructionContract = validateReconstructionContracts(ir, { requireComplete: true });
  const reconstructionBudgetConfig = readReconstructionBudgetConfig(args);
  const reconstructionBudget = evaluateDeckReconstructionBudget(ir, reconstructionBudgetConfig);
  const sourceMediaExclusion = auditSourceMediaExclusion({
    ir,
    pptxFile,
    baseDir: path.dirname(irFile),
    options: {
      perceptualDistance: Number(args["source-media-perceptual-distance"] ?? 4)
    }
  });
  timings.auditMs = Date.now() - auditStartedAt;
  progress({ phase: "audit", status: "done", elapsedMs: timings.auditMs });
  const contactSheetStartedAt = Date.now();
  const contactPageCount = Number(args["contact-pages"] ?? 12);
  progress({ phase: "contact-sheet", status: "start", pages: Math.max(0, contactPageCount) });
  const contactSheet = cachedEvidence?.contactSheet || (contactPageCount > 0
    ? buildContactSheet({
      pages,
      render: alignedRender,
      maxPages: contactPageCount,
      outFile: path.join(outputDir, "quality-contact-sheet.png")
    })
    : null);
  timings.contactSheetMs = Date.now() - contactSheetStartedAt;
  timings.contactSheetCacheHit = Boolean(cachedEvidence?.contactSheet);
  progress({ phase: "contact-sheet", status: "done", elapsedMs: timings.contactSheetMs, skipped: contactPageCount <= 0 });
  const requireCompareThresholds = args["fail-on-thresholds"] === "true"
    || typeof thresholds.textCoverage === "number";
  const gate = summarizeQualityGateStatus({
    summary,
    editabilityProfile,
    nativeComponentProfile,
    layerProfile,
    requireNoTextOverlayRisk: args["fail-on-text-overlay-risk"] === "true",
    requireNoResidualLayerCandidates: args["fail-on-residual-layer-candidates"] === "true",
    requireNoRetainedComponentTemplateCrops: args["fail-on-component-template-retained-crops"] === "true",
    requireNoActionableRetainedComponentTemplateCrops: args["fail-on-actionable-component-template-retained-crops"] === "true",
    requireNoActionableUnexplainedCrops: args["fail-on-actionable-unexplained-crops"] === "true",
    requireNoNativeObjectConflicts: args["fail-on-native-object-conflicts"] === "true",
    requireNoDuplicatePptxText: args["fail-on-duplicate-pptx-text"] === "true",
    requireCompareThresholds,
    comparePassed: compare.data?.passed !== false,
    componentTemplateCropStatus,
    visualUnitDecisionProfile,
    nativeObjectConflictProfile,
    pptxTextLayerAudit,
    reconstructionContract,
    reconstructionBudget,
    sourceMediaExclusion,
    requireReconstructionContract: args["fail-on-reconstruction-contract"] !== "false",
    requireReconstructionBudget: reconstructionBudgetConfig.required,
    requireNoSourceMedia: args["fail-on-source-media"] !== "false"
  });
  const evidenceCacheWriteStartedAt = Date.now();
  const evidenceCacheWrite = !cachedEvidence && evidenceIdentity
    ? tryWriteQualityEvidenceCache({
      cacheDir: evidenceCacheDir,
      identity: evidenceIdentity,
      outputDir,
      diff: diff.data,
      compare: compare.data,
      contactSheet
    })
    : null;
  timings.evidenceCacheWriteMs = Date.now() - evidenceCacheWriteStartedAt;
  timings.totalMs = Date.now() - startedAt;
  const report = {
    provider: "quality-gate-real-pptx",
    irFile,
    pptxFile,
    outputDir,
    thresholds,
    summary,
    pages,
    deckMetrics: summarizeComparedDeckMetrics(compare.data?.summary || {}, pages),
    editability: compare.data?.editability || null,
    editabilityProfile,
    nativeComponentProfile,
    componentTemplateCropStatus,
    layerProfile,
    componentStrategyProfile,
    visualUnitDecisionProfile,
    nativeObjectConflictProfile,
    pptxTextLayerAudit,
    reconstructionContract,
    reconstructionBudget,
    reconstructionBudgetConfig,
    sourceMediaExclusion,
    raster,
    render: alignedRender,
    diff: diff.data,
    compare: compare.data,
    gate,
    timings,
    evidenceCache: evidenceIdentity ? {
      enabled: true,
      key: evidenceIdentity.key,
      hit: Boolean(cachedEvidence),
      files: cachedEvidence?.files ?? evidenceCacheWrite?.files ?? 0
    } : { enabled: false, hit: false },
    contactSheet,
    generatedAt: new Date().toISOString()
  };
  const reportFile = path.join(outputDir, "quality-gate-report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  progress({ phase: "run", status: "done", elapsedMs: timings.totalMs, passed: gate.passed });

  const stdout = buildQualityGateOutput({ ...report, reportFile }, {
    format: outputFormat
  });
  process.stdout.write(`${JSON.stringify(stdout, null, 2)}\n`);
  if ((args["fail-on-rejected"] === "true" && summary.rejected > 0)
    || (args["fail-on-text-overlay-risk"] === "true" && gate.failures.includes("text-overlay-risk"))
    || (args["fail-on-residual-layer-candidates"] === "true" && gate.failures.includes("residual-layer-candidates"))
    || (args["fail-on-component-template-retained-crops"] === "true" && gate.failures.includes("component-template-retained-crops"))
    || (args["fail-on-actionable-component-template-retained-crops"] === "true" && gate.failures.includes("actionable-component-template-retained-crops"))
    || (args["fail-on-actionable-unexplained-crops"] === "true" && gate.failures.includes("actionable-unexplained-crops"))
    || (args["fail-on-native-object-conflicts"] === "true" && gate.failures.includes("native-object-conflicts"))
    || (args["fail-on-duplicate-pptx-text"] === "true" && gate.failures.includes("duplicate-pptx-text"))
    || (requireCompareThresholds && gate.failures.includes("required-thresholds"))
    || ((args["fail-on-reconstruction-contract"] !== "false") && gate.failures.includes("reconstruction-contract"))
    || (reconstructionBudgetConfig.required && gate.failures.includes("reconstruction-budget"))
    || ((args["fail-on-source-media"] !== "false") && gate.failures.includes("source-media-exclusion"))) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function createProgressReporter(args = {}) {
  if (args.progress === "false" || args.quiet === "true") return () => {};
  return (event) => process.stderr.write(`[slideclone-progress] ${JSON.stringify({ scope: "quality-gate", ...event })}\n`);
}

function readThresholds(args = {}) {
  return {
    acceptPixelDiffRatio: numberArg(args["accept-pixel"], DEFAULT_THRESHOLDS.acceptPixelDiffRatio),
    acceptForegroundMissingRatio: numberArg(args["accept-foreground"], DEFAULT_THRESHOLDS.acceptForegroundMissingRatio),
    reviewPixelDiffRatio: numberArg(args["review-pixel"], DEFAULT_THRESHOLDS.reviewPixelDiffRatio),
    reviewForegroundMissingRatio: numberArg(args["review-foreground"], DEFAULT_THRESHOLDS.reviewForegroundMissingRatio),
    maxRasterImageAreaRatio: numberArg(args["max-raster-area"], DEFAULT_THRESHOLDS.maxRasterImageAreaRatio),
    fullPageWidthRatio: numberArg(args["full-page-width"], DEFAULT_THRESHOLDS.fullPageWidthRatio),
    fullPageHeightRatio: numberArg(args["full-page-height"], DEFAULT_THRESHOLDS.fullPageHeightRatio),
    textCoverage: optionalNumberArg(args["min-text-coverage"])
  };
}

function readTextOcrConfig(args = {}) {
  const enabled = args["text-ocr"] === "true"
    || Boolean(args["text-ocr-adapter"])
    || Boolean(args["text-ocr-mode"])
    || Boolean(args["text-ocr-pages"])
    || Boolean(args["min-text-coverage"]);
  return {
    enabled,
    adapter: args["text-ocr-adapter"] || DEFAULT_OCR_ADAPTER,
    mode: args["text-ocr-mode"] || "anchored",
    sourceOcr: args["text-ocr-source"] === "true",
    // Keep the gate crop aligned with text micro-adjust: OCR needs enough
    // surrounding pixels to avoid rejecting correct Chinese glyph edges.
    paddingPt: numberArg(args["text-ocr-padding"], 16),
    microBatch: args["text-ocr-micro-batch"] !== "false",
    microBatchSize: numberArg(args["text-ocr-micro-batch-size"], 8),
    psm: args["text-ocr-psm"] || undefined,
    pageIndexes: parsePageIndexes(args["text-ocr-pages"])
  };
}


function hydrateSourceImages(ir, irDir) {
  const next = JSON.parse(JSON.stringify(ir));
  for (const page of next.pages || []) {
    const sourceImage = resolveSourceImage(page, irDir);
    if (sourceImage) page.sourceImage = sourceImage;
  }
  return next;
}

function resolveSourceImage(page, irDir) {
  const candidates = [
    page.sourceImage,
    ...collectItems(page).map((item) => item?.source?.pageImage),
    ...collectItems(page).map((item) => item?.sourceImage)
  ].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate)
      ? candidate
      : path.resolve(irDir, candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

async function renderWithEngine({ renderer, pptxFile, outputDir, maxPages, progress, heartbeatMs }) {
  if (renderer === "powerpoint") {
    return renderWithPowerPoint({ pptxFile, outputDir, maxPages, progress, heartbeatMs });
  }
  return renderWithLibreOffice({ pptxFile, outputDir, maxPages, progress, heartbeatMs });
}

function selectRendererForIr(requestedRenderer, ir = {}) {
  const requested = normalizeRenderer(requestedRenderer || "libreoffice");
  const tableCount = (Array.isArray(ir?.pages) ? ir.pages : [])
    .reduce((sum, page) => sum + (Array.isArray(page?.tables) ? page.tables.length : 0), 0);
  const mixedImageTextGroupCount = countMixedImageTextComponentGroups(ir);
  const largeNoWrapGroupTextCount = countLargeNoWrapGroupText(ir);
  return {
    requestedRenderer: requested,
    effectiveRenderer: requested,
    tableCount,
    mixedImageTextGroupCount,
    largeNoWrapGroupTextCount,
    fallbackApplied: false,
    reason: "requested renderer is compatible with detected IR content"
  };
}

function countLargeNoWrapGroupText(ir = {}) {
  let count = 0;
  for (const page of Array.isArray(ir?.pages) ? ir.pages : []) {
    for (const item of Array.isArray(page?.textBoxes) ? page.textBoxes : []) {
      const groupId = String(item?.source?.nativeComponentGroupId || item?.style?.nativeComponentGroupId || "").trim();
      const noWrap = item?.wrap === false || item?.style?.wrap === false;
      if (groupId && noWrap && Number(item?.font?.sizePt || 0) >= 24) count += 1;
    }
  }
  return count;
}

function countMixedImageTextComponentGroups(ir = {}) {
  let count = 0;
  for (const page of Array.isArray(ir?.pages) ? ir.pages : []) {
    const imageGroups = new Set((Array.isArray(page?.images) ? page.images : [])
      .map((item) => String(item?.source?.nativeComponentGroupId || "").trim())
      .filter(Boolean));
    const textGroups = new Set((Array.isArray(page?.textBoxes) ? page.textBoxes : [])
      .map((item) => String(item?.source?.nativeComponentGroupId || item?.style?.nativeComponentGroupId || "").trim())
      .filter(Boolean));
    count += [...imageGroups].filter((groupId) => textGroups.has(groupId)).length;
  }
  return count;
}

function alignRenderedPageIndexesToIr(render = {}, ir = {}) {
  const renderedPages = Array.isArray(render?.renderedPages) ? render.renderedPages : [];
  const sourcePages = Array.isArray(ir?.pages) ? ir.pages : [];
  if (renderedPages.length === 0 || sourcePages.length === 0) return render;
  const irPageIndexes = sourcePages.map((page, index) => page?.pageIndex ?? index);
  const renderedPageIndexes = new Set(renderedPages.map((page) => page?.pageIndex));
  if (irPageIndexes.every((pageIndex) => renderedPageIndexes.has(pageIndex))) return render;
  if (renderedPages.length !== sourcePages.length) return render;
  return {
    ...render,
    pageIndexAlignment: {
      provider: "quality-gate-page-shard-render-index-alignment-v1",
      reason: "rendered pages are ordinal but IR preserves original slide page indexes",
      originalRenderedPageIndexes: renderedPages.map((page) => page?.pageIndex ?? null),
      irPageIndexes
    },
    renderedPages: renderedPages.map((page, index) => ({
      ...page,
      originalRenderedPageIndex: page?.pageIndex,
      pageIndex: irPageIndexes[index]
    }))
  };
}

async function renderWithLibreOffice({ pptxFile, outputDir, maxPages, progress, heartbeatMs }) {
  if (!pptxFile) {
    throw new Error("--pptx is required when --render-dir is not provided");
  }
  const script = path.join(__dirname, "libreoffice-benchmark.js");
  const result = await runJsonRenderer(process.execPath, [
    script,
    "--pptx",
    pptxFile,
    "--out",
    outputDir,
    "--max-pages",
    String(maxPages)
  ], {
    cwd: path.resolve(__dirname, "..", "..", ".."),
    progress,
    heartbeatMs
  });
  const report = parseRendererReport(result.stdout, "LibreOffice");
  return {
    provider: "libreoffice-benchmark",
    renderDir: path.join(outputDir, "render"),
    renderedPages: report.renderedPages || [],
    reportFile: report.reportFile,
    totalElapsedMs: report.totalElapsedMs
  };
}

async function renderWithPowerPoint({ pptxFile, outputDir, maxPages, progress, heartbeatMs }) {
  if (!pptxFile) {
    throw new Error("--pptx is required when --render-dir is not provided");
  }
  const startedAt = Date.now();
  const result = await renderPowerPointCom({
    pptx: { pptxFile },
    ir: { pages: [] },
    iteration: 0,
    maxPages
  }, {
    outputDir,
    config: {
      powerPoint: {
        exportTimeoutMs: Math.max(60_000, Number(heartbeatMs || 0) * 12)
      }
    },
    onProgress: progress
  });
  if (result?.ok !== true) throw new Error(result?.error || "PowerPoint renderer failed");
  return {
    ...result.data,
    totalElapsedMs: Date.now() - startedAt
  };
}

function runJsonRenderer(command, args, options = {}) {
  const maxOutputChars = 20 * 1024 * 1024;
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      windowsHide: true,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    let overflow = false;
    const heartbeatMs = boundedHeartbeatMs(options.heartbeatMs);
    const heartbeat = heartbeatMs > 0
      ? setInterval(() => options.progress?.({
        phase: "render",
        status: "heartbeat",
        elapsedMs: Date.now() - startedAt
      }), heartbeatMs)
      : null;
    heartbeat?.unref?.();
    child.stdout.on("data", (chunk) => {
      const appended = appendBoundedOutput(stdout, chunk, maxOutputChars);
      stdout = appended.value;
      overflow ||= appended.overflow;
    });
    child.stderr.on("data", (chunk) => {
      const appended = appendBoundedOutput(stderr, chunk, maxOutputChars);
      stderr = appended.value;
      overflow ||= appended.overflow;
    });
    child.on("error", (error) => {
      if (heartbeat) clearInterval(heartbeat);
      reject(error);
    });
    child.on("close", (status) => {
      if (heartbeat) clearInterval(heartbeat);
      if (overflow) return reject(new Error("Renderer output exceeded the bounded 20 MiB limit"));
      if (status !== 0) return reject(new Error(`Renderer exited with ${status}: ${sanitizeRendererError(stderr || stdout)}`));
      resolve({ stdout, stderr });
    });
  });
}

function parseRendererReport(stdout, rendererName) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`${rendererName} renderer returned invalid JSON`);
  }
}

function appendBoundedOutput(current, chunk, limit) {
  const combined = `${current}${String(chunk || "")}`;
  return { value: combined.slice(-limit), overflow: combined.length > limit };
}

function sanitizeRendererError(value) {
  return String(value || "")
    .replace(/(?:bearer\s+)[^\s]+/gi, "Bearer [redacted]")
    .replace(/(token|api[_-]?key|secret|password|cookie|license)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/[\r\n]+/g, " ")
    .slice(-4000);
}

function resolveRenderOutputDir(args, outputDir, irFile) {
  if (args["render-out"]) return path.resolve(args["render-out"]);
  const baseName = path.basename(outputDir) || path.basename(irFile, ".json");
  // Output folders commonly end in `_quality`; include absolute identities so
  // Concurrent gates must not overwrite one another's renderer cache.
  const cacheIdentity = `${path.resolve(outputDir)}\u0000${path.resolve(irFile)}`;
  const safeName = shortCacheName(baseName, cacheIdentity);
  return path.join(realWorkspaceCwd(), "runs", "quality-gate-render-cache", safeName);
}

function resolveReusableRenderDir({ args = {}, outputDir, irFile, pptxFile, renderOutputDir, renderer = "", cacheIdentity = null }) {
  const expectedPages = expectedRenderPageCount({ args, irFile });
  if (args["render-dir"]) {
    const explicitRenderDir = path.resolve(args["render-dir"]);
    return countRenderedPages(explicitRenderDir, { renderer, expectedPages }) > 0 ? explicitRenderDir : null;
  }
  if (String(args["reuse-render"] || "true").toLowerCase() === "false") return null;

  const renderRoot = path.resolve(args["render-root"] || path.join("runs", "quality-gate-render-cache"));
  const qualityRoot = path.resolve(args["quality-root"] || path.join("runs", "quality-gate"));
  const directCandidates = expandRenderCacheCandidates(unique([
    path.join(renderOutputDir, "render"),
    renderOutputDir
  ]));
  const directMatch = directCandidates.find((candidate) => reusableRenderMatches(candidate, { renderer, expectedPages, cacheIdentity }));
  if (directMatch) return directMatch;

  const prefixCandidates = findRenderDirsByPrefix(renderRoot, renderSearchNames([
    path.basename(outputDir || ""),
    path.basename(irFile || "", path.extname(irFile || "")),
    pptxFile ? path.basename(pptxFile, path.extname(pptxFile)) : ""
  ]));
  const prefixMatch = prefixCandidates.find((candidate) => reusableRenderMatches(candidate, { renderer, expectedPages, cacheIdentity }));
  if (prefixMatch) return prefixMatch;

  const identityMatch = findRenderDirsByIdentity(renderRoot, cacheIdentity)
    .find((candidate) => reusableRenderMatches(candidate, { renderer, expectedPages, cacheIdentity }));
  if (identityMatch) return identityMatch;

  // Recursive report discovery is retained only for legacy cache layouts.
  const legacyCandidates = findRenderDirsFromQualityReports({ qualityRoot, pptxFile });
  return legacyCandidates.find((candidate) => reusableRenderMatches(candidate, { renderer, expectedPages, cacheIdentity })) || null;
}

function findRenderDirsByIdentity(renderRoot, cacheIdentity) {
  if (!cacheIdentity || !fs.existsSync(renderRoot)) return [];
  return expandRenderCacheCandidates(fs.readdirSync(renderRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .slice(0, 2_000)
    .map((entry) => path.join(renderRoot, entry.name, "render")))
    .filter((renderDir) => sameRenderCacheIdentity(readRenderCacheMetadata(renderDir), cacheIdentity));
}

function expandRenderCacheCandidates(renderDirs = []) {
  const candidates = [];
  for (const renderDir of renderDirs) {
    if (!renderDir) continue;
    candidates.push(renderDir);
    try {
      if (!fs.existsSync(renderDir)) continue;
      for (const entry of fs.readdirSync(renderDir, { withFileTypes: true })) {
        if (entry.isDirectory()) candidates.push(path.join(renderDir, entry.name));
      }
    } catch {
      // A missing or unreadable cache directory is simply not reusable.
    }
  }
  return unique(candidates);
}

function sameRenderCacheIdentity(left, right) {
  if (!left || !right) return false;
  return left.provider === right.provider
    && left.packageFingerprint === right.packageFingerprint
    && left.renderer === right.renderer
    && left.expectedPages === right.expectedPages
    && left.dpi === right.dpi;
}

function createRenderCacheIdentity({ pptxFile, renderer, expectedPages, dpi = 144 }) {
  return {
    provider: "slideclone-render-cache-v1",
    packageFingerprint: fingerprintOoxmlPackage(pptxFile),
    renderer: normalizeRenderer(renderer),
    expectedPages: positiveSafeInteger(expectedPages, 1),
    dpi: positiveSafeInteger(dpi, 144)
  };
}

function reusableRenderMatches(renderDir, { renderer, expectedPages, cacheIdentity }) {
  if (countRenderedPages(renderDir, { renderer, expectedPages }) <= 0) return false;
  if (!cacheIdentity) return true;
  const metadata = readRenderCacheMetadata(renderDir);
  return metadata !== null && JSON.stringify(metadata) === JSON.stringify(cacheIdentity);
}

function readRenderCacheMetadata(renderDir) {
  const file = path.join(renderDir, RENDER_CACHE_METADATA);
  try {
    const value = readJson(file);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function writeRenderCacheMetadata(renderDir, identity) {
  ensureDir(renderDir);
  fs.writeFileSync(path.join(renderDir, RENDER_CACHE_METADATA), `${JSON.stringify(identity, null, 2)}\n`, "utf8");
}

function positiveSafeInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function expectedRenderPageCount({ args = {}, irFile = "" } = {}) {
  const maxPages = Number(args["max-pages"] || 999);
  const boundedMaxPages = Number.isFinite(maxPages) && maxPages > 0 ? Math.floor(maxPages) : 999;
  const irPageCount = countIrPages(irFile);
  if (irPageCount > 0) return Math.min(irPageCount, boundedMaxPages);
  return boundedMaxPages < 999 ? boundedMaxPages : 1;
}

function countIrPages(irFile) {
  if (!irFile || !fs.existsSync(irFile)) return 0;
  try {
    const ir = readJson(irFile);
    return Array.isArray(ir.pages) ? ir.pages.length : 0;
  } catch {
    return 0;
  }
}

function countRenderedPages(renderDir, options = {}) {
  return selectRenderedPageFiles(renderDir, options).length;
}

function selectRenderedPageFiles(renderDir, options = {}) {
  if (!renderDir || !fs.existsSync(renderDir)) return [];
  const groups = { libreoffice: [], generic: [] };
  for (const entry of fs.readdirSync(renderDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (/^lo-page-\d+\.png$/i.test(name)) groups.libreoffice.push(name);
    else if (/^page-\d+\.png$/i.test(name)) groups.generic.push(name);
  }
  const rawRenderer = String(options.renderer || "").trim();
  const renderer = rawRenderer ? normalizeRenderer(rawRenderer) : "";
  const expectedPages = Number(options.expectedPages || 0);
  const preferred = renderer === "libreoffice"
      ? [groups.libreoffice, groups.generic]
      : renderer === "powerpoint"
        ? [groups.generic]
        : [];
  const selected = preferred.find((group) => group.length > 0)
    || [groups.libreoffice, groups.generic].sort((a, b) => b.length - a.length)[0]
    || [];
  if (expectedPages > 0 && selected.length < expectedPages) return [];
  return selected
    .slice()
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, expectedPages > 0 ? expectedPages : undefined)
    .map((name) => path.join(renderDir, name));
}

function findRenderDirsFromQualityReports({ qualityRoot, pptxFile }) {
  if (!qualityRoot || !fs.existsSync(qualityRoot) || !pptxFile) return [];
  const expectedPptx = path.resolve(pptxFile);
  const expectedPptxName = path.basename(pptxFile);
  const result = [];
  for (const reportFile of findQualityReports(qualityRoot)) {
    const report = readJsonOrNull(reportFile);
    if (!report) continue;
    const reportPptx = report.pptxFile || report.inputPptx || report.targetPptx || "";
    const matches = reportPptx
      && (path.resolve(reportPptx) === expectedPptx || path.basename(reportPptx) === expectedPptxName);
    if (matches && report.render?.renderDir) result.push(path.resolve(report.render.renderDir));
  }
  return result;
}

function findQualityReports(root) {
  const result = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile() && entry.name === "quality-gate-report.json") result.push(file);
    }
  }
  return result;
}

function findRenderDirsByPrefix(renderRoot, values) {
  if (!fs.existsSync(renderRoot)) return [];
  // Keep recognizing legacy cache folders that used the raw deck prefix,
  // while new folders include a collision-safe hash suffix.
  const prefixes = unique(values.filter(Boolean).flatMap((value) => [
    shortCacheName(value),
    sanitizePathPart(value)
  ]))
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  return expandRenderCacheCandidates(fs.readdirSync(renderRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => prefixes.some((prefix) => entry.name.toLowerCase().startsWith(prefix)))
    .map((entry) => path.join(renderRoot, entry.name, "render")));
}

function renderSearchNames(values) {
  const result = [];
  for (const value of values) {
    const text = String(value || "");
    if (!text) continue;
    result.push(text);
    result.push(text.replace(/\.native(?:-editable)?(?:\.ir)?$/i, ""));
    result.push(text.replace(/\.native(?:-editable)?$/i, ""));
    result.push(text.replace(/\.ir$/i, ""));
  }
  return unique(result);
}

function readJsonOrNull(file) {
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readRenderedPages(renderDir, options = {}) {
  const renderedPages = selectRenderedPageFiles(renderDir, options)
    .map((name, index) => ({
      pageIndex: index,
      image: name
    }));
  return {
    provider: "existing-render-dir",
    renderDir,
    renderedPages
  };
}

function normalizeRenderer(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["powerpoint", "power-point", "powerpoint-com", "office"].includes(normalized)) return "powerpoint";
  if (["libreoffice", "libre-office", "lo", "headless", ""].includes(normalized)) return "libreoffice";
  throw new TypeError(`Unsupported renderer: ${normalized}`);
}

function assessPages({ ir, render, diff, compare, raster, thresholds }) {
  const renderedByPage = new Map((render.renderedPages || []).map((page) => [page.pageIndex, page]));
  const metricsByPage = new Map((diff.metrics || []).map((metric) => [metric.pageIndex, metric]));
  const rasterByPage = new Map((raster.pages || []).map((page) => [page.pageIndex, page]));
  const textCoverageByPage = new Map((compare?.textCoverage?.pages || []).map((page) => [page.pageIndex, page]));
  const comparablePageIndexes = new Set([
    ...renderedByPage.keys(),
    ...[...metricsByPage.values()].filter((metric) => metric?.ok === true).map((metric) => metric.pageIndex)
  ]);
  const sourcePages = (ir.pages || []).map((page, index) => ({
    page,
    pageIndex: page.pageIndex ?? index
  }));
  const pages = comparablePageIndexes.size > 0
    ? sourcePages.filter((entry) => comparablePageIndexes.has(entry.pageIndex))
    : sourcePages;
  return pages.map(({ page, pageIndex }) => {
    const metrics = metricsByPage.get(pageIndex) || { ok: false, error: "No diff metrics for page." };
    const rasterPage = rasterByPage.get(pageIndex) || { fullPageImages: 0, imageAreaRatio: 0, maxImageAreaRatio: 0 };
    const textCoveragePage = textCoverageByPage.get(pageIndex) || null;
    const status = assessPageQuality({
      metrics,
      raster: rasterPage,
      textCoverage: textCoveragePage,
      sourceImage: page.sourceImage,
      renderedImage: renderedByPage.get(pageIndex)?.image,
      thresholds
    });
    return {
      pageIndex,
      status: status.status,
      reasons: status.reasons,
      sourceImage: page.sourceImage || null,
      renderedImage: renderedByPage.get(pageIndex)?.image || null,
      diffImage: metrics.diffImage || null,
      pixelDiffRatio: metrics.pixelDiffRatio ?? null,
      foregroundMissingRatio: metrics.foregroundMissingRatio ?? null,
      foregroundMissingRatioRaw: metrics.foregroundMissingRatioRaw ?? null,
      meanAbsoluteDelta: metrics.meanAbsoluteDelta ?? null,
      rasterImageAreaRatio: rasterPage.imageAreaRatio,
      maxRasterImageAreaRatio: rasterPage.maxImageAreaRatio,
      fullPageImages: rasterPage.fullPageImages,
      imageCount: rasterPage.imageCount,
      textCoverage: textCoveragePage?.textCoverage ?? null,
      textOcrFailedBoxes: textCoveragePage?.failedBoxes ?? null
    };
  });
}

function summarizeComparedDeckMetrics(summary = {}, pages = []) {
  const comparedPages = pages.length;
  const failedPages = pages.filter((page) => page.status === "rejected").length;
  return {
    ...summary,
    comparedPages,
    failedPages
  };
}

function assessPageQuality({ metrics, raster, textCoverage, sourceImage, renderedImage, thresholds = DEFAULT_THRESHOLDS }) {
  const reasons = [];
  if (!sourceImage) reasons.push("missing-source-image");
  if (!renderedImage) reasons.push("missing-rendered-image");
  if (!metrics?.ok) reasons.push(metrics?.error || "missing-diff-metrics");
  const allowedBackgrounds = raster?.allowedFullPageBackgroundImages || 0;
  const disallowedFullPageImages = Math.max(0, (raster?.fullPageImages || 0) - allowedBackgrounds);
  const maxDisallowedImageAreaRatio = raster?.maxDisallowedImageAreaRatio ?? raster?.maxImageAreaRatio ?? raster?.imageAreaRatio ?? 0;
  if (disallowedFullPageImages > 0) reasons.push("contains-full-page-raster-image");
  if (maxDisallowedImageAreaRatio > thresholds.maxRasterImageAreaRatio) reasons.push("raster-image-area-too-high");

  const pixel = typeof metrics?.pixelDiffRatio === "number" ? metrics.pixelDiffRatio : Number.POSITIVE_INFINITY;
  const foreground = typeof metrics?.foregroundMissingRatio === "number" ? metrics.foregroundMissingRatio : Number.POSITIVE_INFINITY;
  if (pixel > thresholds.reviewPixelDiffRatio) reasons.push("pixel-diff-too-high");
  if (foreground > thresholds.reviewForegroundMissingRatio) reasons.push("foreground-missing-too-high");
  if (typeof thresholds.textCoverage === "number"
    && typeof textCoverage?.textCoverage === "number"
    && textCoverage.textCoverage < thresholds.textCoverage) {
    reasons.push("text-coverage-too-low");
  }

  const hardFailure = reasons.some((reason) => reason.startsWith("missing-")
    || reason === "contains-full-page-raster-image"
    || reason === "raster-image-area-too-high"
    || reason === "pixel-diff-too-high"
    || reason === "foreground-missing-too-high");
  if (hardFailure) return { status: "rejected", reasons };
  if (pixel > thresholds.acceptPixelDiffRatio || foreground > thresholds.acceptForegroundMissingRatio) {
    return { status: "needs-review", reasons: [...reasons, "outside-accept-threshold"] };
  }
  if (reasons.includes("text-coverage-too-low")) return { status: "needs-review", reasons };
  return { status: "accepted", reasons };
}

function summarizeRasterImages(ir, thresholds = DEFAULT_THRESHOLDS) {
  const slideSize = ir.slideSize || { widthPt: 960, heightPt: 540 };
  const slideArea = Math.max(1, slideSize.widthPt * slideSize.heightPt);
  const pages = (ir.pages || []).map((page, index) => {
    const pageIndex = page.pageIndex ?? index;
    const images = page.images || [];
    let area = 0;
    let maxImageArea = 0;
    let maxDisallowedImageArea = 0;
    let fullPageImages = 0;
    let allowedFullPageBackgroundImages = 0;
    for (const image of images) {
      const box = image.box || {};
      const w = Number(box.w || 0);
      const h = Number(box.h || 0);
      const imageArea = Math.max(0, w * h);
      const allowedBackground = isAllowedDecorativeBackgroundImage(image);
      area += imageArea;
      maxImageArea = Math.max(maxImageArea, imageArea);
      if (!allowedBackground) maxDisallowedImageArea = Math.max(maxDisallowedImageArea, imageArea);
      if (w >= slideSize.widthPt * thresholds.fullPageWidthRatio
        && h >= slideSize.heightPt * thresholds.fullPageHeightRatio) {
        fullPageImages += 1;
        if (allowedBackground) allowedFullPageBackgroundImages += 1;
      }
    }
    return {
      pageIndex,
      imageCount: images.length,
      fullPageImages,
      allowedFullPageBackgroundImages,
      imageAreaRatio: round(area / slideArea),
      maxImageAreaRatio: round(maxImageArea / slideArea),
      maxDisallowedImageAreaRatio: round(maxDisallowedImageArea / slideArea)
    };
  });
  return {
    provider: "ir-raster-summary",
    pages,
    totalImages: pages.reduce((sum, page) => sum + page.imageCount, 0),
    fullPageImages: pages.reduce((sum, page) => sum + page.fullPageImages, 0),
    meanImageAreaRatio: pages.length
    ? round(pages.reduce((sum, page) => sum + page.imageAreaRatio, 0) / pages.length)
    : 0
  };
}

function summarizeEditabilityProfile({ ir, raster, editability } = {}) {
  const pages = ir?.pages || [];
  const slideSize = ir?.slideSize || { widthPt: 960, heightPt: 540 };
  const slideArea = Math.max(1, Number(slideSize.widthPt || 960) * Number(slideSize.heightPt || 540));
  const detectorCounts = {};
  const intentionalRasterDetectorCounts = {};
  const actionableRasterDetectorCounts = {};
  const imageExpressionCounts = {};
  const imageSubtypeCounts = {};
  const imageRecommendationCounts = {};
  const textOverlayRiskSubtypeCounts = {};
  const textOverlayRiskRecommendationCounts = {};
  const nativeOverlayRiskSubtypeCounts = {};
  const nativeOverlayRiskDetectorCounts = {};
  const pageProfiles = pages.map((page, index) => {
    const pageIndex = page.pageIndex ?? index;
    const images = page.images || [];
    const textBoxes = page.textBoxes || [];
    const shapes = page.shapes || [];
    const logicalShapes = countLogicalNativeShapes(shapes);
    const logicalTextBoxes = countLogicalNativeTextBoxes(textBoxes, shapes);
    const tables = page.tables || [];
    const charts = page.charts || [];
    const icons = page.icons || [];
    const nonEditableImages = images.filter((image) => image?.source?.editable !== true);
    const intentionalRasterImages = nonEditableImages.filter(isIntentionalRasterImage);
    const actionableNonEditableImages = nonEditableImages.filter((image) => !isIntentionalRasterImage(image));
    for (const image of nonEditableImages) {
      addProfileCount(detectorCounts, image?.source?.detector || "unknown");
      addProfileCount(imageExpressionCounts, image?.source?.expressionForm || "unknown-expression");
      addProfileCount(imageSubtypeCounts, image?.source?.expressionSubtype || "unknown-subtype");
      addProfileCount(imageRecommendationCounts, image?.source?.recommendedAction || "manual-review-before-native-rebuild");
    }
    for (const image of intentionalRasterImages) {
      addProfileCount(intentionalRasterDetectorCounts, image?.source?.detector || "unknown");
    }
    for (const image of actionableNonEditableImages) {
      addProfileCount(actionableRasterDetectorCounts, image?.source?.detector || "unknown");
    }
    const rasterPage = (raster?.pages || []).find((item) => item.pageIndex === pageIndex) || {};
    const sourceNativePassthrough = page?.preserveTemplateSlide === true
      && page?.source?.detector === "source-native-slide-passthrough";
    const sourceNativeObjectCount = sourceNativePassthrough
      ? Math.max(0, Number(page?.source?.nativeObjects || 0))
      : 0;
    const sourceNativeTextRuns = sourceNativePassthrough
      ? Math.max(0, Number(page?.source?.textRuns || 0))
      : 0;
    const editableObjects = textBoxes.length + shapes.length + tables.length + charts.length + icons.length
      + sourceNativeObjectCount
      + images.filter((image) => image?.source?.editable === true).length;
    const totalObjects = editableObjects + nonEditableImages.length;
    const actionableTotalObjects = editableObjects + actionableNonEditableImages.length;
    const textOverlayRisks = collectTextOverlayRisks({
      images: nonEditableImages,
      textBoxes,
      slideArea
    });
    for (const risk of textOverlayRisks) {
      addProfileCount(textOverlayRiskSubtypeCounts, risk.expressionSubtype);
      addProfileCount(textOverlayRiskRecommendationCounts, risk.recommendedAction);
    }
    const nativeOverlayRisks = collectNativeOverlayRisks({
      images: nonEditableImages,
      shapes,
      slideArea
    });
    for (const risk of nativeOverlayRisks) {
      addProfileCount(nativeOverlayRiskSubtypeCounts, risk.expressionSubtype);
      addProfileCount(nativeOverlayRiskDetectorCounts, risk.detector);
    }
    return {
      pageIndex,
      textBoxes: textBoxes.length,
      physicalTextBoxes: textBoxes.length,
      logicalTextBoxes,
      physicalShapes: shapes.length,
      logicalShapes,
      sourceNativePassthrough,
      sourceNativeObjectCount,
      sourceNativeTextRuns,
      editableObjects,
      totalObjects,
      nonEditableImages: nonEditableImages.length,
      intentionalRasterImages: intentionalRasterImages.length,
      actionableNonEditableImages: actionableNonEditableImages.length,
      actionableEditableObjectRatio: actionableTotalObjects > 0 ? round(editableObjects / actionableTotalObjects) : 1,
      fullPageImages: rasterPage.fullPageImages || 0,
      allowedFullPageBackgroundImages: rasterPage.allowedFullPageBackgroundImages || 0,
      rasterImageAreaRatio: rasterPage.imageAreaRatio || 0,
      maxRasterImageAreaRatio: rasterPage.maxImageAreaRatio || 0,
      detectors: nonEditableImages.map((image) => image?.source?.detector || "unknown"),
      imageExpressions: nonEditableImages.map((image) => image?.source?.expressionForm || "unknown-expression"),
      imageSubtypes: nonEditableImages.map((image) => image?.source?.expressionSubtype || "unknown-subtype"),
      imageRecommendations: nonEditableImages.map((image) => image?.source?.recommendedAction || "manual-review-before-native-rebuild"),
      textOverlayRiskBoxes: textOverlayRisks.reduce((sum, item) => sum + item.textBoxes, 0),
      textOverlayRiskImages: textOverlayRisks.length,
      textOverlayRisks,
      nativeOverlayRiskShapes: nativeOverlayRisks.reduce((sum, item) => sum + item.shapes, 0),
      nativeOverlayRiskImages: nativeOverlayRisks.length,
      nativeOverlayRisks
    };
  });
  const totalObjects = pageProfiles.reduce((sum, page) => sum + page.totalObjects, 0);
  const editableObjects = pageProfiles.reduce((sum, page) => sum + page.editableObjects, 0);
  const physicalTextBoxes = pageProfiles.reduce((sum, page) => sum + page.physicalTextBoxes, 0);
  const logicalTextBoxes = pageProfiles.reduce((sum, page) => sum + page.logicalTextBoxes, 0);
  const physicalShapes = pageProfiles.reduce((sum, page) => sum + page.physicalShapes, 0);
  const logicalShapes = pageProfiles.reduce((sum, page) => sum + page.logicalShapes, 0);
  const intentionalRasterImages = pageProfiles.reduce((sum, page) => sum + page.intentionalRasterImages, 0);
  const actionableNonEditableImages = pageProfiles.reduce((sum, page) => sum + page.actionableNonEditableImages, 0);
  const actionableTotalObjects = editableObjects + actionableNonEditableImages;
  const fullPageImages = pageProfiles.reduce((sum, page) => sum + page.fullPageImages, 0);
  const allowedFullPageBackgroundImages = pageProfiles.reduce((sum, page) => sum + page.allowedFullPageBackgroundImages, 0);
  const disallowedFullPageImages = Math.max(0, fullPageImages - allowedFullPageBackgroundImages);
  const sourceNativePassthroughPages = pageProfiles.filter((page) => page.sourceNativePassthrough).length;
  const sourceNativePassthroughObjects = pageProfiles.reduce((sum, page) => sum + page.sourceNativeObjectCount, 0);
  const sourceNativePassthroughTextRuns = pageProfiles.reduce((sum, page) => sum + page.sourceNativeTextRuns, 0);
  return {
    provider: "quality-gate-editability-profile",
    pages: pageProfiles.length,
    physicalTextBoxes,
    logicalTextBoxes,
    physicalShapes,
    logicalShapes,
    editableObjects,
    totalObjects,
    editableObjectRatio: totalObjects > 0 ? round(editableObjects / totalObjects) : 1,
    nonEditableImages: pageProfiles.reduce((sum, page) => sum + page.nonEditableImages, 0),
    intentionalRasterImages,
    actionableNonEditableImages,
    actionableEditableObjectRatio: actionableTotalObjects > 0 ? round(editableObjects / actionableTotalObjects) : 1,
    sourceNativePassthroughPages,
    sourceNativePassthroughObjects,
    sourceNativePassthroughTextRuns,
    pagesWithRasterImages: pageProfiles.filter((page) => page.nonEditableImages > 0).length,
    fullPageImages,
    allowedFullPageBackgroundImages,
    disallowedFullPageImages,
    maxRasterImageAreaRatio: pageProfiles.reduce((max, page) => Math.max(max, page.maxRasterImageAreaRatio), 0),
    meanRasterImageAreaRatio: pageProfiles.length
      ? round(pageProfiles.reduce((sum, page) => sum + page.rasterImageAreaRatio, 0) / pageProfiles.length)
      : 0,
    detectorCounts,
    intentionalRasterDetectorCounts,
    actionableRasterDetectorCounts,
    imageExpressionCounts,
    imageSubtypeCounts,
    imageRecommendationCounts,
    textOverlayRiskBoxes: pageProfiles.reduce((sum, page) => sum + page.textOverlayRiskBoxes, 0),
    textOverlayRiskImages: pageProfiles.reduce((sum, page) => sum + page.textOverlayRiskImages, 0),
    pagesWithTextOverlayRisk: pageProfiles.filter((page) => page.textOverlayRiskImages > 0).length,
    textOverlayRiskSubtypeCounts,
    textOverlayRiskRecommendationCounts,
    nativeOverlayRiskShapes: pageProfiles.reduce((sum, page) => sum + page.nativeOverlayRiskShapes, 0),
    nativeOverlayRiskImages: pageProfiles.reduce((sum, page) => sum + page.nativeOverlayRiskImages, 0),
    pagesWithNativeOverlayRisk: pageProfiles.filter((page) => page.nativeOverlayRiskImages > 0).length,
    nativeOverlayRiskSubtypeCounts,
    nativeOverlayRiskDetectorCounts,
    compareEditability: editability
      ? {
        editableObjects: editability.editableObjects ?? null,
        nonEditableObjects: editability.nonEditableObjects ?? null,
        rasterImageAreaRatio: typeof editability.rasterImageAreaRatio === "number"
          ? round(editability.rasterImageAreaRatio)
          : null
      }
      : null,
    pagesDetail: pageProfiles
  };
}

function summarizeNativeComponentProfile(ir = {}, options = {}) {
  const maxExamples = normalizePositiveInt(options.maxExamples, 30);
  const groupKeys = new Set();
  const byArchetype = {};
  const pagesWithGroups = new Set();
  const ungroupedExamples = [];
  let shapeParts = 0;
  let textParts = 0;
  let imageParts = 0;
  let tableParts = 0;
  let ungroupedNativeComponentParts = 0;

  for (const [pageOrdinal, page] of (Array.isArray(ir?.pages) ? ir.pages : []).entries()) {
    const pageIndex = page?.pageIndex ?? pageOrdinal;
    const collections = [
      ["shape", Array.isArray(page?.shapes) ? page.shapes : []],
      ["text", Array.isArray(page?.textBoxes) ? page.textBoxes : []],
      ["image", Array.isArray(page?.images) ? page.images : []],
      ["table", Array.isArray(page?.tables) ? page.tables : []]
    ];
    for (const [partType, items] of collections) {
      for (const item of items) {
        const source = item?.source || {};
        const groupId = String(source.nativeComponentGroupId || item?.style?.nativeComponentGroupId || "").trim();
        const declaredComponent = source.nativeComponentInstance === true || Boolean(groupId);
        if (!declaredComponent) continue;
        if (!groupId) {
          ungroupedNativeComponentParts += 1;
          if (ungroupedExamples.length < maxExamples) {
            ungroupedExamples.push({ pageIndex, id: String(item?.id || ""), partType, detector: String(source.detector || "") });
          }
          continue;
        }
        groupKeys.add(`${pageIndex}:${groupId}`);
        pagesWithGroups.add(pageIndex);
        addProfileCount(byArchetype, source.nativeComponentArchetype || "unknown-component");
        if (partType === "shape") shapeParts += 1;
        else if (partType === "text") textParts += 1;
        else if (partType === "image") imageParts += 1;
        else tableParts += 1;
      }
    }
  }

  return {
    provider: "quality-gate-native-component-profile-v1",
    groups: groupKeys.size,
    pagesWithGroups: pagesWithGroups.size,
    shapeParts,
    textParts,
    imageParts,
    tableParts,
    totalParts: shapeParts + textParts + imageParts + tableParts,
    ungroupedNativeComponentParts,
    byArchetype,
    ungroupedExamples
  };
}

function summarizeComponentTemplateCropStatus(ir = {}, options = {}) {
  const maxExamples = normalizePositiveInt(options.maxExamples, 50);
  const byReason = {};
  const byDetector = {};
  const actionableByReason = {};
  const protectedByReason = {};
  const actionableExamplesByReason = {};
  const examples = [];
  const repairCandidates = [];
  let templateImages = 0;
  let replacedImages = 0;
  let retainedImages = 0;
  let protectedRetainedImages = 0;
  let actionableRetainedImages = 0;
  let splitImages = 0;
  let nativeShapesReplacingCrops = 0;
  for (const [pageOrdinal, page] of (Array.isArray(ir?.pages) ? ir.pages : []).entries()) {
    const pageIndex = page?.pageIndex ?? pageOrdinal;
    for (const image of Array.isArray(page?.images) ? page.images : []) {
      const source = image?.source || {};
      if (!isComponentTemplateCropImage(image)) continue;
      templateImages += 1;
      const reason = safeProfileKey(source.componentTemplateCropReplacementReason || "component-template-crop-no-decision");
      const detector = safeProfileKey(source.detector || "unknown-detector");
      addProfileCount(byReason, reason);
      addProfileCount(byDetector, detector);
      if (source.componentTemplateCropReplacedByNative === true) replacedImages += 1;
      else {
        retainedImages += 1;
        if (isProtectedComponentTemplateRetainedReason(reason, image)) {
          protectedRetainedImages += 1;
          addProfileCount(protectedByReason, reason);
        } else {
          actionableRetainedImages += 1;
          addProfileCount(actionableByReason, reason);
          if (repairCandidates.length < maxExamples) {
            repairCandidates.push(componentTemplateRepairCandidate({
              image,
              pageIndex,
              detector,
              reason
            }));
          }
          if (!actionableExamplesByReason[reason]) actionableExamplesByReason[reason] = [];
          if (actionableExamplesByReason[reason].length < maxExamples) {
            actionableExamplesByReason[reason].push(componentTemplateCropExample({
              image,
              pageIndex,
              detector,
              reason,
              retainedActionable: true
            }));
          }
        }
      }
      if (source.componentTemplateCropSplitIntoResiduals === true) splitImages += 1;
      if (examples.length < maxExamples) {
        examples.push(componentTemplateCropExample({
          image,
          pageIndex,
          detector,
          reason,
          retainedActionable: source.componentTemplateCropReplacedByNative === true
            ? false
            : !isProtectedComponentTemplateRetainedReason(reason, image)
        }));
      }
    }
    for (const shape of Array.isArray(page?.shapes) ? page.shapes : []) {
      if (shape?.source?.componentTemplateCropReplacedByNative === true) nativeShapesReplacingCrops += 1;
    }
  }
  return {
    provider: "quality-gate-component-template-crop-status-v1",
    templateImages,
    replacedImages,
    retainedImages,
    protectedRetainedImages,
    actionableRetainedImages,
    splitImages,
    nativeShapesReplacingCrops,
    replacementRate: templateImages > 0 ? round(replacedImages / templateImages) : 1,
    byReason,
    byDetector,
    protectedByReason,
    actionableByReason,
    topActionableReasons: summarizeTopComponentTemplateReasons(actionableByReason, actionableExamplesByReason),
    repairCandidates,
    examples
  };
}

function componentTemplateCropExample({ image = {}, pageIndex = 0, detector = "unknown-detector", reason = "unknown", retainedActionable = false } = {}) {
  const source = image?.source || {};
  return {
    pageIndex,
    imageId: safeProfileKey(image.id || "unknown-image"),
    detector,
    replaced: source.componentTemplateCropReplacedByNative === true,
    retainedActionable,
    splitIntoResiduals: source.componentTemplateCropSplitIntoResiduals === true,
    reason,
    family: safeProfileKey(source.componentTemplateFamilyApplied || source.layer?.templateFamily || "unknown-family"),
    exactChildCoverageRatio: numberOrNull(source.componentTemplateExactChildCoverageRatio),
    exactChildShapeCount: numberOrNull(source.componentTemplateExactChildShapeCount),
    box: normalizeQualityBox(image.box)
  };
}

function componentTemplateRepairCandidate({ image = {}, pageIndex = 0, detector = "unknown-detector", reason = "unknown" } = {}) {
  const source = image?.source || {};
  const strategy = source.componentRenderStrategy || {};
  const plan = strategy.applicationPlan || {};
  const bestCandidate = strategy.bestCandidate || {};
  const box = normalizeQualityBox(image.box);
  const areaRatio = box ? round((Number(box.w || 0) * Number(box.h || 0)) / (960 * 540)) : null;
  const motifs = [
    ...safeStringArray(source.componentTemplateTargetMotifs),
    ...safeStringArray(strategy.targetMotifs),
    ...safeStringArray(plan.targetMotifs),
    ...safeStringArray(bestCandidate.targetMotifs)
  ];
  return {
    pageIndex,
    imageId: safeProfileKey(image.id || "unknown-image"),
    detector,
    reason,
    priority: componentTemplateRepairPriority({ source, areaRatio, reason }),
    expressionForm: safeProfileKey(source.expressionForm || "unknown-expression"),
    expressionSubtype: safeProfileKey(source.expressionSubtype || "unknown-subtype"),
    layerType: safeProfileKey(source.layer?.layerType || "unknown-layer"),
    recommendedAction: safeProfileKey(source.recommendedAction || "manual-component-rebuild-review"),
    family: safeProfileKey(source.componentTemplateFamilyApplied || source.layer?.templateFamily || "unknown-family"),
    componentGroupId: safeProfileKey(source.componentTemplateGroupId || "unknown-group"),
    componentGroupScore: numberOrNull(source.componentTemplateGroupScore),
    sourceProvider: safeProfileKey(plan.sourceProvider || bestCandidate.sourceProvider || "unknown-provider"),
    componentKind: safeProfileKey(plan.componentKind || bestCandidate.kind || "unknown-kind"),
    componentId: safeProfileKey(plan.componentId || bestCandidate.id || "unknown-component"),
    componentTitle: safeProfileKey(bestCandidate.title || "unknown-title"),
    targetMotifs: [...new Set(motifs)].slice(0, 12),
    currentStep: safeProfileKey(plan.currentStep || "unknown-current-step"),
    targetStep: safeProfileKey(plan.targetStep || "unknown-target-step"),
    requiresDownload: plan.requiresDownload === true,
    box,
    areaRatio
  };
}

function componentTemplateRepairPriority({ source = {}, areaRatio = null, reason = "" } = {}) {
  const action = String(source.recommendedAction || "").toLowerCase();
  const form = String(source.expressionForm || "").toLowerCase();
  const strategyMode = String(source.componentRenderStrategy?.mode || "").toLowerCase();
  let score = 0;
  if (Number.isFinite(areaRatio)) score += Math.min(40, Math.round(areaRatio * 100));
  if (/rebuild-native|split-native|table-grid|axis-aligned/.test(action)) score += 25;
  if (/table-or-matrix|complex-diagram|data-chart/.test(form)) score += 20;
  if (strategyMode === "plugin-component-template") score += 10;
  if (/score-below|native-parts-incomplete|overlay-suppressed|no-decision/.test(String(reason || ""))) score += 5;
  return Math.max(0, Math.min(100, score));
}

function safeStringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function summarizeTopComponentTemplateReasons(actionableByReason = {}, examplesByReason = {}) {
  return Object.entries(actionableByReason)
    .map(([reason, count]) => ({
      reason,
      count: Number(count || 0),
      examples: Array.isArray(examplesByReason[reason]) ? examplesByReason[reason] : []
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function isProtectedComponentTemplateRetainedReason(reason = "", image = {}) {
  const text = String(reason || "").toLowerCase();
  if (isProtectedComponentTemplateMinimumUnit(image)) return true;
  if (text === "component-template-source-layer-requires-fidelity-crop") {
    return isProtectedComponentTemplateFidelityRetainedImage(image);
  }
  if (text === "component-template-overlay-suppressed-because-source-crop-remains-required") {
    return isProtectedComponentTemplateVisualAsset(image)
      || isProtectedComponentTemplateFidelityRetainedImage(image);
  }
  if (text === "component-template-crop-no-decision") {
    return isProtectedComponentTemplateVisualAsset(image)
      || isDeferredComponentTemplateDownloadTarget(image);
  }
  return text === "component-template-child-layout-contains-picture"
    || text === "component-template-contains-picture-children"
    || text === "component-template-picture-children-split-to-local-residuals";
}

function isProtectedComponentTemplateMinimumUnit(image = {}) {
  const source = image?.source || {};
  const strategy = source.componentRenderStrategy || {};
  return source.protectedMinimumUnit === true
    || source.intentionalMinimumUnitCrop === true
    || strategy.mode === "preserve-local-crop"
      && /minimum|icon|illustration|screenshot|document/.test(String(strategy.editableExpectation || strategy.reason || "").toLowerCase());
}

function isProtectedComponentTemplateFidelityRetainedImage(image = {}) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const expressionForm = String(source.expressionForm || "").toLowerCase();
  const expressionSubtype = String(source.expressionSubtype || "").toLowerCase();
  const recommendedAction = String(source.recommendedAction || "").toLowerCase();
  const layerType = String(source.layer?.layerType || "").toLowerCase();
  const visualType = `${detector} ${expressionForm} ${expressionSubtype} ${layerType}`;
  if (/(?:^|[-_ ])(?:screenshot|screen|document|prototype|ui|webpage)(?:$|[-_ ])/.test(visualType)) return true;
  if (/(?:^|[-_ ])(?:chart|kpi|evidence)(?:$|[-_ ])/.test(visualType)) return true;
  if (/(?:^|[-_ ])(?:icon|illustration|photo|picture)(?:$|[-_ ])/.test(visualType)) return true;
  if (/keep-local-crop-and-overlay-external-text-only|keep-crop-until-source-data-or-axis-series-detected/.test(recommendedAction)) return true;
  return false;
}

function isProtectedComponentTemplateVisualAsset(image = {}) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const expressionForm = String(source.expressionForm || "").toLowerCase();
  const expressionSubtype = String(source.expressionSubtype || "").toLowerCase();
  const recommendedAction = String(source.recommendedAction || "").toLowerCase();
  const layerType = String(source.layer?.layerType || "").toLowerCase();
  const visualType = `${detector} ${expressionForm} ${expressionSubtype} ${layerType}`;
  if (/(?:^|[-_ ])(?:decorative|cover|background|brand|logo|watermark)(?:$|[-_ ])/.test(visualType)) return true;
  if (/(?:^|[-_ ])(?:screenshot|screen|document|prototype|ui|webpage)(?:$|[-_ ])/.test(visualType)) return true;
  if (/(?:^|[-_ ])(?:icon|illustration|photo|picture)(?:$|[-_ ])/.test(visualType)) return true;
  return /prefer-native-background-shape-or-keep-local-crop|match-icon-library-or-keep-local-crop|keep-local-crop-and-overlay-external-text-only/.test(recommendedAction);
}

function isDeferredComponentTemplateDownloadTarget(image = {}) {
  const source = image?.source || {};
  const strategy = source.componentRenderStrategy || {};
  const plan = strategy.applicationPlan || {};
  const mode = String(strategy.mode || "").toLowerCase();
  const implementationMode = String(strategy.implementationMode || "").toLowerCase();
  const currentStep = String(plan.currentStep || "").toLowerCase();
  const targetStep = String(plan.targetStep || "").toLowerCase();
  if (mode !== "plugin-component-template") return false;
  if (/auth-or-download-required|download-required/.test(implementationMode)) return true;
  if (/download|auth/.test(currentStep) || /download|auth/.test(targetStep)) return true;
  return plan.requiresDownload === true || strategy.bestCandidate?.downloadable === false;
}

function isComponentTemplateCropImage(image = {}) {
  const source = image?.source || {};
  return source.componentTemplateGroupApplied === true
    || Boolean(source.componentTemplateGroupId)
    || Boolean(source.componentTemplateFamilyApplied)
    || Boolean(source.componentTemplateCropReplacementReason)
    || source.componentRenderStrategy?.mode === "plugin-component-template";
}

function normalizeQualityBox(box = {}) {
  const x = numberOrNull(box?.x);
  const y = numberOrNull(box?.y);
  const w = numberOrNull(box?.w);
  const h = numberOrNull(box?.h);
  return [x, y, w, h].every((value) => value !== null) ? { x, y, w, h } : null;
}

const TEXT_FREE_BAND_CLEARANCE_PT = 12;

function collectTextOverlayRisks({ images = [], textBoxes = [], slideArea = 960 * 540 } = {}) {
  const risks = [];
  for (const image of images) {
    if (!isTextOverlayRiskImage(image, slideArea)) continue;
    const unsafeDecorativeBackground = isUnsafeDecorativeTextOverlayBackground(image);
    const overlapping = textBoxes.filter((textBox) =>
      boxCenterInside(textBox?.box, image?.box) && !isTextErasedFromCrop(textBox, image));
    // A split band is valid only when it stays outside every native text box.
    // This prevents a stale/incorrect textFreeBandSplit marker from masking
    // raster text below the editable text and producing visible ghosting.
    const splitBandOverlaps = image?.source?.textFreeBandSplit === true
      ? textBoxes.filter((textBox) => boxesOverlap(textBox?.box, image?.box) && !isTextErasedFromCrop(textBox, image))
      : [];
    // A crop that merely avoids geometric overlap can still retain antialiased
    // glyph edges. Require a measurable gap before treating it as text-free.
    const splitBandTooClose = image?.source?.textFreeBandSplit === true
      ? textBoxes.filter((textBox) =>
        boxesWithinClearance(textBox?.box, image?.box, TEXT_FREE_BAND_CLEARANCE_PT)
        && !boxesOverlap(textBox?.box, image?.box)
        && !isTextErasedFromCrop(textBox, image))
      : [];
    const verifiedTextFreeBandOverlap = splitBandOverlaps.length > 0;
    if (verifiedTextFreeBandOverlap) {
      risks.push({
        imageId: image.id || null,
        detector: image?.source?.detector || "unknown",
        expressionForm: image?.source?.expressionForm || "unknown-expression",
        expressionSubtype: image?.source?.expressionSubtype || "unknown-subtype",
        recommendedAction: image?.source?.recommendedAction || "manual-review-before-native-rebuild",
        textBoxes: splitBandOverlaps.length,
        reason: "verified-text-free-band-overlaps-native-text",
        areaRatio: round((Number(image?.box?.w || 0) * Number(image?.box?.h || 0)) / Math.max(1, slideArea))
      });
      continue;
    }
    if (splitBandTooClose.length > 0) {
      risks.push({
        imageId: image.id || null,
        detector: image?.source?.detector || "unknown",
        expressionForm: image?.source?.expressionForm || "unknown-expression",
        expressionSubtype: image?.source?.expressionSubtype || "unknown-subtype",
        recommendedAction: image?.source?.recommendedAction || "manual-review-before-native-rebuild",
        textBoxes: splitBandTooClose.length,
        reason: "verified-text-free-band-too-close-to-native-text",
        areaRatio: round((Number(image?.box?.w || 0) * Number(image?.box?.h || 0)) / Math.max(1, slideArea))
      });
      continue;
    }
    // A single native title over an uncleared raster crop is enough to create
    // visible ghosting. Do not wait for a dense text layer before failing it.
    if (overlapping.length === 0) continue;
    risks.push({
      imageId: image.id || null,
      detector: image?.source?.detector || "unknown",
      expressionForm: image?.source?.expressionForm || "unknown-expression",
      expressionSubtype: image?.source?.expressionSubtype || "unknown-subtype",
      recommendedAction: image?.source?.recommendedAction || "manual-review-before-native-rebuild",
      textBoxes: overlapping.length,
      reason: unsafeDecorativeBackground
        ? "decorative-background-with-native-text-must-use-a-verified-text-free-band"
        : "fidelity-crop-with-native-text-overlay",
      areaRatio: round((Number(image?.box?.w || 0) * Number(image?.box?.h || 0)) / Math.max(1, slideArea))
    });
  }
  return risks;
}

function collectNativeOverlayRisks({ images = [], shapes = [], slideArea = 960 * 540 } = {}) {
  const risks = [];
  for (const image of images) {
    if (!isNativeOverlayRiskImage(image, slideArea)) continue;
    const overlapping = shapes.filter((shape) => isVisibleNativeOverlayShapeForImage(shape, image));
    if (overlapping.length === 0) continue;
    risks.push({
      imageId: image.id || null,
      detector: image?.source?.detector || "unknown",
      expressionForm: image?.source?.expressionForm || "unknown-expression",
      expressionSubtype: image?.source?.expressionSubtype || "unknown-subtype",
      recommendedAction: image?.source?.recommendedAction || "manual-review-before-native-rebuild",
      shapes: overlapping.length,
      areaRatio: round((Number(image?.box?.w || 0) * Number(image?.box?.h || 0)) / Math.max(1, slideArea))
    });
  }
  return risks;
}

function isNativeOverlayRiskImage(image, slideArea) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const box = image?.box || {};
  const areaRatio = (Number(box.w || 0) * Number(box.h || 0)) / Math.max(1, slideArea);
  if (areaRatio < 0.18) return false;
  if (source.visualAtomOverlayOnly === true) return true;
  if (/top-complex-diagram-crop/.test(detector) && source.allowVisibleTopComplexNativeRebuild !== true) return true;
  return false;
}

function isVisibleNativeOverlayShapeForImage(shape, image) {
  const source = shape?.source || {};
  if (!source.layerSourceId || !image?.id || source.layerSourceId !== image.id) return false;
  if (source.editable !== true && source.nativeRebuild !== true) return false;
  return boxCenterInside(shape?.box, image?.box);
}

function isTextErasedFromCrop(textBox, image) {
  const source = textBox?.source || {};
  return source.textErasedFromCrop === true
    && source.layerSourceId
    && image?.id
    && source.layerSourceId === image.id;
}

function isTextOverlayRiskImage(image, slideArea) {
  // Split decorative bands still need a geometry check in
  // collectTextOverlayRisks. Returning early here used to trust the marker
  // without proving that the crop stayed outside native text.
  if (isAllowedDecorativeBackgroundImage(image)) return true;
  const source = image?.source || {};
  const form = String(source.expressionForm || "").toLowerCase();
  const action = String(source.recommendedAction || "").toLowerCase();
  const box = image?.box || {};
  const areaRatio = (Number(box.w || 0) * Number(box.h || 0)) / Math.max(1, slideArea);
  if (areaRatio < 0.25) return false;
  if (/decorative-cover|brand|value-banner/.test(form)) return false;
  if (/native-background/.test(action)) return false;
  return /complex-diagram|screenshot|chart-snapshot|icon-or-illustration|unknown/.test(form)
    || /preserve-fidelity-crop|keep-local-crop|keep-crop/.test(action);
}

function isUnsafeDecorativeTextOverlayBackground(image) {
  return isAllowedDecorativeBackgroundImage(image)
    && image?.source?.textFreeBandSplit !== true;
}

function boxCenterInside(box, container) {
  if (!box || !container) return false;
  const x = Number(box.x || 0) + Number(box.w || 0) / 2;
  const y = Number(box.y || 0) + Number(box.h || 0) / 2;
  return x >= Number(container.x || 0)
    && x <= Number(container.x || 0) + Number(container.w || 0)
    && y >= Number(container.y || 0)
    && y <= Number(container.y || 0) + Number(container.h || 0);
}

function boxesOverlap(first, second) {
  const firstX = Number(first?.x);
  const firstY = Number(first?.y);
  const firstW = Number(first?.w);
  const firstH = Number(first?.h);
  const secondX = Number(second?.x);
  const secondY = Number(second?.y);
  const secondW = Number(second?.w);
  const secondH = Number(second?.h);
  if (![firstX, firstY, firstW, firstH, secondX, secondY, secondW, secondH].every(Number.isFinite)) return false;
  if (firstW <= 0 || firstH <= 0 || secondW <= 0 || secondH <= 0) return false;
  return firstX < secondX + secondW
    && firstX + firstW > secondX
    && firstY < secondY + secondH
    && firstY + firstH > secondY;
}

function boxesWithinClearance(first, second, clearancePt = 0) {
  const clearance = Math.max(0, Number(clearancePt) || 0);
  if (clearance === 0) return boxesOverlap(first, second);
  const expanded = {
    x: Number(second?.x) - clearance,
    y: Number(second?.y) - clearance,
    w: Number(second?.w) + clearance * 2,
    h: Number(second?.h) + clearance * 2
  };
  return boxesOverlap(first, expanded);
}

function addProfileCount(target, key) {
  const safeKey = String(key || "unknown");
  target[safeKey] = (target[safeKey] || 0) + 1;
}

function safeProfileKey(value) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text || "unknown";
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? round(number) : null;
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function summarizeVisualUnitDecisionProfile(ir = {}, options = {}) {
  const maxExamples = normalizePositiveInt(options.maxExamples, 40);
  const byDecision = {};
  const byReason = {};
  const byExpression = {};
  const byLayerType = {};
  const byUnitDisposition = {};
  const examples = [];
  const examplesByDecision = {};
  const pages = [];
  let nativeStructureCandidates = 0;
  let intentionalMinimumUnitCrops = 0;
  let actionableUnexplainedCrops = 0;
  let suspiciousMonolithicStructuredCrops = 0;
  let editableNativeObjects = 0;
  for (const [pageOrdinal, page] of (Array.isArray(ir?.pages) ? ir.pages : []).entries()) {
    const pageIndex = page?.pageIndex ?? pageOrdinal;
    const pageSummary = {
      pageIndex,
      nativeStructureCandidates: 0,
      intentionalMinimumUnitCrops: 0,
      actionableUnexplainedCrops: 0,
      suspiciousMonolithicStructuredCrops: 0,
      editableNativeObjects: 0
    };
    for (const key of ["shapes", "tables", "charts", "icons", "textBoxes"]) {
      const items = Array.isArray(page?.[key]) ? page[key] : [];
      editableNativeObjects += items.length;
      pageSummary.editableNativeObjects += items.length;
      for (const item of items) {
        const decision = classifyEditableVisualUnitDecision(item, key);
        if (decision !== "native-structure-candidate") continue;
        nativeStructureCandidates += 1;
        pageSummary.nativeStructureCandidates += 1;
        addProfileCount(byDecision, decision);
        addProfileCount(byReason, safeProfileKey(item?.source?.detector || key));
        addProfileCount(byExpression, safeProfileKey(item?.source?.expressionForm || key));
        addProfileCount(byLayerType, safeProfileKey(item?.source?.layerType || item?.source?.layer?.layerType || "native-object"));
        addProfileCount(byUnitDisposition, "semantic-native-structure");
        pushVisualUnitExample(examples, maxExamples, {
          pageIndex,
          id: item?.id || `${key}-${pageSummary.editableNativeObjects}`,
          decision,
          unitDisposition: "semantic-native-structure",
          type: key,
          detector: item?.source?.detector || key,
          expressionForm: item?.source?.expressionForm || key,
          reason: item?.source?.minimumUnitPolicy || item?.source?.componentTemplatePart || item?.source?.detector || "native editable object"
        });
        pushVisualUnitDecisionExample(examplesByDecision, decision, maxExamples, {
          pageIndex,
          id: item?.id || `${key}-${pageSummary.editableNativeObjects}`,
          type: key,
          unitDisposition: "semantic-native-structure",
          detector: item?.source?.detector || key,
          expressionForm: item?.source?.expressionForm || key,
          reason: item?.source?.minimumUnitPolicy || item?.source?.componentTemplatePart || item?.source?.detector || "native editable object"
        });
      }
    }
    for (const image of Array.isArray(page?.images) ? page.images : []) {
      if (image?.source?.editable === true) {
        editableNativeObjects += 1;
        pageSummary.editableNativeObjects += 1;
        continue;
      }
      const suspiciousMonolithicCrop = isSuspiciousMonolithicStructuredScreenshotCrop(
        image,
        pageSummary.editableNativeObjects,
        ir?.slideSize
      );
      const decision = suspiciousMonolithicCrop
        ? "actionable-unexplained-crop"
        : classifyImageVisualUnitDecision(image);
      const unitDisposition = suspiciousMonolithicCrop
        ? "semantic-native-structure"
        : imageVisualUnitDisposition(image, decision);
      const decisionReason = suspiciousMonolithicCrop
        ? "large process-like screenshot crop has too few editable semantic objects"
        : visualUnitDecisionReason(image, decision);
      addProfileCount(byDecision, decision);
      addProfileCount(byReason, decisionReason);
      addProfileCount(byExpression, safeProfileKey(image?.source?.expressionForm || "unknown-expression"));
      addProfileCount(byLayerType, safeProfileKey(image?.source?.layerType || image?.source?.layer?.layerType || image?.layerType || "unknown-layer"));
      addProfileCount(byUnitDisposition, unitDisposition);
      if (decision === "intentional-minimum-unit-crop") {
        intentionalMinimumUnitCrops += 1;
        pageSummary.intentionalMinimumUnitCrops += 1;
      } else if (decision === "actionable-unexplained-crop") {
        actionableUnexplainedCrops += 1;
        pageSummary.actionableUnexplainedCrops += 1;
      }
      if (suspiciousMonolithicCrop) {
        suspiciousMonolithicStructuredCrops += 1;
        pageSummary.suspiciousMonolithicStructuredCrops += 1;
      }
      pushVisualUnitExample(examples, maxExamples, {
        pageIndex,
        id: image?.id || `image-${pageSummary.intentionalMinimumUnitCrops + pageSummary.actionableUnexplainedCrops}`,
        decision,
        unitDisposition,
        type: image?.type || "image",
        detector: image?.source?.detector || "unknown",
        expressionForm: image?.source?.expressionForm || "unknown-expression",
        expressionSubtype: image?.source?.expressionSubtype || "unknown-subtype",
        recommendedAction: image?.source?.recommendedAction || "manual-review-before-native-rebuild",
        areaRatio: visualUnitAreaRatio(image?.box, ir?.slideSize),
        reason: decisionReason
      });
      pushVisualUnitDecisionExample(examplesByDecision, decision, maxExamples, {
        pageIndex,
        id: image?.id || `image-${pageSummary.intentionalMinimumUnitCrops + pageSummary.actionableUnexplainedCrops}`,
        type: image?.type || "image",
        unitDisposition,
        detector: image?.source?.detector || "unknown",
        expressionForm: image?.source?.expressionForm || "unknown-expression",
        expressionSubtype: image?.source?.expressionSubtype || "unknown-subtype",
        recommendedAction: image?.source?.recommendedAction || "manual-review-before-native-rebuild",
        areaRatio: visualUnitAreaRatio(image?.box, ir?.slideSize),
        reason: decisionReason
      });
    }
    pages.push(pageSummary);
  }
  return {
    provider: "quality-gate-visual-unit-decision-profile",
    pages: pages.length,
    editableNativeObjects,
    nativeStructureCandidates,
    intentionalMinimumUnitCrops,
    actionableUnexplainedCrops,
    suspiciousMonolithicStructuredCrops,
    byDecision,
    byReason,
    byExpression,
    byLayerType,
    byUnitDisposition,
    examples,
    examplesByDecision,
    pagesDetail: pages
  };
}

function isSuspiciousMonolithicStructuredScreenshotCrop(image = {}, editableNativeObjects = 0, slideSize = {}) {
  const source = image?.source || {};
  if (String(source.detector || "") !== "screenshot-process-underlay-crop") return false;
  const retainedTemplateShell = source.componentTemplateApplicationMode === "native-shell-over-fidelity-crop"
    && source.componentTemplateCropReplacedByNative === false;
  if (!retainedTemplateShell && Number(editableNativeObjects) > 3) return false;
  if (visualUnitAreaRatio(image?.box, slideSize) < 0.45) return false;
  if (retainedTemplateShell) return true;
  const text = String(source.pageText || source.allText || "").normalize("NFKC");
  const semanticMarkers = [
    /输入|标准\s*PRD|原文件/,
    /引擎|转换|处理/,
    /输出|原型|手册/,
    /门户|平台|交付|展示/,
    /路由|连接|同步|闭环/
  ];
  return semanticMarkers.filter((pattern) => pattern.test(text)).length >= 4;
}

function classifyEditableVisualUnitDecision(item = {}, key = "") {
  const source = item?.source || {};
  const text = [
    key,
    source.detector,
    source.expressionForm,
    source.expressionSubtype,
    source.minimumUnitPolicy,
    source.nativeRebuild === true ? "native-rebuild" : "",
    source.componentTemplatePart,
    source.layerType,
    source.layer?.layerType
  ].filter(Boolean).join(" ").toLowerCase();
  return /native|rebuild-semantic-structure|table|chart|diagram|matrix|grid|connector|shape|text/.test(text)
    ? "native-structure-candidate"
    : "editable-object";
}

function classifyImageVisualUnitDecision(image = {}) {
  const source = image?.source || {};
  const unitDisposition = imageVisualUnitDisposition(image);
  if (unitDisposition === "intentional-visual-crop"
    || unitDisposition === "intentional-decorative-crop"
    || unitDisposition === "hybrid-crop-with-native-overlays") {
    return "intentional-minimum-unit-crop";
  }
  if (unitDisposition === "semantic-native-structure" || unitDisposition === "classification-needed") {
    return "actionable-unexplained-crop";
  }
  if (source.protectedMinimumUnit === true
    || source.intentionalMinimumUnitCrop === true
    || source.specializedNativeHybridResidual === true
    || isIntentionalRasterImage(image)) {
    return "intentional-minimum-unit-crop";
  }
  return "actionable-unexplained-crop";
}

function imageVisualUnitDisposition(image = {}, decision = "") {
  const source = image?.source || {};
  const explicit = safeProfileKey(
    source.expressionPolicy?.unitDisposition
    || source.unitDisposition
    || source.componentRenderStrategy?.expressionPolicy?.unitDisposition
    || source.layer?.componentRenderStrategy?.expressionPolicy?.unitDisposition
  );
  if (explicit !== "unknown") return explicit;
  if (decision === "intentional-minimum-unit-crop") return "intentional-visual-crop";
  if (decision === "actionable-unexplained-crop") return "classification-needed";
  return "unknown";
}

function visualUnitDecisionReason(image = {}, decision = "") {
  const source = image?.source || {};
  if (decision === "actionable-unexplained-crop") {
    return safeProfileKey(source.componentTemplateCropReplacementReason || source.recommendedAction || "unexplained-non-editable-crop");
  }
  return safeProfileKey(
    source.minimumUnitPolicy
    || source.componentTemplateCropReplacementReason
    || source.recommendedAction
    || source.nonEditableReason
    || source.reason
    || "intentional-raster-fidelity-unit"
  );
}

function visualUnitAreaRatio(box = {}, slideSize = {}) {
  const slideArea = Math.max(1, Number(slideSize.widthPt || 960) * Number(slideSize.heightPt || 540));
  return round((Number(box?.w || 0) * Number(box?.h || 0)) / slideArea);
}

function pushVisualUnitExample(examples, maxExamples, example) {
  if (examples.length >= maxExamples) return;
  examples.push(example);
}

function pushVisualUnitDecisionExample(examplesByDecision, decision, maxExamples, example) {
  const key = safeProfileKey(decision || "unknown-decision");
  if (!Array.isArray(examplesByDecision[key])) examplesByDecision[key] = [];
  const perDecisionLimit = Math.max(1, Math.min(10, Math.floor(maxExamples / 3) || 1));
  if (examplesByDecision[key].length >= perDecisionLimit) return;
  examplesByDecision[key].push(example);
}

function summarizePages(pages) {
  const summary = {
    pages: pages.length,
    accepted: 0,
    needsReview: 0,
    rejected: 0
  };
  for (const page of pages) {
    if (page.status === "accepted") summary.accepted += 1;
    else if (page.status === "needs-review") summary.needsReview += 1;
    else summary.rejected += 1;
  }
  summary.passed = summary.rejected === 0;
  return summary;
}

function summarizeQualityGateStatus(input = {}) {
  return summarizeQualityGateStatusCore(input);
}

function buildContactSheet({ pages, render, maxPages, outFile }) {
  const selected = pages
    .filter((page) => page.sourceImage && page.renderedImage && page.diffImage)
    .slice(0, Math.max(1, maxPages));
  if (selected.length === 0) return null;
  const panelW = 320;
  const gap = 8;
  const rowH = 205;
  const sheet = {
    width: panelW * 3 + gap * 4,
    height: selected.length * (rowH + gap) + gap,
    rgba: Buffer.alloc((panelW * 3 + gap * 4) * (selected.length * (rowH + gap) + gap) * 4, 255)
  };
  selected.forEach((page, row) => {
    const y = gap + row * (rowH + gap);
    const statusColor = statusColorRgba(page.status);
    fillRect(sheet, gap, y, sheet.width - gap * 2, 5, statusColor);
    [page.sourceImage, page.renderedImage, page.diffImage].forEach((file, col) => {
      const image = readPng(file);
      const thumb = resizeFit(image, panelW, rowH - 10);
      const x = gap + col * (panelW + gap);
      paste(sheet, thumb, x, y + 10);
    });
  });
  ensureDir(path.dirname(outFile));
  writePng(outFile, sheet);
  return outFile;
}

function resizeFit(image, maxW, maxH) {
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const out = { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(image.width - 1, Math.floor(x / scale));
      const sy = Math.min(image.height - 1, Math.floor(y / scale));
      const src = (sy * image.width + sx) * 4;
      const dst = (y * width + x) * 4;
      image.rgba.copy(out.rgba, dst, src, src + 4);
    }
  }
  return out;
}

function paste(target, image, x, y) {
  for (let row = 0; row < image.height; row += 1) {
    if (y + row < 0 || y + row >= target.height) continue;
    for (let col = 0; col < image.width; col += 1) {
      if (x + col < 0 || x + col >= target.width) continue;
      const src = (row * image.width + col) * 4;
      const dst = ((y + row) * target.width + x + col) * 4;
      image.rgba.copy(target.rgba, dst, src, src + 4);
    }
  }
}

function fillRect(image, x, y, w, h, rgba) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgba[0];
      image.rgba[offset + 1] = rgba[1];
      image.rgba[offset + 2] = rgba[2];
      image.rgba[offset + 3] = rgba[3];
    }
  }
}

function statusColorRgba(status) {
  if (status === "accepted") return [35, 159, 84, 255];
  if (status === "needs-review") return [244, 123, 32, 255];
  return [196, 45, 45, 255];
}

function collectItems(page) {
  return [
    ...(page.shapes || []),
    ...(page.images || []),
    ...(page.tables || []),
    ...(page.textBoxes || [])
  ];
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizePathPart(value) {
  return String(value || "deck")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "deck";
}

function shortCacheName(value, identity = value) {
  const safe = sanitizePathPart(value);
  const hash = crypto.createHash("sha1").update(String(identity || safe)).digest("hex").slice(0, 8);
  if (safe.length <= 39) return `${safe}-${hash}`;
  return `${safe.slice(0, 39)}-${hash}`;
}

function realWorkspaceCwd() {
  try {
    return fs.realpathSync.native(process.cwd());
  } catch {
    return process.cwd();
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function numberArg(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalNumberArg(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parsePageIndexes(value) {
  if (!value) return null;
  const indexes = new Set();
  for (const part of String(value).split(",")) {
    const item = part.trim();
    if (!item) continue;
    const range = item.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number.parseInt(range[1], 10);
      const end = Number.parseInt(range[2], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) continue;
      for (let page = start; page <= end; page += 1) indexes.add(page - 1);
      continue;
    }
    const page = Number.parseInt(item, 10);
    if (Number.isFinite(page) && page > 0) indexes.add(page - 1);
  }
  return indexes.size ? [...indexes].sort((a, b) => a - b) : null;
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  alignRenderedPageIndexesToIr,
  appendBoundedOutput,
  assessPageQuality,
  assessPages,
  boundedHeartbeatMs,
  countRenderedPages,
  createRenderCacheIdentity,
  createProgressReporter,
  findRenderDirsByPrefix,
  findRenderDirsByIdentity,
  findRenderDirsFromQualityReports,
  hydrateSourceImages,
  normalizeRenderer,
  readRenderedPages,
  readRenderCacheMetadata,
  readReconstructionBudgetConfig,
  readTextOcrConfig,
  readPaddleOcrConfig,
  readThresholds,
  readUmiOcrConfig,
  parsePageIndexes,
  parseRendererReport,
  realWorkspaceCwd,
  resolveRenderOutputDir,
  resolveReusableRenderDir,
  reusableRenderMatches,
  sanitizeRendererError,
  selectRendererForIr,
  summarizeComponentTemplateCropStatus,
  summarizeEditabilityProfile,
  summarizeNativeComponentProfile,
  summarizeVisualUnitDecisionProfile,
  summarizeComparedDeckMetrics,
  summarizeQualityGateStatus,
  summarizeNativeObjectConflicts,
  summarizePages,
  summarizeRasterImages,
  auditSourceMediaExclusion,
  collectTextOverlayRisks,
  countLogicalNativeShapes,
  countLogicalNativeTextBoxes,
  writeRenderCacheMetadata
};
