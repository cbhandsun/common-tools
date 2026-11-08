"use strict";

const { createMissingBlobComponentCollector, missingBlobTargetTouchesText } = require("../slideclone-core/archetypes/missing-blob-components");
const { brightness, clampUnit, colorHexDistance, dominantColor, hexColor, isFiniteBox, pixelColor, rgbToHex, round, saturationProxy } = require('./worker-primitives');
const { traceSparseConnectorContours, estimateSparseConnectorInkColor } = require("../slideclone-core/routing/sparse-connector-contours");
const { averageBand, averagePoint, convexHull, curveBundleArea, isFiniteVisualAtomShapeBox, isLineLikeVisualAtom, isMissingNativeBlobForeground, isReliableMissingNativeVisualAtom, isSparseCurveEvidence, maxBy, minBy, missingNativeCurveFreeformShape, missingNativeSingleDiagonalShape, missingNativeTargetDiagonalShapes, missingNativeVisualAtomOpenCurveShape, nativeOnlyMissingNativeTargetBudgets, normalizedVisualAtomColor, sampleMissingNativeLineColor, similarVisualAtomColor, simplifyHullPoints, visualAtomMissingInRendered } = require('./worker-missing-graphics');
const { createNativeOnlyMissingRefiner } = require("./native-only-refinement");
const { qualityRendered } = require("./worker-output-services");
const { validateDeckIr } = require("./worker-input-services");
const { boxDominantOrientation, boxesNear, changedComponentKeysFromFit, expandPtBox, intersectPtBoxes, lineBoxesHaveGaps, nativeOnlyRefinementImproves, ptBoxOverlapArea, unionManyPtBoxes, unionPtBoxes } = require('./worker-job-support');
const { nativeOnlySemanticChecksPass, sharedWorstComponentRegression, shouldPreserveMissingNativeLineAtom, targetMissingNativeComponentQualityImproves } = require('./worker-quality-policy');
const { readPng } = require("./worker-input-services");
const { extractVisualAtoms } = require("../slideclone-core/scene-plan/visual-atoms");
const { sourceComponentFidelityPrimitiveRuns } = require('./worker-graphic-evidence-2');
const { medianLineThickness } = require('./worker-graphic-evidence');
const { visualAtomNativeShape } = require("../slideclone-core/scene-plan/visual-atom-native-shapes");

const connectedMissingNativeBlobComponents = createMissingBlobComponentCollector({
  summarizeColor: (colors,density) => rgbToHex((density <= 0.18 ? estimateSparseConnectorInkColor(colors) : dominantColor(colors)) || colors[0]),
  describeGeometry: (pixels,bounds,density) => ({
    points: simplifyHullPoints(convexHull(pixels.map(pixel => ({x:(pixel.x-bounds.x)/Math.max(1,bounds.w-1),y:(pixel.y-bounds.y)/Math.max(1,bounds.h-1)}))),18)
      .map(point=>({x:round(Math.max(0,Math.min(1,point.x))),y:round(Math.max(0,Math.min(1,point.y)))})),
    curve: sparseCurveControlPoints(pixels,bounds.x,bounds.y,bounds.w,bounds.h),
    connectorContour: density<=0.18 ? traceSparseConnectorContours(pixels,bounds) : null
  })
});

const refineNativeOnlyResidualCandidateMissingNativeLines = createNativeOnlyMissingRefiner({ qualityRendered, fitDeckMissingNativeVisualAtomShapes, nativeOnlyMissingNativeTargetBudgets, validateDeckIr, changedComponentKeysFromFit, nativeOnlyRefinementImproves, targetMissingNativeComponentQualityImproves, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlySemanticChecksPass });

