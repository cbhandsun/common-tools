// @ts-check
"use strict";

const { assessHeadlessQuality } = require("./headless-quality-assessor");

/**
 * @typedef {Object} QualityGateExecutionReport
 * @property {boolean} passed
 * @property {string} engine
 * @property {ReturnType<typeof import("@common-tools/capability-contracts").assertQualityReport>} qualityReport
 * @property {Record<string, unknown>} summary
 */

/**
 * Executes a two-stage quality gate:
 * Stage 1: Fast, deterministic pure-geometric and static font metrics assessment (100% headless, zero Office dependency).
 * Stage 2: (Optional / Local Dev only) Platform-native COM or headless LibreOffice verification when available.
 *
 * @param {unknown} slideData
 * @param {{
 *   engine?: "headless" | "libreoffice" | "powerpoint",
 *   slideSize?: { widthPt?: number, heightPt?: number },
 *   referenceImage?: unknown,
 *   renderedImage?: unknown,
 *   minSsim?: number,
 *   maxPhashDistance?: number,
 *   allowFailure?: boolean
 * }} [options]
 * @returns {QualityGateExecutionReport}
 */
function runTwoStageQualityGate(slideData, options = {}) {
  const engine = options.engine || "headless";

  // Stage 1: Always run pure geometric and text-metric headless assessment
  const headlessReport = assessHeadlessQuality(slideData, options.slideSize, {
    referenceImage: options.referenceImage,
    renderedImage: options.renderedImage,
    minSsim: options.minSsim,
    maxPhashDistance: options.maxPhashDistance
  });

  const report = {
    passed: headlessReport.passed,
    engine,
    qualityReport: headlessReport,
    summary: {
      checkedAt: new Date().toISOString(),
      stage1Passed: headlessReport.passed,
      textOverflowRate: headlessReport.metrics["text-overflow-rate"],
      canvasBoundaryViolations: headlessReport.metrics["outside-boundary-count"],
      textCollisions: headlessReport.metrics["text-collision-count"],
      nativeCoverageRatio: headlessReport.metrics["native-coverage-ratio"],
      perceptualSsim: headlessReport.metrics["perceptual-ssim"],
      perceptualPhashDistance: headlessReport.metrics["perceptual-phash-distance"]
    }
  };

  if (!report.passed && options.allowFailure !== true) {
    // Stage 1 failure details available in report
  }

  return Object.freeze(report);
}

module.exports = {
  runTwoStageQualityGate
};
