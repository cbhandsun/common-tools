"use strict";

function measureBranchCurves(image, options = {}) {
  if (!validImage(image)) return emptyResult("invalid-image");
  const slide = normalizeSlide(options.slideSize);
  if (!slide) return emptyResult("invalid-slide-size");
  const starts = normalizePoints(options.startPoints, slide);
  const ends = normalizePoints(options.endPoints, slide);
  if (starts.length === 0 || starts.length !== ends.length || starts.length > 12) {
    return emptyResult("invalid-endpoints");
  }

  const sampleCount = clampInteger(options.sampleCount, 5, 24, 11);
  const searchRadiusPt = clampNumber(options.searchRadiusPt, 8, slide.heightPt / 3, 58);
  const minimumCoverage = clampNumber(options.minimumCoverage, 0.45, 1, 0.72);
  const seedCurves = normalizeSeedCurves(options.seedCurves, starts.length, slide);
  const curves = starts.map((start, index) => measureCurve(image, slide, start, ends[index], {
    sampleCount,
    searchRadiusPt,
    bluePredicate: typeof options.bluePredicate === "function" ? options.bluePredicate : isBlueRoutePixel,
    seedPoints: seedCurves[index]
  }));
  const accepted = curves.filter((curve) => curve.coverage >= minimumCoverage && curve.points.length >= 5);
  if (accepted.length !== curves.length) {
    return { ...emptyResult("incomplete-route-evidence"), curves, measuredRoutes: accepted.length };
  }
  const confidence = round4(curves.reduce((sum, curve) => sum + curve.confidence, 0) / curves.length);
  return {
    ok: true,
    reason: "measured-blue-route-centerlines",
    confidence,
    measuredRoutes: curves.length,
    curves
  };
}

function measureBranchCurvesFromAnchors(image, options = {}) {
  if (!validImage(image)) return emptyResult("invalid-image");
  const slide = normalizeSlide(options.slideSize);
  const sourceBox = normalizeBox(options.sourceBox, slide);
  const targetBoxes = Array.isArray(options.targetBoxes)
    ? options.targetBoxes.map((box) => normalizeBox(box, slide)).filter(Boolean)
    : [];
  if (!slide || !sourceBox || targetBoxes.length === 0 || targetBoxes.length > 12) {
    return emptyResult("invalid-anchor-boxes");
  }
  const direction = inferBranchDirection(sourceBox, targetBoxes);
  if (!direction) return emptyResult("ambiguous-anchor-layout");
  const sourceCenter = boxCenter(sourceBox);
  // Sample outside containers, but render slightly inside them so fills hide connector seams.
  const startSearchRadiusPt = clampNumber(options.startSearchRadiusPt, 8, slide.heightPt / 3, 48);
  const endSearchRadiusPt = clampNumber(options.endSearchRadiusPt, 8, slide.heightPt / 3, 34);
  const routeColor = typeof options.bluePredicate === "function"
    ? null
    : inferRouteColor(image, slide, sourceBox, targetBoxes, direction, options);
  const routeColorMode = routeColor
    ? isBlueRouteColor(routeColor) ? "auto-blue-family" : "auto-corridor-cluster"
    : "blue-fallback";
  const bluePredicate = typeof options.bluePredicate === "function"
    ? options.bluePredicate
    : routeColor
      ? routeColorMode === "auto-blue-family"
        ? isBlueRoutePixel
        : createColorPredicate(routeColor, options.routeColorTolerance)
      : isBlueRoutePixel;
  const starts = [];
  const ends = [];
  const sampledStarts = [];
  const sampledEnds = [];
  for (const targetBox of targetBoxes) {
    const targetCenter = boxCenter(targetBox);
    const geometry = branchAnchorGeometry(sourceBox, targetBox, direction);
    const expectedStartCross = direction.axis === "x"
      ? sourceCenter.y + (targetCenter.y - sourceCenter.y) * 0.36
      : sourceCenter.x + (targetCenter.x - sourceCenter.x) * 0.36;
    const targetCross = direction.axis === "x" ? targetCenter.y : targetCenter.x;
    const measuredStart = findRouteCenterAtAxis(
      image, slide, direction.axis, geometry.sourceSampleAxis, expectedStartCross,
      startSearchRadiusPt, bluePredicate
    );
    const measuredEnd = findRouteCenterAtAxis(
      image, slide, direction.axis, geometry.targetSampleAxis, targetCross,
      endSearchRadiusPt, bluePredicate
    );
    if (!measuredStart || !measuredEnd) return emptyResult("anchor-intersection-evidence-missing");
    starts.push(axisPoint(direction.axis, geometry.sourceAnchorAxis, measuredStart.cross));
    ends.push(axisPoint(direction.axis, geometry.targetAnchorAxis, measuredEnd.cross));
    sampledStarts.push(axisPoint(direction.axis, geometry.sourceSampleAxis, measuredStart.cross));
    sampledEnds.push(axisPoint(direction.axis, geometry.targetSampleAxis, measuredEnd.cross));
  }
  const measured = measureBranchCurves(image, {
    ...options,
    slideSize: slide,
    startPoints: starts,
    endPoints: ends,
    bluePredicate
  });
  return measured.ok
    ? {
      ...measured,
      reason: "measured-anchor-intersections-and-centerlines",
      inferredStartPoints: starts,
      inferredEndPoints: ends,
      sampledStartIntersections: sampledStarts,
      sampledEndIntersections: sampledEnds,
      direction: direction.id,
      routeColor: routeColor ? routeColor.hex : null,
      routeColorConfidence: routeColor ? routeColor.confidence : null,
      routeColorMode
    }
    : measured;
}

