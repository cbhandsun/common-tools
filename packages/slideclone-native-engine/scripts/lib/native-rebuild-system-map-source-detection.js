"use strict";

const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { systemMapLine } = require("./native-rebuild-system-map-primitives");

function createSystemMapSourceDetection(dependencies = {}) {
  const {
    detectDenseLinkedNodeAtoms,
    fileExists,
    pixel,
    pointInsidePxBox,
    ptToPxBox,
    pxToPtBox,
    readPng,
    round
  } = dependencies;
  const required = {
    detectDenseLinkedNodeAtoms,
    fileExists,
    pixel,
    pointInsidePxBox,
    ptToPxBox,
    pxToPtBox,
    readPng,
    round
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`system map source detection dependency ${name} must be a function`);
  }

  function measureSystemMapNativeTopology(sourceImage = null, diagramBox = {}, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage || !diagramBox?.w || !diagramBox?.h) return { ready: false, nodeCount: 0, edgeCount: 0 };
    const nodes = detectSystemMapMainNetworkNodes(sourceImage, diagramBox, slideSize);
    if (nodes.length < 24) return { ready: false, nodeCount: nodes.length, edgeCount: 0 };
    const edges = detectSystemMapSourceNetworkLineShapes(
      "system-map-topology-probe",
      sourceImage,
      diagramBox,
      slideSize,
      nodes,
      { detector: "system-map-topology-probe" }
    );
    return { ready: edges.length >= 32, nodeCount: nodes.length, edgeCount: edges.length };
  }

  function detectSystemMapSourceMappingLineShapes(prefix, image = {}, b = {}, slideSize = DEFAULT_SLIDE, source = {}) {
    const region = ptToPxBox(b, image, slideSize, 0);
    const horizontalBands = detectSystemMapGreenAxisBands(image, region, "h");
    const verticalBands = detectSystemMapGreenAxisBands(image, region, "v");
    const shapes = [];
    horizontalBands.forEach((band, bandIndex) => {
      const runs = detectSystemMapGreenRuns(image, region, "h", band.center, Math.max(40, region.w * 0.08));
      runs.forEach((run, runIndex) => {
        const start = pxToPtBox({ x: run.start, y: band.center, w: 1, h: 1 }, image, slideSize, 0);
        const end = pxToPtBox({ x: run.end, y: band.center, w: 1, h: 1 }, image, slideSize, 0);
        const midX = (start.x + end.x) / 2;
        shapes.push(systemMapLine(`${prefix}-native-source-map-horizontal-${bandIndex}-${runIndex}`, start, end, "#4CBF8A", 1.15, {
          ...source,
          detector: "system-map-native-mapping-line",
          side: midX < b.x + b.w * 0.5 ? "left" : "right",
          axis: "h",
          sourceImageDetected: true
        }));
      });
    });
    verticalBands.forEach((band, bandIndex) => {
      const runs = detectSystemMapGreenRuns(image, region, "v", band.center, Math.max(30, region.h * 0.10));
      runs.forEach((run, runIndex) => {
        const start = pxToPtBox({ x: band.center, y: run.start, w: 1, h: 1 }, image, slideSize, 0);
        const end = pxToPtBox({ x: band.center, y: run.end, w: 1, h: 1 }, image, slideSize, 0);
        const ratio = (start.x - b.x) / Math.max(1, b.w);
        const side = ratio < 0.45 ? "left" : ratio > 0.60 ? "right" : "center";
        shapes.push(systemMapLine(`${prefix}-native-source-map-vertical-${bandIndex}-${runIndex}`, start, end, "#4CBF8A", 1.15, {
          ...source,
          detector: "system-map-native-mapping-line",
          side,
          axis: "v",
          sourceImageDetected: true
        }));
      });
    });
    return shapes;
  }

  function systemMapSourceDetectedNetworkLayout(prefix, b, textBoxes = [], slideSize = DEFAULT_SLIDE, source = {}) {
    const sourceImageFile = findSystemMapSourceImageFile(textBoxes);
    if (!sourceImageFile) return null;
    let sourceImage;
    try {
      sourceImage = readPng(sourceImageFile);
    } catch {
      return null;
    }
    const nodes = detectSystemMapMainNetworkNodes(sourceImage, b, slideSize);
    if (nodes.length < 24) return null;
    const edgeShapes = detectSystemMapSourceNetworkLineShapes(prefix, sourceImage, b, slideSize, nodes, source);
    if (edgeShapes.length < 32) return null;
    return {
      nodes,
      edgeShapes
    };
  }

  function detectSystemMapMainNetworkNodes(image = {}, b = {}, slideSize = DEFAULT_SLIDE) {
    return detectDenseLinkedNodeAtoms(image, b, slideSize, {
      idPrefix: "system-map-main-node",
      subRegionRatios: { x: 0.335, y: 0.105, w: 0.450, h: 0.650 },
      isTargetPixel: isSystemMapBluePixel,
      maxNodes: 54,
      minConnectedNodes: 18,
      maxNodeSizePt: 25,
      outputMaxSizePt: 18
    }).map((atom) => ({
      x: round(atom.center.x),
      y: round(atom.center.y),
      size: round(Math.max(9, Math.min(18, Math.max(Number(atom.box?.w || 0), Number(atom.box?.h || 0))))),
      kind: atom.shapeHint === "ellipse" ? "circle" : "rect",
      sourceImageDetected: true,
      detectionMethod: atom.source?.method || "dense-linked-node",
      sourceAtomId: atom.id
    }));
  }

  function detectSystemMapSourceNetworkLineShapes(prefix, image = {}, b = {}, slideSize = DEFAULT_SLIDE, nodes = [], source = {}) {
    const pxRegion = ptToPxBox({
      x: b.x + b.w * 0.325,
      y: b.y + b.h * 0.100,
      w: b.w * 0.470,
      h: b.h * 0.680
    }, image, slideSize, 0);
    const nodeMasks = nodes.map((node) => ptToPxBox({
      x: Number(node.x || 0) - Number(node.size || 0) / 2,
      y: Number(node.y || 0) - Number(node.size || 0) / 2,
      w: Number(node.size || 0),
      h: Number(node.size || 0)
    }, image, slideSize, 2));
    const horizontalRuns = detectSystemMapSourceAxisRuns(image, pxRegion, nodeMasks, "h", slideSize)
      .map((run) => ({ ...run, axis: "h" }));
    const verticalRuns = detectSystemMapSourceAxisRuns(image, pxRegion, nodeMasks, "v", slideSize)
      .map((run) => ({ ...run, axis: "v" }));
    const filteredRuns = filterSystemMapSourceNetworkRuns([...horizontalRuns, ...verticalRuns], nodes);
    const horizontal = filteredRuns
      .filter((run) => run.axis === "h")
      .slice(0, 80)
      .map((run, index) => systemMapLine(`${prefix}-native-network-source-horizontal-${index}`, run.from, run.to, "#126CB4", 1.25, {
        ...source,
        detector: "system-map-native-network-edge",
        route: "source-orthogonal",
        sourceImageDetected: true,
        axis: "h",
        runIndex: index
      }));
    const vertical = filteredRuns
      .filter((run) => run.axis === "v")
      .slice(0, 80)
      .map((run, index) => systemMapLine(`${prefix}-native-network-source-vertical-${index}`, run.from, run.to, "#126CB4", 1.25, {
        ...source,
        detector: "system-map-native-network-edge",
        route: "source-orthogonal",
        sourceImageDetected: true,
        axis: "v",
        runIndex: index
      }));
    return mergeNearbySystemMapSourceRuns([...horizontal, ...vertical]);
  }

  function systemMapSourceDetectedNetworkDetailShapes(prefix, b, textBoxes = [], slideSize = DEFAULT_SLIDE, source = {}) {
    const sourceImageFile = findSystemMapSourceImageFile(textBoxes);
    if (!sourceImageFile) return [];
    let sourceImage;
    try {
      sourceImage = readPng(sourceImageFile);
    } catch {
      return [];
    }
    const detailNodes = detectSystemMapBlueNodeComponents(sourceImage, b, slideSize);
    if (detailNodes.length < 8) return [];
    return buildSystemMapDetailShapesFromNodes(prefix, detailNodes, {
      ...source,
      detector: "system-map-native-network-detail-node",
      sourceImageDetected: true
    });
  }

  function findSystemMapSourceImageFile(textBoxes = []) {
    for (const textBox of textBoxes || []) {
      const sourceImage = textBox?.source?.pageImage || textBox?.source?.sourceImage;
      if (typeof sourceImage === "string" && sourceImage && fileExists(sourceImage)) return sourceImage;
    }
    return null;
  }

  function detectSystemMapBlueNodeComponents(image = {}, b = {}, slideSize = DEFAULT_SLIDE) {
    return detectDenseLinkedNodeAtoms(image, b, slideSize, {
      idPrefix: "system-map-detail-node",
      subRegionRatios: { x: 0.36, y: 0.09, w: 0.32, h: 0.65 },
      isTargetPixel: isSystemMapBluePixel,
      maxNodes: 28,
      minConnectedNodes: 8
    }).map((atom) => ({
      x: round(atom.center.x),
      y: round(atom.center.y),
      size: round(Math.max(Number(atom.box?.w || 0), Number(atom.box?.h || 0))),
      kind: atom.shapeHint === "ellipse" ? "circle" : "rect",
      confidence: atom.density,
      sourceAtomId: atom.id,
      detectionMethod: atom.source?.method || "dense-linked-node"
    }));
  }

  function isSystemMapBluePixel(image, x, y) {
    const offset = (y * image.width + x) * 4;
    const r = image.rgba[offset];
    const g = image.rgba[offset + 1];
    const b = image.rgba[offset + 2];
    const a = image.rgba[offset + 3];
    return a > 180 && b >= 95 && g >= 45 && g <= 180 && r <= 100 && b - r >= 38 && b - g >= 8;
  }

  function detectSystemMapGreenAxisBands(image = {}, region = {}, axis = "h") {
    const length = axis === "h" ? region.h : region.w;
    const cross = axis === "h" ? region.w : region.h;
    const threshold = Math.max(8, Math.floor(cross * 0.055));
    const candidates = [];
    for (let offset = 0; offset < length; offset += 1) {
      let hits = 0;
      for (let crossOffset = 0; crossOffset < cross; crossOffset += 2) {
        const x = axis === "h" ? region.x + crossOffset : region.x + offset;
        const y = axis === "h" ? region.y + offset : region.y + crossOffset;
        if (isSystemMapGreenPixel(pixel(image, x, y))) hits += 1;
      }
      if (hits >= threshold) candidates.push((axis === "h" ? region.y : region.x) + offset);
    }
    return groupAxisPositions(candidates, 3).map((group) => ({
      start: group[0],
      end: group[group.length - 1],
      center: Math.round(group.reduce((sum, value) => sum + value, 0) / group.length)
    }));
  }

  function detectSystemMapGreenRuns(image = {}, region = {}, axis = "h", position = 0, minimumLength = 40) {
    const start = axis === "h" ? region.x : region.y;
    const end = start + (axis === "h" ? region.w : region.h);
    const hits = [];
    for (let value = start; value < end; value += 1) {
      let matched = false;
      for (let delta = -2; delta <= 2 && !matched; delta += 1) {
        const x = axis === "h" ? value : position + delta;
        const y = axis === "h" ? position + delta : value;
        matched = isSystemMapGreenPixel(pixel(image, x, y));
      }
      if (matched) hits.push(value);
    }
    return groupAxisPositions(hits, 4)
      .map((group) => ({ start: group[0], end: group[group.length - 1] }))
      .filter((run) => run.end - run.start >= minimumLength);
  }

  function groupAxisPositions(values = [], maximumGap = 1) {
    const groups = [];
    for (const value of values) {
      const current = groups[groups.length - 1];
      if (!current || value - current[current.length - 1] > maximumGap) groups.push([value]);
      else current.push(value);
    }
    return groups;
  }

  function isSystemMapGreenPixel(color = {}) {
    const r = Number(color.r || 0);
    const g = Number(color.g || 0);
    const b = Number(color.b || 0);
    return g >= 105 && r <= 175 && g - r >= 22 && g - b >= 8;
  }

  function filterSystemMapSourceNetworkRuns(runs = [], nodes = []) {
    const nodeBoxes = (nodes || []).map((node) => ({
      x: Number(node.x || 0) - Number(node.size || 0) / 2,
      y: Number(node.y || 0) - Number(node.size || 0) / 2,
      w: Number(node.size || 0),
      h: Number(node.size || 0)
    }));
    return runs.filter((run) => {
      const length = systemMapSourceRunLength(run);
      const touchesNode = nodeBoxes.some((box) => systemMapRunTouchesBox(run, box, 3.2));
      const crossCount = runs.filter((candidate) => candidate.axis !== run.axis && systemMapRunsIntersect(run, candidate, 2.2)).length;
      if (length >= 28) return true;
      if (length >= 14 && (touchesNode || crossCount >= 2)) return true;
      if (length >= 9 && touchesNode && crossCount >= 1) return true;
      return false;
    });
  }

  function systemMapSourceRunLength(run = {}) {
    return Math.max(Math.abs(Number(run.to?.x || 0) - Number(run.from?.x || 0)), Math.abs(Number(run.to?.y || 0) - Number(run.from?.y || 0)));
  }

  function systemMapRunTouchesBox(run = {}, box = {}, pad = 0) {
    const x1 = Math.min(Number(run.from?.x || 0), Number(run.to?.x || 0));
    const x2 = Math.max(Number(run.from?.x || 0), Number(run.to?.x || 0));
    const y1 = Math.min(Number(run.from?.y || 0), Number(run.to?.y || 0));
    const y2 = Math.max(Number(run.from?.y || 0), Number(run.to?.y || 0));
    const bx1 = Number(box.x || 0) - pad;
    const bx2 = Number(box.x || 0) + Number(box.w || 0) + pad;
    const by1 = Number(box.y || 0) - pad;
    const by2 = Number(box.y || 0) + Number(box.h || 0) + pad;
    return x2 >= bx1 && x1 <= bx2 && y2 >= by1 && y1 <= by2;
  }

  function systemMapRunsIntersect(a = {}, b = {}, tolerance = 0) {
    if (a.axis === b.axis) return false;
    const h = a.axis === "h" ? a : b;
    const v = a.axis === "v" ? a : b;
    const hx1 = Math.min(Number(h.from?.x || 0), Number(h.to?.x || 0)) - tolerance;
    const hx2 = Math.max(Number(h.from?.x || 0), Number(h.to?.x || 0)) + tolerance;
    const hy = Number(h.from?.y || 0);
    const vx = Number(v.from?.x || 0);
    const vy1 = Math.min(Number(v.from?.y || 0), Number(v.to?.y || 0)) - tolerance;
    const vy2 = Math.max(Number(v.from?.y || 0), Number(v.to?.y || 0)) + tolerance;
    return vx >= hx1 && vx <= hx2 && hy >= vy1 && hy <= vy2;
  }

  function detectSystemMapSourceAxisRuns(image = {}, region = {}, nodeMasks = [], axis, slideSize = DEFAULT_SLIDE) {
    const runs = [];
    const minRunPx = Math.max(14, Math.round((axis === "h" ? image.width : image.height) / 960 * 12));
    const outer = axis === "h" ? region.h : region.w;
    const inner = axis === "h" ? region.w : region.h;
    for (let outerIndex = 0; outerIndex < outer; outerIndex += 1) {
      let start = null;
      let targetCount = 0;
      for (let innerIndex = 0; innerIndex <= inner; innerIndex += 1) {
        const x = axis === "h" ? region.x + innerIndex : region.x + outerIndex;
        const y = axis === "h" ? region.y + outerIndex : region.y + innerIndex;
        const inBounds = innerIndex < inner;
        const on = inBounds && isSystemMapBluePixel(image, x, y) && !pointInsideAnyPxBox(x, y, nodeMasks);
        if (on) {
          if (start === null) start = innerIndex;
          targetCount += 1;
          continue;
        }
        if (start !== null) {
          const length = innerIndex - start;
          if (length >= minRunPx && targetCount / Math.max(1, length) >= 0.72) {
            const pxBox = axis === "h"
              ? { x: region.x + start, y: region.y + outerIndex, w: length, h: 1 }
              : { x: region.x + outerIndex, y: region.y + start, w: 1, h: length };
            const ptBox = pxToPtBox(pxBox, image, slideSize, 0);
            runs.push(axis === "h"
              ? { from: { x: ptBox.x, y: ptBox.y }, to: { x: ptBox.x + ptBox.w, y: ptBox.y } }
              : { from: { x: ptBox.x, y: ptBox.y }, to: { x: ptBox.x, y: ptBox.y + ptBox.h } });
          }
          start = null;
          targetCount = 0;
        }
      }
    }
    return coalesceSystemMapSourceRuns(runs, axis);
  }

  function coalesceSystemMapSourceRuns(runs = [], axis) {
    const tolerance = 1.8;
    const groups = [];
    for (const run of runs) {
      const fixed = axis === "h" ? run.from.y : run.from.x;
      const start = axis === "h" ? Math.min(run.from.x, run.to.x) : Math.min(run.from.y, run.to.y);
      const end = axis === "h" ? Math.max(run.from.x, run.to.x) : Math.max(run.from.y, run.to.y);
      const group = groups.find((candidate) => Math.abs(candidate.fixed - fixed) <= tolerance && start <= candidate.end + 2.5 && end >= candidate.start - 2.5);
      if (group) {
        group.fixed = (group.fixed * group.count + fixed) / (group.count + 1);
        group.start = Math.min(group.start, start);
        group.end = Math.max(group.end, end);
        group.count += 1;
      } else {
        groups.push({ fixed, start, end, count: 1 });
      }
    }
    return groups
      .filter((group) => group.end - group.start >= 9)
      .sort((a, b) => (a.fixed - b.fixed) || (a.start - b.start))
      .map((group) => axis === "h"
        ? { from: { x: round(group.start), y: round(group.fixed) }, to: { x: round(group.end), y: round(group.fixed) } }
        : { from: { x: round(group.fixed), y: round(group.start) }, to: { x: round(group.fixed), y: round(group.end) } });
  }

  function mergeNearbySystemMapSourceRuns(shapes = []) {
    const seen = new Set();
    return shapes.filter((shape) => {
      const box = shape.box || {};
      const key = [
        Math.round(Number(box.x || 0) / 2),
        Math.round(Number(box.y || 0) / 2),
        Math.round(Number(box.w || 0) / 2),
        Math.round(Number(box.h || 0) / 2)
      ].join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function pointInsideAnyPxBox(x, y, boxes = []) {
    return (boxes || []).some((box) => pointInsidePxBox(x, y, box));
  }

  function buildSystemMapDetailShapesFromNodes(prefix, detailNodes = [], source = {}) {
    const blue = "#126CB4";
    const shapes = [];
    const rows = clusterSystemMapDetailRows(detailNodes);
    const detailEdges = [];
    for (const row of rows) {
      for (let index = 0; index < row.length - 1; index += 1) {
        detailEdges.push([row[index], row[index + 1], "row"]);
      }
    }
    const columns = clusterSystemMapDetailColumns(detailNodes);
    for (const column of columns) {
      for (let index = 0; index < column.length - 1; index += 1) {
        detailEdges.push([column[index], column[index + 1], "column"]);
      }
    }
    detailEdges.slice(0, 36).forEach(([fromIndex, toIndex, axis], index) => {
      shapes.push(...systemMapOrthogonalLineSegments(`${prefix}-native-network-detail-edge-detected-${index}`, detailNodes[fromIndex], detailNodes[toIndex], blue, 0.95, {
        ...source,
        detector: "system-map-native-network-detail-edge",
        sourceImageDetected: true,
        axis,
        fromIndex,
        toIndex
      }));
    });
    detailNodes.forEach((node, index) => {
      shapes.push(systemMapShape(`${prefix}-native-network-detail-node-detected-${index}`, node.kind === "circle" ? "ellipse" : "rect", {
        x: node.x - node.size / 2,
        y: node.y - node.size / 2,
        w: node.size,
        h: node.size
      }, {
        fill: blue,
        stroke: blue,
        strokeWidthPt: 0.4
      }, {
        ...source,
        detector: "system-map-native-network-detail-node",
        nodeKind: node.kind,
        detailIndex: index,
        confidence: node.confidence,
        detectionMethod: node.detectionMethod || null,
        sourceAtomId: node.sourceAtomId || null
      }));
    });
    return shapes;
  }

  function systemMapOrthogonalLineSegments(idBase, from = {}, to = {}, color, strokeWidthPt, source = {}) {
    const midX = round((Number(from.x || 0) + Number(to.x || 0)) / 2);
    const points = [
      { x: Number(from.x || 0), y: Number(from.y || 0) },
      { x: midX, y: Number(from.y || 0) },
      { x: midX, y: Number(to.y || 0) },
      { x: Number(to.x || 0), y: Number(to.y || 0) }
    ];
    const shapes = [];
    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
      const start = points[segmentIndex];
      const end = points[segmentIndex + 1];
      if (Math.abs(end.x - start.x) < 0.1 && Math.abs(end.y - start.y) < 0.1) continue;
      shapes.push(systemMapLine(`${idBase}-${segmentIndex}`, start, end, color, strokeWidthPt, {
        ...source,
        route: "orthogonal",
        segmentIndex
      }));
    }
    return shapes;
  }

  function systemMapShape(id, type, box, style, source = {}) {
    return {
      id,
      type,
      box: {
        x: round(box.x),
        y: round(box.y),
        w: round(box.w),
        h: round(box.h)
      },
      style,
      source
    };
  }

  function clusterSystemMapDetailRows(nodes = []) {
    return clusterSystemMapDetailAxis(nodes, "y", "x", 18);
  }

  function clusterSystemMapDetailColumns(nodes = []) {
    return clusterSystemMapDetailAxis(nodes, "x", "y", 20);
  }

  function clusterSystemMapDetailAxis(nodes = [], primary, secondary, tolerance) {
    const groups = [];
    nodes.forEach((node, index) => {
      const value = Number(node[primary] || 0);
      let group = groups.find((candidate) => Math.abs(candidate.value - value) <= tolerance);
      if (!group) {
        group = { value, indexes: [] };
        groups.push(group);
      }
      group.indexes.push(index);
      group.value = group.indexes.reduce((sum, itemIndex) => sum + Number(nodes[itemIndex][primary] || 0), 0) / group.indexes.length;
    });
    return groups
      .filter((group) => group.indexes.length >= 2)
      .map((group) => group.indexes.sort((a, b) => Number(nodes[a][secondary] || 0) - Number(nodes[b][secondary] || 0)));
  }

  return {
    detectSystemMapMainNetworkNodes,
    detectSystemMapSourceMappingLineShapes,
    detectSystemMapSourceNetworkLineShapes,
    findSystemMapSourceImageFile,
    isSystemMapBluePixel,
    measureSystemMapNativeTopology,
    systemMapSourceDetectedNetworkDetailShapes,
    systemMapSourceDetectedNetworkLayout
  };
}

module.exports = {
  createSystemMapSourceDetection
};
