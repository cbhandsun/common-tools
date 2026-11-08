// @ts-check
"use strict";
const { types: { isProxy } } = require("node:util");

/** This candidate estimates appearance only. It never creates a strict source
 * measurement, a source-pixel footprint, or an erasure capability. */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {'top'|'bottom'|'left'|'right'} SideName */
/** @typedef {'tl'|'tr'|'bl'|'br'} CornerName */
/** @typedef {{name:SideName,marks:Box[]}} Side */
/** @typedef {{name:CornerName,points:Point[]}} Corner */
/** @typedef {{id:string,source:{width:number,height:number,sha256:string},hint:Box,sides:Side[],corners:Corner[],colors:number[][],strict:{accepted:false,failureCodes:string[]},approvalId:string}} Observation */

const SIDE_NAMES = /** @type {SideName[]} */ (["top", "bottom", "left", "right"]);
const CORNER_NAMES = /** @type {CornerName[]} */ (["tl", "tr", "bl", "br"]);
const LIMITS = Object.freeze({ dimension: 32768, pixels: 40_000_000, marks: 4096, points: 4096, colors: 4096 });
const STRICT_FAILURE_CODES = new Set(["historical-strict-replay-rejected", "patterned-frame-unproven", "patterned-source-scan-budget", "patterned-exterior-unstable",
  "patterned-geometry-budget", "patterned-rail-evidence", "patterned-source-text", "patterned-path-parts", "patterned-enclosure-geometry", "patterned-rail-gap", "patterned-corner-ambiguous", "patterned-corner-unproven"]);

/** @param {unknown} value @returns {Record<string,unknown>} */
function record(value) {
  if (value === null || typeof value !== "object" || isProxy(value) || Array.isArray(value)) throw new TypeError("invalid-record");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new TypeError("invalid-record");
  if (Reflect.ownKeys(value).length > 16) throw new RangeError("record-budget");
  const properties = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(properties).some(key => !("value" in /** @type {PropertyDescriptor} */ (Reflect.get(properties, key))))) throw new TypeError("invalid-record");
  return /** @type {Record<string,unknown>} */ (value);
}

/** @param {unknown} value @param {number} low @param {number} high @returns {number} */
function numeric(value, low, high) {
  const normalized = typeof value === "string" && /^-?\d+(?:\.\d+)?$/u.test(value) && value.length <= 20 ? Number(value) : value;
  if (typeof normalized !== "number" || !Number.isFinite(normalized) || normalized < low || normalized > high) throw new RangeError("invalid-number");
  return normalized;
}

/** @param {unknown} value @returns {string} */
function identifier(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/u.test(value)) throw new TypeError("invalid-identifier");
  return value;
}

/** @param {unknown} value @returns {string} */
function strictFailureCode(value) {
  if (typeof value !== "string" || !STRICT_FAILURE_CODES.has(value)) throw new TypeError("invalid-strict-code");
  return value;
}

/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function array(value, maximum) {
  // Node's native Proxy predicate is checked before Array.isArray (which can
  // throw on a revoked Proxy), length, prototype, or descriptor inspection.
  if (value === null || typeof value !== "object" || isProxy(value) || !Array.isArray(value)) throw new RangeError("invalid-array");
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > maximum) throw new RangeError("invalid-array");
  if (Reflect.ownKeys(value).length > length + 8) throw new RangeError("array-property-budget");
  const properties = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(properties).some(key => !("value" in /** @type {PropertyDescriptor} */ (Reflect.get(properties, key))))) throw new TypeError("invalid-array");
  /** @type {unknown[]} */ const copied = [];
  // Read only original numeric data descriptors. A symbol cannot fill a hole,
  // and a supplied map, iterator, constructor or species is never executed.
  for (let i = 0; i < length; i++) {
    const item = Object.getOwnPropertyDescriptor(value, String(i));
    if (!item || !("value" in item)) throw new TypeError("invalid-array");
    copied.push(item.value);
  }
  return copied;
}

/** @param {unknown} value @param {number} width @param {number} height @returns {Box} */
function box(value, width, height) {
  const r = record(value);
  const result = { x: numeric(r.x, 0, width - 1), y: numeric(r.y, 0, height - 1), w: numeric(r.w, Number.EPSILON, width), h: numeric(r.h, Number.EPSILON, height) };
  if (result.x + result.w > width || result.y + result.h > height) throw new RangeError("outside-source");
  return result;
}

/** Parse, coerce only bounded decimal strings, validate, and copy a whitelist.
 * Unknown extra fields are discarded and never appear in diagnostics.
 * @param {unknown} input @returns {Observation} */