function fitDeckMissingNativeVisualAtomShapes(deck, options = {}) {
  if (options.repairMode !== undefined && !["all", "curves-only", "diagonals-only"].includes(options.repairMode)) {
    throw new TypeError("Invalid missing native repair mode");
  }
  const curvesOnly = options.repairMode === "curves-only";
  const diagonalsOnly = options.repairMode === "diagonals-only";
  const next = structuredClone(deck);
  const sourceImages = Array.isArray(options.sourceImages) ? options.sourceImages : [];
  const renderedImages = Array.isArray(options.renderedImages) ? options.renderedImages : [];
  const maximumTargets = Number.isSafeInteger(options.maximumTargets) && options.maximumTargets > 0 ? Math.min(options.maximumTargets, 40) : 24;
  const maximumAtoms = Number.isSafeInteger(options.maximumAtoms) && options.maximumAtoms > 0 ? Math.min(options.maximumAtoms, 120) : 48;
  const paddingPt = Number.isFinite(Number(options.paddingPt)) ? Math.max(0, Math.min(40, Number(options.paddingPt))) : 8;
  const targets = collectMissingNativeVisualAtomTargets(next, options.visualQuality, maximumTargets, {
    cluster: options.clusterMissingTargets !== false
  });
  const loaded = new Map();
  let addedShapes = 0; let candidateTargets = 0; let candidateAtoms = 0;
  const changedComponentKeys = [];
  const usedObjectIds = new Set((Array.isArray(next?.pages) ? next.pages : []).flatMap(page =>
    [page.shapes, page.images, page.textBoxes, page.icons, page.tables, page.charts].flatMap(items =>
      (Array.isArray(items) ? items : []).map(item => item?.id).filter(id => typeof id === "string"))));
  function generatedMissingId(preferred) {
    let id = preferred, suffix = 1;
    while (usedObjectIds.has(id)) {
      if (suffix > 10000) throw new RangeError("missing native object identity limit exceeded");
      id = `${preferred}-r${suffix++}`;
    }
    usedObjectIds.add(id);
    return id;
  }
  function pageImage(pageIndex) {
    if (loaded.has(pageIndex)) return loaded.get(pageIndex);
    const sourceFile = sourceImages[pageIndex];
    if (!sourceFile) return null;
    const image = {
      source: readPng(sourceFile),
      rendered: renderedImages[pageIndex] ? readPng(renderedImages[pageIndex]) : null
    };
    loaded.set(pageIndex, image);
    return image;
  }
  for (const target of targets) {
    if (candidateAtoms >= maximumAtoms) break;
    const page = next.pages[target.pageIndex];
    const images = pageImage(target.pageIndex);
    const source = images?.source;
    if (!page || !source || !next.slideSize) continue;
    page.shapes = Array.isArray(page.shapes) ? page.shapes : [];
    let emittedForTarget = 0;
    const targetLineBundle = curvesOnly || diagonalsOnly ? null : missingNativeTargetLineBundle(target, source, next.slideSize);
    const targetInkRuns = maximumTargets === 1 && targetLineBundle?.source?.detector === "missing-native-oval-component"
      ? missingNativeTargetInkRunShapes(target, source, next.slideSize, images?.rendered, Math.min(16, Math.max(0, maximumAtoms - candidateAtoms)))
      : [];
    const targetSinglePrimitiveShapes = diagonalsOnly ? missingNativeTargetDiagonalShapes(target, source, next.slideSize)
      : curvesOnly || targetLineBundle ? [] : missingNativeTargetSinglePrimitiveShapes(target, source, next.slideSize);
    const targetSinglePrimitiveInkRuns = maximumTargets === 1 && images?.rendered
      && targetSinglePrimitiveShapes.some((shape) => shape?.source?.detector === "missing-native-oval-component")
      ? missingNativeTargetInkRunShapes(target, source, next.slideSize, images.rendered, Math.min(16, Math.max(0, maximumAtoms - candidateAtoms)))
      : [];
    if (targetInkRuns.length > 0) {
      for (const inkRunShape of targetInkRuns) {
        if (candidateAtoms >= maximumAtoms) break;
        page.shapes.push({
          ...inkRunShape,
          id: generatedMissingId(`missing-native-ink-run-component-${target.pageIndex + 1}-${addedShapes + 1}`)
        });
        addedShapes += 1;
        emittedForTarget += 1;
        candidateAtoms += 1;
        const ids = Array.isArray(inkRunShape.source?.sourceMissingNativeComponentIds) ? inkRunShape.source.sourceMissingNativeComponentIds : [target.id];
        for (const id of ids) {
          if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
        }
      }
      candidateTargets += 1;
      continue;
    }
    if (targetSinglePrimitiveInkRuns.length > 0) {
      for (const inkRunShape of targetSinglePrimitiveInkRuns) {
        if (candidateAtoms >= maximumAtoms) break;
        page.shapes.push({
          ...inkRunShape,
          id: generatedMissingId(`missing-native-ink-run-component-${target.pageIndex + 1}-${addedShapes + 1}`)
        });
        addedShapes += 1;
        emittedForTarget += 1;
        candidateAtoms += 1;
        const ids = Array.isArray(inkRunShape.source?.sourceMissingNativeComponentIds) ? inkRunShape.source.sourceMissingNativeComponentIds : [target.id];
        for (const id of ids) {
          if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
        }
      }
      candidateTargets += 1;
      continue;
    }
    for (const primitiveShape of targetSinglePrimitiveShapes) {
      if (candidateAtoms >= maximumAtoms) break;
      page.shapes.push({
        ...primitiveShape,
        id: generatedMissingId(`missing-native-single-primitive-${target.pageIndex + 1}-${addedShapes + 1}`)
      });
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += 1;
      const ids = Array.isArray(primitiveShape.source?.sourceMissingNativeComponentIds) ? primitiveShape.source.sourceMissingNativeComponentIds : [target.id];
      for (const id of ids) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
    }
    if (emittedForTarget > 0) {
      candidateTargets += 1;
      continue;
    }
    if (diagonalsOnly) continue;
    if (targetLineBundle && candidateAtoms < maximumAtoms) {
      page.shapes.push({
        ...targetLineBundle,
        id: generatedMissingId(`missing-native-line-bundle-${target.pageIndex + 1}-${addedShapes + 1}`)
      });
      addedShapes += 1;
      candidateTargets += 1;
      candidateAtoms += Math.max(1, Number(targetLineBundle.source?.bundledVisualAtomCount || 1));
      const sourceIds = Array.isArray(target.sourceIds) && target.sourceIds.length > 0 ? target.sourceIds : [target.id];
      for (const id of sourceIds) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
      continue;
    }
    for (const ovalShape of curvesOnly ? [] : missingNativeTargetOvalShapes(target, source, next.slideSize)) {
      if (candidateAtoms >= maximumAtoms) break;
      page.shapes.push({
        ...ovalShape,
        id: generatedMissingId(`missing-native-oval-component-${target.pageIndex + 1}-${addedShapes + 1}`)
      });
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += 1;
      const ids = Array.isArray(ovalShape.source?.sourceMissingNativeComponentIds) ? ovalShape.source.sourceMissingNativeComponentIds : [target.id];
      for (const id of ids) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
    }
    for (const curveShape of missingNativeTargetCurveShapes(target, source, next.slideSize, images?.rendered)) {
      if (candidateAtoms >= maximumAtoms) break;
      page.shapes.push({
        ...curveShape,
        id: generatedMissingId(`missing-native-curve-component-${target.pageIndex + 1}-${addedShapes + 1}`)
      });
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += 1;
      const ids = Array.isArray(curveShape.source?.sourceMissingNativeComponentIds) ? curveShape.source.sourceMissingNativeComponentIds : [target.id];
      for (const id of ids) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
    }
    if (emittedForTarget > 0) {
      candidateTargets += 1;
      continue;
    }
    if (curvesOnly) continue;
    for (const blobShape of missingNativeTargetBlobShapes(target, source, next.slideSize, images?.rendered)) {
      if (candidateAtoms >= maximumAtoms) break;
      page.shapes.push({
        ...blobShape,
        id: generatedMissingId(`missing-native-blob-component-${target.pageIndex + 1}-${addedShapes + 1}`)
      });
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += 1;
      const ids = Array.isArray(blobShape.source?.sourceMissingNativeComponentIds) ? blobShape.source.sourceMissingNativeComponentIds : [target.id];
      for (const id of ids) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
    }
    if (emittedForTarget > 0) {
      candidateTargets += 1;
      continue;
    }
    const searchBox = expandPtBox(target.box, paddingPt, next.slideSize);
    const atoms = extractVisualAtoms(source, searchBox, next.slideSize, {
      maxAtoms: Math.max(4, Math.min(20, maximumAtoms - candidateAtoms)),
      textBoxes: Array.isArray(page.textBoxes) ? page.textBoxes : []
    })
      .filter((atom) => atom?.nativeCandidate === true && atom?.residualCandidate !== true && isFiniteBox(atom.box))
      .filter(isReliableMissingNativeVisualAtom)
      .filter((atom) => !images?.rendered || visualAtomMissingInRendered(atom, source, images.rendered, next.slideSize))
      .filter((atom) => options.constrainAtomsToTargetBox === false || visualAtomOverlapsMissingTarget(atom, target.box));
    if (atoms.length < 1) continue;
    const sourceLayer = {
      id: target.id,
      source: {
        layer: {
          layerType: "diagram-zone",
          diagramUnderstanding: {
            archetype: "missing-native-component",
            visualAtoms: atoms
          }
        }
      }
    };
    const curveBundles = missingNativeVisualAtomCurveBundles(atoms, target);
    const lineBundles = missingNativeVisualAtomLineBundles(atoms, target);
    const bundledAtomIds = new Set();
    for (const bundle of curveBundles) {
      if (candidateAtoms >= maximumAtoms) break;
      page.shapes.push({
        ...bundle.shape,
        id: generatedMissingId(`missing-native-curve-bundle-${target.pageIndex + 1}-${addedShapes + 1}`),
        source: {
          ...(bundle.shape.source || {}),
          missingNativeComponentId: target.id,
          sourceMissingNativeComponentIds: [...(target.sourceIds || [target.id])]
        }
      });
      for (const atomId of bundle.atomIds) bundledAtomIds.add(atomId);
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += bundle.atomIds.length;
    }
    for (const bundle of lineBundles) {
      if (candidateAtoms >= maximumAtoms) break;
      if (bundle.atomIds.every((atomId) => bundledAtomIds.has(atomId))) continue;
      page.shapes.push({
        ...bundle.shape,
        id: generatedMissingId(`missing-native-line-bundle-${target.pageIndex + 1}-${addedShapes + 1}`),
        source: {
          ...(bundle.shape.source || {}),
          missingNativeComponentId: target.id,
          sourceMissingNativeComponentIds: [...(target.sourceIds || [target.id])]
        }
      });
      for (const atomId of bundle.atomIds) bundledAtomIds.add(atomId);
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += bundle.atomIds.length;
    }
    for (const atom of atoms) {
      if (candidateAtoms >= maximumAtoms) break;
      if (bundledAtomIds.has(String(atom.id || ""))) continue;
      const atomWithId = { ...atom, id: `${target.id}-${atom.id || candidateAtoms + 1}` };
      const atomVariants = missingNativeVisualAtomVariants(atomWithId, target);
      for (const atomVariant of atomVariants) {
        if (candidateAtoms >= maximumAtoms) break;
        const shape = missingNativeVisualAtomShape(sourceLayer, atomVariant, candidateAtoms, sourceLayer.source.layer.diagramUnderstanding, next.slideSize);
        const shapes = Array.isArray(shape) ? shape.filter(Boolean) : shape ? [shape] : [];
        for (const item of shapes) {
          if (!item || !isFiniteVisualAtomShapeBox(item)) continue;
          page.shapes.push({
            ...item,
            id: generatedMissingId(`missing-native-visual-atom-${target.pageIndex + 1}-${addedShapes + 1}`),
            source: {
              ...(item.source || {}),
              detector: item.source?.detector || "missing-native-visual-atom",
              missingNativeComponentId: target.id,
              sourceMissingNativeComponentIds: [...(target.sourceIds || [target.id])]
            }
          });
          addedShapes += 1;
          emittedForTarget += 1;
        }
        candidateAtoms += 1;
      }
    }
    if (emittedForTarget < 1) {
      for (const inkRunShape of missingNativeTargetInkRunShapes(target, source, next.slideSize, images?.rendered, Math.max(0, maximumAtoms - candidateAtoms))) {
        if (candidateAtoms >= maximumAtoms) break;
        page.shapes.push({
          ...inkRunShape,
          id: generatedMissingId(`missing-native-ink-run-component-${target.pageIndex + 1}-${addedShapes + 1}`)
        });
        addedShapes += 1;
        emittedForTarget += 1;
        candidateAtoms += 1;
        const ids = Array.isArray(inkRunShape.source?.sourceMissingNativeComponentIds) ? inkRunShape.source.sourceMissingNativeComponentIds : [target.id];
        for (const id of ids) {
          if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
        }
      }
    }
    if (emittedForTarget > 0) candidateTargets += 1;
    if (emittedForTarget > 0) {
      const sourceIds = Array.isArray(target.sourceIds) && target.sourceIds.length > 0 ? target.sourceIds : [target.id];
      for (const id of sourceIds) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
    }
  }
  if (addedShapes > 0) {
    next.meta = { ...(next.meta || {}), finalMissingNativeVisualAtomFit: { provider: "worker-final-missing-native-visual-atom-fit-v1", addedShapes, candidateTargets, candidateAtoms, changedComponentKeys } };
  }
  return { deck: next, addedShapes, candidateTargets, candidateAtoms, changedComponentKeys };
}

