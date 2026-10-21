"use strict";

const path = require("node:path");
const { readPng } = require("./png");
const { pixel, round } = require("./raster-native-detection");
const { fitDashedLineGeometry } = require("./dashed-line-geometry");

const LINE_ART_FOREGROUND_LUMA = 132;
const BLUE_ICON_MIN_BLUE = 145;

function replaceResidualCropsWithNativeComponents({ page, root } = {}) {
  validateInput(page, root);
  if (!Array.isArray(page.images) || page.images.length === 0) return Object.freeze({ matched: false, replaced: 0, addedShapes: 0, skipped: 0 });
  const retainedImages = [];
  const addedShapes = [];
  let replaced = 0;
  let skipped = 0;
  for (const image of page.images) {
    const replacement = buildResidualCropNativeReplacement(image, root, addedShapes.length);
    if (!replacement) {
      retainedImages.push(image);
      if (isEligibleResidualCrop(image)) skipped += 1;
      continue;
    }
    addedShapes.push(...replacement.shapes);
    replaced += 1;
  }
  if (replaced === 0) return Object.freeze({ matched: skipped > 0, replaced: 0, addedShapes: 0, skipped });
  page.images = retainedImages;
  page.shapes = [...(Array.isArray(page.shapes) ? page.shapes : []), ...addedShapes];
  page.source = {
    ...(page.source || {}),
    residualCropNativeReplacement: {
      provider: "residual-crop-native-replacement-v1",
      replaced,
      addedShapes: addedShapes.length,
      skipped
    }
  };
  return Object.freeze({ matched: true, replaced, addedShapes: addedShapes.length, skipped });
}

function buildResidualCropNativeReplacement(image, root, offset = 0) {
  if (!isEligibleResidualCrop(image)) return null;
  const assetFile = resolveAssetPath(root, image.assetPath);
  if (!assetFile) return null;
  const raster = readPng(assetFile);
  if (!boundedRaster(raster)) return null;
  const evidence = analyzeLineArt(raster);
  if (!isSparseLineArt(evidence)) return null;
  const box = foregroundPtBox(image.box, raster, evidence.bounds);
  if (!box) return null;
  if (looksLikeDashedCross(evidence)) {
    const shapes = dashedCrossShapes(image, raster, evidence, offset);
    return shapes.length ? Object.freeze({ kind: "dashed-cross", shapes }) : null;
  }
  if (looksLikeServerStack(evidence)) {
    return Object.freeze({ kind: "server-stack", shapes: serverStackShapes(image, box, offset, evidence.strokeColor) });
  }
  return null;
}

function isEligibleResidualCrop(image = {}) {
  const source = image.source || {};
  if (source.strategy !== "local-fidelity-crop") return false;
  if (source.protectedMinimumUnit === true && source.expressionSubtype === "knowledge-graph-icon") return false;
  const detector = String(source.detector || "");
  return detector === "mixed-diagram-semantic-atom-residual-crop"
    || detector === "visual-atom-erased-residual-crop"
    || detector === "split-erased-residual-crop"
    || detector === "icon-residual-crop";
}

function analyzeLineArt(image) {
  if (!boundedRaster(image)) throw new TypeError("line-art raster exceeds safe bounds");
  let foreground = 0;
  let blue = 0;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  const rows = Array(image.height).fill(0);
  const columns = Array(image.width).fill(0);
  const points = [];
  const strokeColors = new Map();
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const color = pixel(image, x, y);
      const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
      const saturation = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
      const isBlue = color.b >= BLUE_ICON_MIN_BLUE && color.b - Math.max(color.r, color.g) >= 45;
      const isForeground = color.a > 20 && (luma <= LINE_ART_FOREGROUND_LUMA || (saturation >= 58 && luma <= 210));
      if (isBlue) blue += 1;
      if (!isForeground) continue;
      foreground += 1;
      if (color.a >= 160) {
        const key = `${color.r >> 4}:${color.g >> 4}:${color.b >> 4}`;
        const bucket = strokeColors.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        bucket.count += 1; bucket.r += color.r; bucket.g += color.g; bucket.b += color.b;
        strokeColors.set(key, bucket);
      }
      rows[y] += 1;
      columns[x] += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      points.push({ x, y });
    }
  }
  const total = Math.max(1, image.width * image.height);
  const dominant = [...strokeColors.values()].sort((a, b) => b.count - a.count)[0];
  const strokeColor = dominant ? "#" + [dominant.r, dominant.g, dominant.b]
    .map(channel => Math.round(channel / dominant.count).toString(16).padStart(2, "0")).join("").toUpperCase() : null;
  return Object.freeze({
    width: image.width,
    height: image.height,
    foreground,
    strokeColor,
    foregroundRatio: foreground / total,
    blueRatio: blue / total,
    rows,
    columns,
    points,
    bounds: maxX >= minX && maxY >= minY ? Object.freeze({ minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 }) : null
  });
}