function measureCurve(image, slide, start, end, options) {
  const points = [start];
  const axis = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? "x" : "y";
  let measured = 0;
  let totalOffset = 0;
  for (let index = 1; index <= options.sampleCount; index += 1) {
    const t = index / (options.sampleCount + 1);
    const axisValue = axis === "x"
      ? start.x + (end.x - start.x) * t
      : start.y + (end.y - start.y) * t;
    const linearCross = axis === "x"
      ? start.y + (end.y - start.y) * smoothStep(t)
      : start.x + (end.x - start.x) * smoothStep(t);
    // In crossed networks, the straight start/end interpolation can jump to a
    // neighbouring connector. A native seed curve narrows the readback corridor.
    const expectedCross = seedCrossAtAxis(options.seedPoints, axis, axisValue, linearCross);
    const candidate = findRouteCenterAtAxis(
      image, slide, axis, axisValue, expectedCross, options.searchRadiusPt, options.bluePredicate
    );
    if (!candidate) continue;
    points.push(axisPoint(axis, axisValue, candidate.cross));
    measured += 1;
    totalOffset += Math.abs(candidate.cross - expectedCross);
  }
  points.push(end);
  const coverage = measured / options.sampleCount;
  const meanOffset = measured > 0 ? totalOffset / measured : options.searchRadiusPt;
  const confidence = clampNumber(coverage * (1 - meanOffset / Math.max(1, options.searchRadiusPt * 1.8)), 0, 1, 0);
  return {
    start,
    end,
    points: smoothMeasuredPoints(points),
    measuredSamples: measured,
    requestedSamples: options.sampleCount,
    coverage: round4(coverage),
    confidence: round4(confidence),
    meanOffsetPt: round2(meanOffset)
  };
}

function normalizeSeedCurves(value, expectedCount, slide) {
  if (!Array.isArray(value) || value.length !== expectedCount) return Array.from({ length: expectedCount }, () => null);
  return value.map((curve) => {
    const points = normalizePoints(curve, slide);
    return points.length >= 2 ? points : null;
  });
}

function seedCrossAtAxis(points, axis, axisValue, fallback) {
  if (!Array.isArray(points) || points.length < 2) return fallback;
  const candidates = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    const a = axis === "x" ? left.x : left.y;
    const b = axis === "x" ? right.x : right.y;
    if ((axisValue < Math.min(a, b)) || (axisValue > Math.max(a, b))) continue;
    if (Math.abs(b - a) < 0.001) continue;
    const t = (axisValue - a) / (b - a);
    candidates.push(axis === "x"
      ? left.y + (right.y - left.y) * t
      : left.x + (right.x - left.x) * t);
  }
  if (candidates.length === 0) return fallback;
  return candidates.sort((a, b) => Math.abs(a - fallback) - Math.abs(b - fallback))[0];
}