function missingNativeTargetLineBundle(target, source, slideSize) {
  const sourceBoxes = Array.isArray(target?.sourceBoxes) ? target.sourceBoxes : [];
  const boxes = sourceBoxes.map((item) => item?.box).filter(isFiniteBox);
  if (boxes.length === 1) return null;
  if (boxes.length < 2) return null;
  const unionBox = unionManyPtBoxes(boxes);
  const orientation = boxDominantOrientation(unionBox);
  if (orientation !== "horizontal" && orientation !== "vertical") return null;
  if (boxes.some((box) => boxDominantOrientation(box) !== orientation)) return null;
  const color = sampleMissingNativeLineColor(source, unionBox, slideSize) || normalizedVisualAtomColor(target.color);
  const group = { orientation, color, boxes, atomIds: new Set(sourceBoxes.map((item) => String(item?.id || "")).filter(Boolean)) };
  const bundle = lineAtomBundleShape(group, target);
  if (!bundle) return null;
  return {
    ...bundle.shape,
    source: {
      ...bundle.shape.source,
      detector: "missing-native-line-bundle",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : []
    }
  };
}

function missingNativeTargetInkRunShapes(target, source, slideSize, rendered = null, maximumRuns = 12) {
  if (!target || !source || !rendered || !slideSize || !Number.isSafeInteger(maximumRuns) || maximumRuns < 1) return [];
  const sourceBoxes = Array.isArray(target.sourceBoxes) && target.sourceBoxes.length > 0
    ? target.sourceBoxes
    : [{ id: target.id || null, box: target.box }];
  const shapes = [];
  for (const item of sourceBoxes) {
    if (shapes.length >= maximumRuns) break;
    if (!isFiniteBox(item?.box)) continue;
    const targetId = typeof item.id === "string" && item.id ? item.id : target.id;
    const runs = sourceComponentFidelityPrimitiveRuns({
      target: {
        ...target,
        id: targetId,
        kind: "missing",
        role: "missing-native-component",
        box: item.box
      },
      source,
      rendered,
      slideSize,
      maximumRuns,
      currentRuns: shapes.length
    });
    for (const runShape of runs.shapes) {
      if (shapes.length >= maximumRuns) break;
      if (!isFiniteBox(runShape.box) || runShape.box.w * runShape.box.h < 0.08) continue;
      shapes.push({
        type: "rect",
        box: {
          x: round(Number(runShape.box.x)),
          y: round(Number(runShape.box.y)),
          w: round(Number(runShape.box.w)),
          h: round(Number(runShape.box.h))
        },
        style: {
          fill: runShape.style?.fill || normalizedVisualAtomColor(target.color) || "#111111",
          stroke: "none",
          strokeWidthPt: 0
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "missing-native-ink-run-component",
          missingNativeComponentId: target.id,
          sourceMissingNativeComponentIds: [targetId].filter(Boolean),
          componentQualityRole: "shape",
          semanticNativeStructure: true,
          sourceDetector: target.source?.detector || null
        }
      });
    }
  }
  return shapes;
}

