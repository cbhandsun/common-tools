"use strict";

const POLICIES = new Set(["editable-first", "hybrid", "fidelity-first"]);

function measurePageReconstructionQuality(page = {}, slideSize = {}) {
  const slideArea = positiveNumber(slideSize.widthPt) * positiveNumber(slideSize.heightPt);
  if (!(slideArea > 0)) throw new TypeError("slideSize must contain positive finite widthPt and heightPt");
  const images = Array.isArray(page.images) ? page.images : [];
  const residuals = images.filter(isResidualImage);
  const residualBoxes = residuals.map((item) => normalizeBox(item?.box)).filter(Boolean);
  const protectedResiduals = residuals.filter(isProtectedResidualImage);
  const protectedResidualBoxes = protectedResiduals.map((item) => normalizeBox(item?.box)).filter(Boolean);
  const actionableResiduals = residuals.filter((item) => !isProtectedResidualImage(item));
  const actionableResidualBoxes = actionableResiduals.map((item) => normalizeBox(item?.box)).filter(Boolean);
  const residualArea = unionArea(residualBoxes);
  const largestResidualArea = residualBoxes.reduce((maximum, box) => Math.max(maximum, box.w * box.h), 0);
  const protectedResidualArea = unionArea(protectedResidualBoxes);
  const actionableResidualArea = unionArea(actionableResidualBoxes);
  const largestActionableResidualArea = actionableResidualBoxes.reduce((maximum, box) => Math.max(maximum, box.w * box.h), 0);
  const nativeObjectCount = ["textBoxes", "shapes", "tables", "charts", "icons"]
    .reduce((sum, key) => sum + (Array.isArray(page[key]) ? page[key].length : 0), 0);
  return Object.freeze({
    slideAreaPt2: round(slideArea),
    residualAreaPt2: round(residualArea),
    residualAreaRatio: round(residualArea / slideArea, 6),
    largestResidualAreaRatio: round(largestResidualArea / slideArea, 6),
    residualCount: residuals.length,
    protectedResidualAreaPt2: round(protectedResidualArea),
    protectedResidualAreaRatio: round(protectedResidualArea / slideArea, 6),
    protectedResidualCount: protectedResiduals.length,
    actionableResidualAreaPt2: round(actionableResidualArea),
    actionableResidualAreaRatio: round(actionableResidualArea / slideArea, 6),
    largestActionableResidualAreaRatio: round(largestActionableResidualArea / slideArea, 6),
    actionableResidualCount: actionableResiduals.length,
    nativeObjectCount,
    imageCount: images.length
  });
}

function evaluatePageReconstructionBudget(page = {}, slideSize = {}, options = {}) {
  const metrics = measurePageReconstructionQuality(page, slideSize);
  const policy = normalizePolicy(options.policy);
  const thresholds = thresholdsFor(policy, options);
  const reasonCodes = [];
  if (metrics.actionableResidualAreaRatio > thresholds.maxResidualAreaRatio) reasonCodes.push("quality.residual-area-exceeded");
  if (metrics.largestActionableResidualAreaRatio > thresholds.maxLargestResidualAreaRatio) reasonCodes.push("quality.largest-residual-exceeded");
  if (metrics.nativeObjectCount < thresholds.minNativeObjectCount) reasonCodes.push("quality.native-object-count-low");
  return Object.freeze({
    contractVersion: "1.0",
    policy,
    passed: reasonCodes.length === 0,
    reasonCodes: Object.freeze(reasonCodes),
    thresholds: Object.freeze(thresholds),
    metrics
  });
}

function evaluateDeckReconstructionBudget(ir = {}, options = {}) {
  const pages = Array.isArray(ir?.pages) ? ir.pages : [];
  if (pages.length === 0 || pages.length > 10000) {
    throw new TypeError("Deck IR must contain 1 to 10000 pages for reconstruction budget evaluation");
  }
  const policyOverride = options.policy === undefined ? null : requirePolicy(options.policy);
  const thresholdOverrides = normalizeThresholdOverrides(options);
  const pageResults = pages.map((page, pageOffset) => {
    const storedPolicy = page?.reconstruction?.qualityBudget?.policy
      || page?.reconstruction?.expressionPolicy;
    const result = evaluatePageReconstructionBudget(page, ir.slideSize, {
      policy: policyOverride || normalizePolicy(storedPolicy),
      ...thresholdOverrides
    });
    return Object.freeze({
      pageIndex: safePageIndex(page?.pageIndex, pageOffset),
      ...result
    });
  });
  const failedPages = pageResults.filter((page) => !page.passed);
  const reasonCounts = {};
  for (const page of failedPages) {
    for (const reasonCode of page.reasonCodes) reasonCounts[reasonCode] = (reasonCounts[reasonCode] || 0) + 1;
  }
  return Object.freeze({
    contractVersion: "1.0",
    passed: failedPages.length === 0,
    policyOverride,
    thresholdOverrides: Object.freeze(thresholdOverrides),
    pageCount: pageResults.length,
    failedPageCount: failedPages.length,
    reasonCounts: Object.freeze(reasonCounts),
    maxResidualAreaRatio: round(Math.max(...pageResults.map((page) => page.metrics.residualAreaRatio)), 6),
    maxLargestResidualAreaRatio: round(Math.max(...pageResults.map((page) => page.metrics.largestResidualAreaRatio)), 6),
    maxActionableResidualAreaRatio: round(Math.max(...pageResults.map((page) => page.metrics.actionableResidualAreaRatio)), 6),
    maxLargestActionableResidualAreaRatio: round(Math.max(...pageResults.map((page) => page.metrics.largestActionableResidualAreaRatio)), 6),
    pages: Object.freeze(pageResults)
  });
}

