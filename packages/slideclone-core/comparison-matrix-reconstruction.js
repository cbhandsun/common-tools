"use strict";
const { comparisonMatrixSegmentNativeTextBoxes, comparisonMatrixTextKey, maybeEraseSegmentedComparisonMatrixText, visibleComparisonMatrixTextBox, comparisonMatrixInternalTextBoxes } = require("./comparison-matrix-text");
const { inferComparisonMatrix, inferComparisonMatrixSkeletonShapes, shouldObjectifyComparisonMatrixFromLayoutFallback } = require("./comparison-matrix-layout");
const { inferStructuredCaseFlowCardChainShapes, inferStructuredCaseHubSpokeSkeletonShapes, inferStructuredCaseMatrixSkeletonShapes, shouldObjectifyCycleIllustrationComparisonMatrix, shouldObjectifyStructuredCaseFlowCardChain, shouldObjectifyStructuredCaseHubSpokeSkeleton, shouldObjectifyStructuredCaseMatrixSkeleton, structuredCaseFlowCardChainTextBoxes, structuredCaseHubSpokeSemanticTextBoxes, structuredCaseMatrixSemanticTextBoxes } = require("./structured-case-matrix-reconstruction");
const { comparisonMatrixVisualAtoms } = require("./comparison-matrix-evidence");
const { boxCenterInside, expandPtBox } = require("./raster-native-detection");
const { normalizeMatrixLabel } = require("./diagram-label-matching");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function createComparisonMatrixShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {
  const shapes = [];
  for (const image of images || []) {
    if (sourceImage && shouldObjectifySegmentedComparisonMatrixText(image, textBoxes)) {
      const nativeTextBoxes = comparisonMatrixSegmentNativeTextBoxes(image, textBoxes);
      if (nativeTextBoxes.length > 0) {
        const visibleTextBoxes = maybeEraseSegmentedComparisonMatrixText({
          image,
          textBoxes: nativeTextBoxes,
          sourceImage,
          slideSize,
          irDir
        });
        const visibleKeys = new Set(visibleTextBoxes.map(comparisonMatrixTextKey));
        image.source = {
          ...(image.source || {}),
          comparisonMatrixTextObjectified: true,
          comparisonMatrixVisibleTextObjectified: visibleTextBoxes.length > 0,
          comparisonMatrixFullyObjectified: shouldDropSegmentedComparisonMatrixResidual(image, nativeTextBoxes, visibleTextBoxes),
          comparisonMatrixNativeTextBoxes: nativeTextBoxes.map((item) =>
            visibleKeys.has(comparisonMatrixTextKey(item))
              ? visibleComparisonMatrixTextBox(item, image)
              : item),
          objectifiedComparisonTextBoxes: nativeTextBoxes.length,
          objectifiedComparisonVisibleTextBoxes: visibleTextBoxes.length,
          objectifiedComparisonVisualAtoms: comparisonMatrixNativeVisualAtoms(image).length,
          dropErasedResidualAfterNativeRebuild: shouldDropSegmentedComparisonMatrixResidual(image, nativeTextBoxes, visibleTextBoxes)
            ? true
            : image.source?.dropErasedResidualAfterNativeRebuild,
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "comparison matrix"}; OCR matrix labels ${visibleTextBoxes.length > 0 ? "partially erased from crop and rebuilt as visible native text" : "preserved as hidden editable text over the fidelity crop"}`
        };
      }
      continue;
    }
    if (shouldObjectifyComparisonMatrixSkeleton(image)) {
      const skeletonShapes = inferComparisonMatrixSkeletonShapes(image);
      if (skeletonShapes.length > 0) {
        image.source = {
          ...(image.source || {}),
          comparisonMatrixSkeletonObjectified: true,
          visualAtomOverlayOnly: true,
          objectifiedComparisonMatrixSkeletonShapes: skeletonShapes.length,
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "comparison matrix"}; comparison matrix structure rebuilt as native skeleton overlays while preserving the source crop`
        };
        shapes.push(...skeletonShapes);
      }
      continue;
    }
    if (shouldObjectifyStructuredCaseMatrixSkeleton(image)) {
      const skeletonShapes = inferStructuredCaseMatrixSkeletonShapes(image);
      const nativeTextBoxes = structuredCaseMatrixSemanticTextBoxes(image);
      if (skeletonShapes.length > 0 || nativeTextBoxes.length > 0) {
        image.source = {
          ...(image.source || {}),
          structuredCaseMatrixSkeletonObjectified: skeletonShapes.length > 0,
          structuredCaseMatrixTextObjectified: nativeTextBoxes.length > 0,
          visualAtomOverlayOnly: true,
          comparisonMatrixNativeTextBoxes: nativeTextBoxes,
          structuredCaseMatrixNativeTextBoxes: nativeTextBoxes,
          objectifiedStructuredCaseMatrixSkeletonShapes: skeletonShapes.length,
          objectifiedStructuredCaseMatrixTextBoxes: nativeTextBoxes.length,
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "structured case matrix"}; structured case matrix rebuilt as native grid skeleton and editable semantic labels while preserving complex icon residuals`
        };
        shapes.push(...skeletonShapes);
      }
      continue;
    }
    if (shouldObjectifyCycleIllustrationComparisonMatrix(image)) {
      const skeletonShapes = inferCycleIllustrationComparisonMatrixShapes(image);
      const nativeTextBoxes = cycleIllustrationComparisonMatrixTextBoxes(image);
      if (skeletonShapes.length > 0 || nativeTextBoxes.length > 0) {
        image.source = {
          ...(image.source || {}),
          cycleIllustrationComparisonMatrixObjectified: skeletonShapes.length > 0,
          cycleIllustrationComparisonMatrixTextObjectified: nativeTextBoxes.length > 0,
          visualAtomOverlayOnly: true,
          comparisonMatrixNativeTextBoxes: nativeTextBoxes,
          cycleIllustrationComparisonMatrixNativeTextBoxes: nativeTextBoxes,
          objectifiedCycleIllustrationComparisonMatrixShapes: skeletonShapes.length,
          objectifiedCycleIllustrationComparisonMatrixTextBoxes: nativeTextBoxes.length,
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "cycle illustration"}; grid-like comparison matrix misclassified as illustration rebuilt as native matrix skeleton and editable semantic labels while preserving residual icons`
        };
        shapes.push(...skeletonShapes);
      }
      continue;
    }
    if (shouldObjectifyStructuredCaseHubSpokeSkeleton(image)) {
      const skeletonShapes = inferStructuredCaseHubSpokeSkeletonShapes(image);
      const nativeTextBoxes = structuredCaseHubSpokeSemanticTextBoxes(image);
      if (skeletonShapes.length > 0 || nativeTextBoxes.length > 0) {
        image.source = {
          ...(image.source || {}),
          structuredCaseHubSpokeSkeletonObjectified: skeletonShapes.length > 0,
          structuredCaseHubSpokeTextObjectified: nativeTextBoxes.length > 0,
          visualAtomOverlayOnly: true,
          comparisonMatrixNativeTextBoxes: nativeTextBoxes,
          structuredCaseHubSpokeNativeTextBoxes: nativeTextBoxes,
          objectifiedStructuredCaseHubSpokeSkeletonShapes: skeletonShapes.length,
          objectifiedStructuredCaseHubSpokeTextBoxes: nativeTextBoxes.length,
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "structured case hub-spoke"}; structured case hub-spoke diagram rebuilt as native node cards, connectors, and editable semantic labels while preserving complex residual icons`
        };
        shapes.push(...skeletonShapes);
      }
      continue;
    }
    if (shouldObjectifyStructuredCaseFlowCardChain(image)) {
      const skeletonShapes = inferStructuredCaseFlowCardChainShapes(image);
      const nativeTextBoxes = structuredCaseFlowCardChainTextBoxes(image);
      if (skeletonShapes.length > 0 || nativeTextBoxes.length > 0) {
        image.source = {
          ...(image.source || {}),
          structuredCaseFlowCardChainObjectified: skeletonShapes.length > 0,
          structuredCaseFlowCardChainTextObjectified: nativeTextBoxes.length > 0,
          visualAtomOverlayOnly: true,
          comparisonMatrixNativeTextBoxes: nativeTextBoxes,
          structuredCaseFlowCardChainNativeTextBoxes: nativeTextBoxes,
          objectifiedStructuredCaseFlowCardChainShapes: skeletonShapes.length,
          objectifiedStructuredCaseFlowCardChainTextBoxes: nativeTextBoxes.length,
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "structured case flow-card chain"}; structured case flow-card chain rebuilt as native cards, rails, connectors, and editable semantic labels while preserving complex residual icons`
        };
        shapes.push(...skeletonShapes);
      }
      continue;
    }
    if (shouldObjectifyMatrixResidualSkeleton(image)) {
      const skeletonShapes = inferMatrixResidualSkeletonShapes(image);
      if (skeletonShapes.length > 0) {
        image.source = {
          ...(image.source || {}),
          matrixResidualSkeletonObjectified: true,
          visualAtomOverlayOnly: true,
          objectifiedMatrixResidualSkeletonShapes: skeletonShapes.length,
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "matrix residual"}; matrix residual structure rebuilt as native skeleton overlays while preserving the source crop`
        };
        shapes.push(...skeletonShapes);
      }
      continue;
    }
    if (!shouldObjectifyComparisonMatrix(image, textBoxes)) continue;
    const matrix = inferComparisonMatrix(image, textBoxes, slideSize);
    if (!matrix) continue;
    image.source = {
      ...(image.source || {}),
      comparisonMatrixObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      comparisonMatrixNativeTextBoxes: matrix.textBoxes,
      objectifiedComparisonGridLines: matrix.gridLines.length,
      objectifiedComparisonStatusIcons: matrix.statusShapes.length,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "comparison matrix"}; rebuilt matrix grid, labels, and status icons natively`
    };
    shapes.push(...matrix.gridLines.map((line, index) => ({
      id: `${image.id || "comparison-matrix"}-grid-line-${index}`,
      type: "line",
      box: line.box,
      style: {
        stroke: line.stroke,
        strokeWidthPt: line.strokeWidthPt,
        connectorType: "straight"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "comparison-matrix-native-grid-line",
        layerSourceId: image.id || null
      }
    })));
    shapes.push(...matrix.statusShapes.map((shape, index) => ({
      id: `${image.id || "comparison-matrix"}-status-${index}`,
      ...shape,
      source: {
        editable: true,
        nativeRebuild: true,
        detector: shape.detector,
        layerSourceId: image.id || null,
        statusKind: shape.statusKind
      }
    })));
  }
  return shapes;
}

