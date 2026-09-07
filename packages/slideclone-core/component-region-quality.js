"use strict";

const MAX_REGIONS = 5000;
const MAX_DIMENSION = 16384;
const MAX_EVALUATED_PIXELS = 100_000_000;
const ELEMENT_GROUPS = Object.freeze([
  ["text", "textBoxes"], ["shape", "shapes"], ["image", "images"], ["table", "tables"], ["chart", "charts"],
]);
const COMPONENT_BASELINES = Object.freeze({
  text: Object.freeze({ maximumPixelDiffRatio: 0.62, maximumForegroundMissingRatio: 0.34, minimumForegroundPixels: 8 }),
  pictorial: Object.freeze({ maximumPixelDiffRatio: 0.42, maximumForegroundMissingRatio: 0.24, minimumForegroundPixels: 12 }),
  "connector-straight": Object.freeze({ maximumPixelDiffRatio: 0.58, maximumForegroundMissingRatio: 0.34, minimumForegroundPixels: 4 }),
  "connector-arc": Object.freeze({ maximumPixelDiffRatio: 0.62, maximumForegroundMissingRatio: 0.36, minimumForegroundPixels: 4 }),
  "container-border": Object.freeze({ maximumPixelDiffRatio: 0.5, maximumForegroundMissingRatio: 0.3, minimumForegroundPixels: 8 }),
  shape: Object.freeze({ maximumPixelDiffRatio: 0.38, maximumForegroundMissingRatio: 0.24, minimumForegroundPixels: 12 }),
  table: Object.freeze({ maximumPixelDiffRatio: 0.34, maximumForegroundMissingRatio: 0.22, minimumForegroundPixels: 12 }),
  chart: Object.freeze({ maximumPixelDiffRatio: 0.4, maximumForegroundMissingRatio: 0.26, minimumForegroundPixels: 12 }),
  image: Object.freeze({ maximumPixelDiffRatio: 0.44, maximumForegroundMissingRatio: 0.26, minimumForegroundPixels: 12 }),
});

function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function finiteBox(box) { return isRecord(box) && [box.x, box.y, box.w, box.h].every(Number.isFinite); }
function validBox(box) { return finiteBox(box) && box.w > 0 && box.h > 0; }
function validSize(size) { return isRecord(size) && Number.isFinite(size.widthPt) && size.widthPt > 0 && Number.isFinite(size.heightPt) && size.heightPt > 0; }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

function buildComponentRegions(page, slideSize) {
  if (!isRecord(page) || !validSize(slideSize)) throw new TypeError("component region source is invalid");
  const regions = [];
  for (const [kind, key] of ELEMENT_GROUPS) {
    const items = Array.isArray(page[key]) ? page[key] : [];
    for (const [index, item] of items.entries()) {
      const region = buildRegion(item, kind, index, slideSize);
      if (!region) continue;
      regions.push(region);
      if (regions.length > MAX_REGIONS) throw new RangeError("component region count exceeds the safety limit");
    }
  }
  return Object.freeze(regions.map((region) => Object.freeze({
    ...region,
    box: Object.freeze(region.box),
    ...(region.geometry ? { geometry: Object.freeze(region.geometry) } : {}),
  })));
}

function buildRegion(item, kind, index, slideSize) {
  if (!isRecord(item) || !finiteBox(item.box)) return null;
  const role = componentRole(item, kind);
  const isConnector = role === "connector-straight" || role === "connector-arc";
  if ((!isConnector && (item.box.w <= 0 || item.box.h <= 0)) || (isConnector && item.box.w === 0 && item.box.h === 0)) return null;
  const normalized = normalizeBox(item.box);
  const strokeWidthPt = clamp(Number(item.style?.strokeWidthPt) || 1, 0.25, 24);
  const id = boundedId(item.id, `${kind}-${index + 1}`);
  if (role === "connector-straight") {
    const endpointRadiusPt = clamp(strokeWidthPt * 4 + 2, 4, 14);
    return {
      id, kind, role,
      box: expandAndClampBox(normalized, endpointRadiusPt, slideSize),
      geometry: {
        type: "segment",
        startX: item.box.x,
        startY: item.box.y,
        endX: item.box.x + item.box.w,
        endY: item.box.y + item.box.h,
        corridorPt: clamp(strokeWidthPt * 1.75 + 1, 2, 8),
        endpointRadiusPt,
      },
    };
  }
  if (role === "connector-arc") {
    const endpointRadiusPt = clamp(strokeWidthPt * 4 + 2, 4, 14);
    const adjustments = Array.isArray(item.style?.adjustments) ? item.style.adjustments : [];
    return {
      id, kind, role,
      box: expandAndClampBox(normalized, endpointRadiusPt, slideSize),
      geometry: {
        type: "ellipse-arc",
        x: normalized.x,
        y: normalized.y,
        w: normalized.w,
        h: normalized.h,
        startAngle: normalizedAngle(adjustments[0], 0),
        endAngle: normalizedAngle(adjustments[1], 360),
        corridorPt: clamp(strokeWidthPt * 1.75 + 1, 2, 8),
        endpointRadiusPt,
      },
    };
  }
  if (role === "container-border") {
    const corridorPt = clamp(strokeWidthPt * 1.75 + 1, 2, 8);
    return {
      id, kind, role,
      box: expandAndClampBox(normalized, corridorPt, slideSize),
      geometry: { type: "rectangle-border", x: normalized.x, y: normalized.y, w: normalized.w, h: normalized.h, corridorPt },
    };
  }
  return { id, kind, role, box: clampBox(normalized, slideSize) };
}