function parseObservation(input) {
  const r = record(input), source = record(r.source), approval = record(r.approval), strict = record(r.strict);
  if (approval.enabled !== true) throw new TypeError("approval-required");
  if (strict.accepted !== false) throw new TypeError("strict-failure-required");
  const width = numeric(source.width, 1, LIMITS.dimension), height = numeric(source.height, 1, LIMITS.dimension);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > LIMITS.pixels) throw new RangeError("source-budget");
  if (typeof source.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(source.sha256)) throw new TypeError("invalid-source-hash");
  const hint = box(r.hint, width, height);
  const sides = array(r.sides, 4).map(raw => {
    const s = record(raw);
    if (typeof s.name !== "string" || !SIDE_NAMES.includes(/** @type {SideName} */ (s.name))) throw new TypeError("invalid-side");
    return { name: /** @type {SideName} */ (s.name), marks: array(s.marks, LIMITS.marks).map(m => box(m, width, height)) };
  });
  if (sides.length !== 4 || new Set(sides.map(s => s.name)).size !== 4 || sides.reduce((n, s) => n + s.marks.length, 0) > LIMITS.marks) throw new RangeError("side-budget");
  const corners = array(r.corners ?? [], 4).map(raw => {
    const c = record(raw);
    if (typeof c.name !== "string" || !CORNER_NAMES.includes(/** @type {CornerName} */ (c.name))) throw new TypeError("invalid-corner");
    return { name: /** @type {CornerName} */ (c.name), points: array(c.points, LIMITS.points).map(rawPoint => {
      const p = record(rawPoint);
      return { x: numeric(p.x, 0, width - 1), y: numeric(p.y, 0, height - 1) };
    }) };
  });
  if (new Set(corners.map(c => c.name)).size !== corners.length || corners.reduce((n, c) => n + c.points.length, 0) > LIMITS.points) throw new RangeError("corner-budget");
  const colors = array(r.colors ?? [], LIMITS.colors).map(raw => {
    const channels = array(raw, 3).map(v => numeric(v, 0, 255));
    if (channels.length !== 3 || channels.some(v => !Number.isInteger(v))) throw new TypeError("invalid-color");
    return channels;
  });
  return { id: identifier(r.id), source: { width, height, sha256: source.sha256 }, hint, sides, corners, colors,
    strict: { accepted: false, failureCodes: array(strict.failureCodes, 32).map(strictFailureCode) }, approvalId: identifier(approval.id) };
}

/** @param {number[]} values @returns {number} */
function median(values) {
  if (!values.length) throw new RangeError("empty-statistic");
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? /** @type {number} */ (sorted[mid]) : (/** @type {number} */ (sorted[mid - 1]) + /** @type {number} */ (sorted[mid])) / 2;
}

/** @param {number} value @returns {number} */
const rounded = value => Math.round(value * 1000) / 1000;

/** @param {Side} side @param {Box} hint */
function fitSide(side, hint) {
  const horizontal = side.name === "top" || side.name === "bottom";
  const tracks = side.marks.map(m => horizontal ? m.y + (m.h - 1) / 2 : m.x + (m.w - 1) / 2);
  if (tracks.length < 3) return null;
  const center = median(tracks), deviation = median(tracks.map(t => Math.abs(t - center)));
  const thickness = median(side.marks.map(m => horizontal ? m.h : m.w));
  const tolerance = Math.max(1, Math.min(4, 3 * deviation + thickness));
  const expected = side.name === "top" ? hint.y : side.name === "bottom" ? hint.y + hint.h : side.name === "left" ? hint.x : hint.x + hint.w;
  if (Math.abs(center - expected) > 12 || thickness > 6) return null;
  const marks = side.marks.filter((m, i) => Math.abs(/** @type {number} */ (tracks[i]) - center) <= tolerance);
  if (marks.length < 3) return null;
  const intervals = marks.map(m => ({ start: horizontal ? m.x : m.y, end: horizontal ? m.x + m.w : m.y + m.h })).sort((a, b) => a.start - b.start);
  const low = /** @type {number} */ (intervals[0]?.start), high = Math.max(...intervals.map(i => i.end));
  const full = horizontal ? hint.w : hint.h;
  if (high - low < full * 0.4) return null;
  const lengths = intervals.map(i => i.end - i.start), nominal = median(lengths);
  const dashLengths = lengths.filter(n => n >= 1 && n <= Math.min(24, 2 * nominal));
  const gaps = intervals.slice(1).map((b, i) => b.start - /** @type {{start:number,end:number}} */ (intervals[i]).end).filter(n => n > 0 && n <= Math.min(24, 2 * nominal));
  return { name: side.name, track: median(marks.map(m => horizontal ? m.y + (m.h - 1) / 2 : m.x + (m.w - 1) / 2)),
    thickness: median(marks.map(m => horizontal ? m.h : m.w)), acceptedMarks: marks.length, rejectedMarks: side.marks.length - marks.length,
    observedSpan: [low, high], coverageSpan: rounded((high - low) / full), dashLengths, gaps };
}