function inferCycleIllustrationComparisonMatrixShapes(image = {}) {
  return inferStructuredCaseMatrixSkeletonShapes(image).map((shape) => ({
    ...shape,
    id: String(shape.id || "").replace("structured-case-matrix", "cycle-illustration-comparison-matrix"),
    source: {
      ...(shape.source || {}),
      detector: String(shape.source?.detector || "").replace("structured-case-matrix-native-skeleton", "cycle-illustration-comparison-matrix-native-skeleton"),
      expressionSubtype: "cycle-illustration-comparison-matrix",
      layerType: image?.source?.layer?.layerType || "illustration-zone"
    }
  }));
}

function cycleIllustrationComparisonMatrixTextBoxes(image = {}) {
  return structuredCaseMatrixSemanticTextBoxes(image).map((textBox) => ({
    ...textBox,
    id: String(textBox.id || "").replace("structured-case-matrix", "cycle-illustration-comparison-matrix"),
    source: {
      ...(textBox.source || {}),
      detector: "cycle-illustration-comparison-matrix-semantic-node-text",
      expressionSubtype: "cycle-illustration-comparison-matrix",
      layerType: image?.source?.layer?.layerType || "illustration-zone"
    }
  }));
}

function shouldObjectifyMatrixResidualSkeleton(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const box = image?.box || {};
  if (!/^(?:split-erased-residual-crop|split-table-grid-residual-crop|split-wide-residual-crop|sparse-diagram-graphic-underlay-crop)$/.test(String(source.detector || ""))) return false;
  if (layer.layerType !== "table-zone" && understanding.archetype !== "matrix-or-grid") return false;
  if (/screenshot|document|prototype|ui/.test(String(source.expressionForm || source.expressionSubtype || ""))) return false;
  if (!box.w || !box.h || Number(box.w) < 220 || Number(box.h) < 140) return false;
  const atoms = comparisonMatrixVisualAtoms(image);
  const gridAtoms = atoms.filter((atom) => /grid-line-candidate|connector-line-candidate/.test(String(atom?.kind || ""))).length;
  return gridAtoms >= 3 || Number(understanding.nodeCount || 0) >= 5 || Number(understanding.confidence || 0) >= 0.84;
}

