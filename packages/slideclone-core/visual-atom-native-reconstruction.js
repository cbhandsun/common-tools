"use strict";
const { annotateVisualAtomComponentShape, finalizeNativeComponentGroupMetadata } = require("./visual-atom-native-metadata");
const { annotateVisualAtomTopology } = require("./visual-atom-topology");
const { createChartZoneNativeShellShapes } = require("./native-chart-shell-shapes");
const { createGanttRoadmapNativeShellShapes } = require("./gantt-native-shell");
const { createRelationshipNativeShell } = require("./relationship-native-shell");
const { inferFallbackVisualAtoms } = require("./visual-atom-fallback");
const { excludeOcrGlyphAtoms, isHandledBySpecializedDiagramRebuilder, mergeUnderstoodAndFallbackVisualAtoms, persistPromotedVisualAtoms, selectVisualAtomNativeCandidates, shouldDropHybridDiagramResidualAfterVisualAtoms, shouldDropSegmentedComparisonMatrixAfterVisualAtoms, shouldDropVisualAtomResidualAfterNativeRebuild, shouldKeepVisualAtomResidualAsOverlayBase, shouldObjectifyVisualAtom, shouldProtectComplexCropFromVisibleVisualAtoms, shouldSupplementWithFallbackVisualAtoms, suppressTrustedDonutDensityFragments, visualAtomNativeBudget } = require("./visual-atom-native-policy");
const { promoteHybridDiagramResidualAtomsToNative, promoteMatrixSolidArrowAtomsToNative } = require("./visual-atom-promotion");
const { shouldDeferNativeRebuildForComponentStrategy } = require("./component-strategy-annotator");
const { visualAtomNativeShape } = require("./visual-atom-native-shapes");
const { hasUnverifiedNativeGeometry } = require("./screenshot-texture-evidence");
const { createSolidAtomSourceFilter } = require("./visual-atom-source-contradiction");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function createVisualAtomNativeShapes(images = [], sourceImage = null, slideSize = DEFAULT_SLIDE, sourceTextBoxes = []) {
  const shapes = [];
  const sourceFilter = sourceImage ? createSolidAtomSourceFilter(sourceImage, slideSize) : null;
  for (const image of images || []) {
    if (hasUnverifiedNativeGeometry(image)) continue;
    if (shouldDeferNativeRebuildForComponentStrategy(image) && !shouldAllowVisualAtomOverlayForDeferredComponent(image)) continue;
    if (isHandledBySpecializedDiagramRebuilder(image)) continue;
    const layer = image?.source?.layer || {};
    const understanding = layer.diagramUnderstanding || {};
    const understoodAtoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
    const nativeUnderstoodAtoms = understoodAtoms.filter((atom) => atom?.nativeCandidate === true);
    const fallbackAtoms = sourceImage && shouldSupplementWithFallbackVisualAtoms(understoodAtoms, nativeUnderstoodAtoms, layer, understanding)
      ? inferFallbackVisualAtoms(image, sourceImage, slideSize, layer, understanding)
      : [];
    const promotedAtoms = promoteMatrixSolidArrowAtomsToNative(
      promoteHybridDiagramResidualAtomsToNative(
        mergeUnderstoodAndFallbackVisualAtoms(understoodAtoms, fallbackAtoms),
        layer,
        understanding
      ),
      layer,
      understanding
    );
    const atoms = excludeOcrGlyphAtoms(suppressTrustedDonutDensityFragments(promotedAtoms, understanding), sourceTextBoxes, slideSize);
    persistPromotedVisualAtoms(image, atoms);
    const relationshipShell = image?.source?.triangleTopologyObjectified === true
      ? null
      : createRelationshipNativeShell(image, atoms, layer, understanding, { sourceImage, slideSize });
    if (relationshipShell?.preserveWhole === true) {
      image.source = {
        ...(image.source || {}),
        visualAtomObjectified: false,
        relationshipShellObjectified: false,
        relationshipShellKind: relationshipShell.shellKind,
        preserveRelationshipAsWhole: true,
        nativeRebuildDeferredReason: relationshipShell.reason,
        dropErasedResidualAfterNativeRebuild: false,
        ...(relationshipShell.protectWhole === true ? {
          intentionalMinimumUnitCrop: true,
          protectedMinimumUnit: true,
          minimumUnitPolicy: "preserve-obvious-visual-asset-crop",
          minimumUnitReason: relationshipShell.reason,
          skipVisualAtomRebuild: true
        } : {})
      };
      continue;
    }
    if (relationshipShell?.shapes?.length > 0) {
      image.source = {
        ...(image.source || {}),
        visualAtomObjectified: true,
        relationshipShellObjectified: true,
        relationshipShellKind: relationshipShell.shellKind,
        objectifiedVisualAtoms: relationshipShell.handledAtomCount,
        objectifiedRelationshipShapes: relationshipShell.shapes.length,
        visualAtomFullyObjectified: relationshipShell.fullyObjectified === true,
        dropErasedResidualAfterNativeRebuild: relationshipShell.fullyObjectified === true
      };
      shapes.push(...finalizeNativeComponentGroupMetadata(
        relationshipShell.shapes.map((shape) => annotateVisualAtomComponentShape(
          shape,
          image,
          { id: shape.source?.atomId || null, kind: shape.source?.atomKind || null },
          understanding
        ))
      ));
      continue;
    }
    const atomBudget = visualAtomNativeBudget(image, layer, understanding, atoms);
    if (atomBudget <= 0) {
      if (shouldProtectComplexCropFromVisibleVisualAtoms(image)) {
        image.source = {
          ...(image.source || {}),
          visualAtomObjectified: false,
          deferredVisualAtomsDueToProtectedComplexCrop: atoms.filter((atom) => atom?.nativeCandidate === true).length,
          nativeRebuildDeferredReason: image.source?.nativeRebuildDeferredReason || "complex crop is preserved as a fidelity image until native replacement can safely remove the source pixels"
        };
      }
      continue;
    }
    const ganttNativeShapes = createGanttRoadmapNativeShellShapes(image, atoms, layer, understanding);
    if (ganttNativeShapes.length > 0) {
      image.source = {
        ...(image.source || {}),
        visualAtomObjectified: true,
        ganttRoadmapObjectified: true,
        objectifiedVisualAtoms: ganttNativeShapes.length,
        nativeVisualAtomBudget: atomBudget,
        nativeVisualAtomCandidates: atoms.filter((atom) => atom?.nativeCandidate === true).length,
        visualAtomSource: fallbackAtoms.length > 0 && understoodAtoms.length > 0
          ? "diagram-understanding-plus-fallback-pixel-segmentation"
          : understoodAtoms.length > 0 ? "diagram-understanding" : "fallback-pixel-segmentation",
        visualAtomFullyObjectified: true,
        dropErasedResidualAfterNativeRebuild: true
      };
      shapes.push(...finalizeNativeComponentGroupMetadata(
        ganttNativeShapes.map((shape) => annotateVisualAtomComponentShape(
          shape,
          image,
          { id: shape.source?.atomId || null, kind: shape.source?.atomKind || null },
          understanding
        ))
      ));
      continue;
    }
    const sourceRejections = [];
    const nativeAtoms = atoms
      .filter((atom) => atom?.nativeCandidate === true)
      .filter((atom) => shouldObjectifyVisualAtom(atom, layer, understanding, atoms))
      .filter((atom) => {
        const evidence = sourceFilter?.inspect(atom);
        if (evidence?.retained === false) { sourceRejections.push({ atomId: atom.id, ...evidence }); return false; }
        return true;
      });
    if (sourceRejections.length) image.source = { ...image.source, solidAtomSourceContradictions: sourceRejections,
      visualAtomFullyObjectified: false, dropErasedResidualAfterNativeRebuild: false };
    const selectedNativeAtoms = selectVisualAtomNativeCandidates(nativeAtoms, image, layer, understanding, atomBudget);
    if (selectedNativeAtoms.length === 0) continue;
    const chartNativeShapes = createChartZoneNativeShellShapes(image, selectedNativeAtoms, layer, understanding);
    if (chartNativeShapes.length > 0) {
      image.source = {
        ...(image.source || {}),
        visualAtomObjectified: true,
        chartZoneObjectified: true,
        objectifiedVisualAtoms: chartNativeShapes.length,
        objectifiedChartAtoms: chartNativeShapes.length,
        nativeVisualAtomBudget: atomBudget,
        nativeVisualAtomCandidates: atoms.filter((atom) => atom?.nativeCandidate === true).length,
        visualAtomSource: fallbackAtoms.length > 0 && understoodAtoms.length > 0
          ? "diagram-understanding-plus-fallback-pixel-segmentation"
          : understoodAtoms.length > 0 ? "diagram-understanding" : "fallback-pixel-segmentation",
        visualAtomFullyObjectified: sourceRejections.length === 0,
        dropErasedResidualAfterNativeRebuild: sourceRejections.length === 0
      };
      shapes.push(...finalizeNativeComponentGroupMetadata(
        chartNativeShapes.map((shape) => annotateVisualAtomComponentShape(shape, image, { id: shape.source?.atomId || null }, understanding))
      ));
      continue;
    }
    const dropSegmentedComparisonMatrix = shouldDropSegmentedComparisonMatrixAfterVisualAtoms(image, atoms, selectedNativeAtoms);
    const dropVisualAtomResidual = sourceRejections.length === 0 && (shouldDropVisualAtomResidualAfterNativeRebuild(image, layer, understanding, atoms, nativeAtoms)
      || shouldDropHybridDiagramResidualAfterVisualAtoms(image, layer, understanding, atoms, selectedNativeAtoms));
    const overlayOnly = shouldKeepVisualAtomResidualAsOverlayBase(image, layer, understanding) && !dropVisualAtomResidual;
    const topologyNativeAtoms = annotateVisualAtomTopology(selectedNativeAtoms);
    const emittedNativeAtoms = overlayOnly ? [] : topologyNativeAtoms;
    image.source = {
      ...(image.source || {}),
      visualAtomObjectified: emittedNativeAtoms.length > 0,
      ...(overlayOnly ? { visualAtomOverlayOnly: true } : {}),
      objectifiedVisualAtoms: emittedNativeAtoms.length,
      ...(overlayOnly ? { deferredVisualAtomsDueToResidualOverlay: nativeAtoms.length } : {}),
      nativeVisualAtomBudget: atomBudget,
      nativeVisualAtomCandidates: atoms.filter((atom) => atom?.nativeCandidate === true).length,
      visualAtomSource: fallbackAtoms.length > 0 && understoodAtoms.length > 0
        ? "diagram-understanding-plus-fallback-pixel-segmentation"
        : understoodAtoms.length > 0 ? "diagram-understanding" : "fallback-pixel-segmentation",
      visualAtomFullyObjectified: overlayOnly ? false : dropVisualAtomResidual,
      dropErasedResidualAfterNativeRebuild: sourceRejections.length === 0 && (image.source?.dropErasedResidualAfterNativeRebuild
        || dropSegmentedComparisonMatrix
        || (!overlayOnly && dropVisualAtomResidual))
    };
    const emittedShapes = [];
    let admittedAtoms=0;
    for (let index = 0; index < emittedNativeAtoms.length; index += 1) {
      const atom = emittedNativeAtoms[index];
      const shape = visualAtomNativeShape(image, atom, index, understanding);
      const proposed=Array.isArray(shape)?shape.filter(Boolean):shape?[shape]:[];
      const contradicted=proposed.map(item=>sourceFilter?.inspectShape(item)).filter(result=>result?.retained===false);
      if(contradicted.length){
        sourceRejections.push(...contradicted.map(result=>({atomId:atom.id,...result})));
        image.source={...image.source,solidAtomSourceContradictions:sourceRejections,
          visualAtomFullyObjectified:false,dropErasedResidualAfterNativeRebuild:false};
        continue;
      }
      const annotated = Array.isArray(shape)
        ? shape.filter(Boolean).map((item) => annotateVisualAtomComponentShape(item, image, atom, understanding))
        : shape ? [annotateVisualAtomComponentShape(shape, image, atom, understanding)] : [];
      emittedShapes.push(...annotated);
      if(annotated.length)admittedAtoms++;
    }
    image.source={...image.source,visualAtomObjectified:admittedAtoms>0,objectifiedVisualAtoms:admittedAtoms};
    shapes.push(...finalizeNativeComponentGroupMetadata(emittedShapes));
  }
  return shapes;
}