function missingNativeTargetSinglePrimitiveShapes(target, source, slideSize) {
  const sourceBoxes = Array.isArray(target?.sourceBoxes) && target.sourceBoxes.length > 0
    ? target.sourceBoxes
    : [{ id: target?.id || null, box: target?.box }];
  const shapes = [];
  for (const item of sourceBoxes) {
    if (!isFiniteBox(item?.box)) continue;
    const sampledColor = sampleMissingNativeLineColor(source, item.box, slideSize);
    if (!sampledColor) continue;
    const targetId = typeof item.id === "string" && item.id ? item.id : target.id;
    const scopedTarget = {
      ...target,
      id: targetId,
      color: sampledColor,
      sourceIds: [targetId].filter(Boolean)
    };
    const primitive = missingNativeSingleDiagonalShape(scopedTarget, item.box, source, slideSize)
      || missingNativeSingleLineShape(scopedTarget, item.box, source, slideSize)
      || missingNativeSingleOvalShape(scopedTarget, item.box, source, slideSize)
      || missingNativeSingleTinyRectShape(scopedTarget, item.box, source, slideSize);
    if (primitive) shapes.push(primitive);
  }
  return shapes;
}

function missingNativeTargetBlobShapes(target, source, slideSize, rendered = null) {
  const sourceBoxes = Array.isArray(target?.sourceBoxes) && target.sourceBoxes.length > 0
    ? target.sourceBoxes
    : [{ id: target?.id || null, box: target?.box }];
  const shapes = [];
  for (const item of sourceBoxes) {
    if (!isFiniteBox(item?.box)) continue;
    for (const shape of missingNativeBlobFreeformShapes({ ...target, id: item.id || target.id, sourceIds: [item.id || target.id].filter(Boolean) }, item.box, source, slideSize, rendered)) {
      shapes.push(shape);
    }
  }
  return shapes;
}

function missingNativeTargetCurveShapes(target, source, slideSize, rendered = null) {
  if (Array.isArray(target?.sourceBoxes) && target.sourceBoxes.length > 1) {
    return missingNativeCurveFreeformShapes(target, target.box, source, slideSize, rendered);
  }
  const sourceBoxes = Array.isArray(target?.sourceBoxes) && target.sourceBoxes.length > 0
    ? target.sourceBoxes
    : [{ id: target?.id || null, box: target?.box }];
  const shapes = [];
  for (const item of sourceBoxes) {
    if (!isFiniteBox(item?.box)) continue;
    for (const shape of missingNativeCurveFreeformShapes({ ...target, id: item.id || target.id, sourceIds: [item.id || target.id].filter(Boolean) }, item.box, source, slideSize, rendered)) {
      shapes.push(shape);
    }
  }
  return shapes;
}

function missingNativeCurveFreeformShapes(target, box, source, slideSize, _rendered = null) {
  if (!isFiniteBox(target?.box) || !isFiniteBox(box)) return [];
  if (box.w * box.h > 25000) return [];
  // Once a missing relationship is targeted, recover its complete source ink.
  // A difference-only mask can sever a curve at an already matching middle.
  return missingNativeBlobEvidence(source, box, slideSize, null, { maximumComponentAreaPt2: 25000 })
    .filter((evidence) => isSparseCurveEvidence(evidence))
    .map((evidence, index) => missingNativeCurveFreeformShape(target, evidence, index))
    .filter(Boolean);
}

function missingNativeBlobFreeformShapes(target, box, source, slideSize, rendered = null) {
  if (!isFiniteBox(target?.box) || !isFiniteBox(box)) return [];
  const width = Number(box.w);
  const height = Number(box.h);
  const area = width * height;
  if (!Number.isFinite(area) || area < 120 || area > 9000) return [];
  if (boxDominantOrientation(box) !== "block") return [];
  const components = missingNativeBlobEvidence(source, box, slideSize, rendered);
  return components.filter((evidence) => Number(evidence.density) >= 0.08 && boxDominantOrientation(evidence.box) === "block").map((evidence, index) => {
    if (!evidence || evidence.points.length < 3 || !isFiniteBox(evidence.box)) return null;
    const parsed = hexColor(evidence.color);
    if (!parsed || brightness(parsed) > 245 || saturationProxy(parsed) < 24) return null;
    return {
    type: "freeform",
    box: {
      x: round(Number(evidence.box.x)),
      y: round(Number(evidence.box.y)),
      w: round(Number(evidence.box.w)),
      h: round(Number(evidence.box.h))
    },
    points: evidence.nativeContour ? evidence.nativeContour.segments.flatMap(segment=>segment.points) : evidence.points,
    style: {
      fill: evidence.color,
      stroke: evidence.color,
      strokeWidthPt: 0,
      ...(evidence.nativeContour ? {closePath:true,freeformSegments:evidence.nativeContour.segments} : {})
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-blob-freeform-component",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : [target.id].filter(Boolean),
      bundledVisualAtomCount: 1,
      componentQualityRole: "shape",
      semanticNativeStructure: true,
      contourIndex: index + 1,
      ...(evidence.nativeContour ? {sourceContourTolerancePx:evidence.nativeContour.tolerancePx} : {})
    }
  };
  }).filter(Boolean);
}

