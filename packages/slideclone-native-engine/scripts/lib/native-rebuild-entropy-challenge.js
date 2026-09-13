"use strict";

const { entropyChallengeAnnotationEntries } = require("@common-tools/slideclone-core/entropy-challenge-crops");
const {
  shouldObjectifyEntropyFragmentCloud,
  shouldObjectifyEntropyIsland
} = require("@common-tools/slideclone-core/graphic-crop-generation");
const {
  entropyChallengeFooterEntries,
  entropyChallengeNativeComponentMetadata,
  hasEntropyChallengeFooterEvidence,
  DEFAULT_SLIDE
} = require("@common-tools/slideclone-core/page-text-rule-helpers");
const {
  constrainPtBox,
  expandPtBox,
  detectEntropyMicroComponents,
  isEntropyOrangePixel,
  isEntropyIslandMicroPixel
} = require("@common-tools/slideclone-core/raster-native-detection");
const { lineBox } = require("@common-tools/slideclone-core/workflow-shape-primitives");

function createEntropyChallengeAnnotationObjects(textBoxes = [], images = [], slideSize = DEFAULT_SLIDE) {
  const fragment = (images || []).find((image) =>
    image?.source?.detector === "entropy-challenge-crop"
      && image?.source?.annotationTextErasedFromCrop === true
  );
  const entries = entropyChallengeAnnotationEntries(textBoxes, slideSize);
  if (!fragment || entries.length !== 4) return { shapes: [], textBoxes: [] };
  const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  const shapes = [];
  const nativeTextBoxes = [];
  entries.forEach((entry) => {
    const component = entropyChallengeNativeComponentMetadata(`annotation-${entry.index}`, "backplate");
    shapes.push({
      id: `entropy-challenge-annotation-backplate-${entry.index}`,
      type: "rect",
      box: constrainPtBox(expandPtBox(entry.box, slideSize, 7, 4), bounds),
      style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0 },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "entropy-challenge-native-annotation-backplate",
        expressionForm: "text-and-ui-chrome",
        ...component
      }
    });
    nativeTextBoxes.push({
      id: `entropy-challenge-annotation-text-${entry.index}`,
      role: "body",
      text: entry.label,
      box: entry.box,
      font: {
        family: "Microsoft YaHei",
        sizePt: entry.index === 0 ? 16 : 15,
        color: "#C56717",
        opacity: 1,
        weight: "bold",
        align: "center",
        valign: "middle"
      },
      style: {
        visibility: "visible",
        opacity: 1,
        wrap: false,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "entropy-challenge-native-annotation-text",
        layerSourceId: fragment.id,
        textErasedFromCrop: true,
        expressionForm: "text-and-ui-chrome",
        ...entropyChallengeNativeComponentMetadata(`annotation-${entry.index}`, "label")
      }
    });
  });
  return { shapes, textBoxes: nativeTextBoxes };
}

function createEntropyChallengeFooterBulletShapes(textBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!hasEntropyChallengeFooterEvidence(textBoxes)) return [];
  const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  return entropyChallengeFooterEntries().map((entry, index) => ({
    id: `entropy-challenge-footer-bullet-${index}`,
    type: "ellipse",
    box: constrainPtBox({ x: entry.bullet.x, y: entry.bullet.y, w: 10, h: 10 }, bounds),
    style: { fill: "#F07105", stroke: "#F07105", strokeWidthPt: 0 },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "entropy-challenge-native-footer-bullet",
      expressionForm: "native-shape",
      reason: "semantic entropy footer bullet rebuilt as an editable native ellipse",
      ...entropyChallengeNativeComponentMetadata(`footer-${index}`, "bullet")
    }
  }));
}

