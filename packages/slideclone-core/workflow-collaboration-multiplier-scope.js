"use strict";

// Kept separate from the composition root so visual tuning invalidates only
// the collaboration multiplier page cache, not every page in a deck.
function workflowCollaborationBranchGlowStyle() {
  return {
    stroke: "#72D8B1",
    strokeWidthPt: 20,
    opacity: 0.18
  };
}

function workflowCollaborationHubLayerStyle() {
  return {
    highlight: { fill: "#5DE39C", opacity: 0.22 },
    shade: { fill: "#078F78", opacity: 0.14 }
  };
}

module.exports = {
  scope: "workflow-collaboration-multiplier",
  workflowCollaborationBranchGlowStyle,
  workflowCollaborationHubLayerStyle
};
