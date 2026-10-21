"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildComponentRegions, compareComponentRegions } = require("../slideclone-core/component-region-quality");
const { createCandidateVerificationCache } = require("./candidate-verification-cache");
const { createRenderedPageSnapshotCache, validatedRenderedPagePaths } = require("./rendered-page-snapshot-cache");
const { missingReferenceRegions } = require("./missing-component-regression");
const { createTextComparisonSession } = require("./text-comparison-session");
const { parseRenderedTypographyAudit } = require("../slideclone-core/rendered-typography-audit");

const DEFAULT_THRESHOLDS = Object.freeze({ maximumPixelDiffRatio: 0.08, maximumForegroundMissingRatio: 0.12, maximumMeanAbsoluteDelta: 12 });
const COMPARISON_SETTINGS = Object.freeze({ threshold: 24, foregroundTolerancePx: 2, foregroundToleranceDelta: 54 });

function boundedThreshold(value, fallback, maximum) {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > maximum) throw new TypeError("raw image quality threshold is invalid");
  return resolved;
}
function insideRoot(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function createRawImageRenderQualityVerifier({ renderPresentation, comparePageFiles, auditRenderedText, thresholds = {} } = {}) {
  if (typeof renderPresentation !== "function" || typeof comparePageFiles !== "function") throw new TypeError("raw image quality adapters are required");
  if (auditRenderedText !== undefined && typeof auditRenderedText !== "function") throw new TypeError("invalid rendered text audit adapter");
  const policy = Object.freeze({
    maximumPixelDiffRatio: boundedThreshold(thresholds.maximumPixelDiffRatio, DEFAULT_THRESHOLDS.maximumPixelDiffRatio, 1),
    maximumForegroundMissingRatio: boundedThreshold(thresholds.maximumForegroundMissingRatio, DEFAULT_THRESHOLDS.maximumForegroundMissingRatio, 1),
    maximumMeanAbsoluteDelta: boundedThreshold(thresholds.maximumMeanAbsoluteDelta, DEFAULT_THRESHOLDS.maximumMeanAbsoluteDelta, 255)
  });
  const candidateVerificationCache = createCandidateVerificationCache();
  const pendingVerifications = new Map();
  const renderedPageSnapshotCache = createRenderedPageSnapshotCache();
  const textComparisonSession = createTextComparisonSession({ snapshotCache: renderedPageSnapshotCache, compareRegions: compareComponentRegions, settings: COMPARISON_SETTINGS });
  return async ({ root, pptxFile, sourceImage, sourceImages, deck, referenceQuality, isCancellationRequested, collectRenderedPages }) => {
    if (collectRenderedPages !== undefined && typeof collectRenderedPages !== "function") throw new TypeError("rendered page collector is invalid");
    const sources = sourceImages === undefined ? [sourceImage] : sourceImages;
    if (typeof root !== "string" || !path.isAbsolute(root)
      || typeof pptxFile !== "string" || !path.isAbsolute(pptxFile) || !insideRoot(root, pptxFile)
      || !Array.isArray(sources) || sources.length < 1 || sources.length > 20
      || sources.some((file) => typeof file !== "string" || !path.isAbsolute(file) || !insideRoot(root, file))) throw new TypeError("raw image quality request is invalid");
    for (const file of [pptxFile, ...sources]) {
      const info = fs.lstatSync(file);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("raw image quality input is invalid");
    }
    const componentRegions = deck === undefined ? null : componentRegionsForDeck(deck, sources.length);
    const referenceRegions = referenceQuality === undefined ? null : missingReferenceRegions(referenceQuality);
    if (referenceRegions && (!deck || referenceRegions.some(region => region.pageIndex >= sources.length))) throw new TypeError("missing-component reference pages are invalid");
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    const renderConfig = Object.freeze({
      render: Object.freeze({ dpi: 144, maxPages: sources.length, convertTimeoutMs: 120000, renderTimeoutMs: 120000 }),
      powerPoint: Object.freeze({ exportTimeoutMs: 180000 })
    });
    const cacheBinding = {
      root,
      pptxFile,
      sourceImages: sources,
      deck,
      referenceQuality,
      renderer: renderPresentation,
      comparator: comparePageFiles,
      settings: Object.freeze({ render: renderConfig, comparison: COMPARISON_SETTINGS }),
      policy
    };
    let cacheAttempt = candidateVerificationCache.begin(cacheBinding);
    let releaseVerification = () => {};
    const startedAt = Date.now();
    // Report only a local allowlisted phase. Adapter messages and error fields
    // may contain source content, paths or credentials and must never escape.
    let failureStage = "cache";
    try {
      // A duplicate regional candidate waits for the same fully bound revision.
      // After waiting, repeat the normal source/artifact binding and cache
      // admission; a failed or changed result cannot become cached evidence.
      while (cacheAttempt.key !== null && pendingVerifications.has(cacheAttempt.key)) {
        await pendingVerifications.get(cacheAttempt.key);
        if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
        cacheAttempt = candidateVerificationCache.begin(cacheBinding);
      }
      if (cacheAttempt.key !== null) {
        const key = cacheAttempt.key;
        let release;
        const pending = new Promise(resolve => { release = resolve; });
        pendingVerifications.set(key, pending);
        releaseVerification = () => { pendingVerifications.delete(key); release(); };
      }
      if (cacheAttempt.cached) {
        textComparisonSession.validateReference(referenceQuality, root, sources, deck);
        if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
        const replayPages = collectRenderedPages
          ? renderedPageSnapshotCache.replay({ root, entry: cacheAttempt.getEntry() }) : null;
        if (!collectRenderedPages || replayPages) {
          if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
          if (collectRenderedPages) await collectRenderedPages(replayPages);
          if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
          if (cacheAttempt.isCurrent()) return Object.freeze({ ...cacheAttempt.cached,
            metrics: Object.freeze({ ...cacheAttempt.cached.metrics,
              "quality-render-milliseconds": 0, "quality-verification-cache-hit": 1 }) });
        }
      }
      // Independent candidates never share writable comparison files.
      const outputDir = fs.mkdtempSync(path.join(root, "quality-render-"));
      failureStage = "renderer";
      const rendered = await renderPresentation({ pptx: { pptxFile }, iteration: 0, sourceImages: sources, maxPages: sources.length, ...(deck ? { ir: deck } : {}) }, { outputDir, isCancellationRequested, config: renderConfig });
      const renderedImages = validatedRenderedPagePaths(rendered, sources.length);
      if (!renderedImages) throw new Error("quality renderer returned an invalid result");
      failureStage = "typography";
      const typography = deck && auditRenderedText ? parseRenderedTypographyAudit(await auditRenderedText({deck,rendered,root,isCancellationRequested})) : null;
      if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
      failureStage = "collector";
      if (collectRenderedPages) await collectRenderedPages(renderedImages);
      if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
      failureStage = "snapshot";
      const snapshot = renderedPageSnapshotCache.capture({ root, pages: renderedImages });
      failureStage = "comparison";
      const metrics = sources.map((currentSource, pageIndex) => comparePageFiles({ pageIndex, sourceImage: currentSource, renderedImage: renderedImages[pageIndex], diffImage: path.join(outputDir, `diff-${String(pageIndex + 1).padStart(3, "0")}.png`), options: { ...COMPARISON_SETTINGS, ...(componentRegions ? { componentRegions: componentRegions[pageIndex], slideSize: deck.slideSize, textBoxes: deck.pages[pageIndex].textBoxes } : {}) } }));
      if (metrics.some((metric) => !metric?.ok || ![metric.pixelDiffRatio, metric.foregroundMissingRatio, metric.meanAbsoluteDelta].every(Number.isFinite))) throw new Error("quality comparison returned an invalid result");
      const maxima = {
        pixelDiffRatio: Math.max(...metrics.map((metric) => metric.pixelDiffRatio)),
        foregroundMissingRatio: Math.max(...metrics.map((metric) => metric.foregroundMissingRatio)),
        meanAbsoluteDelta: Math.max(...metrics.map((metric) => metric.meanAbsoluteDelta))
      };
      const visualPassed = maxima.pixelDiffRatio <= policy.maximumPixelDiffRatio && maxima.foregroundMissingRatio <= policy.maximumForegroundMissingRatio && maxima.meanAbsoluteDelta <= policy.maximumMeanAbsoluteDelta;
      const passed = visualPassed && (!typography || typography.passed);
      failureStage = "evidence";
      const componentQuality = metrics.map((metric) => metric.componentQuality).filter(Boolean);
      const componentWorst = boundedComponentWorst(metrics);
      const componentLocalMetrics = boundedComponentLocalMetrics(metrics, componentRegions);
      const textWeightEvidence = boundedTextWeightEvidence(metrics);
      const componentReferenceMetrics = referenceRegions ? sources.flatMap((currentSource, pageIndex) => {
        const regions = referenceRegions.filter(region => region.pageIndex === pageIndex);
        if (!regions.length) return [];
        const comparison = comparePageFiles({ pageIndex, sourceImage: currentSource, renderedImage: renderedImages[pageIndex],
          diffImage: path.join(outputDir, `reference-diff-${pageIndex + 1}.png`),
          options: { ...COMPARISON_SETTINGS, componentRegions: regions, slideSize: deck.slideSize } });
        if (!comparison?.ok || !Array.isArray(comparison.componentQuality?.local)) throw new Error("missing-component reference comparison failed");
        return regions.map(region => {
          const metric = comparison.componentQuality.local.find(item => item.id === region.id);
          if (!metric || !Number.isFinite(metric.severity)) throw new Error("missing-component reference evidence is incomplete");
          return Object.freeze({ pageIndex, box: Object.freeze({ ...region.box }), severity: metric.severity });
        });
      }) : null;
      const textPair = deck ? textComparisonSession.compare({ referenceQuality, root, sources, deck, regions: componentRegions, renderedImages, metrics }) : null;
      if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
      const quality = Object.freeze({
        passed,
        checks: Object.freeze([Object.freeze({ name: "quality-rendered", passed: true }), Object.freeze({ name: "visual-fidelity", passed:visualPassed }), ...(typography?[
          Object.freeze({name:"typography-rendered-content",passed:typography.missing===0}),
          Object.freeze({name:"typography-rendered-containment",passed:typography.overflow===0}),
          Object.freeze({name:"typography-rendered-collisions",passed:typography.collisions===0}),
          Object.freeze({name:"typography-rendered-order",passed:typography.order===0}),
          Object.freeze({name:"typography-rendered-coverage",passed:typography.unverified===0}),
          Object.freeze({name:"typography-rendered-ownership",passed:typography.ambiguous===0})]:[])]),
        ...(typography?{typographyEvidence:Object.freeze(typography)}:{}),
        metrics: Object.freeze({ "pixel-diff-ratio": maxima.pixelDiffRatio, "foreground-missing-ratio": maxima.foregroundMissingRatio, "mean-absolute-delta": maxima.meanAbsoluteDelta, "quality-pages-compared": metrics.length, ...(componentQuality.length ? { "component-regions-audited": componentQuality.reduce((sum, item) => sum + item.audited, 0), "component-regions-evaluated": componentQuality.reduce((sum, item) => sum + (item.evaluated ?? item.audited), 0), "component-regions-attention": componentQuality.reduce((sum, item) => sum + (item.attentionCount ?? 0), 0), "worst-component-normalized-severity": Math.max(...componentQuality.map((item) => item.worstSeverity ?? 0)), "worst-component-pixel-diff-ratio": Math.max(...componentQuality.map((item) => item.worstPixelDiffRatio ?? 0)), "worst-component-foreground-missing-ratio": Math.max(...componentQuality.map((item) => item.worstForegroundMissingRatio ?? 0)) } : {}), "quality-render-milliseconds": Date.now() - startedAt }),
        ...(componentWorst.length ? { componentWorst: Object.freeze(componentWorst) } : {}),
        ...(componentLocalMetrics.length ? { componentLocalMetrics: Object.freeze(componentLocalMetrics) } : {}),
        ...(textWeightEvidence.length ? { textWeightEvidence: Object.freeze(textWeightEvidence) } : {}),
        ...(componentReferenceMetrics ? { componentReferenceMetrics: Object.freeze(componentReferenceMetrics) } : {})
      });
      textComparisonSession.bind(quality, textPair);
      failureStage = "cache";
      if (cacheAttempt.commit(quality)) {
        const entry = cacheAttempt.getEntry();
        const snapshotCommitted = snapshot?.commit(entry);
        if (textPair && !snapshotCommitted) { candidateVerificationCache.clear(); throw new Error("paired text candidate snapshot changed"); }
        if (snapshotCommitted) textComparisonSession.remember({ quality, entry, isCurrent: cacheAttempt.isCurrent, root, sources, deck, regions: componentRegions, metrics });
        if (entry) textComparisonSession.copyEvidence(quality, entry.quality, referenceQuality);
      }
      return quality;
    } catch (error) {
      if (error instanceof Error && error.message === "editable job was cancelled") throw error;
      return Object.freeze({
        passed: false,
        checks: Object.freeze([Object.freeze({ name: "quality-rendered", passed: false })]),
        metrics: Object.freeze({
          "quality-render-milliseconds": Date.now() - startedAt,
          "quality-render-failed": 1,
          [`quality-failure-stage-${failureStage}`]: 1
        })
      });
    } finally { releaseVerification(); }
  };
}

function componentRegionsForDeck(deck, pageCount) {
  if (!deck || !Array.isArray(deck.pages) || deck.pages.length !== pageCount || !deck.slideSize) throw new TypeError("raw image component region deck is invalid");
  return deck.pages.map((page) => buildComponentRegions(page, deck.slideSize));
}

function boundedTextWeightEvidence(metrics) {
  const rows = [];
  for (const [pageIndex, metric] of metrics.entries()) {
    if (metric.textWeightEvidence === undefined) continue;
    if (!Array.isArray(metric.textWeightEvidence) || metric.textWeightEvidence.length > 2000) throw new TypeError("text weight evidence is excessive");
    const seen = new Set();
    for (const item of metric.textWeightEvidence) {
      if (typeof item?.id !== "string" || !item.id || item.id.length > 256 || [...item.id].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
        || seen.has(item.id) || !Number.isFinite(item.coverageRatio) || item.coverageRatio <= 0 || item.coverageRatio > 4
        || ![item.source, item.rendered].every(box => box && [box.x, box.y, box.w, box.h].every(Number.isFinite)
          && box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0 && box.x + box.w <= 100000 && box.y + box.h <= 100000)) throw new TypeError("text weight evidence is invalid");
      seen.add(item.id);
      rows.push(Object.freeze({ pageIndex, id: item.id, coverageRatio: item.coverageRatio,
        source: Object.freeze(boundedBox(item.source)), rendered: Object.freeze(boundedBox(item.rendered)) }));
      if (rows.length > 20000) throw new RangeError("text weight evidence exceeds the page batch boundary");
    }
  }
  return rows;
}

function boundedComponentWorst(metrics) {
  const rows = [];
  for (const metric of metrics) {
    if (!Number.isSafeInteger(metric?.pageIndex) || !metric?.componentQuality || !Array.isArray(metric.componentQuality.worst)) continue;
    for (const item of metric.componentQuality.worst) {
      if (typeof item?.id !== "string" || !item.id) continue;
      rows.push({
        pageIndex: metric.pageIndex,
        id: item.id.slice(0, 160),
        kind: typeof item.kind === "string" ? item.kind.slice(0, 32) : "",
        role: typeof item.role === "string" ? item.role.slice(0, 48) : "",
        ...(finiteBox(item.box) ? { box: boundedBox(item.box) } : {}),
        attention: item.attention === true,
        severity: boundedMetric(item.severity),
        pixelDiffRatio: boundedMetric(item.pixelDiffRatio),
        foregroundMissingRatio: boundedMetric(item.foregroundMissingRatio),
        changedPixels: boundedMetric(item.changedPixels),
        foregroundMissingPixels: boundedMetric(item.foregroundMissingPixels),
        contributionScore: boundedMetric(item.contributionScore),
        ...(item.textAdjacent === true ? { textAdjacent: true } : {}),
        ...(typeof item.repairHint === "string" && item.repairHint ? { repairHint: item.repairHint.slice(0, 32) } : {}),
        ...(typeof item.nearestTextId === "string" && item.nearestTextId ? { nearestTextId: item.nearestTextId.slice(0, 160) } : {}),
        ...(Number.isFinite(item.nearestTextDistancePt) ? { nearestTextDistancePt: boundedMetric(item.nearestTextDistancePt) } : {}),
        ...(item.kind === "missing" && item.role === "missing-native-component" ? boundedMissingNativeSourceEvidence(item.source) : {})
      });
    }
  }
  rows.sort((left, right) => Number(right.attention) - Number(left.attention)
    || componentRepairPriority(right) - componentRepairPriority(left)
    || right.severity - left.severity
    || right.foregroundMissingRatio - left.foregroundMissingRatio
    || left.pageIndex - right.pageIndex
    || left.id.localeCompare(right.id));
  return selectBoundedComponentWorstRows(rows).map(Object.freeze);
}

function componentRepairPriority(row) {
  if (row?.textAdjacent === true || row?.repairHint === "text") return 0;
  if (row?.kind === "missing" && row?.role === "missing-native-component" && Number(row.severity) >= 2) return 2;
  return 0;
}

function selectBoundedComponentWorstRows(rows = []) {
  const selected = [];
  const seen = new Set();
  const add = (row) => {
    const key = `${row.pageIndex}:${row.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(row);
  };
  for (const row of rows.slice(0, 30)) add(row);
  addWorstRowQuota(rows, add, (item) => item.kind === "text" && item.role === "text", 12);
  addWorstRowQuota(rows, add, (item) => item.kind === "missing" && item.role === "missing-native-component", 12);
  addWorstRowQuota([...rows].sort((left, right) => Number(right.contributionScore || 0) - Number(left.contributionScore || 0)), add, (item) => item.kind === "missing" && item.role === "missing-native-component", 8);
  addWorstRowQuota(rows, add, (item) => item.kind === "shape" && item.role === "connector-straight", 8);
  addWorstRowQuota(rows, add, (item) => item.kind === "shape" && item.role === "shape", 12);
  return selected.slice(0, 48);
}

function addWorstRowQuota(rows, add, predicate, limit) {
  let count = 0;
  for (const row of rows) {
    if (!predicate(row)) continue;
    add(row);
    count += 1;
    if (count >= limit) break;
  }
}

function boundedComponentLocalMetrics(metrics, regions = null) {
  const rows = [];
  for (const metric of metrics) {
    if (!Number.isSafeInteger(metric?.pageIndex) || !metric?.componentQuality || !Array.isArray(metric.componentQuality.local)) continue;
    for (const item of metric.componentQuality.local) {
      if (typeof item?.id !== "string" || !item.id) continue;
      const kind = typeof item.kind === "string" && item.kind ? item.kind.slice(0, 32) : "";
      const role = typeof item.role === "string" && item.role ? item.role.slice(0, 48) : "";
      const regionBox = kind === "text" ? item.box ?? regions?.[metric.pageIndex]?.find(region => region.id === item.id)?.box : undefined;
      rows.push({
        pageIndex: metric.pageIndex,
        id: item.id.slice(0, 160),
        kind,
        role,
        ...(finiteBox(regionBox) ? { box: Object.freeze(boundedBox(regionBox)) } : {}),
        attention: item.attention === true,
        severity: boundedMetric(item.severity),
        pixelDiffRatio: boundedMetric(item.pixelDiffRatio),
        foregroundMissingRatio: boundedMetric(item.foregroundMissingRatio),
        foregroundPixels: boundedMetric(item.foregroundPixels),
        changedPixels: boundedMetric(item.changedPixels),
        foregroundMissingPixels: boundedMetric(item.foregroundMissingPixels),
        contributionScore: boundedMetric(item.contributionScore),
        sufficientEvidence: item.sufficientEvidence === true,
        ...(item.kind === "missing" && item.role === "missing-native-component" ? boundedMissingNativeSourceEvidence(item.source) : {})
      });
      if (rows.length >= 5000) break;
    }
    if (rows.length >= 5000) break;
  }
  rows.sort((left, right) => left.pageIndex - right.pageIndex || left.id.localeCompare(right.id));
  return rows.map(Object.freeze);
}

function boundedMissingNativeSourceEvidence(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const result = {};
  if (typeof source.detector === "string" && source.detector) result.detector = source.detector.slice(0, 80);
  if (typeof source.dominantColor === "string" && /^#[0-9a-f]{6}$/iu.test(source.dominantColor)) result.dominantColor = source.dominantColor.toUpperCase();
  if (Number.isFinite(source.missingForegroundPixels) && source.missingForegroundPixels >= 0) result.missingForegroundPixels = boundedMetric(source.missingForegroundPixels);
  if (Number.isFinite(source.missingPixelDensity) && source.missingPixelDensity >= 0) result.missingPixelDensity = boundedMetric(source.missingPixelDensity);
  if (typeof source.missingComponentFingerprint === "string" && source.missingComponentFingerprint) result.missingComponentFingerprint = source.missingComponentFingerprint.slice(0, 160);
  if (typeof source.repairHint === "string" && source.repairHint) result.repairHint = source.repairHint.slice(0, 32);
  if (typeof source.nearestTextId === "string" && source.nearestTextId) result.nearestTextId = source.nearestTextId.slice(0, 160);
  if (Number.isFinite(source.nearestTextDistancePt) && source.nearestTextDistancePt >= 0) result.nearestTextDistancePt = boundedMetric(source.nearestTextDistancePt);
  return Object.keys(result).length > 0 ? { source: Object.freeze(result) } : {};
}

function boundedMetric(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function finiteBox(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && ["x", "y", "w", "h"].every((key) => Number.isFinite(Number(value[key])))
    && Number(value.w) > 0 && Number(value.h) > 0;
}

function boundedBox(value) {
  return Object.freeze({
    x: boundedMetric(Number(value.x)),
    y: boundedMetric(Number(value.y)),
    w: boundedMetric(Number(value.w)),
    h: boundedMetric(Number(value.h))
  });
}

module.exports = { DEFAULT_THRESHOLDS, createRawImageRenderQualityVerifier };