/** @param {Corner[]} corners @param {Box} fitted @param {number} lineWidth */
function fitRadius(corners, fitted, lineWidth) {
  const limit = Math.min(24, fitted.w / 4, fitted.h / 4);
  const estimates = corners.map(c => {
    const left = c.name === "tl" || c.name === "bl", top = c.name === "tl" || c.name === "tr";
    const x = left ? fitted.x : fitted.x + fitted.w, y = top ? fitted.y : fitted.y + fitted.h;
    const radii = c.points.flatMap(p => {
      const u = (p.x - x) * (left ? 1 : -1), v = (p.y - y) * (top ? 1 : -1);
      if (u <= lineWidth / 2 || v <= lineWidth / 2 || u >= limit || v >= limit) return [];
      // Closed-form symmetric quarter-circle fit. No radius search or retry.
      const r = u + v + Math.sqrt(2 * u * v);
      return r <= limit ? [r] : [];
    });
    return { corner: c.name, samples: radii.length, radiusPx: radii.length ? rounded(median(radii)) : null };
  });
  const supported = estimates.filter(e => e.radiusPx !== null);
  if (!supported.length) return null;
  const radius = median(supported.map(e => /** @type {number} */ (e.radiusPx)));
  const uncertainty = Math.max(lineWidth, ...supported.map(e => Math.abs(/** @type {number} */ (e.radiusPx) - radius)));
  return { radiusPx: rounded(radius), intervalPx: [rounded(Math.max(lineWidth, radius - uncertainty)), rounded(Math.min(limit, radius + uncertainty))],
    cornerEvidence: estimates, inferred: ["common-radius-across-corners", "missing-dash-phase-through-corners"] };
}

/** Approximate appearance from observed marks; fixed failure codes contain no
 * user text, paths, pixels, secrets, or thrown exception messages.
 * @param {unknown} input */
function fitApproximateFrame(input) {
  /** @type {Observation} */ let observed;
  try { observed = parseObservation(input); } catch { return { status: "unavailable", code: "approx-frame-invalid-input" }; }
  const sides = SIDE_NAMES.map(name => fitSide(/** @type {Side} */ (observed.sides.find(s => s.name === name)), observed.hint));
  if (sides.some(s => s === null)) return { status: "unavailable", code: "approx-frame-four-rails-required" };
  const rails = /** @type {NonNullable<ReturnType<typeof fitSide>>[]} */ (sides);
  const [top, bottom, left, right] = rails.map(s => s.track);
  if (top === undefined || bottom === undefined || left === undefined || right === undefined || right <= left || bottom <= top) return { status: "unavailable", code: "approx-frame-invalid-enclosure" };
  const fitted = { x: left, y: top, w: right - left, h: bottom - top };
  const lineWidth = median(rails.map(s => s.thickness));
  const radius = fitRadius(observed.corners, fitted, lineWidth);
  if (!radius) return { status: "unavailable", code: "approx-frame-corner-trend-required" };
  const dashLengths = rails.flatMap(s => s.dashLengths), gaps = rails.flatMap(s => s.gaps);
  if (dashLengths.length < 8 || gaps.length < 8) return { status: "unavailable", code: "approx-frame-dash-rhythm-required" };
  if (observed.colors.length < 8) return { status: "unavailable", code: "approx-frame-color-samples-required" };
  const rgb = [0, 1, 2].map(i => Math.round(median(observed.colors.map(c => /** @type {number} */ (c[i])))));
  return { status: "fitted", version: 1, id: observed.id, source: observed.source,
    geometry: { boxPx: Object.fromEntries(Object.entries(fitted).map(([k, v]) => [k, rounded(v)])), radiusPx: radius.radiusPx,
      strokeWidthPx: rounded(lineWidth), dashPx: { on: rounded(median(dashLengths)), off: rounded(median(gaps)), phase: /** @type {null} */ (null) },
      strokeColor: "#" + rgb.map(c => c.toString(16).padStart(2, "0")).join("").toUpperCase(), fill: "none" },
    approximation: { approvalId: observed.approvalId, kind: "visible-rail-native-roundrect", inferred: ["unobserved-rail-gaps", "dash-phase", "antialias-color", ...radius.inferred],
      radiusIntervalPx: radius.intervalPx, corners: radius.cornerEvidence,
      rails: rails.map(s => ({ side: s.name, trackPx: rounded(s.track), acceptedMarks: s.acceptedMarks, rejectedMarks: s.rejectedMarks, observedSpanPx: s.observedSpan, coverageSpan: s.coverageSpan })),
      colorSamples: observed.colors.length, strictResult: observed.strict,
      authority: { strictMeasurement: false, sourceFootprint: false, sourceErasure: false },
      limitations: ["appearance-and-move-qa-required", "original-source-residual-not-removed", "fitted-frame-does-not-complete-strict-region"] } };
}

module.exports = { fitApproximateFrame, parseObservation };