function createEntropyChallengeFragmentShapes(textBoxes = [], slideSize = DEFAULT_SLIDE, sourceImage = null) {
  if (!shouldObjectifyEntropyFragmentCloud(textBoxes, slideSize)) return [];
  const fragments = [
    { x: 88, y: 121, w: 38, h: 66, type: "triangle", rotation: -12 },
    { x: 72, y: 191, w: 76, h: 46, type: "diamond", rotation: -21, fill: "#FFFFFF", stroke: "#F07105", strokeWidthPt: 2.2 },
    { x: 132, y: 189, w: 86, h: 42, type: "triangle", rotation: 102 },
    { x: 198, y: 119, w: 78, h: 42, type: "triangle", rotation: 71 },
    { x: 275, y: 137, w: 56, h: 37, type: "triangle", rotation: 86 },
    { x: 204, y: 179, w: 76, h: 38, type: "triangle", rotation: -27 },
    { x: 127, y: 216, w: 79, h: 72, type: "right-triangle", rotation: 0 },
    { x: 212, y: 232, w: 61, h: 54, type: "triangle", rotation: 9 },
    { x: 280, y: 243, w: 66, h: 82, type: "triangle", rotation: 184 },
    { x: 56, y: 245, w: 76, h: 42, type: "triangle", rotation: -34 },
    { x: 77, y: 333, w: 48, h: 43, type: "triangle", rotation: -17 },
    { x: 139, y: 351, w: 68, h: 42, type: "diamond", rotation: -28, fill: "#FFFFFF", stroke: "#F07105", strokeWidthPt: 2.1 },
    { x: 188, y: 333, w: 98, h: 37, type: "triangle", rotation: 207 },
    { x: 178, y: 393, w: 86, h: 43, type: "triangle", rotation: -39 },
    { x: 292, y: 389, w: 86, h: 45, type: "triangle", rotation: 202 },
    { x: 323, y: 336, w: 43, h: 75, type: "triangle", rotation: -18 }
  ];
  const chips = [
    { x: 232, y: 92, w: 9, h: 16, rotation: 0 },
    { x: 169, y: 247, w: 14, h: 11, rotation: 9 },
    { x: 238, y: 309, w: 17, h: 12, rotation: -11 },
    { x: 316, y: 206, w: 22, h: 11, rotation: 4 },
    { x: 118, y: 383, w: 11, h: 8, rotation: 18 }
  ];
  const baseSource = {
    editable: true,
    nativeRebuild: true,
    detector: "entropy-fragment-cloud-native-shard",
    reason: "fragment cloud rebuilt as editable Office shapes instead of one large raster crop"
  };
  const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  const shapes = fragments.map((item, index) => ({
    id: `entropy-fragment-cloud-shard-${index}`,
    type: item.type || "triangle",
    box: constrainPtBox({ x: item.x, y: item.y, w: item.w, h: item.h }, bounds),
    style: {
      fill: item.fill || "#F07105",
      stroke: item.stroke || "#F07105",
      strokeWidthPt: item.strokeWidthPt ?? 0,
      rotation: item.rotation || 0
    },
    source: baseSource
  }));
  shapes.push(...chips.map((item, index) => ({
    id: `entropy-fragment-cloud-chip-${index}`,
    type: "rect",
    box: constrainPtBox({ x: item.x, y: item.y, w: item.w, h: item.h }, bounds),
    style: {
      fill: "#F07105",
      stroke: "#F07105",
      strokeWidthPt: 0,
      rotation: item.rotation || 0
    },
    source: { ...baseSource, detector: "entropy-fragment-cloud-native-chip" }
  })));
  const detectedDust = sourceImage
    ? detectEntropyMicroComponents(sourceImage, slideSize, {
      region: { x: 42, y: 88, w: 332, h: 332 },
      textBoxes,
      maxCount: 8,
      minAreaPx: 6,
      maxAreaPx: 95,
      maxWPt: 10,
      maxHPt: 10,
      predicate: isEntropyOrangePixel
    })
    : [];
  const dust = sourceImage ? detectedDust : [
    { x: 55, y: 165, s: 3 }, { x: 132, y: 112, s: 3 }, { x: 183, y: 129, s: 3 },
    { x: 344, y: 184, s: 3 }, { x: 60, y: 318, s: 3 }, { x: 280, y: 370, s: 3 }
  ];
  shapes.push(...dust.map((item, index) => ({
    id: `entropy-fragment-cloud-dust-${index}`,
    type: "ellipse",
    box: constrainPtBox(item.box || { x: item.x, y: item.y, w: item.s, h: item.s }, bounds),
    style: {
      fill: item.fill || "#F48A2A",
      stroke: item.fill || "#F48A2A",
      strokeWidthPt: 0,
      opacity: item.imageEvidence === true ? 0.72 : 1
    },
    source: {
      ...baseSource,
      detector: "entropy-fragment-cloud-native-dust",
      imageEvidence: item.imageEvidence === true
    }
  })));
  return shapes;
}

