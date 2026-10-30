"use strict";

// Keep WMS route-chain tuning isolated so cache invalidation stays on the
// matching diagram page instead of forcing a whole-deck semantic rebuild.
function workflowWmsRouteOutputBannerBox({ panel = {}, outputBox = {} } = {}) {
  const panelX = finiteNumber(panel.x);
  const panelW = finiteNumber(panel.w);
  const outputY = finiteNumber(outputBox.y);
  const outputH = finiteNumber(outputBox.h);
  if (panelX === null || panelW === null || outputY === null || outputH === null) return null;
  return {
    x: Math.round(panelX),
    y: Math.round(outputY - 12),
    w: Math.round(panelW),
    h: Math.round(outputH + 24)
  };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

module.exports = {
  scope: "workflow-wms-route-chain",
  workflowWmsRouteOutputBannerBox
};
