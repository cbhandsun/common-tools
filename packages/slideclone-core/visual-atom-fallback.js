"use strict";
const {cropPng} = require("./png");
const {ptToPxBox, pixel, centerOfBox, luma, rgbToHsl, saturation, averageColor, rgbToHex, roundRatio, unionPtBox, normalizeHex, parseHex} = require("./raster-native-detection");
const {expandPxBox} = require("./residual-component-analysis");
const {boxOverlapArea} = require("./prd-generation-shapes");
const {fallbackLineEndpoints} = require("./visual-atom-topology");
const {localPxBoxToSlidePt, looksLikeScreenshotOrDocumentLayer} = require("./structured-residual-splitting");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function isProtectedFidelityDiagramDetector(detector) {
  return /wms-chain-underlay-crop|collaboration-flow-underlay-crop/.test(String(detector || ""));
}

function inferFallbackVisualAtoms(image = {}, sourceImage = null, slideSize = DEFAULT_SLIDE, layer = {}, understanding = {}) {
  if (!shouldUseFallbackVisualAtomSegmentation(image, layer, understanding, sourceImage, slideSize)) return [];
  const pxBox = ptToPxBox(image.box, sourceImage, slideSize, 0);
  if (pxBox.w < 48 || pxBox.h < 48) return [];
  const local = cropPng(sourceImage, pxBox);
  const components = fallbackVisualAtomComponents(local)
    .map((component) => fallbackVisualAtomFromComponent(component, image, local, pxBox))
    .filter(Boolean)
    .filter((atom) => !isLikelyTextSpeckAtom(atom))
    .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
  const merged = mergeFallbackLineAtoms(components);
  return merged.slice(0, 80);
}

function shouldUseFallbackVisualAtomSegmentation(image = {}, layer = {}, understanding = {}, sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !image?.box) return false;
  const hasNativeOverlayStrategy = hasPreserveCropWithNativeOverlaysStrategy(image);
  if (looksLikeScreenshotOrDocumentLayer(image, layer, understanding) && !hasNativeOverlayStrategy) return false;
  if (isProtectedFidelityDiagramDetector(image?.source?.detector)) return false;
  const box = image.box;
  const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, slideSize.widthPt * slideSize.heightPt);
  const maxAreaRatio = hasNativeOverlayStrategy ? 0.92 : 0.72;
  if (areaRatio < 0.018 || areaRatio > maxAreaRatio) return false;
  const detector = String(image?.source?.detector || "").toLowerCase();
  const action = String(layer.recommendedAction || image?.source?.recommendedAction || "").toLowerCase();
  const layerType = String(layer.layerType || image?.source?.layerType || "").toLowerCase();
  if (!hasNativeOverlayStrategy && /icon|brand|logo|screenshot|document|prototype|webpage/.test(detector)) return false;
  if (hasNativeOverlayStrategy) return true;
  if (/foreground|underlay|visual-cluster|mixed-diagram|sparse-diagram|saturated-diagram|content/.test(detector)) return true;
  if (layerType === "diagram-zone" || layerType === "chart-zone" || layerType === "table-zone") {
    return /native|reconstruction|split/.test(action) || Number(understanding.confidence || 0) >= 0.62;
  }
  return false;
}