function findBlueCenterAtX(image, slide, xPt, expectedYPt, radiusPt, predicate) {
  const centerX = Math.round(xPt / slide.widthPt * image.width);
  const yMin = Math.max(0, Math.floor((expectedYPt - radiusPt) / slide.heightPt * image.height));
  const yMax = Math.min(image.height - 1, Math.ceil((expectedYPt + radiusPt) / slide.heightPt * image.height));
  const halfWindow = Math.max(1, Math.round(image.width / 900));
  const rowScores = [];
  for (let y = yMin; y <= yMax; y += 1) {
    let score = 0;
    for (let x = centerX - halfWindow; x <= centerX + halfWindow; x += 1) {
      if (x < 0 || x >= image.width) continue;
      const offset = (y * image.width + x) * 4;
      if (predicate(image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2], image.rgba[offset + 3])) score += 1;
    }
    rowScores.push(score);
  }
  const threshold = Math.max(1, Math.ceil((halfWindow * 2 + 1) * 0.4));
  const runs = contiguousRuns(rowScores, threshold, yMin)
    .filter((run) => run.length >= Math.max(2, Math.round(image.height / 540 * 3)));
  if (runs.length === 0) return null;
  const expectedPx = expectedYPt / slide.heightPt * image.height;
  const best = runs
    .map((run) => ({ ...run, distance: Math.abs(run.center - expectedPx) }))
    .sort((a, b) => a.distance - b.distance || b.score - a.score)[0];
  return { y: best.center / image.height * slide.heightPt, score: best.score };
}

function findBlueCenterAtY(image, slide, yPt, expectedXPt, radiusPt, predicate) {
  const centerY = Math.round(yPt / slide.heightPt * image.height);
  const xMin = Math.max(0, Math.floor((expectedXPt - radiusPt) / slide.widthPt * image.width));
  const xMax = Math.min(image.width - 1, Math.ceil((expectedXPt + radiusPt) / slide.widthPt * image.width));
  const halfWindow = Math.max(1, Math.round(image.height / 540));
  const columnScores = [];
  for (let x = xMin; x <= xMax; x += 1) {
    let score = 0;
    for (let y = centerY - halfWindow; y <= centerY + halfWindow; y += 1) {
      if (y < 0 || y >= image.height) continue;
      const offset = (y * image.width + x) * 4;
      if (predicate(image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2], image.rgba[offset + 3])) score += 1;
    }
    columnScores.push(score);
  }
  const threshold = Math.max(1, Math.ceil((halfWindow * 2 + 1) * 0.4));
  const runs = contiguousRuns(columnScores, threshold, xMin)
    .filter((run) => run.length >= Math.max(2, Math.round(image.width / 960 * 3)));
  if (runs.length === 0) return null;
  const expectedPx = expectedXPt / slide.widthPt * image.width;
  const best = runs
    .map((run) => ({ ...run, distance: Math.abs(run.center - expectedPx) }))
    .sort((a, b) => a.distance - b.distance || b.score - a.score)[0];
  return { x: best.center / image.width * slide.widthPt, score: best.score };
}

function findRouteCenterAtAxis(image, slide, axis, axisValue, expectedCross, radiusPt, predicate) {
  if (axis === "x") {
    const result = findBlueCenterAtX(image, slide, axisValue, expectedCross, radiusPt, predicate);
    return result ? { cross: result.y, score: result.score } : null;
  }
  const result = findBlueCenterAtY(image, slide, axisValue, expectedCross, radiusPt, predicate);
  return result ? { cross: result.x, score: result.score } : null;
}

function inferBranchDirection(sourceBox, targetBoxes) {
  if (targetBoxes.every((box) => box.x >= sourceBox.x + sourceBox.w)) return { id: "right", axis: "x", sign: 1 };
  if (targetBoxes.every((box) => box.x + box.w <= sourceBox.x)) return { id: "left", axis: "x", sign: -1 };
  if (targetBoxes.every((box) => box.y >= sourceBox.y + sourceBox.h)) return { id: "down", axis: "y", sign: 1 };
  if (targetBoxes.every((box) => box.y + box.h <= sourceBox.y)) return { id: "up", axis: "y", sign: -1 };
  return null;
}

