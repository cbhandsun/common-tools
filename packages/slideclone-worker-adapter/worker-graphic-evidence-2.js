"use strict";

const { COMPONENT_FIDELITY_PRIMITIVE_MAX_RUNS, colorBrightness, hexColor, isSlideSize, pixelColor, saturationProxy } = require('./worker-primitives');
const { collectWorstComponentPrimitiveTargets, cropRaster, insideComponentPrimitiveTargetGeometry, lineSourcePixelMatchesStroke, mergeVerticalComponentPrimitiveRuns } = require('./worker-job-support');
const { sampledLowContrastFooterMarkFill, sourceComponentFidelityForeground, sourcePixelHex, sourceRenderedDelta } = require('./worker-graphic-evidence');
const { readPng, writePng } = require("./worker-input-services");
const path = require("node:path");
const { addNativeResidualPrimitives } = require('./worker-native-recovery-2');
const fs = require("node:fs");

function fitVerticalLineToSource(shape, image, slideSize) {
  const stroke = hexColor(shape?.style?.stroke);
  if (!stroke || !shape?.box || !image || !slideSize) return null;
  if (Math.abs(Number(shape.box.h || 0)) < 16 || Math.abs(Number(shape.box.w || 0)) > Math.max(1, Math.abs(Number(shape.box.h || 0)) * 0.08)) return null;
  const probe = { x: Number(shape.box.x) - 2, y: Number(shape.box.y), w: 4, h: Number(shape.box.h) };
  const scaleX = image.width / slideSize.widthPt; const scaleY = image.height / slideSize.heightPt;
  const left = Math.max(0, Math.floor((probe.x - 3) * scaleX));
  const top = Math.max(0, Math.floor((probe.y - 3) * scaleY));
  const right = Math.min(image.width, Math.ceil((probe.x + probe.w + 3) * scaleX));
  const bottom = Math.min(image.height, Math.ceil((probe.y + probe.h + 3) * scaleY));
  const xs = []; const ys = [];
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const color = pixelColor(image, x, y);
    if (lineSourcePixelMatchesStroke(color, stroke)) {
      xs.push(x); ys.push(y);
    }
  }
  if (xs.length < Math.max(20, Math.abs(shape.box.h) * scaleY * 0.18)) return null;
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const fitted = { x: xs[Math.floor(xs.length / 2)] / scaleX, y: ys[0] / scaleY, w: 0, h: (ys[ys.length - 1] + 1) / scaleY - ys[0] / scaleY };
  if (fitted.h < Math.max(12, Math.abs(shape.box.h) * 0.35) || fitted.h > Math.abs(shape.box.h) * 1.35) return null;
  return fitted;
}

function fitHorizontalLineToSource(shape, image, slideSize) {
  const stroke = hexColor(shape?.style?.stroke);
  if (!stroke || !shape?.box || !image || !slideSize) return null;
  if (Math.abs(Number(shape.box.w || 0)) < 16 || Math.abs(Number(shape.box.h || 0)) > Math.max(1, Math.abs(Number(shape.box.w || 0)) * 0.08)) return null;
  const probe = { x: Number(shape.box.x), y: Number(shape.box.y) - 2, w: Number(shape.box.w), h: 4 };
  const scaleX = image.width / slideSize.widthPt; const scaleY = image.height / slideSize.heightPt;
  const left = Math.max(0, Math.floor((probe.x - 3) * scaleX));
  const top = Math.max(0, Math.floor((probe.y - 3) * scaleY));
  const right = Math.min(image.width, Math.ceil((probe.x + probe.w + 3) * scaleX));
  const bottom = Math.min(image.height, Math.ceil((probe.y + probe.h + 3) * scaleY));
  const xs = []; const ys = [];
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const color = pixelColor(image, x, y);
    if (lineSourcePixelMatchesStroke(color, stroke)) {
      xs.push(x); ys.push(y);
    }
  }
  if (xs.length < Math.max(20, Math.abs(shape.box.w) * scaleX * 0.18)) return null;
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const fitted = { x: xs[0] / scaleX, y: ys[Math.floor(ys.length / 2)] / scaleY, w: (xs[xs.length - 1] + 1) / scaleX - xs[0] / scaleX, h: 0 };
  if (fitted.w < Math.max(12, Math.abs(shape.box.w) * 0.35) || fitted.w > Math.abs(shape.box.w) * 1.35) return null;
  return fitted;
}