function fallbackVisualAtomComponents(local) {
  const step = 2;
  const gridW = Math.ceil(local.width / step);
  const gridH = Math.ceil(local.height / step);
  const visited = new Uint8Array(gridW * gridH);
  const components = [];
  for (let gy = 0; gy < gridH; gy += 1) {
    for (let gx = 0; gx < gridW; gx += 1) {
      const idx = gy * gridW + gx;
      if (visited[idx]) continue;
      const x = Math.min(local.width - 1, gx * step);
      const y = Math.min(local.height - 1, gy * step);
      const family = fallbackAtomColorFamily(pixel(local, x, y));
      if (!family) continue;
      const queue = [[gx, gy]];
      visited[idx] = 1;
      let qi = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let sampledCount = 0;
      const samples = [];
      while (qi < queue.length && sampledCount < 180000) {
        const [cgx, cgy] = queue[qi++];
        const cx = Math.min(local.width - 1, cgx * step);
        const cy = Math.min(local.height - 1, cgy * step);
        sampledCount += 1;
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
        if (samples.length < 96) samples.push(pixel(local, cx, cy));
        for (const [ngx, ngy] of [[cgx + 1, cgy], [cgx - 1, cgy], [cgx, cgy + 1], [cgx, cgy - 1]]) {
          if (ngx < 0 || ngy < 0 || ngx >= gridW || ngy >= gridH) continue;
          const nextIdx = ngy * gridW + ngx;
          if (visited[nextIdx]) continue;
          const nx = Math.min(local.width - 1, ngx * step);
          const ny = Math.min(local.height - 1, ngy * step);
          if (fallbackAtomColorFamily(pixel(local, nx, ny)) !== family) continue;
          visited[nextIdx] = 1;
          queue.push([ngx, ngy]);
        }
      }
      const box = expandPxBox({ x: minX, y: minY, w: maxX - minX + step, h: maxY - minY + step }, local, 1);
      const density = sampledCount / Math.max(1, Math.ceil(box.w / step) * Math.ceil(box.h / step));
      if (!isUsefulFallbackVisualAtomComponent(box, local, density)) continue;
      components.push({ box, samples, density, family, sampledCount });
    }
  }
  return dedupeFallbackVisualAtomComponents(components);
}

function fallbackAtomColorFamily(color) {
  if (color.a < 64) return null;
  const lightness = luma(color);
  const sat = saturation(color);
  if (lightness > 244 && sat < 0.14) return null;
  if (lightness < 72 && sat < 0.18) return "dark";
  if (sat < 0.10 && lightness > 214) return null;
  if (sat < 0.12) return "neutral";
  const hsl = rgbToHsl(color);
  return `h${Math.floor(hsl.h / 24)}-l${Math.floor(hsl.l * 5)}`;
}

function isUsefulFallbackVisualAtomComponent(box, local, density) {
  const area = box.w * box.h;
  const localArea = Math.max(1, local.width * local.height);
  const areaRatio = area / localArea;
  const aspect = box.w / Math.max(1, box.h);
  const lineLike = aspect >= 5.2 || aspect <= 0.19;
  if (areaRatio < 0.00045 || areaRatio > 0.46) return false;
  if (lineLike) return Math.max(box.w, box.h) >= 18 && Math.min(box.w, box.h) >= 2;
  if (box.w < 7 || box.h < 7) return false;
  if (box.w < 18 && box.h < 18) return false;
  if (aspect > 28 || aspect < 1 / 28) return false;
  if (density < 0.18 && !(aspect > 4 || aspect < 0.25)) return false;
  return true;
}

function dedupeFallbackVisualAtomComponents(components = []) {
  const sorted = components.sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h));
  const out = [];
  for (const component of sorted) {
    if (out.some((existing) => {
      const overlap = boxOverlapArea(existing.box, component.box) / Math.max(1, component.box.w * component.box.h);
      if (overlap <= 0.72) return false;
      return !isNestedFallbackVisualAtomComponent(existing, component);
    })) continue;
    out.push(component);
  }
  return out.sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
}

function isNestedFallbackVisualAtomComponent(existing = {}, component = {}) {
  const outer = existing.box || {};
  const inner = component.box || {};
  const outerArea = Math.max(1, Number(outer.w || 0) * Number(outer.h || 0));
  const innerArea = Math.max(1, Number(inner.w || 0) * Number(inner.h || 0));
  if (outerArea < innerArea * 2.2) return false;
  const center = centerOfBox(inner);
  return center.x >= Number(outer.x || 0)
    && center.x <= Number(outer.x || 0) + Number(outer.w || 0)
    && center.y >= Number(outer.y || 0)
    && center.y <= Number(outer.y || 0) + Number(outer.h || 0);
}