function branchAnchorGeometry(sourceBox, targetBox, direction) {
  const sourceSize = direction.axis === "x" ? sourceBox.w : sourceBox.h;
  const targetSize = direction.axis === "x" ? targetBox.w : targetBox.h;
  const sourceNear = direction.axis === "x" ? sourceBox.x : sourceBox.y;
  const targetNear = direction.axis === "x" ? targetBox.x : targetBox.y;
  const sourceFar = sourceNear + sourceSize;
  const targetFar = targetNear + targetSize;
  const sourceEdge = direction.sign > 0 ? sourceFar : sourceNear;
  const targetEdge = direction.sign > 0 ? targetNear : targetFar;
  return {
    sourceSampleAxis: sourceEdge + direction.sign * Math.min(4, sourceSize * 0.04),
    sourceAnchorAxis: sourceEdge - direction.sign * Math.min(8, sourceSize * 0.08),
    targetSampleAxis: targetEdge - direction.sign * Math.min(8, targetSize * 0.025),
    targetAnchorAxis: targetEdge + direction.sign * Math.min(8, targetSize * 0.025)
  };
}

function axisPoint(axis, axisValue, crossValue) {
  return axis === "x"
    ? { x: round2(axisValue), y: round2(crossValue) }
    : { x: round2(crossValue), y: round2(axisValue) };
}

function boxCenter(box) {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function inferRouteColor(image, slide, sourceBox, targetBoxes, direction, options = {}) {
  if (options.autoRouteColor === false) return null;
  const corridor = branchCorridor(sourceBox, targetBoxes, direction, slide);
  if (!corridor || corridor.w < 6 || corridor.h < 6) return null;
  const x0 = Math.max(0, Math.floor(corridor.x / slide.widthPt * image.width));
  const x1 = Math.min(image.width - 1, Math.ceil((corridor.x + corridor.w) / slide.widthPt * image.width));
  const y0 = Math.max(0, Math.floor(corridor.y / slide.heightPt * image.height));
  const y1 = Math.min(image.height - 1, Math.ceil((corridor.y + corridor.h) / slide.heightPt * image.height));
  const stride = Math.max(1, Math.floor(Math.min(image.width / 960, image.height / 540)));
  const bins = new Map();
  let eligible = 0;
  for (let y = y0; y <= y1; y += stride) {
    for (let x = x0; x <= x1; x += stride) {
      const offset = (y * image.width + x) * 4;
      const r = image.rgba[offset];
      const g = image.rgba[offset + 1];
      const b = image.rgba[offset + 2];
      const a = image.rgba[offset + 3];
      if (!routeColorCandidate(r, g, b, a)) continue;
      eligible += 1;
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      const bin = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      bin.count += 1;
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bins.set(key, bin);
    }
  }
  if (eligible === 0 || bins.size === 0) return null;
  const best = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  const minimumPixels = Math.max(12, Math.round((x1 - x0 + y1 - y0) * 0.03));
  const confidence = best.count / eligible;
  if (best.count < minimumPixels || confidence < 0.12) return null;
  const color = {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
    confidence: round4(confidence),
    sampleCount: best.count
  };
  return { ...color, hex: rgbHex(color.r, color.g, color.b) };
}

function branchCorridor(sourceBox, targetBoxes, direction, slide) {
  const padding = 10;
  if (direction.axis === "x") {
    const sourceEdge = direction.sign > 0 ? sourceBox.x + sourceBox.w : sourceBox.x;
    const targetEdge = direction.sign > 0
      ? Math.min(...targetBoxes.map((box) => box.x))
      : Math.max(...targetBoxes.map((box) => box.x + box.w));
    const left = Math.min(sourceEdge, targetEdge) + padding;
    const right = Math.max(sourceEdge, targetEdge) - padding;
    const top = Math.max(0, Math.min(sourceBox.y, ...targetBoxes.map((box) => box.y)) - padding);
    const bottom = Math.min(slide.heightPt, Math.max(sourceBox.y + sourceBox.h, ...targetBoxes.map((box) => box.y + box.h)) + padding);
    return right > left ? { x: left, y: top, w: right - left, h: bottom - top } : null;
  }
  const sourceEdge = direction.sign > 0 ? sourceBox.y + sourceBox.h : sourceBox.y;
  const targetEdge = direction.sign > 0
    ? Math.min(...targetBoxes.map((box) => box.y))
    : Math.max(...targetBoxes.map((box) => box.y + box.h));
  const top = Math.min(sourceEdge, targetEdge) + padding;
  const bottom = Math.max(sourceEdge, targetEdge) - padding;
  const left = Math.max(0, Math.min(sourceBox.x, ...targetBoxes.map((box) => box.x)) - padding);
  const right = Math.min(slide.widthPt, Math.max(sourceBox.x + sourceBox.w, ...targetBoxes.map((box) => box.x + box.w)) + padding);
  return bottom > top ? { x: left, y: top, w: right - left, h: bottom - top } : null;
}

function routeColorCandidate(r, g, b, a) {
  if (a < 96) return false;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  if (luma < 28 || luma > 235) return false;
  return maximum - minimum >= 24 || luma < 145;
}

function createColorPredicate(color, toleranceValue) {
  const tolerance = clampNumber(toleranceValue, 18, 120, 58);
  const squaredTolerance = tolerance * tolerance;
  return (r, g, b, a) => a >= 48
    && (r - color.r) ** 2 + (g - color.g) ** 2 + (b - color.b) ** 2 <= squaredTolerance;
}

function isBlueRouteColor(color) {
  return isBlueRoutePixel(color.r, color.g, color.b, 255);
}

function rgbHex(r, g, b) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

function contiguousRuns(scores, threshold, baseY) {
  const runs = [];
  let start = -1;
  let score = 0;
  for (let index = 0; index <= scores.length; index += 1) {
    const value = scores[index] || 0;
    if (index < scores.length && value >= threshold) {
      if (start < 0) start = index;
      score += value;
      continue;
    }
    if (start >= 0) {
      const end = index - 1;
      runs.push({
        start: baseY + start,
        end: baseY + end,
        center: baseY + (start + end) / 2,
        length: end - start + 1,
        score
      });
      start = -1;
      score = 0;
    }
  }
  return runs;
}

function smoothMeasuredPoints(points) {
  if (points.length < 5) return points;
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const previous = points[index - 1];
    const next = points[index + 1];
    return {
      x: point.x,
      y: round2(previous.y * 0.2 + point.y * 0.6 + next.y * 0.2)
    };
  });
}