function inferMatrixResidualSkeletonShapes(image = {}) {
  return inferComparisonMatrixSkeletonShapes(image).map((shape) => ({
    ...shape,
    id: String(shape.id || "").replace("comparison-matrix", "matrix-residual"),
    source: {
      ...(shape.source || {}),
      detector: String(shape.source?.detector || "").replace("comparison-matrix-native-skeleton", "matrix-residual-native-skeleton"),
      expressionSubtype: "matrix-residual-grid"
    }
  }));
}

function shouldObjectifyComparisonMatrixSkeleton(image = {}) {
  const source = image?.source || {};
  const box = image?.box || {};
  if (source.detector !== "comparison-matrix-crop") return false;
  if (!box.w || !box.h || Number(box.w) < 220 || Number(box.h) < 220) return false;
  if (source.comparisonMatrixTextObjectified === true || source.comparisonMatrixObjectified === true) return false;
  return source.expressionSubtype === "comparison-matrix"
    || source.componentTemplateGroupApplied === true
    || source.componentTemplateFamilyApplied === "matrix"
    || source.layer?.layerType === "table-zone";
}

function shouldDropSegmentedComparisonMatrixResidual(image, nativeTextBoxes = [], visibleTextBoxes = []) {
  if (image?.source?.detector !== "comparison-matrix-crop") return false;
  if (nativeTextBoxes.length < 4 || visibleTextBoxes.length !== nativeTextBoxes.length) return false;
  const nativeAtoms = comparisonMatrixNativeVisualAtoms(image);
  const fillAtoms = nativeAtoms.filter((atom) =>
    /^native-(?:rect|document|ellipse)-candidate$/.test(String(atom?.kind || "")));
  const lineAtoms = nativeAtoms.filter((atom) =>
    /^(?:connector-line|grid-line)-candidate$/.test(String(atom?.kind || "")));
  const residualAtoms = comparisonMatrixVisualAtoms(image).filter((atom) => atom?.residualCandidate === true);
  return nativeAtoms.length >= 6
    && fillAtoms.length >= 2
    && lineAtoms.length >= 1
    && residualAtoms.length === 0;
}