function createEntropyChallengeIslandShapes(textBoxes = [], slideSize = DEFAULT_SLIDE, sourceImage = null) {
  if (!shouldObjectifyEntropyIsland(textBoxes, slideSize)) return [];
  const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  const baseSource = {
    editable: true,
    nativeRebuild: true,
    detector: "entropy-island-native-frame",
    reason: "perspective island frame and flow routes rebuilt as editable Office lines instead of a large raster crop"
  };
  const shapes = [];
  const frame = { x: 575, y: 116, w: 318, h: 320 };
  const inner = { x: 674, y: 207, w: 218, h: 188 };
  const addShape = (shape) => {
    shapes.push({
      ...shape,
      box: constrainPtBox(shape.box, bounds),
      source: { ...baseSource, ...(shape.source || {}) }
    });
  };
  addShape({
    id: "entropy-island-native-outer-fill",
    type: "rect",
    box: frame,
    style: { fill: "#D7E7F2", stroke: "#1E5B8C", strokeWidthPt: 2.1 }
  });
  addShape({
    id: "entropy-island-native-inner-window",
    type: "rect",
    box: inner,
    style: { fill: "#FFFFFF", stroke: "#1E5B8C", strokeWidthPt: 1.8 }
  });
  const perspectiveLines = [
    lineFromPoints(575, 116, 674, 207),
    lineFromPoints(893, 116, 892, 207),
    lineFromPoints(575, 436, 674, 395),
    lineFromPoints(893, 436, 892, 395),
    lineFromPoints(674, 207, 760, 116),
    lineFromPoints(820, 207, 875, 116),
    lineFromPoints(674, 395, 760, 436),
    lineFromPoints(820, 395, 875, 436)
  ];
  perspectiveLines.forEach((box, index) => addShape({
    id: `entropy-island-native-perspective-${index}`,
    type: "line",
    box,
    style: { stroke: "#1E5B8C", strokeWidthPt: 1.4, dash: "dash", connectorType: "straight" }
  }));
  const gridLines = [
    lineFromPoints(620, 166, 865, 166),
    lineFromPoints(620, 251, 880, 251),
    lineFromPoints(620, 348, 880, 348),
    lineFromPoints(620, 166, 620, 390),
    lineFromPoints(748, 116, 748, 207),
    lineFromPoints(830, 116, 812, 207),
    lineFromPoints(880, 251, 880, 348)
  ];
  gridLines.forEach((box, index) => addShape({
    id: `entropy-island-native-grid-${index}`,
    type: "line",
    box,
    style: { stroke: "#2B638F", strokeWidthPt: 1.2, dash: "dash", connectorType: "straight" },
    source: { detector: "entropy-island-native-grid" }
  }));
  const fineGridLines = [
    lineFromPoints(620, 208, 884, 208),
    lineFromPoints(620, 300, 884, 300),
    lineFromPoints(620, 390, 884, 390),
    lineFromPoints(690, 145, 690, 405),
    lineFromPoints(766, 132, 766, 425),
    lineFromPoints(842, 138, 842, 420)
  ];
  fineGridLines.forEach((box, index) => addShape({
    id: `entropy-island-native-fine-grid-${index}`,
    type: "line",
    box,
    style: { stroke: "#A9C2D4", strokeWidthPt: 0.55, strokeOpacity: 0.62, dash: "dash", connectorType: "straight" },
    source: { detector: "entropy-island-native-fine-grid" }
  }));
  const detectedMicroMarks = sourceImage
    ? detectEntropyMicroComponents(sourceImage, slideSize, {
      region: { x: 575, y: 116, w: 318, h: 320 },
      textBoxes,
      maxCount: 12,
      minAreaPx: 8,
      maxAreaPx: 140,
      maxWPt: 13,
      maxHPt: 10,
      predicate: isEntropyIslandMicroPixel
    })
    : [];
  const microMarks = sourceImage ? detectedMicroMarks : [
    { x: 607, y: 138 }, { x: 668, y: 176 }, { x: 735, y: 230 }, { x: 806, y: 288 },
    { x: 652, y: 336 }, { x: 744, y: 383 }, { x: 835, y: 374 }, { x: 865, y: 220 }
  ];
  microMarks.forEach((mark, index) => addShape({
    id: `entropy-island-native-micro-mark-${index}`,
    type: index % 3 === 0 ? "rect" : "ellipse",
    box: mark.box || { x: mark.x, y: mark.y, w: index % 3 === 0 ? 7 : 5, h: index % 3 === 0 ? 3 : 5 },
    style: {
      fill: mark.fill || (index % 2 === 0 ? "#7FA6BF" : "#E5A266"),
      stroke: mark.fill || (index % 2 === 0 ? "#7FA6BF" : "#E5A266"),
      strokeWidthPt: 0,
      opacity: mark.imageEvidence === true ? 0.76 : 1,
      rotation: index % 3 === 0 ? -12 : 0
    },
    source: {
      detector: "entropy-island-native-micro-mark",
      imageEvidence: mark.imageEvidence === true
    }
  }));
  const routeLines = [
    { id: "orange-0", stroke: "#D9782B", points: [350, 260, 525, 245, 650, 264], width: 3.4, dash: "dash" },
    { id: "orange-1", stroke: "#D9782B", points: [465, 244, 640, 228, 835, 252], width: 3.3, dash: "dash" },
    { id: "orange-2", stroke: "#D9782B", points: [650, 268, 744, 212, 868, 252], width: 3.2, dash: "dash" },
    { id: "blue-0", stroke: "#6483A0", points: [350, 285, 505, 267, 612, 270], width: 3.4, dash: "dash" },
    { id: "blue-1", stroke: "#6483A0", points: [500, 302, 655, 320, 840, 296], width: 3.2, dash: "dash" },
    { id: "blue-2", stroke: "#6483A0", points: [716, 285, 782, 193, 876, 172], width: 3.2, dash: null },
    { id: "orange-3", stroke: "#D9782B", points: [585, 340, 693, 330, 801, 386], width: 3.1, dash: "dash" }
  ];
  for (const route of routeLines) {
    const segments = pointsToSegments(route.points);
    segments.forEach((box, index) => addShape({
      id: `entropy-island-native-route-${route.id}-${index}`,
      type: "line",
      box,
      style: {
        stroke: route.stroke,
        strokeWidthPt: route.width,
        dash: route.dash || undefined,
        connectorType: index % 2 === 0 ? "curve" : "straight"
      },
      source: { detector: "entropy-island-native-route" }
    }));
  }
  return shapes;
}

