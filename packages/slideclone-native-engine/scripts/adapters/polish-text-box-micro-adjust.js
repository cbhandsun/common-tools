"use strict";

const { applyTextBoxMicroAdjustments } = require("../lib/text-box-micro-adjust");

module.exports = async function polishTextBoxMicroAdjust(input, context = {}) {
  const result = applyTextBoxMicroAdjustments(input.ir, input.compare?.textCoverage, {
    enabled: context.config?.textMicroAdjust?.enabled !== false,
    paddingPt: context.config?.textMicroAdjust?.paddingPt ?? context.config?.textOcr?.paddingPt ?? 16,
    minCoverage: context.config?.textMicroAdjust?.minCoverage ?? 0.995,
    maxMovePt: context.config?.textMicroAdjust?.maxMovePt ?? 3,
    maxHeightAdjustPt: context.config?.textMicroAdjust?.maxHeightAdjustPt ?? 2.5,
    minDeltaPt: context.config?.textMicroAdjust?.minDeltaPt ?? 0.15
  });

  return {
    ok: true,
    data: {
      provider: "polish-text-box-micro-adjust",
      iteration: input.iteration,
      changed: result.changed,
      ir: result.ir,
      changes: result.changes.map((change) => ({
        iteration: input.iteration,
        ...change
      })),
      pages: result.perPage
    }
  };
};