function shouldAllowVisualAtomOverlayForDeferredComponent(image = {}) {
  if (shouldRebuildSemanticSplitVisualAtoms(image)) return true;
  const strategy = image?.source?.componentRenderStrategy || image?.source?.layer?.componentRenderStrategy || {};
  const mode = String(strategy.mode || "");
  if (mode === "preserve-crop-with-native-overlays") return true;
  if (mode !== "plugin-component-template") return false;
  const plan = strategy.applicationPlan || {};
  const candidate = strategy.bestCandidate || {};
  if (plan.requiresDownload !== true && candidate.downloadable === true) return false;
  const detector = String(image?.source?.detector || "").toLowerCase();
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || image?.source?.diagramUnderstanding || {};
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  if (String(understanding.archetype || "") === "funnel-lens-flow") {
    const measuredShell = createRelationshipNativeShell(image, atoms, layer, understanding);
    if (measuredShell?.fullyObjectified === true && measuredShell?.shellKind === "funnel-lens-flow") return true;
  }
  const gridLineCount = atoms.filter((atom) => atom?.kind === "grid-line-candidate" && atom?.nativeCandidate === true).length;
  return detector === "line-diagram-graphic-underlay-crop"
    && String(layer.layerType || "") === "diagram-zone"
    && gridLineCount >= 6
    && atoms.every((atom) => atom?.residualCandidate !== true);
}

function shouldRebuildSemanticSplitVisualAtoms(image = {}) {
  const source = image?.source || {};
  if (source.semanticSplitOwnsLayer !== true) return false;
  if (source.componentTemplateGroupApplied === true || Number(source.componentTemplateNativeShapes || 0) > 0) return false;
  const layer = source.layer || {};
  const action = String(layer.recommendedAction || source.recommendedAction || "");
  if (action !== "split-native-with-residual-crop" && action !== "attempt-native-reconstruction") return false;
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  const nativeAtoms = atoms.filter((atom) => atom?.nativeCandidate === true && atom?.box);
  if (nativeAtoms.length < 2) return false;
  const detector = String(source.detector || "").toLowerCase();
  return /mixed-diagram|semantic-residual|graphic-underlay|diagram/.test(detector)
    || String(layer.layerType || "") === "diagram-zone";
}

module.exports = { createVisualAtomNativeShapes, shouldAllowVisualAtomOverlayForDeferredComponent, shouldRebuildSemanticSplitVisualAtoms };