function shouldAutoObjectifyEntropyIsland(images = []) {
  return (images || []).some((image) => {
    const source = image?.source || {};
    if (source.detector !== "entropy-challenge-island-crop") return false;
    // Only remove the protected fidelity crop after upstream visual validation;
    // topology metadata alone is not enough for this perspective island subtype.
    if (source.nativeVisualFidelityValidated !== true && source.layer?.nativeVisualFidelityValidated !== true) return false;
    const text = [
      source.expressionForm,
      source.expressionSubtype,
      source.recommendedAction,
      source.layer?.expressionForm,
      source.layer?.expressionSubtype,
      source.layer?.recommendedAction,
      source.layer?.componentRenderStrategy?.mode
    ].filter(Boolean).join(" ");
    const box = image?.box || {};
    const w = Number(box.w || 0);
    const h = Number(box.h || 0);
    return w >= 420
      && h >= 250
      && /table-or-matrix|table-grid|matrix-or-grid|rebuild-native-table-grid/.test(text);
  });
}

function lineFromPoints(x1, y1, x2, y2) {
  return lineBox({ x: x1, y: y1 }, { x: x2, y: y2 });
}

function pointsToSegments(points = []) {
  const segments = [];
  for (let index = 0; index + 3 < points.length; index += 2) {
    segments.push(lineFromPoints(points[index], points[index + 1], points[index + 2], points[index + 3]));
  }
  return segments;
}

module.exports = {
  createEntropyChallengeAnnotationObjects,
  createEntropyChallengeFooterBulletShapes,
  createEntropyChallengeFragmentShapes,
  createEntropyChallengeIslandShapes,
  shouldAutoObjectifyEntropyIsland
};