function componentRole(item, kind) {
  const requested = item.source?.componentQualityRole;
  if (typeof requested === "string" && Object.hasOwn(COMPONENT_BASELINES, requested)) return requested;
  if (kind === "text" || kind === "table" || kind === "chart") return kind;
  if (kind === "image") return item.source?.protectedMinimumUnit === true || item.source?.cropEvidenceRequired === true ? "pictorial" : "image";
  const type = String(item.type || item.style?.shapeType || "").toLowerCase();
  if (type === "arc") return "connector-arc";
  if (["line", "polyline", "freeform"].includes(type) || item.style?.connectorType) return "connector-straight";
  const fill = String(item.style?.fill || "").toLowerCase();
  if (["rect", "roundrect", "rounded-rect", "roundedrectangle"].includes(type) && ["", "none", "#ffffff", "ffffff"].includes(fill)) return "container-border";
  return "shape";
}

function compareComponentRegions(source, generated, regions, slideSize, options = {}) {
  validateImage(source); validateImage(generated);
  if (!Array.isArray(regions) || regions.length > MAX_REGIONS || !validSize(slideSize)) throw new TypeError("component region comparison input is invalid");
  const threshold = Number(options.threshold ?? 24);
  const tolerance = Number(options.foregroundTolerancePx ?? 2);
  const toleranceDelta = Number(options.foregroundToleranceDelta ?? 54);
  if (![threshold, tolerance, toleranceDelta].every(Number.isFinite) || threshold < 0 || threshold > 255 || tolerance < 0 || tolerance > 8 || toleranceDelta < 0 || toleranceDelta > 255) throw new RangeError("component region comparison options are invalid");
  ensureEvaluationBound(regions, source, slideSize);
  const metrics = regions.filter((region) => validBox(region?.box)).map((region) => {
    const baseline = baselineFor(region.role, options.componentBaselines);
    const metric = compareRegion(source, generated, region, slideSize, { threshold, tolerance: Math.floor(tolerance), toleranceDelta });
    const sufficientEvidence = metric.foregroundPixels >= baseline.minimumForegroundPixels;
    const severity = sufficientEvidence ? Math.max(metric.pixelDiffRatio / baseline.maximumPixelDiffRatio, metric.foregroundMissingRatio / baseline.maximumForegroundMissingRatio) : 0;
    return Object.freeze({ ...metric, baseline, sufficientEvidence, attention: sufficientEvidence && severity > 1, severity });
  });
  metrics.sort((left, right) => Number(right.attention) - Number(left.attention) || right.severity - left.severity || right.foregroundMissingRatio - left.foregroundMissingRatio || left.id.localeCompare(right.id));
  return Object.freeze({
    audited: metrics.length,
    evaluated: metrics.filter((item) => item.sufficientEvidence).length,
    attentionCount: metrics.filter((item) => item.attention).length,
    worstSeverity: metrics.length ? Math.max(...metrics.map((item) => item.severity)) : null,
    worstPixelDiffRatio: metrics.length ? Math.max(...metrics.map((item) => item.pixelDiffRatio)) : null,
    worstForegroundMissingRatio: metrics.length ? Math.max(...metrics.map((item) => item.foregroundMissingRatio)) : null,
    roles: Object.freeze(summarizeRoles(metrics)),
    worst: Object.freeze(metrics.slice(0, 30)),
  });
}