function thresholdsFor(policy, options) {
  const defaults = policy === "editable-first"
    ? { maxResidualAreaRatio: 0.35, maxLargestResidualAreaRatio: 0.25, minNativeObjectCount: 1 }
    : policy === "fidelity-first"
      ? { maxResidualAreaRatio: 1, maxLargestResidualAreaRatio: 1, minNativeObjectCount: 0 }
      : { maxResidualAreaRatio: 0.65, maxLargestResidualAreaRatio: 0.5, minNativeObjectCount: 1 };
  return {
    maxResidualAreaRatio: finiteRatio(options.maxResidualAreaRatio, defaults.maxResidualAreaRatio),
    maxLargestResidualAreaRatio: finiteRatio(options.maxLargestResidualAreaRatio, defaults.maxLargestResidualAreaRatio),
    minNativeObjectCount: boundedInteger(options.minNativeObjectCount, defaults.minNativeObjectCount, 0, 100000)
  };
}

function isResidualImage(image) {
  const source = image?.source || {};
  const realization = source?.reconstruction?.realization;
  return realization === "source_crop"
    || source.editable === false
    || /(?:residual|crop|underlay)/i.test(String(source.detector || ""));
}

function isProtectedResidualImage(image) {
  const source = image?.source || {};
  const policy = source?.componentRenderStrategy?.expressionPolicy || {};
  return isResidualImage(image)
    && source.editable === false
    && source.intentionalMinimumUnitCrop === true
    && source.protectedMinimumUnit === true
    && source.graphicExpressionPolicy?.kind === "fidelity-crop"
    && policy.kind === "fidelity-crop"
    && policy.minimumUnitPolicy === "preserve-as-single-crop"
    && policy.unitDisposition === "intentional-visual-crop"
    && policy.allowNativeRebuild === false
    && policy.protectCrop === true
    && ["keep-local-crop", "preserve-local-crop"].includes(source.recommendedAction);
}

function unionArea(boxes) {
  if (boxes.length === 0) return 0;
  const xs = [...new Set(boxes.flatMap((box) => [box.x, box.x + box.w]))].sort((a, b) => a - b);
  let area = 0;
  for (let index = 0; index < xs.length - 1; index += 1) {
    const left = xs[index];
    const right = xs[index + 1];
    if (!(right > left)) continue;
    const intervals = boxes
      .filter((box) => box.x < right && box.x + box.w > left)
      .map((box) => [box.y, box.y + box.h])
      .sort((a, b) => a[0] - b[0]);
    let height = 0;
    let start = null;
    let end = null;
    for (const interval of intervals) {
      if (start === null) {
        [start, end] = interval;
      } else if (interval[0] <= end) {
        end = Math.max(end, interval[1]);
      } else {
        height += end - start;
        [start, end] = interval;
      }
    }
    if (start !== null) height += end - start;
    area += (right - left) * height;
  }
  return area;
}

function normalizeBox(value) {
  const numbers = [value?.x, value?.y, value?.w, value?.h].map(Number);
  if (!numbers.every(Number.isFinite) || numbers[2] <= 0 || numbers[3] <= 0 || numbers.some((item) => Math.abs(item) > 1e7)) return null;
  return { x: numbers[0], y: numbers[1], w: numbers[2], h: numbers[3] };
}

function normalizePolicy(value) {
  return POLICIES.has(value) ? value : "hybrid";
}

function requirePolicy(value) {
  if (!POLICIES.has(value)) throw new TypeError(`reconstruction budget policy must be one of: ${[...POLICIES].join(", ")}`);
  return value;
}

function normalizeThresholdOverrides(options) {
  const result = {};
  if (options.maxResidualAreaRatio !== undefined) {
    result.maxResidualAreaRatio = requireRatio(options.maxResidualAreaRatio, "maxResidualAreaRatio");
  }
  if (options.maxLargestResidualAreaRatio !== undefined) {
    result.maxLargestResidualAreaRatio = requireRatio(options.maxLargestResidualAreaRatio, "maxLargestResidualAreaRatio");
  }
  if (options.minNativeObjectCount !== undefined) {
    result.minNativeObjectCount = requireInteger(options.minNativeObjectCount, "minNativeObjectCount", 0, 100000);
  }
  return result;
}

function requireRatio(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError(`${label} must be a finite number between 0 and 1`);
  return number;
}

function requireInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new TypeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return number;
}

function safePageIndex(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 && value < 10000 ? value : fallback;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 1e7 ? number : 0;
}

function finiteRatio(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function round(value, digits = 2) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

module.exports = {
  POLICIES,
  evaluateDeckReconstructionBudget,
  evaluatePageReconstructionBudget,
  isProtectedResidualImage,
  isResidualImage,
  measurePageReconstructionQuality,
  unionArea
};
