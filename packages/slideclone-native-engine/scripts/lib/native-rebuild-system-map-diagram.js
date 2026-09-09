"use strict";

const { composeSystemMapDiagram } = require("./system-map-reconstruction");

function createSystemMapDiagramFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxCenterInside,
    clampPtBoxToSlide,
    compactDenseTopologyLineFamilies,
    cropPng,
    ensureDir,
    inferSystemMapDiagramLayout,
    materializeFidelityCrop,
    ptToPxBox,
    pxToPtBox,
    safeIdentifier,
    writePng
  } = dependencies;
  const required = {
    DEFAULT_SLIDE,
    boxCenterInside,
    clampPtBoxToSlide,
    compactDenseTopologyLineFamilies,
    cropPng,
    ensureDir,
    inferSystemMapDiagramLayout,
    materializeFidelityCrop,
    ptToPxBox,
    pxToPtBox,
    safeIdentifier,
    writePng
  };
  for (const [name, value] of Object.entries(required)) {
    if (value === null || value === undefined) throw new TypeError(`system map dependency ${name} is required`);
  }
  if (typeof DEFAULT_SLIDE !== "object" || Array.isArray(DEFAULT_SLIDE)) {
    throw new TypeError("system map dependency DEFAULT_SLIDE must be an object");
  }
  for (const name of Object.keys(required).filter((item) => item !== "DEFAULT_SLIDE")) {
    if (typeof required[name] !== "function") throw new TypeError(`system map dependency ${name} must be a function`);
  }

  function createSystemMapDiagramObjects(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
    return composeSystemMapDiagram(images, textBoxes, slideSize, options, {
      shouldObjectify: shouldObjectifySystemMapDiagram,
      inferLayout: inferSystemMapDiagramLayout,
      createNetworkCrop: createSystemMapNetworkFidelityCrop,
      compactLines: compactSystemMapLineFamilies,
      boxCenterInside
    });
  }

  function createSystemMapNetworkFidelityCrop(target = {}, slideSize = DEFAULT_SLIDE, options = {}) {
    if (!options.sourceImage || !options.assetDir || !options.irDir) return null;
    const b = target.box || {};
    if (!b.w || !b.h) return null;
    const cropBox = clampPtBoxToSlide({
      x: Number(b.x || 0) + Number(b.w || 0) * 0.325,
      // Keep the map heading editable as a single native text box. The dense
      // network starts below it, so beginning the fidelity unit at 18% avoids
      // doubling the title while retaining micro-label topology.
      y: Number(b.y || 0) + Number(b.h || 0) * 0.18,
      w: Number(b.w || 0) * 0.455,
      h: Number(b.h || 0) * 0.7
    }, slideSize);
    const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
    const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-system-map-network`, "system-map-network");
    return materializeFidelityCrop({
      id: `${target.id || "system-map"}-network-fidelity-unit`,
      sourceImage: options.sourceImage,
      cropBox,
      slideSize,
      assetDir: options.assetDir,
      irDir: options.irDir,
      fileName: `${base}-fidelity-unit.png`,
      source: {
        nativeRebuild: true,
        detector: "system-map-network-fidelity-crop",
        strategy: "local-fidelity-crop",
        expressionFamily: "generic-structured-diagram",
        expressionForm: "complex-diagram",
        expressionSubtype: "dense-system-map-network-minimum-unit",
        recommendedAction: "preserve-local-crop",
        layerType: "diagram-zone",
        authoritativeExpressionMetadata: true,
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        sourceFaithfulCrop: true,
        systemMapHybridNetworkCrop: true,
        layerSourceId: target.id || null,
        largeFidelityCropApproved: true,
        largeFidelityCropApprovalReason: "the dense central system-map network and micro labels form one pictorial minimum unit; outer mapping rails, asset grid, search chrome, and external labels remain native editable components",
        componentRenderStrategy: {
          mode: "preserve-crop-with-native-overlays",
          implementationMode: "hybrid-native-overlay",
          editableExpectation: "central-network-fidelity-unit-with-native-outer-rails-grid-and-chrome",
          visualFidelityBias: "source-faithful"
        },
        nonEditableReason: "dense central topology and micro labels remain one source-faithful diagram minimum unit"
      }
    }, { ptToPxBox, pxToPtBox, cropPng, writePng, ensureDir });
  }

  function compactSystemMapLineFamilies(shapes = [], image = {}) {
    const denseEdgeDetectors = new Set([
      "system-map-native-network-edge",
      "system-map-native-network-detail-edge"
    ]);
    const compactionAnnotated = (shapes || []).map((shape) => {
      if (!denseEdgeDetectors.has(String(shape?.source?.detector || ""))) return shape;
      return {
        ...shape,
        source: {
          ...(shape.source || {}),
          compactionEligible: true,
          compactionPartition: String(shape.source?.axis || "") || undefined
        }
      };
    });
    return compactDenseTopologyLineFamilies(compactionAnnotated, {
      ownerId: `${image.id || "system-map"}-native-system-map-component`,
      ownerKind: "system-map-diagram",
      maxLinesPerCompound: 64
    });
  }

  function shouldObjectifySystemMapDiagram(image = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
    const box = image?.box || {};
    const area = Number(box.w || 0) * Number(box.h || 0);
    const slideArea = Math.max(1, Number(slideSize.widthPt || 0) * Number(slideSize.heightPt || 0));
    if (area / slideArea < 0.35 || box.w < 700 || box.h < 300) return false;
    const source = image.source || {};
    if (source.systemMapDiagramObjectified === true) return false;
    if (!/line-diagram|graphic-underlay|dense-line/i.test(String(source.detector || ""))) return false;
    const allText = (textBoxes || []).map((item) => String(item.text || "")).join(" ");
    return /产品版图|System\s*Map/i.test(allText)
      && /数字化产品大脑|产品大脑/.test(allText);
  }

  return {
    createSystemMapDiagramObjects,
    createSystemMapNetworkFidelityCrop,
    compactSystemMapLineFamilies,
    shouldObjectifySystemMapDiagram
  };
}

module.exports = {
  createSystemMapDiagramFactory
};