function compareRegion(source, generated, region, slideSize, options) {
  const left = Math.max(0, Math.floor(region.box.x * source.width / slideSize.widthPt));
  const top = Math.max(0, Math.floor(region.box.y * source.height / slideSize.heightPt));
  const right = Math.min(source.width, Math.ceil((region.box.x + region.box.w) * source.width / slideSize.widthPt));
  const bottom = Math.min(source.height, Math.ceil((region.box.y + region.box.h) * source.height / slideSize.heightPt));
  let pixels = 0; let changed = 0; let foreground = 0; let missing = 0;
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const slideX = (x + 0.5) * slideSize.widthPt / source.width;
    const slideY = (y + 0.5) * slideSize.heightPt / source.height;
    if (region.geometry && !insideGeometry(slideX, slideY, region.geometry)) continue;
    const sourceOffset = (y * source.width + x) * 4;
    const gx = Math.min(generated.width - 1, Math.round(x * generated.width / source.width));
    const gy = Math.min(generated.height - 1, Math.round(y * generated.height / source.height));
    const delta = colorDelta(source.rgba, sourceOffset, generated.rgba, (gy * generated.width + gx) * 4);
    const sourceForeground = isForeground(source.rgba, sourceOffset);
    pixels += 1;
    if (delta > options.threshold) changed += 1;
    if (sourceForeground) {
      foreground += 1;
      if (delta > options.threshold && !nearbyMatch(source, sourceOffset, generated, gx, gy, options)) missing += 1;
    }
  }
  return Object.freeze({ id: region.id, kind: region.kind, role: region.role || region.kind, pixelDiffRatio: pixels ? changed / pixels : 1, foregroundMissingRatio: foreground ? missing / foreground : 0, foregroundPixels: foreground, sampledPixels: pixels });
}

function insideGeometry(x, y, geometry) {
  if (geometry.type === "segment") {
    return pointSegmentDistance(x, y, geometry.startX, geometry.startY, geometry.endX, geometry.endY) <= geometry.corridorPt
      || Math.hypot(x - geometry.startX, y - geometry.startY) <= geometry.endpointRadiusPt
      || Math.hypot(x - geometry.endX, y - geometry.endY) <= geometry.endpointRadiusPt;
  }
  if (geometry.type === "rectangle-border") {
    const horizontal = x >= geometry.x - geometry.corridorPt && x <= geometry.x + geometry.w + geometry.corridorPt
      && (Math.abs(y - geometry.y) <= geometry.corridorPt || Math.abs(y - geometry.y - geometry.h) <= geometry.corridorPt);
    const vertical = y >= geometry.y - geometry.corridorPt && y <= geometry.y + geometry.h + geometry.corridorPt
      && (Math.abs(x - geometry.x) <= geometry.corridorPt || Math.abs(x - geometry.x - geometry.w) <= geometry.corridorPt);
    return horizontal || vertical;
  }
  if (geometry.type === "ellipse-arc") {
    const rx = geometry.w / 2; const ry = geometry.h / 2;
    if (rx <= 0 || ry <= 0) return false;
    const cx = geometry.x + rx; const cy = geometry.y + ry;
    const nx = (x - cx) / rx; const ny = (y - cy) / ry;
    const radialDistance = Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry);
    const angle = (Math.atan2(ny, nx) * 180 / Math.PI + 360) % 360;
    const startPoint = ellipsePoint(cx, cy, rx, ry, geometry.startAngle);
    const endPoint = ellipsePoint(cx, cy, rx, ry, geometry.endAngle);
    return (radialDistance <= geometry.corridorPt && angleInClockwiseRange(angle, geometry.startAngle, geometry.endAngle, 4))
      || Math.hypot(x - startPoint.x, y - startPoint.y) <= geometry.endpointRadiusPt
      || Math.hypot(x - endPoint.x, y - endPoint.y) <= geometry.endpointRadiusPt;
  }
  return true;
}

