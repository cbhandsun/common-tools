"use strict";

function createTriangleTopologyToolkit(operations = {}) {
  const ops = validateOperations(operations);

  function createShapes(images = [], textBoxes = [], sourceImage = null, slideSize = ops.defaultSlide) {
    if (!sourceImage) return [];
    const effectiveSlideSize = normalizeSlideSize(slideSize, ops.defaultSlide);
    const shapes = [];
    for (const image of Array.isArray(images) ? images : []) {
      if (!shouldObjectify(image, textBoxes)) continue;
      const topology = infer(
        image.box,
        ops.measurePrimitives(sourceImage, image.box, effectiveSlideSize)
      );
      if (!topology) continue;
      const detectedTextBoxes = ops.nativeTextBoxes(image, topology, textBoxes);
      const nativeTextBoxes = Array.isArray(detectedTextBoxes) ? detectedTextBoxes : [];
      const centerTextBoxes = byDetector(nativeTextBoxes, "triangle-topology-native-center-text");
      const topTextBoxes = byDetector(nativeTextBoxes, "triangle-topology-native-top-text");
      const bottomTextBoxes = byDetector(nativeTextBoxes, "triangle-topology-native-bottom-text");
      const sideTextBoxes = byDetector(nativeTextBoxes, "triangle-topology-native-side-text");
      const commonSource = {
        editable: true,
        nativeRebuild: true,
        layerSourceId: image.id || null,
        componentOwnerId: `${image.id || "triangle-topology"}-native-component`,
        componentOwnerKind: "triangle-topology"
      };
      const arrowFills = topology.arrows.map((arrow) => (
        ops.sampleArrowFill(sourceImage, arrow.box, effectiveSlideSize) || "#2878D4"
      ));
      topology.edges.forEach((edge, index) => shapes.push({
        id: `${image.id || "triangle-topology"}-native-edge-${index}`,
        type: "line",
        box: edge.box,
        style: { stroke: arrowFills[index] || "#2878D4", strokeWidthPt: edge.strokeWidthPt || 2.8, connectorType: "straight", lineCap: "round" },
        source: { ...commonSource, detector: "triangle-topology-native-edge", index, sampledStroke: arrowFills[index] || null, ...ops.componentMetadata(image.id, edgeRole(index), "edge") }
      }));
      topology.arrows.forEach((arrow, index) => shapes.push({
        id: `${image.id || "triangle-topology"}-native-arrow-${index}`,
        type: "freeform",
        box: arrow.box,
        points: arrow.points,
        style: { fill: arrowFills[index] || "#2878D4", stroke: arrowFills[index] || "#2878D4", strokeWidthPt: 0 },
        source: { ...commonSource, detector: "triangle-topology-native-arrow", index, sampledFill: arrowFills[index] || null, ...ops.componentMetadata(image.id, edgeRole(index), "arrow") }
      }));
      shapes.push({
        id: `${image.id || "triangle-topology"}-native-center`,
        type: "ellipse",
        box: topology.center,
        style: { fill: "#1689F3", stroke: "#D8EBFF", strokeWidthPt: 2, shadow: { color: "#1689F3", alpha: 0.18, blurPt: 4, distancePt: 0, angle: 0 } },
        source: { ...commonSource, detector: "triangle-topology-native-center", ...ops.componentMetadata(image.id, "center-baseline", "center") }
      });
      image.source = {
        ...(image.source || {}),
        triangleTopologyObjectified: true,
        triangleTopologyCenterTextObjectified: centerTextBoxes.length > 0,
        triangleTopologyTopTextObjectified: topTextBoxes.length > 0,
        triangleTopologyBottomTextObjectified: bottomTextBoxes.length > 0,
        triangleTopologySideTextObjectified: sideTextBoxes.length > 0,
        triangleTopologyTextPreservedInCrop: false,
        triangleTopologyNodesObjectified: false,
        triangleTopologyVisualConnectorsObjectified: true,
        triangleTopologyVisualConnectorsPreservedAsCrops: false,
        triangleTopologyNativeTextBoxes: nativeTextBoxes,
        detectedTriangleTopologyNativeTextBoxes: nativeTextBoxes,
        objectifiedTriangleTopologyEdges: topology.edges.length,
        objectifiedTriangleTopologyArrows: topology.arrows.length,
        objectifiedTriangleTopologyNodes: 0,
        preservedTriangleTopologyNodeCrops: topology.nodes.length,
        preservedTriangleTopologyVisualConnectorCrops: 0,
        preserveResidualCropUnderNativeRebuild: true,
        dropErasedResidualAfterNativeRebuild: false,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt triangle edges, arrows, center, and labels natively while preserving only gem nodes as local crops`
      };
    }
    return shapes;
  }

  function shouldObjectify(image, textBoxes = []) {
    const box = image?.box || {};
    if (!isCandidateImage(image) || !boundedDiagramBox(box, ops.defaultSlide)) return false;
    const aspect = box.w / box.h;
    if (aspect < 0.95 || aspect > 1.35 || box.w < 300 || box.h < 260) return false;
    const neighborhood = ops.expandPtBox(box, ops.defaultSlide, Math.max(48, box.w * 0.16), Math.max(36, box.h * 0.16));
    const internalTexts = (Array.isArray(textBoxes) ? textBoxes : [])
      .filter((item) => item?.box && typeof item.text === "string" && ops.boxCenterInside(item.box, neighborhood))
      .map((item) => item.text.trim());
    const sourceText = String(image?.source?.pageText || image?.source?.allText || "");
    const joined = `${internalTexts.join(" ")} ${sourceText}`;
    const normalized = ops.normalizeText(joined);
    const strongTriangleTitle = /铁三角/.test(normalized) && /原型/.test(normalized) && /PRD/i.test(joined) && /评审|Review/i.test(joined);
    if (strongTriangleTitle) return /基线|可视化|推导|文档/.test(normalized);
    if (internalTexts.length < 7) return false;
    return /PRD|Review|Hif|原型|评审|基线|可视化/.test(joined);
  }

  function infer(box, measurement = null) {
    if (!boundedDiagramBox(box, ops.defaultSlide)) return null;
    const left = { x: box.x + box.w * 0.17, y: box.y + box.h * 0.79 };
    const top = { x: box.x + box.w * 0.50, y: box.y + box.h * 0.16 };
    const right = { x: box.x + box.w * 0.84, y: box.y + box.h * 0.79 };
    const edgeInset = 0.03;
    const nodeW = box.w * 0.19;
    const nodeH = nodeW * 0.74;
    const shaftWidth = Math.max(7, box.w * 0.024);
    const headWidth = Math.max(22, box.w * 0.07);
    const headLength = Math.max(20, box.w * 0.064);
    const fallbackEdges = [
      { box: lineBox({ x: left.x + box.w * edgeInset, y: left.y - box.h * 0.03 }, { x: top.x - box.w * 0.05, y: top.y + box.h * 0.02 }) },
      { box: lineBox({ x: top.x + box.w * 0.05, y: top.y + box.h * 0.02 }, { x: right.x - box.w * edgeInset, y: right.y - box.h * 0.03 }) },
      { box: lineBox({ x: left.x + box.w * 0.08, y: left.y + box.h * 0.02 }, { x: right.x - box.w * 0.07, y: right.y + box.h * 0.02 }) }
    ];
    const fallbackArrows = [
      directedArrow({ x: box.x + box.w * 0.14, y: box.y + box.h * 0.76 }, { x: box.x + box.w * 0.38, y: box.y + box.h * 0.20 }, shaftWidth, headWidth, headLength),
      directedArrow({ x: box.x + box.w * 0.62, y: box.y + box.h * 0.20 }, { x: box.x + box.w * 0.87, y: box.y + box.h * 0.76 }, shaftWidth, headWidth, headLength),
      directedArrow({ x: box.x + box.w * 0.78, y: box.y + box.h * 0.91 }, { x: box.x + box.w * 0.26, y: box.y + box.h * 0.91 }, shaftWidth, headWidth, headLength)
    ];
    const measuredEdges = validBaseline(measurement?.baseline) ? [
      { box: lineBox(measurement.baseline.left, { x: top.x - box.w * 0.05, y: top.y + box.h * 0.02 }), strokeWidthPt: measurement.baseline.strokeWidthPt },
      { box: lineBox({ x: top.x + box.w * 0.05, y: top.y + box.h * 0.02 }, measurement.baseline.right), strokeWidthPt: measurement.baseline.strokeWidthPt },
      { box: lineBox(measurement.baseline.left, measurement.baseline.right), strokeWidthPt: measurement.baseline.strokeWidthPt }
    ] : null;
    const measuredArrows = Array.isArray(measurement?.arrows) && measurement.arrows.length === 3
      && measurement.arrows.every(validMeasuredArrow)
      ? measurement.arrows.map((arrow) => directedArrow(arrow.from, arrow.to, arrow.shaftWidthPt, arrow.headWidthPt, arrow.headLengthPt))
      : null;
    return {
      edges: measuredEdges || fallbackEdges,
      arrows: measuredArrows || fallbackArrows,
      center: positiveBox(measurement?.center) ? measurement.center : {
        x: ops.round(box.x + box.w * 0.47), y: ops.round(box.y + box.h * 0.50),
        w: ops.round(box.w * 0.13), h: ops.round(box.w * 0.13)
      },
      nodes: [
        { name: "top", label: "标准统一", box: { x: ops.round(top.x - nodeW / 2), y: ops.round(box.y + box.h * 0.02), w: ops.round(nodeW), h: ops.round(nodeH) } },
        { name: "left", label: "质量前置", box: { x: ops.round(left.x - nodeW / 2), y: ops.round(box.y + box.h * 0.75), w: ops.round(nodeW), h: ops.round(nodeH) } },
        { name: "right", label: "效率跃升", box: { x: ops.round(right.x - nodeW / 2), y: ops.round(box.y + box.h * 0.75), w: ops.round(nodeW), h: ops.round(nodeH) } }
      ]
    };
  }

  function lineBox(start, end) {
    return { x: ops.round(start.x), y: ops.round(start.y), w: ops.round(end.x - start.x), h: ops.round(end.y - start.y) };
  }

  function directedArrow(from, to, shaftWidth, headWidth, headLength) {
    const dx = Number(to.x) - Number(from.x);
    const dy = Number(to.y) - Number(from.y);
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const boundedHeadLength = Math.min(Number(headLength || 0), length * 0.42);
    const headBase = { x: to.x - ux * boundedHeadLength, y: to.y - uy * boundedHeadLength };
    const shaftHalf = Number(shaftWidth || 0) / 2;
    const headHalf = Number(headWidth || 0) / 2;
    const points = [
      { x: from.x + px * shaftHalf, y: from.y + py * shaftHalf },
      { x: headBase.x + px * shaftHalf, y: headBase.y + py * shaftHalf },
      { x: headBase.x + px * headHalf, y: headBase.y + py * headHalf },
      { x: to.x, y: to.y },
      { x: headBase.x - px * headHalf, y: headBase.y - py * headHalf },
      { x: headBase.x - px * shaftHalf, y: headBase.y - py * shaftHalf },
      { x: from.x - px * shaftHalf, y: from.y - py * shaftHalf }
    ];
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const width = Math.max(0.01, Math.max(...points.map((point) => point.x)) - minX);
    const height = Math.max(0.01, Math.max(...points.map((point) => point.y)) - minY);
    return {
      box: { x: ops.round(minX), y: ops.round(minY), w: ops.round(width), h: ops.round(height) },
      points: points.map((point) => ({ x: ops.round((point.x - minX) / width), y: ops.round((point.y - minY) / height) }))
    };
  }

  return Object.freeze({ createShapes, infer, shouldObjectify });
}

function validateOperations(operations) {
  if (!operations || typeof operations !== "object" || Array.isArray(operations)) throw new TypeError("triangle topology operations must be an object");
  const required = ["boxCenterInside", "componentMetadata", "expandPtBox", "measurePrimitives", "nativeTextBoxes", "normalizeText", "round", "sampleArrowFill"];
  for (const name of required) {
    if (typeof operations[name] !== "function") throw new TypeError(`triangle topology operation ${name} must be a function`);
  }
  const defaultSlide = operations.defaultSlide;
  if (!positiveBox({ x: 0, y: 0, w: defaultSlide?.widthPt, h: defaultSlide?.heightPt })) throw new TypeError("triangle topology defaultSlide is invalid");
  return Object.freeze({ ...operations, defaultSlide: Object.freeze({ ...defaultSlide }) });
}

function byDetector(items, detector) {
  return (Array.isArray(items) ? items : []).filter((item) => item?.source?.detector === detector);
}

function edgeRole(index) {
  return ["left-edge", "right-edge", "bottom-edge"][index] || `edge-${index}`;
}

function isCandidateImage(image) {
  const detector = image?.source?.detector || "";
  const layer = image?.source?.layer || {};
  if (detector === "foreground-graphic-crop" && layer.layerType === "diagram-zone") return true;
  if (detector !== "cycle-illustration-underlay-crop") return false;
  return layer.layerType === "illustration-zone"
    && (layer.recommendedAction === "split-native-with-residual-crop"
      || image?.source?.reconstructionPlan?.strategy === "split-native-with-residual-crop");
}

function positiveBox(box) {
  return Boolean(box) && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
}

function boundedDiagramBox(box, slideSize) {
  return positiveBox(box)
    && Math.abs(box.x) <= slideSize.widthPt * 2
    && Math.abs(box.y) <= slideSize.heightPt * 2
    && box.w <= slideSize.widthPt * 2
    && box.h <= slideSize.heightPt * 2;
}

function normalizeSlideSize(value, fallback) {
  if (!value || !Number.isFinite(value.widthPt) || !Number.isFinite(value.heightPt)
    || value.widthPt <= 0 || value.heightPt <= 0
    || value.widthPt > fallback.widthPt * 4 || value.heightPt > fallback.heightPt * 4) {
    return fallback;
  }
  return value;
}

function validPoint(point) {
  return Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function validBaseline(baseline) {
  return Boolean(baseline) && validPoint(baseline.left) && validPoint(baseline.right);
}

function validMeasuredArrow(arrow) {
  return Boolean(arrow) && validPoint(arrow.from) && validPoint(arrow.to);
}

module.exports = { createTriangleTopologyToolkit };
