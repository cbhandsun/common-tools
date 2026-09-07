"use strict";

const { annotateSystemMapSemantics } = require("./system-map-semantics");

const MODES = Object.freeze({
  NATIVE_HYBRID: "native-hybrid",
  STRUCTURED_HYBRID: "structured-hybrid",
  READABLE_NATIVE: "readable-native",
  FIDELITY: "fidelity"
});

function chooseSystemMapReconstructionMode(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("system map reconstruction input must be an object");
  }
  const topologyReady = input.topologyReady === true;
  const pictorialEnclosure = input.pictorialEnclosure === true;
  const structuredLineMap = input.structuredLineMap === true;
  const decorativeGridTexture = input.decorativeGridTexture === true;
  const innerLabelCount = boundedInteger(input.innerLabelCount, "innerLabelCount", 0, 10000);
  if (topologyReady && !pictorialEnclosure) {
    return Object.freeze({
      mode: MODES.NATIVE_HYBRID,
      protectFullCrop: false,
      preserveDenseCenter: true,
      rebuildOuterTexture: decorativeGridTexture,
      reasonCode: decorativeGridTexture
        ? "system-map.topology-and-texture-measurable"
        : "system-map.topology-measurable"
    });
  }
  if (structuredLineMap) {
    return Object.freeze({
      mode: MODES.STRUCTURED_HYBRID,
      protectFullCrop: false,
      preserveDenseCenter: true,
      rebuildOuterTexture: false,
      reasonCode: "system-map.structured-lines-measurable"
    });
  }
  if (innerLabelCount >= 6) {
    return Object.freeze({
      mode: MODES.READABLE_NATIVE,
      protectFullCrop: false,
      preserveDenseCenter: false,
      rebuildOuterTexture: false,
      reasonCode: "system-map.internal-labels-readable"
    });
  }
  return Object.freeze({
    mode: MODES.FIDELITY,
    protectFullCrop: true,
    preserveDenseCenter: false,
    rebuildOuterTexture: false,
    reasonCode: "system-map.insufficient-structure-evidence"
  });
}

function composeSystemMapDiagram(images = [], textBoxes = [], slideSize = {}, options = {}, operations = {}) {
  if (!Array.isArray(images) || !Array.isArray(textBoxes)) throw new TypeError("system map inputs must be arrays");
  if (images.length > 10000 || textBoxes.length > 10000) throw new RangeError("system map inputs exceed the supported limit");
  const requiredOperations = [
    "shouldObjectify",
    "inferLayout",
    "createNetworkCrop",
    "compactLines",
    "boxCenterInside"
  ];
  for (const name of requiredOperations) {
    if (typeof operations[name] !== "function") throw new TypeError(`system map operation ${name} must be a function`);
  }
  const target = images.find((image) => operations.shouldObjectify(image, textBoxes, slideSize));
  if (!target) return { shapes: [], textBoxes: [], images: [] };
  const inferredLayout = normalizeLayout(operations.inferLayout(target, textBoxes, slideSize));
  const semanticLayout = annotateSystemMapSemantics(inferredLayout, slideSize);
  const networkCrop = options.preserveDenseNetworkCrop === true
    ? operations.createNetworkCrop(target, slideSize, options)
    : null;
  const hybridLayout = networkCrop
    ? {
      shapes: operations.compactLines(semanticLayout.shapes.filter((shape) => {
        const detector = String(shape?.source?.detector || "");
        return /^system-map-native-search/.test(detector)
          || detector === "system-map-native-background-dot"
          || detector === "system-map-native-asset-grid"
          || detector === "system-map-native-mapping-line";
      }), target),
      textBoxes: semanticLayout.textBoxes.filter((textBox) =>
        !operations.boxCenterInside(textBox?.box || {}, networkCrop.box || {}))
    }
    : semanticLayout;
  const layout = target.source?.systemMapTopologyProbeReady === true
    ? { ...hybridLayout, shapes: operations.compactLines(hybridLayout.shapes, target) }
    : hybridLayout;
  target.source = {
    ...(target.source || {}),
    systemMapDiagramObjectified: true,
    dropErasedResidualAfterNativeRebuild: true,
    objectifiedSystemMapShapes: layout.shapes.length,
    objectifiedSystemMapTextBoxes: layout.textBoxes.length,
    systemMapHybridNetworkCrop: Boolean(networkCrop),
    systemMapSemanticNodeCount: semanticLayout.semantics.nodeCount,
    systemMapSemanticConnectorCount: semanticLayout.semantics.connectorCount,
    systemMapSemanticNodeGroupCount: semanticLayout.semantics.nodeGroupCount,
    systemMapSemanticLegendCount: semanticLayout.semantics.legendCount,
    systemMapSemanticGroups: semanticLayout.semantics.groups,
    systemMapSemanticLegend: semanticLayout.semantics.legend,
    nonEditableReason: `${target.source?.nonEditableReason || target.source?.reason || "system map diagram crop"}; rebuilt system map as native editable nodes, grid cells, mapping lines, and search chrome`
  };
  return { shapes: layout.shapes, textBoxes: layout.textBoxes, images: networkCrop ? [networkCrop] : [] };
}

function normalizeLayout(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("system map layout must be an object");
  if (!Array.isArray(value.shapes) || !Array.isArray(value.textBoxes)) throw new TypeError("system map layout collections must be arrays");
  if (value.shapes.length > 100000 || value.textBoxes.length > 10000) throw new RangeError("system map layout exceeds the supported limit");
  return { shapes: value.shapes, textBoxes: value.textBoxes };
}

function boundedInteger(value, label, minimum, maximum) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new TypeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return number;
}

module.exports = {
  MODES,
  chooseSystemMapReconstructionMode,
  composeSystemMapDiagram
};