function missingNativeBlobEvidence(source, box, slideSize, rendered = null, options = {}) {
  if (!source || !Buffer.isBuffer(source.rgba) || !isFiniteBox(box) || !slideSize) return [];
  const scaleX = source.width / Number(slideSize.widthPt);
  const scaleY = source.height / Number(slideSize.heightPt);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return [];
  const left = Math.max(0, Math.floor(Number(box.x) * scaleX));
  const top = Math.max(0, Math.floor(Number(box.y) * scaleY));
  const right = Math.min(source.width, Math.ceil((Number(box.x) + Number(box.w)) * scaleX));
  const bottom = Math.min(source.height, Math.ceil((Number(box.y) + Number(box.h)) * scaleY));
  if (right <= left || bottom <= top) return [];
  const width = right - left;
  const height = bottom - top;
  if (width * height > 1_000_000) return [];
  const foreground = new Uint8Array(width * height);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * source.width + x) * 4;
      const color = { r: source.rgba[offset], g: source.rgba[offset + 1], b: source.rgba[offset + 2] };
      const renderedColor = rendered && rendered.width === source.width && rendered.height === source.height
        ? pixelColor(rendered, x, y)
        : null;
      if (!isMissingNativeBlobForeground(color, renderedColor)) continue;
      foreground[(y - top) * width + (x - left)] = 1;
    }
  }
  const maximumComponentAreaPt2 = options.maximumComponentAreaPt2 ?? 9000;
  if (!Number.isFinite(maximumComponentAreaPt2) || maximumComponentAreaPt2 < 12 || maximumComponentAreaPt2 > 25000) {
    throw new TypeError("Invalid missing native component area boundary");
  }
  return connectedMissingNativeBlobComponents({ source, foreground, left, top, width, height, scaleX, scaleY, maximumComponentAreaPt2 })
    .filter((component) => component.points.length >= 3)
    .sort((leftComponent, rightComponent) => rightComponent.pixelCount - leftComponent.pixelCount)
    .slice(0, 8)
    .map((component) => ({
      color: component.color,
      box: component.box,
      pixelCount: component.pixelCount,
      density: component.density,
      curve: component.curve,
      connectorContour: component.connectorContour,
      nativeContour: component.nativeContour,
      points: component.points
    }));
}

function sparseCurveControlPoints(pixels, minX, minY, width, height) {
  if (!Array.isArray(pixels) || pixels.length < 3 || width <= 1 || height <= 1) return null;
  const normalized = pixels.map((pixel) => ({
    x: (pixel.x - minX) / Math.max(1, width - 1),
    y: (pixel.y - minY) / Math.max(1, height - 1)
  }));
  const left = averageBand(normalized, (point) => point.x <= 0.25) || minBy(normalized, (point) => point.x);
  const right = averageBand(normalized, (point) => point.x >= 0.75) || maxBy(normalized, (point) => point.x);
  const middle = averageBand(normalized, (point) => point.x > 0.35 && point.x < 0.65) || averagePoint(normalized);
  if (!left || !right || !middle) return null;
  const endpointY = (left.y + right.y) / 2;
  const bendY = middle.y < endpointY ? Math.max(0, middle.y - 0.08) : Math.min(1, middle.y + 0.08);
  return {
    start: { x: clampUnit(left.x), y: clampUnit(left.y) },
    control1: { x: clampUnit(0.32), y: clampUnit(bendY) },
    control2: { x: clampUnit(0.68), y: clampUnit(bendY) },
    end: { x: clampUnit(right.x), y: clampUnit(right.y) }
  };
}