function isSparseLineArt(evidence) {
  if (!evidence.bounds) return false;
  if (evidence.foregroundRatio < 0.012 || evidence.foregroundRatio > 0.18) return false;
  if (evidence.blueRatio > 0.08) return false;
  const boundsAreaRatio = evidence.bounds.w * evidence.bounds.h / Math.max(1, evidence.width * evidence.height);
  return boundsAreaRatio >= 0.12 && boundsAreaRatio <= 0.78;
}

function looksLikeServerStack(evidence) {
  const bounds = evidence.bounds;
  if (!bounds) return false;
  const aspect = bounds.w / Math.max(1, bounds.h);
  if (aspect < 0.55 || aspect > 1.45) return false;
  const strongRows = evidence.rows.filter((count) => count >= Math.max(10, bounds.w * 0.38)).length;
  const rightStart = Math.floor(bounds.minX + bounds.w * 0.78);
  const rightColumns = evidence.columns.slice(rightStart, bounds.maxX + 1).filter((count) => count >= Math.max(12, bounds.h * 0.28)).length;
  const leftColumns = evidence.columns.slice(bounds.minX, Math.floor(bounds.minX + bounds.w * 0.2)).filter((count) => count >= Math.max(12, bounds.h * 0.28)).length;
  return strongRows >= 10 && rightColumns >= 2 && leftColumns <= rightColumns + 2;
}

function looksLikeDashedCross(evidence) {
  const bounds = evidence.bounds;
  if (!bounds || bounds.w < 30 || bounds.h < 24) return false;
  if (evidence.foregroundRatio > 0.075) return false;
  const positive = bestDiagonalLineVote(evidence, 1);
  const negative = bestDiagonalLineVote(evidence, -1);
  const required = Math.max(24, evidence.foreground * 0.24);
  return positive.count >= required
    && negative.count >= required
    && positive.count + negative.count >= evidence.foreground * 0.58;
}

function bestDiagonalLineVote(evidence, sign) {
  const bounds = evidence.bounds;
  if (!bounds) return { count: 0, slope: 0, intercept: 0 };
  let best = { count: 0, slope: 0, intercept: 0 };
  for (let absSlope = 0.35; absSlope <= 2.2; absSlope += 0.05) {
    const slope = absSlope * sign;
    const buckets = new Map();
    for (const point of evidence.points) {
      const nx = (point.x - bounds.minX) / Math.max(1, bounds.w - 1);
      const ny = (point.y - bounds.minY) / Math.max(1, bounds.h - 1);
      const intercept = Math.round((ny - slope * nx) / 0.04) * 0.04;
      buckets.set(intercept, (buckets.get(intercept) || 0) + 1);
    }
    for (const [intercept, count] of buckets) {
      if (count > best.count) best = { count, slope, intercept };
    }
  }
  return best;
}

function serverStackShapes(image, box, offset, strokeColor) {
  const color = strokeColor || "#202124";
  const id = nativeId(image, offset, "server-stack");
  const source = nativeSource(image, "server-stack");
  const strokeWidthPt = Math.max(1.5, Math.min(2.6, Math.min(box.w, box.h) * 0.035));
  const shapes = [
    nativeShape(`${id}-body`, "roundRect", box, { fill: "none", stroke: color, strokeWidthPt, radiusRatio: 0.08, lineCap: "round", lineJoin: "round" }, source("body"))
  ];
  for (const [index, yRatio] of [0.34, 0.65].entries()) {
    shapes.push(nativeShape(`${id}-divider-${index + 1}`, "line", {
      x: round(box.x + box.w * 0.07),
      y: round(box.y + box.h * yRatio),
      w: round(box.w * 0.86),
      h: 0
    }, { stroke: color, strokeWidthPt: Math.max(1.2, strokeWidthPt * 0.82), connectorType: "straight", lineCap: "round" }, source("divider")));
  }
  for (const [index, yRatio] of [0.47, 0.77].entries()) {
    const dot = Math.max(4, Math.min(7, box.w * 0.075));
    shapes.push(nativeShape(`${id}-dot-${index + 1}`, "ellipse", {
      x: round(box.x + box.w * 0.73),
      y: round(box.y + box.h * yRatio - dot / 2),
      w: round(dot),
      h: round(dot)
    }, { fill: color, stroke: color, strokeWidthPt: 0 }, source("dot")));
  }
  return shapes;
}