function isBlueRoutePixel(r, g, b, a) {
  return a >= 48 && b >= 115 && b - r >= 35 && b >= g * 0.9 && g >= 45;
}

function normalizePoints(points, slide) {
  if (!Array.isArray(points)) return [];
  return points.map((point) => ({ x: Number(point?.x), y: Number(point?.y) })).filter((point) => (
    Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= slide.widthPt
    && point.y >= 0 && point.y <= slide.heightPt
  ));
}

function normalizeSlide(value) {
  const widthPt = Number(value?.widthPt);
  const heightPt = Number(value?.heightPt);
  return Number.isFinite(widthPt) && Number.isFinite(heightPt) && widthPt > 0 && heightPt > 0
    ? { widthPt, heightPt }
    : null;
}

function normalizeBox(value, slide) {
  if (!slide || !value || typeof value !== "object") return null;
  const box = { x: Number(value.x), y: Number(value.y), w: Number(value.w), h: Number(value.h) };
  if (!Object.values(box).every(Number.isFinite) || box.w <= 0 || box.h <= 0) return null;
  if (box.x < 0 || box.y < 0 || box.x + box.w > slide.widthPt || box.y + box.h > slide.heightPt) return null;
  return box;
}

function validImage(image) {
  return Number.isInteger(image?.width) && image.width > 0
    && Number.isInteger(image?.height) && image.height > 0
    && Buffer.isBuffer(image?.rgba) && image.rgba.length === image.width * image.height * 4;
}

function smoothStep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function round4(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

function emptyResult(reason) {
  return { ok: false, reason, confidence: 0, measuredRoutes: 0, curves: [] };
}

module.exports = {
  isBlueRoutePixel,
  measureBranchCurves,
  measureBranchCurvesFromAnchors,
  _private: {
    branchAnchorGeometry,
    branchCorridor,
    contiguousRuns,
    createColorPredicate,
    findBlueCenterAtX,
    findBlueCenterAtY,
    inferRouteColor,
    isBlueRouteColor,
    inferBranchDirection,
    smoothMeasuredPoints
  }
};