function missingNativeSingleTinyRectShape(target, box, source, slideSize) {
  if (!isFiniteBox(target?.box) || !isFiniteBox(box)) return null;
  const width = Number(box.w);
  const height = Number(box.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (Math.max(width, height) > 22 || Math.min(width, height) > 7) return null;
  if (boxDominantOrientation(box) !== "block") return null;
  const color = sampleMissingNativeLineColor(source, box, slideSize) || normalizedVisualAtomColor(target.color);
  const parsed = hexColor(color);
  if (!parsed || brightness(parsed) > 248) return null;
  return {
    type: "rect",
    box: {
      x: round(Number(box.x)),
      y: round(Number(box.y)),
      w: round(width),
      h: round(height)
    },
    style: {
      fill: color,
      stroke: color,
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-tiny-rect-component",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : [target.id].filter(Boolean),
      bundledVisualAtomCount: 1,
      componentQualityRole: "shape",
      semanticNativeStructure: true
    }
  };
}

function missingNativeSingleLineShape(target, box, source, slideSize) {
  if (!isFiniteBox(target?.box) || !isFiniteBox(box)) return null;
  const orientation = boxDominantOrientation(box);
  if (orientation !== "horizontal" && orientation !== "vertical") return null;
  const length = orientation === "horizontal" ? Number(box.w) : Number(box.h);
  const thickness = orientation === "horizontal" ? Number(box.h) : Number(box.w);
  if (!Number.isFinite(length) || !Number.isFinite(thickness) || length < 3 || thickness <= 0 || thickness > 8) return null;
  const color = sampleMissingNativeLineColor(source, box, slideSize) || normalizedVisualAtomColor(target.color);
  const strokeWidthPt = Math.max(0.5, Math.min(4, Math.round(thickness * 100) / 100));
  const line = orientation === "horizontal"
    ? { x: Number(box.x), y: Number(box.y) + Number(box.h) / 2, w: Number(box.w), h: 0 }
    : { x: Number(box.x) + Number(box.w) / 2, y: Number(box.y), w: 0, h: Number(box.h) };
  return {
    type: "line",
    box: {
      x: round(line.x),
      y: round(line.y),
      w: round(line.w),
      h: round(line.h)
    },
    style: {
      stroke: color,
      strokeWidthPt,
      connectorType: "straight"
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-line-component",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : [target.id].filter(Boolean),
      bundledVisualAtomCount: 1,
      componentQualityRole: "connector-straight",
      axis: orientation,
      semanticNativeStructure: true
    }
  };
}

function missingNativeSingleOvalShape(target, box, source, slideSize) {
  if (!isFiniteBox(target?.box) || !isFiniteBox(box)) return null;
  const width = Number(box.w);
  const height = Number(box.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 18 || height < 5 || height > 24 || width < height * 2.4 || width > height * 7) return null;
  const color = sampleMissingNativeLineColor(source, box, slideSize) || normalizedVisualAtomColor(target.color);
  const parsed = hexColor(color);
  if (!parsed || saturationProxy(parsed) < 45 || brightness(parsed) > 245) return null;
  return {
    type: "ellipse",
    box: {
      x: round(Number(box.x)),
      y: round(Number(box.y)),
      w: round(width),
      h: round(height)
    },
    style: {
      fill: color,
      stroke: color,
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-oval-component",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : [target.id].filter(Boolean),
      bundledVisualAtomCount: 1,
      componentQualityRole: "shape",
      semanticNativeStructure: true
    }
  };
}

function missingNativeTargetOvalShapes(target, source, slideSize) {
  const sourceBoxes = Array.isArray(target?.sourceBoxes) ? target.sourceBoxes : [];
  if (sourceBoxes.length < 2) return [];
  return sourceBoxes
    .map((item) => {
      const id = String(item?.id || "");
      if (!id || !isFiniteBox(item?.box)) return null;
      return missingNativeSingleOvalShape({ ...target, id, sourceIds: [id] }, item.box, source, slideSize);
    })
    .filter(Boolean);
}

function missingNativeVisualAtomLineBundles(atoms, target) {
  if (!Array.isArray(atoms) || !isFiniteBox(target?.box)) return [];
  const variants = [];
  for (const atom of atoms) {
    if (!isLineLikeVisualAtom(atom)) continue;
    const atomId = String(atom?.id || "");
    for (const variant of missingNativeVisualAtomVariants(atom, target)) {
      if (!isFiniteBox(variant?.box)) continue;
      const orientation = boxDominantOrientation(variant.box);
      if (orientation !== "horizontal" && orientation !== "vertical") continue;
      variants.push({
        atomId,
        orientation,
        color: normalizedVisualAtomColor(variant.color || atom.color),
        box: variant.box
      });
    }
  }
  if (variants.length < 2) return [];
  const groups = [];
  for (const variant of variants) {
    const group = groups.find((entry) => canMergeLineAtomVariant(entry, variant));
    if (!group) {
      groups.push({ orientation: variant.orientation, color: variant.color, boxes: [variant.box], atomIds: new Set([variant.atomId]) });
      continue;
    }
    group.boxes.push(variant.box);
    group.atomIds.add(variant.atomId);
  }
  return groups
    .map((group) => lineAtomBundleShape(group, target))
    .filter(Boolean)
    .sort((left, right) => right.atomIds.length - left.atomIds.length
      || Math.hypot(right.shape.box.w, right.shape.box.h) - Math.hypot(left.shape.box.w, left.shape.box.h));
}

function missingNativeVisualAtomCurveBundles(atoms, target) {
  if (!Array.isArray(atoms) || !isFiniteBox(target?.box)) return [];
  const variants = [];
  for (const atom of atoms) {
    if (!isLineLikeVisualAtom(atom)) continue;
    const atomId = String(atom?.id || "");
    for (const variant of missingNativeVisualAtomVariants(atom, target)) {
      if (!isFiniteBox(variant?.box) || boxDominantOrientation(variant.box) !== "horizontal") continue;
      variants.push({
        atomId,
        color: normalizedVisualAtomColor(variant.color || atom.color),
        box: variant.box
      });
    }
  }
  if (variants.length < 2) return [];
  const groups = [];
  for (const variant of variants) {
    const group = groups.find((entry) => canMergeCurveAtomVariant(entry, variant));
    if (!group) {
      groups.push({ color: variant.color, boxes: [variant.box], atomIds: new Set([variant.atomId]) });
      continue;
    }
    group.boxes.push(variant.box);
    group.atomIds.add(variant.atomId);
  }
  return groups
    .map((group) => curveAtomBundleShape(group, target))
    .filter(Boolean)
    .sort((left, right) => right.atomIds.length - left.atomIds.length || curveBundleArea(right.shape) - curveBundleArea(left.shape))
    .slice(0, 2);
}

function canMergeCurveAtomVariant(group, variant) {
  if (!group || !similarVisualAtomColor(group.color, variant.color)) return false;
  const box = unionManyPtBoxes(group.boxes);
  if (!box) return false;
  const overlap = Math.max(0, Math.min(box.x + box.w, variant.box.x + variant.box.w) - Math.max(box.x, variant.box.x));
  const minWidth = Math.min(box.w, variant.box.w);
  if (minWidth <= 0 || overlap / minWidth < 0.35) return false;
  const groupCy = box.y + box.h / 2;
  const variantCy = variant.box.y + variant.box.h / 2;
  const rowGap = Math.abs(groupCy - variantCy);
  return rowGap >= Math.max(10, Math.min(28, Math.max(box.h, variant.box.h) * 4))
    && rowGap <= Math.max(72, Math.min(180, Math.max(box.w, variant.box.w) * 1.2));
}

function curveAtomBundleShape(group, target) {
  const boxes = Array.isArray(group?.boxes) ? group.boxes.filter(isFiniteBox) : [];
  if (boxes.length < 2 || !(group.atomIds instanceof Set) || group.atomIds.size < 2) return null;
  const box = unionManyPtBoxes(boxes);
  if (!box || !visualAtomOverlapsMissingTarget({ box }, target.box)) return null;
  if (box.w < 24 || box.h < 18 || box.w / Math.max(1e-6, box.h) < 0.9) return null;
  const sorted = [...boxes].sort((left, right) => left.y - right.y);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const strokeWidthPt = Math.max(1.1, Math.min(4, medianLineThickness(boxes, "horizontal")));
  const leftAligned = Math.abs(top.x - bottom.x) <= Math.max(8, box.w * 0.22);
  const openSide = leftAligned ? "right" : "left";
  const startX = openSide === "right" ? 0.05 : 0.95;
  const outerX = openSide === "right" ? 0.95 : 0.05;
  const endX = startX;
  const topY = Math.max(0.05, Math.min(0.35, ((top.y + top.h / 2) - box.y) / Math.max(1e-6, box.h)));
  const bottomY = Math.min(0.95, Math.max(0.65, ((bottom.y + bottom.h / 2) - box.y) / Math.max(1e-6, box.h)));
  return {
    atomIds: [...group.atomIds],
    shape: {
      type: "freeform",
      box: {
        x: round(box.x),
        y: round(box.y),
        w: round(box.w),
        h: round(box.h)
      },
      points: [
        { x: startX, y: topY },
        { x: outerX, y: topY },
        { x: outerX, y: bottomY },
        { x: endX, y: bottomY }
      ],
      style: {
        fill: "none",
        stroke: group.color,
        strokeWidthPt: Math.round(strokeWidthPt * 100) / 100,
        closePath: false,
        lineCap: "round",
        freeformSegments: [
          { type: "moveTo", points: [{ x: startX, y: topY }] },
          { type: "cubicBezTo", points: [{ x: 0.45, y: topY }, { x: outerX, y: 0.35 }, { x: outerX, y: 0.5 }] },
          { type: "cubicBezTo", points: [{ x: outerX, y: 0.65 }, { x: 0.45, y: bottomY }, { x: endX, y: bottomY }] }
        ]
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "missing-native-curve-bundle",
        bundledVisualAtomCount: group.atomIds.size,
        atomIds: [...group.atomIds].slice(0, 20),
        componentQualityRole: "connector-curve",
        semanticNativeStructure: true
      }
    }
  };
}

function canMergeLineAtomVariant(group, variant) {
  if (!group || group.orientation !== variant.orientation || group.color !== variant.color) return false;
  const box = unionManyPtBoxes(group.boxes);
  if (!box) return false;
  if (variant.orientation === "horizontal") {
    const groupCy = box.y + box.h / 2;
    const variantCy = variant.box.y + variant.box.h / 2;
    const rowTolerance = Math.max(2, Math.min(8, Math.max(box.h, variant.box.h) * 2.5));
    const gap = Math.max(0, Math.max(box.x, variant.box.x) - Math.min(box.x + box.w, variant.box.x + variant.box.w));
    return Math.abs(groupCy - variantCy) <= rowTolerance && gap <= Math.max(8, Math.min(36, Math.max(box.h, variant.box.h) * 8));
  }
  const groupCx = box.x + box.w / 2;
  const variantCx = variant.box.x + variant.box.w / 2;
  const columnTolerance = Math.max(2, Math.min(8, Math.max(box.w, variant.box.w) * 2.5));
  const gap = Math.max(0, Math.max(box.y, variant.box.y) - Math.min(box.y + box.h, variant.box.y + variant.box.h));
  return Math.abs(groupCx - variantCx) <= columnTolerance && gap <= Math.max(8, Math.min(36, Math.max(box.w, variant.box.w) * 8));
}

function lineAtomBundleShape(group, target) {
  const boxes = Array.isArray(group?.boxes) ? group.boxes.filter(isFiniteBox) : [];
  if (boxes.length < 2 || !(group.atomIds instanceof Set) || group.atomIds.size < 2) return null;
  const box = unionManyPtBoxes(boxes);
  if (!box || !visualAtomOverlapsMissingTarget({ box }, target.box)) return null;
  const thickness = Math.max(0.5, Math.min(4, medianLineThickness(boxes, group.orientation)));
  const sorted = [...boxes].sort((left, right) => group.orientation === "horizontal" ? left.x - right.x : left.y - right.y);
  const hasGaps = lineBoxesHaveGaps(sorted, group.orientation, thickness);
  const style = {
    stroke: group.color,
    strokeWidthPt: Math.round(thickness * 100) / 100,
    connectorType: "straight",
    ...(hasGaps ? { dash: "dash" } : {})
  };
  const line = group.orientation === "horizontal"
    ? { x: box.x, y: box.y + box.h / 2, w: box.w, h: 0 }
    : { x: box.x + box.w / 2, y: box.y, w: 0, h: box.h };
  return {
    atomIds: [...group.atomIds],
    shape: {
      type: "line",
      box: {
        x: round(line.x),
        y: round(line.y),
        w: round(line.w),
        h: round(line.h)
      },
      style,
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "missing-native-line-bundle",
        bundledVisualAtomCount: group.atomIds.size,
        componentQualityRole: "connector-straight",
        atomIds: [...group.atomIds].slice(0, 20),
        axis: group.orientation
      }
    }
  };
}

