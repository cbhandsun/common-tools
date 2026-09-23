"use strict";

const { boxAreaValue } = require("./registry-graphic-rules");
const { ptBoxOverlapAreaValue } = require("./diagram-geometry");

function applySystemMapNativeHybridProbeSource({ target, reconstructionMode, topologyProbe, decorativeGridTexture, pictorialEnclosure, targetAreaRatio }) {
  const promotedFullSlideSource = target?.source?.systemMapSyntheticSourceCandidate === true || target?.source?.systemMapSourceBackgroundPromoted === true || (targetAreaRatio >= 0.78 && String(target?.type || "") === "source-background");
  const probeSource = {
    ...(target.source || {}),
    systemMapTopologyProbeReady: promotedFullSlideSource ? topologyProbe.ready === true : true,
    systemMapTopologyProbeNodeCount: topologyProbe.nodeCount,
    systemMapTopologyProbeEdgeCount: topologyProbe.edgeCount,
    systemMapDecorativeGridTextureDetected: decorativeGridTexture,
    systemMapReconstructionReasonCode: promotedFullSlideSource ? "system-map.promoted-full-slide-source-preserved" : reconstructionMode.reasonCode
  };
  target.source = promotedFullSlideSource
    ? { ...probeSource, systemMapPictorialEnclosureDetected: pictorialEnclosure.detected === true, systemMapPictorialEnclosureConfidence: pictorialEnclosure.confidence }
    : { ...probeSource, systemMapHybridEligible: true };
  return promotedFullSlideSource;
}

function removeDuplicateSystemMapFidelityUnderlays(page = {}, target = null) {
  if (!target || target?.source?.systemMapFidelityProtected !== true || !Array.isArray(page.images)) return;
  const targetArea = boxAreaValue(target.box || {});
  if (targetArea <= 0) return;
  page.images = page.images.filter((image) => {
    if (image === target) return true;
    const detector = String(image?.source?.detector || image?.detector || "");
    if (!/screenshot-process-underlay-crop|graphic-underlay|line-diagram|foreground-graphic/i.test(detector)) return true;
    const imageArea = boxAreaValue(image?.box || {});
    return imageArea <= 0 || ptBoxOverlapAreaValue(image.box || {}, target.box || {}) / Math.max(1, Math.min(imageArea, targetArea)) < 0.85;
  });
}

module.exports = {
  applySystemMapNativeHybridProbeSource,
  removeDuplicateSystemMapFidelityUnderlays
};