function fallbackVisualAtomFromComponent(component, image, local, pxBox) {
  const box = localPxBoxToSlidePt(component.box, local, image.box);
  if (!box || box.w <= 0 || box.h <= 0) return null;
  const aspect = box.w / Math.max(1, box.h);
  const color = rgbToHex(averageColor(component.samples));
  const lineLike = aspect >= 5.2 || aspect <= 0.19;
  const id = `fallback-${Math.round(component.box.x)}-${Math.round(component.box.y)}-${Math.round(component.box.w)}-${Math.round(component.box.h)}`;
  if (lineLike && (box.w <= 12 || box.h <= 12)) {
    return {
      id,
      kind: "connector-line-candidate",
      shapeHint: aspect >= 1 ? "line-horizontal" : "line-vertical",
      box,
      color,
      nativeCandidate: true,
      residualCandidate: false,
      density: roundRatio(component.density),
      lineEndpoints: fallbackLineEndpoints(box, aspect >= 1)
    };
  }
  const shapeHint = inferFallbackShapeHint(component, box);
  return {
    id,
    kind: shapeHint === "ellipse" ? "native-ellipse-candidate" : "native-rect-candidate",
    shapeHint,
    box,
    color,
    nativeCandidate: true,
    residualCandidate: false,
    density: roundRatio(component.density),
    pxBox: {
      x: pxBox.x + component.box.x,
      y: pxBox.y + component.box.y,
      w: component.box.w,
      h: component.box.h
    }
  };
}

function inferFallbackShapeHint(component, box) {
  const aspect = box.w / Math.max(1, box.h);
  if (aspect > 2.4 && box.h <= 42) return "pill";
  if (aspect >= 0.72 && aspect <= 1.38 && component.density < 0.82) return "ellipse";
  return "rect";
}

function isLikelyTextSpeckAtom(atom) {
  const box = atom?.box || {};
  const area = Number(box.w || 0) * Number(box.h || 0);
  if (atom.kind === "connector-line-candidate") return false;
  if (area < 55) return true;
  if (Number(box.w || 0) < 9 || Number(box.h || 0) < 9) return true;
  return false;
}

function mergeFallbackLineAtoms(atoms = []) {
  const lines = atoms.filter((atom) => atom.kind === "connector-line-candidate");
  const others = atoms.filter((atom) => atom.kind !== "connector-line-candidate");
  const merged = [];
  for (const line of lines) {
    const horizontal = line.shapeHint === "line-horizontal";
    const match = merged.find((item) => {
      if (item.shapeHint !== line.shapeHint) return false;
      const a = item.box;
      const b = line.box;
      if (horizontal) {
        return Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) <= 3
          && !(a.x + a.w + 8 < b.x || b.x + b.w + 8 < a.x);
      }
      return Math.abs((a.x + a.w / 2) - (b.x + b.w / 2)) <= 3
        && !(a.y + a.h + 8 < b.y || b.y + b.h + 8 < a.y);
    });
    if (!match) {
      merged.push({ ...line });
      continue;
    }
    match.box = unionPtBox(match.box, line.box);
    match.lineEndpoints = fallbackLineEndpoints(match.box, horizontal);
  }
  return promoteFallbackLineArrowheads([...others, ...merged])
    .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
}

function promoteFallbackLineArrowheads(atoms = []) {
  const lines = atoms.filter((atom) => atom.kind === "connector-line-candidate" && atom?.box);
  const heads = atoms.filter((atom) => atom.kind !== "connector-line-candidate" && atom?.box);
  const consumed = new Set();
  const promoted = lines.map((line) => {
    const match = heads
      .map((head, index) => ({ head, index, score: fallbackArrowHeadScore(line, head) }))
      .filter((item) => item.score > 0 && !consumed.has(item.index))
      .sort((a, b) => b.score - a.score)[0];
    if (!match) return line;
    consumed.add(match.index);
    return fallbackArrowFromLineAndHead(line, match.head);
  });
  const remainingHeads = heads.filter((_, index) => !consumed.has(index));
  return [...remainingHeads, ...promoted];
}