function dashedCrossShapes(image, raster, evidence, offset) {
  const color = evidence.strokeColor || "#202124";
  const id = nativeId(image, offset, "dashed-cross");
  const source = nativeSource(image, "dashed-cross");
  const scaleX = image.box.w / raster.width, scaleY = image.box.h / raster.height;
  const lines = [-1, 1].map(sign => fitDashedLineGeometry(evidence, bestDiagonalLineVote(evidence, sign)));
  if (lines.some(line => !line)) return [];
  return lines.map((line, index) => nativeShape(`${id}-${index === 0 ? "a" : "b"}`, "line", {
    x: image.box.x + line.x1 * scaleX, y: image.box.y + line.y1 * scaleY,
    w: (line.x2 - line.x1) * scaleX, h: (line.y2 - line.y1) * scaleY
  }, { stroke: color, strokeWidthPt: round(line.thickness * Math.sqrt(scaleX * scaleY)),
    connectorType: "straight", dash: "dash", lineCap: "round" }, source(index === 0 ? "diagonal-a" : "diagonal-b")));
}

function foregroundPtBox(imageBox, raster, bounds) {
  if (!validBox(imageBox) || !bounds) return null;
  return {
    x: round(imageBox.x + imageBox.w * bounds.minX / raster.width),
    y: round(imageBox.y + imageBox.h * bounds.minY / raster.height),
    w: round(imageBox.w * bounds.w / raster.width),
    h: round(imageBox.h * bounds.h / raster.height)
  };
}

function nativeShape(id, type, box, style, source) {
  return {
    id,
    type,
    box: {
      x: round(Number(box.x || 0)),
      y: round(Number(box.y || 0)),
      w: round(Number(box.w || 0)),
      h: round(Number(box.h || 0))
    },
    style,
    source
  };
}

function nativeSource(image, kind) {
  return (part) => ({
    editable: true,
    nativeRebuild: true,
    detector: `residual-crop-native-${kind}`,
    nativeComponentRole: "residual-crop-replacement",
    residualCropReplacement: true,
    residualCropReplacementKind: kind,
    residualCropReplacementPart: part,
    sourceImageId: image.id || null,
    sourceDetector: image.source?.detector || null,
    sourceAssetPath: image.assetPath || null
  });
}

function boundedRaster(image) {
  return image && Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height)
    && image.width > 0 && image.height > 0 && image.width <= 2048 && image.height <= 2048
    && image.width * image.height <= 262144 && image.rgba instanceof Uint8Array
    && image.rgba.length === image.width * image.height * 4;
}

function nativeId(image, offset, kind) {
  const raw = String(image?.id || `residual-${offset}`).replace(/[^a-z0-9_-]+/giu, "-").slice(0, 96);
  return `${raw}-native-${kind}`;
}

function resolveAssetPath(root, assetPath) {
  if (typeof assetPath !== "string" || !assetPath || path.isAbsolute(assetPath) || assetPath.includes("..")) return null;
  const normalizedRoot = path.resolve(root);
  const file = path.resolve(normalizedRoot, ...assetPath.split("/"));
  return file.startsWith(normalizedRoot + path.sep) ? file : null;
}

function validateInput(page, root) {
  if (!page || typeof page !== "object" || Array.isArray(page)) throw new TypeError("residual crop replacement page is invalid");
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("residual crop replacement root is invalid");
}

function validBox(box) {
  return !!box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
}

module.exports = {
  buildResidualCropNativeReplacement,
  replaceResidualCropsWithNativeComponents,
  _private: {
    analyzeLineArt,
    looksLikeDashedCross,
    looksLikeServerStack,
    isEligibleResidualCrop
  }
};