function missingNativeVisualAtomShape(sourceLayer, atom, index, understanding, slideSize) {
  const curveShape = missingNativeVisualAtomOpenCurveShape(sourceLayer, atom, index);
  if (curveShape) return curveShape;
  const shape = visualAtomNativeShape(sourceLayer, atom, index, understanding, slideSize);
  if (!shape || Array.isArray(shape) || shape.type !== "line" || !isFiniteBox(atom?.box)) return shape;
  const kind = String(atom.kind || "");
  if (kind !== "grid-line-candidate" && kind !== "connector-line-candidate" && kind !== "connector-arrow-candidate") return shape;
  if (shouldPreserveMissingNativeLineAtom(atom)) return {
    ...shape,
    source: {
      ...(shape.source || {}),
      detector: "missing-native-visual-atom-line",
      originalAtomKind: kind
    }
  };
  const color = shape.style?.stroke || atom.color || "#6B7280";
  return {
    ...shape,
    type: "rect",
    box: {
      x: round(Number(atom.box.x)),
      y: round(Number(atom.box.y)),
      w: round(Number(atom.box.w)),
      h: round(Number(atom.box.h))
    },
    style: {
      fill: color,
      stroke: color,
      strokeWidthPt: 0
    },
    source: {
      ...(shape.source || {}),
      detector: "missing-native-visual-atom-rect",
      originalAtomKind: kind
    }
  };
}

