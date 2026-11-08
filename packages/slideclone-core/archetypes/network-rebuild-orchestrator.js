"use strict";

function createNetworkRebuildOrchestrator(operations = {}) {
  const ops = validateOperations(operations);

  function createShapes(images = [], sourceImage = null, slideSize = null, options = {}) {
    if (!sourceImage || !Array.isArray(images)) return [];
    const shapes = [];
    for (const image of images.slice(0, 10_000)) {
      if (!image || typeof image !== "object" || !ops.shouldObjectify(image)) continue;
      const network = ops.inferNetwork(image, sourceImage, slideSize);
      if (!network || !Array.isArray(network.nodes) || network.nodes.length < 12) {
        rebuildAggregateFallback(image, shapes);
        continue;
      }
      const searchBox = ops.inferSearchBox(image, network, sourceImage, slideSize);
      const mode = ops.classify(image, network);
      if (mode === ops.modes.PRESERVE) {
        preserveDenseNetwork(image, network, searchBox, sourceImage, slideSize, options, shapes);
        continue;
      }
      if (mode === ops.modes.DETAILED) {
        const componentShapes = safeShapes(ops.createDetailedShapes(image, network, searchBox));
        image.source = {
          ...sourceOf(image),
          networkDiagramObjectified: true,
          denseRadialNetworkComponentObjectified: true,
          objectifiedNetworkNodes: network.nodes.length,
          objectifiedNetworkRays: network.nodes.length,
          emittedNetworkComponentShapes: componentShapes.length,
          objectifiedNetworkSearchBox: searchBox ? true : undefined,
          networkCenterBox: network.centerBox,
          dropErasedResidualAfterNativeRebuild: true,
          nonEditableReason: `${existingReason(image, "network diagram")}; rebuilt dense radial network as a controlled native component owner`
        };
        shapes.push(...componentShapes);
        continue;
      }
      if (mode === ops.modes.SUMMARY) {
        const summaryShapes = safeShapes(ops.createSummaryShapes(image, network, searchBox));
        image.source = {
          ...sourceOf(image),
          networkDiagramObjectified: true,
          denseRadialNetworkSummarized: true,
          objectifiedNetworkNodes: network.nodes.length,
          objectifiedNetworkRays: network.nodes.length,
          emittedNetworkSummaryShapes: summaryShapes.length,
          objectifiedNetworkSearchBox: searchBox ? true : undefined,
          networkCenterBox: network.centerBox,
          dropErasedResidualAfterNativeRebuild: true,
          nonEditableReason: `${existingReason(image, "network diagram")}; summarized dense radial network as native grouped fan components and center emblem`
        };
        shapes.push(...summaryShapes);
        continue;
      }
      image.source = {
        ...sourceOf(image),
        networkDiagramObjectified: true,
        objectifiedNetworkNodes: network.nodes.length,
        objectifiedNetworkRays: network.nodes.length,
        objectifiedNetworkSearchBox: searchBox ? true : undefined,
        networkCenterBox: network.centerBox,
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${existingReason(image, "network diagram")}; rebuilt radial network, search box, and center emblem natively`
      };
      shapes.push(...safeShapes(ops.createStandardShapes(image, network, searchBox)));
    }
    return shapes;
  }

  function createPageShapes(page = {}, sourceImage = null, slideSize = null) {
    if (!sourceImage || !validSlide(slideSize)) return [];
    const candidate = inferPageCandidate(page, slideSize);
    if (!candidate) return [];
    const pageIndex = Number.isInteger(page?.pageIndex) && Math.abs(page.pageIndex) <= 1_000_000 ? page.pageIndex : 0;
    const syntheticImage = {
      id: `page-${pageIndex}-radial-network`,
      box: candidate.box,
      source: {
        detector: "foreground-aggregate-crop",
        disableDenseRadialNetworkSummary: true,
        layer: {
          layerType: "diagram-zone",
          areaRatio: candidate.areaRatio,
          recommendedAction: "preserve-local-crop",
          diagramUnderstanding: {
            archetype: "hub-spoke",
            visualAtomKindCounts: { "grid-line-candidate": candidate.gridLineCount }
          }
        }
      }
    };
    const shapes = createShapes([syntheticImage], sourceImage, slideSize);
    const nodeCount = shapes.filter((shape) => shape?.source?.detector === "network-diagram-native-node").length;
    if (nodeCount < 24) return [];
    for (const item of candidate.residuals) {
      item.source = {
        ...sourceOf(item),
        pageLevelNetworkResidualDrop: true,
        nonEditableReason: `${existingReason(item, "split network residual")}; page-level radial network rebuilt natively`
      };
    }
    const residualSourceIds = candidate.residuals
      .map((item) => typeof item?.id === "string" && item.id.length <= 160 ? item.id : null)
      .filter(Boolean);
    return shapes.map((shape) => ({
      ...shape,
      source: {
        ...sourceOf(shape),
        detector: shape?.source?.detector || "page-level-network-native",
        pageLevelNetworkObjectified: true,
        residualSourceIds
      }
    }));
  }

  function inferPageCandidate(page, slideSize) {
    const residuals = (Array.isArray(page?.images) ? page.images : []).slice(0, 10_000).filter((item) => {
      const source = sourceOf(item);
      if (!/^(?:split-wide-residual-crop|foreground-graphic-crop)$/.test(String(source.detector || ""))) return false;
      const layer = objectValue(source.layer);
      const understanding = objectValue(layer.diagramUnderstanding);
      const kindCounts = objectValue(understanding.visualAtomKindCounts);
      return layer.layerType === "diagram-zone"
        && /^(?:matrix-or-grid|hub-spoke|generic-node-diagram|unclassified-diagram)$/.test(String(understanding.archetype || ""))
        && finiteNumber(kindCounts["grid-line-candidate"], 0) >= 6
        && finiteNumber(layer.areaRatio, 0) >= 0.04
        && validBox(item?.box);
    });
    if (residuals.length < 2) return null;
    const gridLineCount = residuals.reduce((sum, item) => {
      const counts = objectValue(item?.source?.layer?.diagramUnderstanding?.visualAtomKindCounts);
      return sum + finiteNumber(counts["grid-line-candidate"], 0);
    }, 0);
    if (gridLineCount < 16) return null;
    const box = unionBoxes(residuals.map((item) => item.box));
    if (!box) return null;
    const widthRatio = box.w / slideSize.widthPt;
    const heightRatio = box.h / slideSize.heightPt;
    const areaRatio = (box.w * box.h) / (slideSize.widthPt * slideSize.heightPt);
    if (widthRatio < 0.55 || heightRatio < 0.35 || areaRatio < 0.18) return null;
    return { box, areaRatio: roundRatio(areaRatio), gridLineCount, residuals };
  }

  function rebuildAggregateFallback(image, shapes) {
    const aggregateShapes = safeShapes(ops.createAggregateGridShapes(image));
    if (aggregateShapes.length === 0) return;
    image.source = {
      ...sourceOf(image),
      aggregateGridAtomSkeletonObjectified: true,
      visualAtomOverlayOnly: true,
      objectifiedAggregateGridAtomShapes: aggregateShapes.length,
      dropErasedResidualAfterNativeRebuild: image?.source?.dropErasedResidualAfterNativeRebuild,
      nonEditableReason: `${existingReason(image, "foreground aggregate crop")}; rebuilt detected aggregate grid atoms as native line overlays while preserving the source crop`
    };
    shapes.push(...aggregateShapes);
  }

  function preserveDenseNetwork(image, network, searchBox, sourceImage, slideSize, options, shapes) {
    const searchControlErased = searchBox
      ? ops.eraseSearchControl(image, searchBox, sourceImage, slideSize, options) === true
      : false;
    const source = sourceOf(image);
    const layer = objectValue(source.layer);
    image.source = {
      ...source,
      detector: "dense-radial-network-hero-crop",
      denseRadialNetworkPreservedAsCrop: true,
      objectifiedNetworkNodes: network.nodes.length,
      objectifiedNetworkRays: network.nodes.length,
      objectifiedNetworkSearchBox: searchControlErased || undefined,
      searchControlErasedFromCrop: searchControlErased || undefined,
      networkCenterBox: network.centerBox,
      preserveResidualCropUnderNativeRebuild: true,
      dropErasedResidualAfterNativeRebuild: false,
      expressionForm: "icon-or-illustration",
      expressionSubtype: "dense-radial-network-hero",
      recommendedAction: "keep-local-crop",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      skipVisualAtomRebuild: true,
      minimumUnitPolicy: "preserve-dense-radial-brand-illustration",
      minimumUnitReason: "dense radial brand illustration has many decorative rays and nested emblem contours without independent semantic labels",
      componentRenderStrategy: {
        ...objectValue(source.componentRenderStrategy),
        mode: "preserve-crop-with-native-overlays",
        implementationMode: "hybrid-native-overlay",
        editableExpectation: "source-faithful-brand-illustration-with-editable-search-control",
        visualFidelityBias: "fidelity-first",
        reason: "dense radial hero remains a single illustration while its erased search control is rebuilt above the crop"
      },
      layer: {
        ...layer,
        layerType: "diagram-zone",
        detector: "dense-radial-network-hero-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "dense-radial-network-hero",
        recommendedAction: "keep-local-crop",
        componentRenderStrategy: {
          ...objectValue(layer.componentRenderStrategy),
          mode: "preserve-crop-with-native-overlays",
          implementationMode: "hybrid-native-overlay",
          editableExpectation: "source-faithful-brand-illustration-with-editable-search-control"
        }
      },
      nonEditableReason: `${existingReason(image, "dense radial network illustration")}; preserved as a local crop because the page-level network is decorative/illustrative rather than a precise editable chart`
    };
    if (searchControlErased) shapes.push(...safeShapes(ops.createSearchShapes(image, searchBox)));
  }

  return Object.freeze({ createPageShapes, createShapes, inferPageCandidate });
}

function validateOperations(operations) {
  if (!operations || typeof operations !== "object" || Array.isArray(operations)) throw new TypeError("network rebuild orchestrator operations must be an object");
  const required = [
    "classify", "createAggregateGridShapes", "createDetailedShapes", "createSearchShapes", "createStandardShapes",
    "createSummaryShapes", "eraseSearchControl", "inferNetwork", "inferSearchBox", "shouldObjectify"
  ];
  for (const name of required) {
    if (typeof operations[name] !== "function") throw new TypeError(`network rebuild orchestrator operation ${name} must be a function`);
  }
  if (!operations.modes || typeof operations.modes !== "object" || Array.isArray(operations.modes)) {
    throw new TypeError("network rebuild orchestrator modes must be an object");
  }
  for (const name of ["DETAILED", "PRESERVE", "STANDARD", "SUMMARY"]) {
    if (typeof operations.modes[name] !== "string" || !operations.modes[name]) throw new TypeError(`network rebuild orchestrator mode ${name} must be a string`);
  }
  return Object.freeze({ ...operations, modes: Object.freeze({ ...operations.modes }) });
}

function sourceOf(image) {
  return objectValue(image?.source);
}

function existingReason(image, fallback) {
  const source = sourceOf(image);
  return typeof source.nonEditableReason === "string" && source.nonEditableReason
    ? source.nonEditableReason
    : (typeof source.reason === "string" && source.reason ? source.reason : fallback);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeShapes(value) {
  return Array.isArray(value) ? value.filter((shape) => shape && typeof shape === "object") : [];
}

function unionBoxes(boxes) {
  const valid = (Array.isArray(boxes) ? boxes : []).filter(validBox);
  if (valid.length === 0) return null;
  const minX = Math.min(...valid.map((box) => box.x));
  const minY = Math.min(...valid.map((box) => box.y));
  const maxX = Math.max(...valid.map((box) => box.x + box.w));
  const maxY = Math.max(...valid.map((box) => box.y + box.h));
  return { x: round(minX), y: round(minY), w: round(maxX - minX), h: round(maxY - minY) };
}

function validSlide(slideSize) {
  return Boolean(slideSize) && Number.isFinite(slideSize.widthPt) && Number.isFinite(slideSize.heightPt)
    && slideSize.widthPt > 0 && slideSize.heightPt > 0 && slideSize.widthPt <= 100_000 && slideSize.heightPt <= 100_000;
}

function validBox(box) {
  return Boolean(box) && [box.x, box.y, box.w, box.h].every(Number.isFinite)
    && box.w > 0 && box.h > 0 && [box.x, box.y, box.w, box.h].every((value) => Math.abs(value) <= 100_000);
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function roundRatio(value) {
  return Math.round(Number(value) * 10_000) / 10_000;
}

module.exports = { createNetworkRebuildOrchestrator };
