"use strict";

module.exports = async function diffPlaceholder() {
  return {
    ok: true,
    data: {
      provider: "diff-placeholder",
      metrics: [],
      summary: {
        pixelDiffRatio: null,
        layoutMeanIoU: null,
        textCoverage: null,
        maxCriticalOffsetPt: null
      },
      warning: "No diff provider configured. Replace with pixel/layout/text diff implementation."
    }
  };
};