function missingNativeVisualAtomVariants(atom, target) {
  if (!isFiniteBox(atom?.box)) return [];
  const sourceBoxes = Array.isArray(target?.sourceBoxes) && target.sourceBoxes.length > 0
    ? target.sourceBoxes
    : [{ id: target?.id || null, box: target?.box }];
  if (!isLineLikeVisualAtom(atom)) return visualAtomOverlapsMissingTarget(atom, target?.box) ? [atom] : [];
  const variants = [];
  const seen = new Set();
  for (const source of sourceBoxes) {
    if (!isFiniteBox(source?.box)) continue;
    const clipped = intersectPtBoxes(atom.box, source.box);
    if (!clipped || clipped.w < 0.2 || clipped.h < 0.2) continue;
    const key = `${round(clipped.x)}:${round(clipped.y)}:${round(clipped.w)}:${round(clipped.h)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push({
      ...atom,
      id: `${atom.id || "atom"}-${source.id || variants.length + 1}`,
      box: clipped,
      sourceMissingNativeComponentId: source.id || null
    });
  }
  return variants.length > 0 ? variants : (visualAtomOverlapsMissingTarget(atom, target?.box) ? [atom] : []);
}

function collectMissingNativeVisualAtomTargets(deck, visualQuality, maximumTargets, options = {}) {
  if (!Array.isArray(deck?.pages)) return [];
  const rows = Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst : [];
  const targets = rows
    .filter((item) => item?.kind === "missing" && item?.role === "missing-native-component")
    .filter((item) => item?.textAdjacent !== true && String(item?.repairHint || "") !== "text")
    .filter((item) => Number.isSafeInteger(item.pageIndex) && deck.pages[item.pageIndex] && typeof item.id === "string" && item.id && isFiniteBox(item.box))
    .filter((item) => !missingBlobTargetTouchesText(item, Array.isArray(deck.pages[item.pageIndex].textBoxes) ? deck.pages[item.pageIndex].textBoxes : []))
    .map((item, index) => ({
      pageIndex: item.pageIndex,
      id: item.id,
      box: { x: Number(item.box.x), y: Number(item.box.y), w: Number(item.box.w), h: Number(item.box.h) },
      source: item.source && typeof item.source === "object" ? { ...item.source } : {},
      sourceBoxes: [{ id: item.id, box: { x: Number(item.box.x), y: Number(item.box.y), w: Number(item.box.w), h: Number(item.box.h) } }],
      color: item.source?.dominantColor,
      contribution: Number.isFinite(item.contributionScore) && item.contributionScore >= 0
        ? item.contributionScore : Number.isFinite(item.source?.missingForegroundPixels) && item.source.missingForegroundPixels >= 0
          ? item.source.missingForegroundPixels : 0,
      priority: index
    }))
    .sort((left, right) => right.contribution - left.contribution || left.priority - right.priority);
  const clustered = options.cluster === false ? targets : clusterMissingNativeVisualAtomTargets(targets);
  return clustered.slice(0, Math.max(0, maximumTargets));
}

function clusterMissingNativeVisualAtomTargets(targets) {
  const groups = [];
  for (const target of targets) {
    const group = groups.find((entry) => entry.pageIndex === target.pageIndex && missingTargetsMayCluster(entry, target));
    if (!group) {
      groups.push({ ...target, sourceIds: [target.id] });
      continue;
    }
    group.box = unionPtBoxes(group.box, target.box);
    group.priority = Math.min(group.priority, target.priority);
    group.contribution += target.contribution;
    group.color = group.color || target.color;
    group.sourceIds.push(target.id);
    group.sourceBoxes.push({ id: target.id, box: target.box });
    group.id = `missing-native-component-cluster-${String(group.priority + 1).padStart(3, "0")}`;
  }
  return groups.sort((left, right) => right.contribution - left.contribution || left.priority - right.priority);
}

function missingTargetsMayCluster(left, right) {
  if (!left || !right || !boxesNear(left.box, right.box)) return false;
  const union = unionPtBoxes(left.box, right.box);
  const orientation = boxDominantOrientation(union);
  if (orientation === "block") {
    if (union.w * union.h > 25000 || ![left, right].every((target) => {
      const density = target.source?.missingPixelDensity;
      return Number.isFinite(density) && density >= 0.025 && density <= 0.18
        && target.box.w >= 22 && target.box.h >= 18;
    })) return false;
  }
  const leftColor = normalizedVisualAtomColor(left.color || left.source?.dominantColor);
  const rightColor = normalizedVisualAtomColor(right.color || right.source?.dominantColor);
  if (leftColor && rightColor && colorHexDistance(leftColor, rightColor) > 28) return false;
  return true;
}

function visualAtomOverlapsMissingTarget(atom, targetBox) {
  if (!isFiniteBox(atom?.box) || !isFiniteBox(targetBox)) return false;
  const atomBox = atom.box;
  const overlap = ptBoxOverlapArea(atomBox, targetBox);
  const atomArea = Math.max(0.01, Number(atomBox.w) * Number(atomBox.h));
  const targetArea = Math.max(0.01, Number(targetBox.w) * Number(targetBox.h));
  if (overlap / Math.min(atomArea, targetArea) >= 0.15) return true;
  const center = { x: Number(atomBox.x) + Number(atomBox.w) / 2, y: Number(atomBox.y) + Number(atomBox.h) / 2 };
  const expanded = {
    x: Number(targetBox.x) - 1,
    y: Number(targetBox.y) - 1,
    w: Number(targetBox.w) + 2,
    h: Number(targetBox.h) + 2
  };
  return center.x >= expanded.x
    && center.x <= expanded.x + expanded.w
    && center.y >= expanded.y
    && center.y <= expanded.y + expanded.h;
}

function nativeOnlyMissingNativeLinesDoesNotRegress({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (sharedWorstComponentRegression({ baselineQuality, candidateQuality }) > 0.02) return false;
  const before = baselineQuality.metrics || {};
  const after = candidateQuality.metrics || {};
  const pixelBefore = Number(before["pixel-diff-ratio"]);
  const pixelAfter = Number(after["pixel-diff-ratio"]);
  const missingBefore = Number(before["foreground-missing-ratio"]);
  const missingAfter = Number(after["foreground-missing-ratio"]);
  const deltaBefore = Number(before["mean-absolute-delta"]);
  const deltaAfter = Number(after["mean-absolute-delta"]);
  if (![pixelBefore, pixelAfter, missingBefore, missingAfter, deltaBefore, deltaAfter].every(Number.isFinite)) return false;
  if (pixelAfter > pixelBefore + 1e-9) return false;
  if (missingAfter > missingBefore + 0.0002) return false;
  if (deltaAfter > deltaBefore + 0.02) return false;
  const attentionBefore = Number(before["component-regions-attention"]);
  const attentionAfter = Number(after["component-regions-attention"]);
  if (Number.isFinite(attentionBefore) && Number.isFinite(attentionAfter) && attentionAfter > attentionBefore) return false;
  const severityBefore = Number(before["worst-component-normalized-severity"]);
  const severityAfter = Number(after["worst-component-normalized-severity"]);
  if (Number.isFinite(severityBefore) && Number.isFinite(severityAfter) && severityAfter > severityBefore + 1e-9) return false;
  return true;
}

module.exports = { connectedMissingNativeBlobComponents, refineNativeOnlyResidualCandidateMissingNativeLines, fitDeckMissingNativeVisualAtomShapes, missingNativeTargetLineBundle, missingNativeTargetInkRunShapes, missingNativeTargetSinglePrimitiveShapes, missingNativeTargetBlobShapes, missingNativeTargetCurveShapes, missingNativeCurveFreeformShapes, missingNativeBlobFreeformShapes, missingNativeBlobEvidence, sparseCurveControlPoints, missingNativeSingleTinyRectShape, missingNativeSingleLineShape, missingNativeSingleOvalShape, missingNativeTargetOvalShapes, missingNativeVisualAtomLineBundles, missingNativeVisualAtomCurveBundles, canMergeCurveAtomVariant, curveAtomBundleShape, canMergeLineAtomVariant, lineAtomBundleShape, missingNativeVisualAtomShape, missingNativeVisualAtomVariants, collectMissingNativeVisualAtomTargets, clusterMissingNativeVisualAtomTargets, missingTargetsMayCluster, visualAtomOverlapsMissingTarget, nativeOnlyMissingNativeLinesDoesNotRegress };