function fitDeckSourceVerticalLines(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      const detector = String(shape?.source?.detector || "");
      const priorityKey = `${pageIndex}:${shape?.id || ""}`;
      if (shape?.type !== "line"
        || (detector !== "long-axis-line" && detector !== "line-text-native-card-side-accent" && !priorityIds.has(priorityKey))) continue;
      const fit = fitVerticalLineToSource(shape, image, next.slideSize) || fitHorizontalLineToSource(shape, image, next.slideSize);
      if (!fit) continue;
      const movement = Math.abs(fit.x - shape.box.x) + Math.abs(fit.y - shape.box.y) + Math.abs(fit.w - shape.box.w) + Math.abs(fit.h - shape.box.h);
      if (movement < 0.25) continue;
      const priority = priorityIds.has(priorityKey) ? priorityIds.get(priorityKey) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, fit, priority, score: movement });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.box = item.fit;
    shape.source = { ...(shape.source || {}), finalSourceVerticalLineFit: { provider: "worker-final-source-vertical-line-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalSourceVerticalLineFit: { provider: "worker-final-source-vertical-line-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}

function fitDeckLowContrastFooterMarks(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const targetOpacity = Number.isFinite(options.targetOpacity) ? Math.max(0.25, Math.min(0.9, options.targetOpacity)) : 0.5;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (shape?.source?.detector !== "low-contrast-footer-native-mark" || !shape.box || !shape.style) continue;
      const fill = hexColor(shape.style.fill);
      const currentOpacity = Number(shape.style.opacity ?? 1);
      if (!fill || !Number.isFinite(currentOpacity)) continue;
      if (colorBrightness(fill) < 120 || colorBrightness(fill) > 220 || saturationProxy(fill) > 42) continue;
      const area = Number(shape.box.w || 0) * Number(shape.box.h || 0);
      if (!Number.isFinite(area) || area < 50 || area > 2500) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      const sampledFill = sampledLowContrastFooterMarkFill(shape, image, next.slideSize);
      if (!sampledFill && currentOpacity <= targetOpacity) continue;
      candidates.push({ pageIndex, index, priority, score: sampledFill ? area + 1000 : area, sampledFill });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.style = item.sampledFill ? { ...shape.style, fill: item.sampledFill } : { ...shape.style, opacity: targetOpacity };
    shape.source = { ...(shape.source || {}), finalLowContrastFooterMarkFit: { provider: "worker-final-low-contrast-footer-mark-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalLowContrastFooterMarkFit: { provider: "worker-final-low-contrast-footer-mark-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length, opacity: targetOpacity } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}

function sourceComponentFidelityPrimitiveRuns({ target, source, rendered, slideSize, maximumRuns, currentRuns }) {
  if (!target?.box || !source || !rendered || !slideSize) return { shapes: [], skippedRuns: 0 };
  const scaleX = source.width / slideSize.widthPt; const scaleY = source.height / slideSize.heightPt;
  const left = Math.max(0, Math.floor((target.box.x - 1) * scaleX));
  const top = Math.max(0, Math.floor((target.box.y - 1) * scaleY));
  const right = Math.min(source.width, Math.ceil((target.box.x + target.box.w + 1) * scaleX));
  const bottom = Math.min(source.height, Math.ceil((target.box.y + target.box.h + 1) * scaleY));
  if (right <= left || bottom <= top || (right - left) * (bottom - top) > 180_000) return { shapes: [], skippedRuns: 0 };
  const shapes = [];
  let skippedRuns = 0;
  const remainingRuns = maximumRuns - currentRuns;
  if (remainingRuns < 1) return { shapes, skippedRuns };
  const minimumRunLength = target.role === "container-border" || target.role === "connector-straight" ? 1 : 2;
  for (let y = top; y < bottom; y += 1) {
    let x = left;
    while (x < right) {
      const slideX = (x + 0.5) / scaleX;
      const slideY = (y + 0.5) / scaleY;
      if (!insideComponentPrimitiveTargetGeometry(slideX, slideY, target)) {
        x += 1;
        continue;
      }
      if (!sourceComponentFidelityForeground(source, rendered, x, y) || sourceRenderedDelta(source, rendered, x, y) <= 5) {
        x += 1;
        continue;
      }
      const fill = sourcePixelHex(source, x, y);
      const start = x;
      let score = sourceRenderedDelta(source, rendered, x, y);
      x += 1;
      while (x < right) {
        const nextSlideX = (x + 0.5) / scaleX;
        const nextSlideY = (y + 0.5) / scaleY;
        if (!insideComponentPrimitiveTargetGeometry(nextSlideX, nextSlideY, target)) break;
        const nextDelta = sourceRenderedDelta(source, rendered, x, y);
        if (!sourceComponentFidelityForeground(source, rendered, x, y) || nextDelta <= 5 || sourcePixelHex(source, x, y) !== fill) break;
        score += nextDelta;
        x += 1;
      }
      const length = x - start;
      if (length < minimumRunLength) {
        skippedRuns += 1;
        continue;
      }
      shapes.push({
        start,
        y,
        length,
        fill,
        score
      });
    }
  }
  return { shapes: mergeVerticalComponentPrimitiveRuns(shapes, scaleX, scaleY, target, remainingRuns), skippedRuns };
}

function fitDeckWorstComponentFidelityPrimitives(deck, options = {}) {
  const next = structuredClone(deck);
  const sourceImages = Array.isArray(options.sourceImages) ? options.sourceImages : [];
  const renderedImages = Array.isArray(options.renderedImages) ? options.renderedImages : [];
  const maximumRuns = Number.isSafeInteger(options.maximumRuns) && options.maximumRuns > 0 ? Math.min(options.maximumRuns, COMPONENT_FIDELITY_PRIMITIVE_MAX_RUNS) : 1200;
  const maximumTargets = Number.isSafeInteger(options.maximumTargets) && options.maximumTargets > 0 ? Math.min(options.maximumTargets, 48) : 36;
  const targetKinds = Array.isArray(options.targetKinds) ? options.targetKinds : null;
  const targets = collectWorstComponentPrimitiveTargets(next, options.visualQuality, maximumTargets, targetKinds);
  let addedShapes = 0; let skippedRuns = 0; let candidateComponents = 0;
  const loaded = new Map();
  function pageImages(pageIndex) {
    if (loaded.has(pageIndex)) return loaded.get(pageIndex);
    const files = { sourceFile: sourceImages[pageIndex], renderedFile: renderedImages[pageIndex] };
    if (!files.sourceFile || !files.renderedFile) return null;
    const images = { source: readPng(files.sourceFile), rendered: readPng(files.renderedFile) };
    loaded.set(pageIndex, images);
    return images;
  }
  for (const target of targets) {
    if (addedShapes >= maximumRuns) break;
    const page = next.pages[target.pageIndex];
    const images = pageImages(target.pageIndex);
    if (!page || !images) continue;
    page.shapes = Array.isArray(page.shapes) ? page.shapes : [];
    const runs = sourceComponentFidelityPrimitiveRuns({ target, source: images.source, rendered: images.rendered, slideSize: next.slideSize, maximumRuns, currentRuns: addedShapes });
    skippedRuns += runs.skippedRuns;
    if (runs.shapes.length < 1) continue;
    candidateComponents += 1;
    for (const run of runs.shapes) {
      page.shapes.push({
        id: `component-fidelity-native-run-${target.pageIndex + 1}-${addedShapes + 1}`,
        type: "rect",
        box: run.box,
        style: run.style,
        source: {
          detector: "component-fidelity-native-primitive",
          componentQualityIgnore: true,
          sourceComponentId: run.sourceComponentId,
          sourceComponentKind: run.sourceComponentKind
        }
      });
      addedShapes += 1;
    }
  }
  if (addedShapes > 0) {
    next.meta = { ...(next.meta || {}), finalWorstComponentFidelityPrimitiveFit: { provider: "worker-final-worst-component-fidelity-primitive-fit-v1", addedShapes, candidateComponents, candidateTargets: targets.length, skippedRuns: Math.min(skippedRuns, 100_000), skippedRunsTruncated: skippedRuns > 100_000 } };
  }
  return { deck: next, addedShapes, candidateComponents, candidateTargets: targets.length, skippedRuns };
}

function fitDeckLowContrastFooterPrimitives(deck, options = {}) {
  const next = structuredClone(deck || {});
  const root = typeof options.root === "string" ? options.root : "";
  const sourceImages = Array.isArray(options.sourceImages) ? options.sourceImages : [];
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  if (!path.isAbsolute(root) || !Array.isArray(next.pages) || !isSlideSize(next.slideSize)) return { deck: next, addedShapes: 0, candidatePages: 0, skipped: 0 };
  let candidatePages = 0;
  let skipped = 0;
  for (let pageIndex = 0; pageIndex < next.pages.length; pageIndex += 1) {
    const page = next.pages[pageIndex];
    const shapes = Array.isArray(page?.shapes) ? page.shapes : [];
    const footerShapes = shapes.filter((shape) => {
      if (!shape?.box || !shape?.source) return false;
      const detector = String(shape.source.detector || "");
      if (detector !== "low-contrast-footer-native-mark" && detector !== "solid-region-native-background") return false;
      if (Number(shape.box.y) < next.slideSize.heightPt * 0.88) return false;
      return priorityIds.size === 0 || priorityIds.has(`${pageIndex}:${shape.id}`) || detector === "solid-region-native-background";
    });
    if (footerShapes.length < 1) continue;
    let source;
    try {
      source = readPng(sourceImages[pageIndex]);
    } catch {
      skipped += 1;
      continue;
    }
    const minY = Math.max(0, Math.min(...footerShapes.map((shape) => Number(shape.box.y))) - 8);
    const footerBox = { x: 0, y: minY, w: next.slideSize.widthPt, h: next.slideSize.heightPt - minY };
    const scaleY = source.height / next.slideSize.heightPt;
    const px = {
      x: 0,
      y: Math.max(0, Math.floor(footerBox.y * scaleY)),
      w: source.width,
      h: Math.min(source.height, Math.ceil((footerBox.y + footerBox.h) * scaleY)) - Math.max(0, Math.floor(footerBox.y * scaleY))
    };
    if (px.h < 8 || px.w * px.h > 1_500_000) {
      skipped += 1;
      continue;
    }
    const assetPath = `assets/final-low-contrast-footer-primitives-page-${String(pageIndex + 1).padStart(3, "0")}.png`;
    const assetFile = path.join(root, ...assetPath.split("/"));
    fs.mkdirSync(path.dirname(assetFile), { recursive: true });
    writePng(assetFile, cropRaster(source, px));
    page.images = [...(Array.isArray(page.images) ? page.images : []), {
      id: `final-low-contrast-footer-primitives-source-${pageIndex + 1}`,
      type: "fidelity-crop",
      assetPath,
      box: footerBox,
      style: { opacity: 0, assetPath },
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "foreground-graphic-crop",
        residualCrop: true,
        lowContrastFooterPrimitiveSource: true
      }
    }];
    candidatePages += 1;
  }
  if (candidatePages < 1) return { deck: next, addedShapes: 0, candidatePages, skipped };
  const vectorized = addNativeResidualPrimitives(next, root);
  let addedShapes = 0;
  for (const page of vectorized.deck.pages || []) {
    addedShapes += (Array.isArray(page.shapes) ? page.shapes : []).filter((shape) => String(shape?.source?.detector || "") === "native-residual-primitive-rect").length;
    page.images = (Array.isArray(page.images) ? page.images : []).filter((image) => image?.source?.lowContrastFooterPrimitiveSource !== true);
  }
  if (addedShapes > 0) {
    vectorized.deck.meta = {
      ...(vectorized.deck.meta || {}),
      finalLowContrastFooterPrimitives: {
        provider: "worker-final-low-contrast-footer-primitives-v1",
        addedShapes,
        candidatePages,
        skipped: skipped + vectorized.skipped
      }
    };
  }
  return { deck: vectorized.deck, addedShapes, candidatePages, skipped: skipped + vectorized.skipped };
}

module.exports = { fitVerticalLineToSource, fitHorizontalLineToSource, fitDeckSourceVerticalLines, fitDeckLowContrastFooterMarks, sourceComponentFidelityPrimitiveRuns, fitDeckWorstComponentFidelityPrimitives, fitDeckLowContrastFooterPrimitives };