function pointSegmentDistance(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1; const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function ellipsePoint(cx, cy, rx, ry, angle) { const radians = angle * Math.PI / 180; return { x: cx + Math.cos(radians) * rx, y: cy + Math.sin(radians) * ry }; }
function angleInClockwiseRange(angle, start, end, padding) {
  const span = ((end - start) % 360 + 360) % 360 || 360;
  const offset = ((angle - start) % 360 + 360) % 360;
  return offset <= span + padding || offset >= 360 - padding;
}

function baselineFor(role, overrides) {
  const base = COMPONENT_BASELINES[role] || COMPONENT_BASELINES.shape;
  const override = isRecord(overrides) && isRecord(overrides[role]) ? overrides[role] : {};
  return Object.freeze({
    maximumPixelDiffRatio: boundedRatio(override.maximumPixelDiffRatio, base.maximumPixelDiffRatio),
    maximumForegroundMissingRatio: boundedRatio(override.maximumForegroundMissingRatio, base.maximumForegroundMissingRatio),
    minimumForegroundPixels: boundedInteger(override.minimumForegroundPixels, base.minimumForegroundPixels, 1, 1_000_000),
  });
}
function boundedRatio(value, fallback) { const result = value === undefined ? fallback : Number(value); if (!Number.isFinite(result) || result <= 0 || result > 1) throw new RangeError("component baseline ratio is invalid"); return result; }
function boundedInteger(value, fallback, minimum, maximum) { const result = value === undefined ? fallback : Number(value); if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new RangeError("component baseline count is invalid"); return result; }

function summarizeRoles(metrics) {
  const summaries = new Map();
  for (const metric of metrics) {
    const current = summaries.get(metric.role) || { role: metric.role, audited: 0, evaluated: 0, attentionCount: 0, worstSeverity: 0 };
    current.audited += 1;
    current.evaluated += Number(metric.sufficientEvidence);
    current.attentionCount += Number(metric.attention);
    current.worstSeverity = Math.max(current.worstSeverity, metric.severity);
    summaries.set(metric.role, current);
  }
  return [...summaries.values()].sort((left, right) => left.role.localeCompare(right.role)).map(Object.freeze);
}

function normalizeBox(box) { return { x: Math.min(box.x, box.x + box.w), y: Math.min(box.y, box.y + box.h), w: Math.abs(box.w), h: Math.abs(box.h) }; }
function clampBox(box, size) {
  const left = clamp(box.x, 0, size.widthPt); const top = clamp(box.y, 0, size.heightPt);
  const right = clamp(box.x + box.w, 0, size.widthPt); const bottom = clamp(box.y + box.h, 0, size.heightPt);
  return { x: left, y: top, w: Math.max(0.01, right - left), h: Math.max(0.01, bottom - top) };
}
function expandAndClampBox(box, padding, size) { return clampBox({ x: box.x - padding, y: box.y - padding, w: box.w + padding * 2, h: box.h + padding * 2 }, size); }
function normalizedAngle(value, fallback) { return Number.isFinite(value) ? ((value % 360) + 360) % 360 : fallback; }
function boundedId(value, fallback) { const candidate = typeof value === "string" && value.trim() ? value.trim() : fallback; return candidate.slice(0, 160); }

function validateImage(image) {
  if (!isRecord(image) || !Buffer.isBuffer(image.rgba) || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width < 1 || image.height < 1 || image.width > MAX_DIMENSION || image.height > MAX_DIMENSION
    || image.rgba.length < image.width * image.height * 4) throw new TypeError("component region comparison input is invalid");
}
function ensureEvaluationBound(regions, source, slideSize) {
  let total = 0;
  for (const region of regions) {
    if (!validBox(region?.box)) continue;
    total += Math.ceil(region.box.w * source.width / slideSize.widthPt) * Math.ceil(region.box.h * source.height / slideSize.heightPt);
    if (total > MAX_EVALUATED_PIXELS) throw new RangeError("component region comparison exceeds the pixel safety limit");
  }
}

function colorDelta(left, leftOffset, right, rightOffset) {
  return (Math.abs(left[leftOffset] - right[rightOffset]) + Math.abs(left[leftOffset + 1] - right[rightOffset + 1]) + Math.abs(left[leftOffset + 2] - right[rightOffset + 2]) + Math.abs(left[leftOffset + 3] - right[rightOffset + 3])) / 4;
}
function isForeground(rgba, offset) {
  const r = rgba[offset]; const g = rgba[offset + 1]; const b = rgba[offset + 2];
  return (r + g + b) / 3 < 245 || Math.max(r, g, b) - Math.min(r, g, b) > 18;
}
function nearbyMatch(source, sourceOffset, generated, gx, gy, options) {
  for (let dy = -options.tolerance; dy <= options.tolerance; dy += 1) for (let dx = -options.tolerance; dx <= options.tolerance; dx += 1) {
    const x = gx + dx; const y = gy + dy;
    if (x < 0 || y < 0 || x >= generated.width || y >= generated.height) continue;
    const generatedOffset = (y * generated.width + x) * 4;
    if (isForeground(generated.rgba, generatedOffset) && colorDelta(source.rgba, sourceOffset, generated.rgba, generatedOffset) <= options.toleranceDelta) return true;
  }
  return false;
}

module.exports = { COMPONENT_BASELINES, buildComponentRegions, compareComponentRegions };