function fallbackArrowHeadScore(line = {}, head = {}) {
  const lineBox = line.box || {};
  const headBox = head.box || {};
  const headW = Number(headBox.w || 0);
  const headH = Number(headBox.h || 0);
  const headArea = headW * headH;
  if (headArea < 32 || headArea > 900) return 0;
  if (Math.max(headW, headH) > 34 || Math.min(headW, headH) < 4) return 0;
  if (!fallbackAtomColorsClose(line.color, head.color)) return 0;
  const horizontal = line.shapeHint === "line-horizontal";
  const lineCenter = centerOfBox(lineBox);
  const headCenter = centerOfBox(headBox);
  if (horizontal) {
    const lineStart = Number(lineBox.x || 0);
    const lineEnd = lineStart + Number(lineBox.w || 0);
    const yGap = Math.abs(lineCenter.y - headCenter.y);
    if (yGap > Math.max(8, headH * 0.65)) return 0;
    const nearRight = Math.abs(headCenter.x - lineEnd) <= Math.max(14, headW * 0.9);
    const nearLeft = Math.abs(headCenter.x - lineStart) <= Math.max(14, headW * 0.9);
    if (!nearRight && !nearLeft) return 0;
    return 100 - yGap - Math.min(Math.abs(headCenter.x - lineEnd), Math.abs(headCenter.x - lineStart));
  }
  const lineStart = Number(lineBox.y || 0);
  const lineEnd = lineStart + Number(lineBox.h || 0);
  const xGap = Math.abs(lineCenter.x - headCenter.x);
  if (xGap > Math.max(8, headW * 0.65)) return 0;
  const nearBottom = Math.abs(headCenter.y - lineEnd) <= Math.max(14, headH * 0.9);
  const nearTop = Math.abs(headCenter.y - lineStart) <= Math.max(14, headH * 0.9);
  if (!nearBottom && !nearTop) return 0;
  return 100 - xGap - Math.min(Math.abs(headCenter.y - lineEnd), Math.abs(headCenter.y - lineStart));
}

function fallbackArrowFromLineAndHead(line = {}, head = {}) {
  const horizontal = line.shapeHint === "line-horizontal";
  const lineBox = line.box || {};
  const headCenter = centerOfBox(head.box || {});
  const endpoints = fallbackLineEndpoints(lineBox, horizontal);
  const forward = horizontal
    ? headCenter.x >= centerOfBox(lineBox).x
    : headCenter.y >= centerOfBox(lineBox).y;
  const from = forward ? endpoints.from : endpoints.to;
  const to = forward ? headCenter : headCenter;
  return {
    ...line,
    kind: "connector-arrow-candidate",
    shapeHint: horizontal ? (forward ? "arrow-right" : "arrow-left") : (forward ? "arrow-down" : "arrow-up"),
    box: unionPtBox(line.box, head.box),
    lineEndpoints: { from, to },
    arrowHeadAtomId: head.id || null,
    density: Math.max(Number(line.density || 0), Number(head.density || 0))
  };
}

function fallbackAtomColorsClose(a, b) {
  const left = parseHex(normalizeHex(a, "#000000"));
  const right = parseHex(normalizeHex(b, "#000000"));
  const distance = Math.abs(left.r - right.r) + Math.abs(left.g - right.g) + Math.abs(left.b - right.b);
  return distance <= 54;
}

function hasPreserveCropWithNativeOverlaysStrategy(image = {}) {
  return image?.source?.componentRenderStrategy?.mode === "preserve-crop-with-native-overlays"
    || image?.source?.layer?.componentRenderStrategy?.mode === "preserve-crop-with-native-overlays";
}

module.exports = { inferFallbackVisualAtoms, fallbackVisualAtomComponents, dedupeFallbackVisualAtomComponents, isNestedFallbackVisualAtomComponent, fallbackAtomColorFamily, isUsefulFallbackVisualAtomComponent, fallbackVisualAtomFromComponent, inferFallbackShapeHint, isLikelyTextSpeckAtom, mergeFallbackLineAtoms, promoteFallbackLineArrowheads, fallbackArrowFromLineAndHead, fallbackArrowHeadScore, fallbackAtomColorsClose, shouldUseFallbackVisualAtomSegmentation, hasPreserveCropWithNativeOverlaysStrategy, isProtectedFidelityDiagramDetector };
