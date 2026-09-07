"use strict";

function isSemanticallySplitScreenshotFlowRegion(source = {}) {
  const splitMode = String(source.residualSplitMode || "").toLowerCase();
  const reason = `${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  if (splitMode === "process-with-screenshots-semantic-regions" || /process-with-screenshots/.test(reason)) return true;
  if (!/case-study-diagram/.test(reason)) return false;
  const layer = source.layer || {};
  const archetype = String(layer.diagramUnderstanding?.archetype || "").toLowerCase();
  const typedDiagram = layer.layerType === "diagram-zone" && /^(matrix-or-grid|comparison-matrix|quadrant-matrix|flow-card-chain|process-chain)$/.test(archetype);
  const screenshot = /screenshot|document|photo|illustration/.test(`${source.detector || ""} ${source.expressionForm || ""} ${source.expressionSubtype || ""}`.toLowerCase());
  return !typedDiagram || screenshot;
}

function hasTargetConcentricCircleEvidence(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const strategy = source.componentRenderStrategy || {};
  const values = [
    layer.templateFamily,
    understanding.templateFamily,
    understanding.archetype,
    understanding.componentStrategy?.templateFamily,
    strategy.templateFamily,
    ...(Array.isArray(understanding.targetMotifs) ? understanding.targetMotifs : []),
    ...(Array.isArray(understanding.componentStrategy?.targetMotifs) ? understanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : [])
  ].map((value) => safeText(value).toLowerCase());
  return values.some((value) => /concentric|onion|nested.?circle|同心圆|洋葱图|圈层|嵌套圆/.test(value));
}

function safeText(value) { return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120); }

function isProtectedFidelityFirstDiagram(source = {}, trustedTemplate = false) {
  if (source.layer?.diagramUnderstanding?.evidence?.nativeGeometryUnverified === true) return true;
  if (trustedTemplate === true) return false;
  const detector = String(source.detector || "").toLowerCase();
  const action = String(source.recommendedAction || source.layer?.recommendedAction || "").toLowerCase();
  const reason = `${source.reason || ""} ${source.nonEditableReason || ""} ${source.explanation || ""}`.toLowerCase();
  return /^(?:sparse-diagram-graphic-underlay-crop|foreground-graphic-crop)$/.test(detector)
    && (/preserve-fidelity-crop|preserve-local-crop/.test(action)
      || /preserved-as-movable-crop|preserving this visual until/.test(reason));
}

module.exports = { isProtectedFidelityFirstDiagram, isSemanticallySplitScreenshotFlowRegion, hasTargetConcentricCircleEvidence };