function comparisonMatrixNativeVisualAtoms(image) {
  return comparisonMatrixVisualAtoms(image).filter((atom) =>
    atom?.nativeCandidate === true && atom?.residualCandidate !== true);
}

function shouldObjectifySegmentedComparisonMatrixText(image, textBoxes = []) {
  const source = image?.source || {};
  const box = image?.box || {};
  if (source.detector !== "comparison-matrix-crop") return false;
  if (!box.w || !box.h || Number(box.w) < 220 || Number(box.h) < 240) return false;
  const internal = comparisonMatrixInternalTextBoxes(image, textBoxes);
  if (internal.length < 3) return false;
  const labels = internal.map((item) => normalizeMatrixLabel(item.text)).filter(Boolean);
  const hasHeader = labels.some((label) => /传统工作方式|普通AI工具|PM\s*Portal\s*AI\s*Skills|PM\s*Portal\s*Skills|PMPortal/.test(label));
  const hasRows = labels.filter((label) => /场景理解|流程引擎|质量控制|资产沉淀|人工翻阅|上下文|域仓|PRD|评审|拦截|落盘/.test(label)).length;
  return hasHeader || hasRows >= 2;
}

function shouldObjectifyComparisonMatrix(image, textBoxes = []) {
  const box = image?.box || {};
  if (image?.source?.detector !== "cycle-illustration-underlay-crop") return false;
  if (!box.w || !box.h || box.w < 760 || box.h < 300) return false;
  if (shouldObjectifyComparisonMatrixFromLayoutFallback(image, textBoxes)) return true;
  const labels = new Set((textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, DEFAULT_SLIDE, 10, 10)))
    .map((item) => normalizeMatrixLabel(item.text)));
  const required = [
    "传统手工推进",
    "普通对话式AI",
    "上下文感知",
    "质量校验与拦截",
    "资产落盘"
  ];
  return required.every((label) => labels.has(label))
    && [...labels].some((label) => /PM\s*Portal\s*Skills|PMPortalSkills/.test(label));
}

module.exports = { createComparisonMatrixShapes, comparisonMatrixNativeVisualAtoms, cycleIllustrationComparisonMatrixTextBoxes, inferCycleIllustrationComparisonMatrixShapes, inferMatrixResidualSkeletonShapes, shouldDropSegmentedComparisonMatrixResidual, shouldObjectifyComparisonMatrix, shouldObjectifyComparisonMatrixSkeleton, shouldObjectifyMatrixResidualSkeleton, shouldObjectifySegmentedComparisonMatrixText };
