// @ts-check
"use strict";

const { assertQualityReport } = require("../capability-contracts");
const { detectStaticTextOverflow } = require("./static-text-overflow-detector");
const { ptBoxOverlapAreaValue } = require("./diagram-geometry");
const { comparePerceptualImages } = require("./perceptual-image-quality");

const DEFAULT_SLIDE_WIDTH = 960;
const DEFAULT_SLIDE_HEIGHT = 540;
const MAX_SLIDE_DIMENSION_PT = 100000;

/**
 * @typedef {Object} Box
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * Extract normalized { x, y, w, h } box from element.
 * @param {unknown} element
 * @returns {Box | null}
 */
function extractBox(element) {
  if (!element || typeof element !== "object" || Array.isArray(element)) return null;
  const raw = /** @type {Record<string, unknown>} */ (element);
  const candidate = raw.box && typeof raw.box === "object" ? /** @type {Record<string, unknown>} */ (raw.box) : raw;
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  const w = Number(candidate.w);
  const h = Number(candidate.h);
  if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
    return { x, y, w, h };
  }
  return null;
}

/**
 * Assess slide reconstruction quality purely via headless geometric and text metric analysis.
 * Complies strictly with capability-contracts QualityReport specification.
 * @param {unknown} pageData
 * @param {unknown} [slideSize]
 * @param {unknown} [options]
 * @returns {ReturnType<typeof assertQualityReport>}
 */
function assessHeadlessQuality(pageData, slideSize = {}, options = {}) {
  if (!pageData || typeof pageData !== "object" || Array.isArray(pageData)) {
    throw new TypeError("pageData must be an object");
  }
  const rawPage = /** @type {Record<string, unknown>} */ (pageData);
  const rawSlideSize = optionalRecord(slideSize, "slideSize");
  const rawOptions = optionalRecord(options, "options");
  const widthPt = slideDimension(rawSlideSize.widthPt, DEFAULT_SLIDE_WIDTH, "slideSize.widthPt");
  const heightPt = slideDimension(rawSlideSize.heightPt, DEFAULT_SLIDE_HEIGHT, "slideSize.heightPt");

  const rawShapes = Array.isArray(rawPage.shapes) ? rawPage.shapes : [];
  const rawTextBoxes = Array.isArray(rawPage.textBoxes) ? rawPage.textBoxes : [];
  const rawResiduals = Array.isArray(rawPage.residuals) ? rawPage.residuals : [];

  // 1. Text Overflow Check
  let overflowCount = 0;
  rawTextBoxes.forEach((t) => {
    const raw = /** @type {Record<string, unknown>} */ (t);
    const box = extractBox(raw);
    if (!box) return;
    const text = String(raw.text || "").trim();
    const font = raw.font && typeof raw.font === "object" ? /** @type {Record<string, unknown>} */ (raw.font) : {};
    const sizePt = Number(font.sizePt) || 14;
    const report = detectStaticTextOverflow(text, sizePt, box);
    if (report.overflows) overflowCount += 1;
  });
  const textCount = Math.max(1, rawTextBoxes.length);
  const textOverflowRate = Math.round((overflowCount / textCount) * 1000) / 1000;
  const maxOverflowRate = boundedRatio(rawOptions.maxOverflowRate, 0.15, "maxOverflowRate");
  const textOverflowPassed = textOverflowRate <= maxOverflowRate;

  // 2. Canvas Boundary Check
  let outsideBoundaryCount = 0;
  const allElements = [...rawShapes, ...rawTextBoxes];
  for (const el of allElements) {
    const box = extractBox(el);
    if (!box) continue;
    if (box.x < -1 || box.y < -1 || (box.x + box.w) > (widthPt + 5) || (box.y + box.h) > (heightPt + 5)) {
      outsideBoundaryCount += 1;
    }
  }
  const canvasBoundaryPassed = outsideBoundaryCount === 0;

  // 3. Collision / Overlap Check among text boxes
  let collisionCount = 0;
  for (let i = 0; i < rawTextBoxes.length; i += 1) {
    const boxA = extractBox(rawTextBoxes[i]);
    if (!boxA) continue;
    for (let j = i + 1; j < rawTextBoxes.length; j += 1) {
      const boxB = extractBox(rawTextBoxes[j]);
      if (!boxB) continue;
      const overlap = ptBoxOverlapAreaValue(boxA, boxB);
      const minArea = Math.min(boxA.w * boxA.h, boxB.w * boxB.h);
      if (overlap > 0 && (overlap / minArea) > 0.3) {
        collisionCount += 1;
      }
    }
  }
  const collisionPassed = collisionCount === 0;

  // 4. Native Elements Ratio Check
  const nativeCount = rawShapes.length + rawTextBoxes.length;
  const residualCount = rawResiduals.length;
  const totalElements = Math.max(1, nativeCount + residualCount);
  const nativeRatio = Math.round((nativeCount / totalElements) * 1000) / 1000;
  const minNativeRatio = boundedRatio(rawOptions.minNativeRatio, 0.70, "minNativeRatio");
  const nativeCoveragePassed = nativeRatio >= minNativeRatio;
  const minSsim = boundedRatio(rawOptions.minSsim, 0.92, "minSsim");
  const maxPhashDistance = boundedInteger(rawOptions.maxPhashDistance, 8, 0, 63, "maxPhashDistance");
  const perceptualComparison = rawOptions.referenceImage != null || rawOptions.renderedImage != null
    ? comparePerceptualImages(
        requireImageOption(rawOptions.referenceImage, "referenceImage"),
        requireImageOption(rawOptions.renderedImage, "renderedImage"),
        { minSsim, maxPhashDistance }
      )
    : null;

  const checks = [
    { name: "text-overflow-check", passed: textOverflowPassed },
    { name: "canvas-boundary-check", passed: canvasBoundaryPassed },
    { name: "text-collision-check", passed: collisionPassed },
    { name: "native-coverage-check", passed: nativeCoveragePassed }
  ];
  if (perceptualComparison) checks.push({ name: "perceptual-image-check", passed: perceptualComparison.passed });

  /** @type {Record<string, number>} */
  const metrics = {
    "text-overflow-rate": textOverflowRate,
    "outside-boundary-count": outsideBoundaryCount,
    "text-collision-count": collisionCount,
    "native-coverage-ratio": nativeRatio
  };
  if (perceptualComparison) {
    metrics["perceptual-ssim"] = perceptualComparison.ssim;
    metrics["perceptual-phash-distance"] = perceptualComparison.phashDistance;
  }

  const passed = checks.every((c) => c.passed);

  return assertQualityReport({
    passed,
    checks,
    metrics
  });
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {unknown}
 */
function requireImageOption(value, label) {
  if (value == null) throw new TypeError(`${label} is required when perceptual image comparison is enabled`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function optionalRecord(value, label) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {string} label
 * @returns {number}
 */
function slideDimension(value, fallback, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > MAX_SLIDE_DIMENSION_PT) {
    throw new TypeError(`${label} must be a positive finite number no greater than ${MAX_SLIDE_DIMENSION_PT}`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {string} label
 * @returns {number}
 */
function boundedRatio(value, fallback, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${label} must be a number between 0 and 1`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @param {string} label
 * @returns {number}
 */
function boundedInteger(value, fallback, min, max, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new TypeError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

module.exports = {
  assessHeadlessQuality,
  boundedInteger,
  boundedRatio,
  optionalRecord,
  requireImageOption,
  slideDimension
};
