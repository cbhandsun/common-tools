"use strict";

const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { round } = require("@common-tools/slideclone-core/raster-native-detection");
const {
  systemMapAssetGridTileSegments,
  systemMapBottomLabelTextBoxes,
  systemMapLine,
  systemMapShape
} = require("./native-rebuild-system-map-primitives");

function createSystemMapLayoutFactory(dependencies = {}) {
  const {
    detectSystemMapSourceMappingLineShapes,
    findSystemMapSourceImageFile,
    readPng,
    systemMapSourceDetectedNetworkDetailShapes,
    systemMapSourceDetectedNetworkLayout
  } = dependencies;
  const required = {
    detectSystemMapSourceMappingLineShapes,
    findSystemMapSourceImageFile,
    readPng,
    systemMapSourceDetectedNetworkDetailShapes,
    systemMapSourceDetectedNetworkLayout
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`system map layout dependency ${name} must be a function`);
  }

  function createSystemMapFidelityChromeObjects(textBoxes = [], slideSize = DEFAULT_SLIDE) {
    const source = {
      editable: true,
      nativeRebuild: true,
      confidence: 0.94,
      expressionForm: "text-and-ui-chrome",
      expressionSubtype: "system-map-fidelity-chrome"
    };
    const shapes = systemMapSearchChromeShapes("system-map-fidelity", textBoxes, slideSize, {
        ...source,
        detector: "system-map-fidelity-chrome-search"
      }).map((shape) => ({
        ...shape,
        source: {
          ...(shape.source || {}),
          detector: "system-map-fidelity-chrome-search"
        }
      }));
    return {
      shapes,
      textBoxes: []
    };
  }

  function inferSystemMapDiagramLayout(image = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
    const b = image.box || {};
    const prefix = image.id || "system-map";
    const shapes = [];
    const generatedTextBoxes = [];
    const source = {
      editable: true,
      nativeRebuild: true,
      layerSourceId: image.id || null,
      componentOwnerId: `${prefix}-native-system-map-component`,
      componentOwnerKind: "system-map-diagram",
      nativeComponentInstance: true,
      nativeComponentGroupId: `${prefix}-native-system-map-component`,
      nativeComponentArchetype: "system-map-diagram",
      nativeComponentRole: "system-map-structure",
      confidence: 0.86
    };
    let sourceImage = null;
    const sourceImageFile = findSystemMapSourceImageFile(textBoxes);
    if (sourceImageFile) {
      try {
        sourceImage = readPng(sourceImageFile);
      } catch {
        sourceImage = null;
      }
    }
    shapes.push(...systemMapDottedBackgroundShapes(prefix, b, slideSize, source));
    shapes.push(...systemMapSearchChromeShapes(prefix, textBoxes, slideSize, source));
    shapes.push(...systemMapBottomGridShapes(prefix, b, source));
    const measuredMappingLines = sourceImage
      ? detectSystemMapSourceMappingLineShapes(prefix, sourceImage, b, slideSize, source)
      : [];
    shapes.push(...(measuredMappingLines.length >= 40 ? measuredMappingLines : systemMapMappingLineShapes(prefix, b, source)));
    const sourceNetwork = systemMapSourceDetectedNetworkLayout(prefix, b, textBoxes, slideSize, source);
    const network = sourceNetwork || systemMapNetworkLayout(b);
    const rails = systemMapNetworkRailLayout(prefix, b, source);
    shapes.push(...(network.edgeShapes || systemMapOrthogonalNetworkEdgeShapes(prefix, network.edges, source)));
    shapes.push(...network.nodes.map((node, index) => systemMapShape(`${prefix}-native-network-node-${index}`, node.kind === "circle" ? "ellipse" : "rect", {
      x: node.x - node.size / 2,
      y: node.y - node.size / 2,
      w: node.size,
      h: node.size
    }, {
      fill: "#126CB4",
      stroke: "#126CB4",
      strokeWidthPt: 0.6
    }, {
      ...source,
      detector: "system-map-native-network-node",
      nodeKind: node.kind,
      sourceImageDetected: node.sourceImageDetected === true || undefined,
      detectionMethod: node.detectionMethod || undefined
    })));
    const sourceDetectedDetails = systemMapSourceDetectedNetworkDetailShapes(prefix, b, textBoxes, slideSize, source);
    shapes.push(...(sourceDetectedDetails.length ? sourceDetectedDetails : systemMapDenseNetworkDetailShapes(prefix, b, source)));
    shapes.push(...rails.shapes);
    generatedTextBoxes.push(...systemMapBottomLabelTextBoxes(prefix, b, source));
    generatedTextBoxes.push(...rails.textBoxes);
    return { shapes, textBoxes: generatedTextBoxes };
  }

  return {
    createSystemMapFidelityChromeObjects,
    inferSystemMapDiagramLayout
  };
}

function systemMapDottedBackgroundShapes(prefix, b, slideSize = DEFAULT_SLIDE, source = {}) {
  const shapes = [];
  const dot = Math.max(0.55, Math.min(0.9, b.w * 0.00095));
  const xStep = b.w * 0.011;
  const yStep = b.h * 0.021;
  const startX = Math.max(6, b.x - b.w * 0.035);
  const endX = Math.min(Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) - 6, b.x + b.w * 1.035);
  const startY = Math.max(4, b.y - b.h * 0.285);
  const endY = Math.min(Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) - 6, b.y + b.h * 1.005);
  // Dots are texture only; cap them tightly so dense maps stay responsive in PowerPoint.
  const maxDecorativeDots = 30;
  const estimatedColumns = Math.max(1, Math.floor((endX - startX) / Math.max(1, xStep)));
  const estimatedRows = Math.max(1, Math.floor((endY - startY) / Math.max(1, yStep)));
  const estimatedCandidateDots = Math.max(1, Math.ceil((estimatedColumns * estimatedRows) / 2));
  const keepEvery = Math.max(1, Math.ceil(estimatedCandidateDots / maxDecorativeDots));
  let index = 0;
  let kept = 0;
  for (let y = startY; y <= endY; y += yStep) {
    for (let x = startX; x <= endX; x += xStep) {
      if (index % 2 === 0 && kept % keepEvery === 0) {
        shapes.push(systemMapShape(`${prefix}-native-background-dot-${index}`, "ellipse", {
          x,
          y,
          w: dot,
          h: dot
        }, {
          fill: "#D9E0E7",
          stroke: "#D9E0E7",
          strokeWidthPt: 0,
          opacity: 0.88
        }, {
          ...source,
          detector: "system-map-native-background-dot",
          decorativeTexture: true,
          minimumUnitPolicy: "sampled-decorative-texture",
          dotIndex: index
        }));
      }
      if (index % 2 === 0) kept += 1;
      index += 1;
    }
  }
  return shapes;
}

function systemMapSearchChromeShapes(prefix, textBoxes = [], slideSize = DEFAULT_SLIDE, source = {}) {
  const searchText = (textBoxes || []).find((item) => /多域资产|全景搜索|全景搜素/.test(String(item.text || "")));
  const searchBox = searchText?.box
    ? {
        x: round(slideSize.widthPt - 258),
        y: round(Math.max(31, Math.min(34, searchText.box.y - 8))),
        w: 224,
        h: 31.5
      }
    : { x: slideSize.widthPt - 258, y: 33, w: 224, h: 31 };
  const lens = { x: searchBox.x + 14, y: searchBox.y + searchBox.h * 0.27, w: searchBox.h * 0.36, h: searchBox.h * 0.36 };
  return [
    systemMapShape(`${prefix}-native-search-box`, "roundRect", searchBox, {
      fill: "#FFFFFF",
      stroke: "#175D8A",
      strokeWidthPt: 1.2,
      radiusPt: 3
    }, { ...source, detector: "system-map-native-search" }),
    systemMapShape(`${prefix}-native-search-lens`, "ellipse", lens, {
      fill: "none",
      stroke: "#175D8A",
      strokeWidthPt: 1.7
    }, { ...source, detector: "system-map-native-search" }),
    systemMapLine(`${prefix}-native-search-handle`, {
      x: lens.x + lens.w * 0.78,
      y: lens.y + lens.h * 0.78
    }, {
      x: lens.x + lens.w * 1.28,
      y: lens.y + lens.h * 1.28
    }, "#175D8A", 1.8, { ...source, detector: "system-map-native-search" })
  ];
}

function systemMapBottomGridShapes(prefix, b, source = {}) {
  const shapes = [];
  const blue = "#126CB4";
  // The source is a 111 x 3 matrix of square assets, not a dashed rule. Keep
  // the individual tiles editable while packing each short run into one shape.
  const rows = 3;
  const cols = 111;
  const startX = b.x + b.w * 0.0034;
  const startY = b.y + b.h * 0.9318;
  const cellW = Math.max(4.9, Math.min(5.5, b.w * 0.00615));
  const cellH = Math.max(4.9, Math.min(5.5, b.h * 0.014));
  const gapX = Math.max(2.45, Math.min(2.8, b.w * 0.00305));
  const gapY = Math.max(2.1, Math.min(2.4, b.h * 0.006));
  const tilesPerShape = 20;
  for (let row = 0; row < rows; row += 1) {
    for (let firstColumn = 0; firstColumn < cols; firstColumn += tilesPerShape) {
      const tileCount = Math.min(tilesPerShape, cols - firstColumn);
      const x = startX + firstColumn * (cellW + gapX);
      const y = startY + row * (cellH + gapY);
      const w = tileCount * cellW + (tileCount - 1) * gapX;
      const h = cellH;
      shapes.push(systemMapShape(`${prefix}-native-asset-grid-row-${row}-part-${Math.floor(firstColumn / tilesPerShape)}`, "freeform", {
        x,
        y,
        w,
        h
      }, {
        fill: blue,
        stroke: "none",
        strokeWidthPt: 0,
        closePath: false,
        freeformSegments: systemMapAssetGridTileSegments(tileCount, cellW, gapX, w)
      }, {
        ...source,
        detector: "system-map-native-asset-grid",
        row,
        part: Math.floor(firstColumn / tilesPerShape),
        tileCount,
        decorativeTexture: true,
        nativeComponentMinimumUnit: "asset-grid-tile-run",
        minimumUnitPolicy: "source-sampled-asset-grid-tile-run"
      }));
    }
  }
  return shapes;
}

function systemMapMappingLineShapes(prefix, b, source = {}) {
  const shapes = [];
  const green = "#4CBF8A";
  const leftX = b.x + b.w * 0.003;
  const rightX = b.x + b.w * 0.997;
  const centerLeftX = b.x + b.w * 0.530;
  const centerRightX = b.x + b.w * 0.565;
  const bottomY = b.y + b.h * 0.925;
  const topY = b.y + b.h * 0.672;
  const sideLineCount = 31;
  for (let index = 0; index < sideLineCount; index += 1) {
    const y = b.y + b.h * (0.020 + index * 0.0198);
    const x = leftX + index * (b.w * 0.0069);
    shapes.push(systemMapLine(`${prefix}-native-left-map-horizontal-${index}`, { x: leftX, y }, { x: b.x + b.w * 0.340, y }, green, 1.15, {
      ...source,
      detector: "system-map-native-mapping-line",
      side: "left",
      index
    }));
    shapes.push(systemMapLine(`${prefix}-native-left-map-vertical-${index}`, { x, y }, { x, y: bottomY }, green, 1.15, {
      ...source,
      detector: "system-map-native-mapping-line",
      side: "left",
      index
    }));
  }
  for (let index = 0; index < sideLineCount; index += 1) {
    const y = b.y + b.h * (0.020 + index * 0.0198);
    const x = rightX - index * (b.w * 0.0069);
    shapes.push(systemMapLine(`${prefix}-native-right-map-horizontal-${index}`, { x: b.x + b.w * 0.660, y }, { x: rightX, y }, green, 1.15, {
      ...source,
      detector: "system-map-native-mapping-line",
      side: "right",
      index
    }));
    shapes.push(systemMapLine(`${prefix}-native-right-map-vertical-${index}`, { x, y }, { x, y: bottomY }, green, 1.15, {
      ...source,
      detector: "system-map-native-mapping-line",
      side: "right",
      index
    }));
  }
  for (let index = 0; index < 24; index += 1) {
    const x = centerLeftX + (centerRightX - centerLeftX) * (index / 23);
    shapes.push(systemMapLine(`${prefix}-native-center-map-vertical-${index}`, { x, y: topY }, { x, y: bottomY }, green, 0.95, {
      ...source,
      detector: "system-map-native-mapping-line",
      side: "center",
      index
    }));
  }
  return shapes;
}

function systemMapNetworkRailLayout(prefix, b, source = {}) {
  const labels = {
    left: ["IP-PBC", "PPS-C", "需求池", "评审流", "知识库", "领域资产", "交付工单", "运营视图"],
    right: ["BPM", "MKT", "MFG", "HR", "SCM", "财务", "门户"]
  };
  const blue = "#126CB4";
  const makeRail = (side, x, yStart, gap, w, h) => labels[side].map((text, index) => {
    const y = yStart + index * gap;
    return {
      shape: systemMapShape(`${prefix}-native-${side}-rail-module-${index}`, "rect", { x, y, w, h }, {
        fill: blue,
        stroke: blue,
        strokeWidthPt: 0
      }, {
        ...source,
        detector: "system-map-native-network-rail-module",
        side,
        index
      }),
      textBox: {
        id: `${prefix}-native-${side}-rail-label-${index}`,
        text,
        box: { x: round(x + 1), y: round(y + h * 0.22), w: round(w - 2), h: round(h * 0.58) },
        font: {
          family: "Microsoft YaHei",
          sizePt: 3.6,
          color: "#FFFFFF",
          opacity: 1,
          weight: "regular",
          align: "center",
          valign: "middle"
        },
        source: {
          ...source,
          detector: "system-map-native-network-rail-label",
          side,
          index
        }
      }
    };
  });
  const left = makeRail("left", b.x + b.w * 0.335, b.y + b.h * 0.150, b.h * 0.083, b.w * 0.022, b.h * 0.050);
  const right = makeRail("right", b.x + b.w * 0.735, b.y + b.h * 0.150, b.h * 0.094, b.w * 0.024, b.h * 0.056);
  return {
    shapes: [...left, ...right].map((item) => item.shape),
    textBoxes: [...left, ...right].map((item) => item.textBox)
  };
}

function systemMapNetworkLayout(b) {
  const nodeSpecs = [
    [0.34, 0.12, "rect", 15], [0.39, 0.13, "rect", 13], [0.45, 0.12, "rect", 14], [0.53, 0.10, "rect", 16], [0.59, 0.16, "rect", 14], [0.68, 0.13, "rect", 16], [0.76, 0.14, "rect", 15],
    [0.34, 0.25, "rect", 15], [0.39, 0.25, "rect", 15], [0.42, 0.30, "circle", 15], [0.46, 0.28, "rect", 15], [0.52, 0.24, "circle", 16], [0.57, 0.26, "rect", 14], [0.64, 0.28, "rect", 14], [0.73, 0.27, "circle", 15],
    [0.35, 0.42, "circle", 16], [0.41, 0.41, "circle", 15], [0.47, 0.42, "rect", 13], [0.51, 0.40, "rect", 15], [0.56, 0.40, "rect", 13], [0.61, 0.42, "rect", 15], [0.66, 0.41, "circle", 16], [0.76, 0.42, "circle", 15],
    [0.35, 0.56, "circle", 15], [0.40, 0.57, "circle", 15], [0.45, 0.56, "rect", 14], [0.54, 0.55, "rect", 14], [0.61, 0.56, "circle", 15], [0.68, 0.56, "rect", 15], [0.77, 0.57, "circle", 15],
    [0.36, 0.71, "rect", 14], [0.46, 0.69, "rect", 15], [0.51, 0.70, "rect", 16], [0.56, 0.70, "rect", 14], [0.66, 0.72, "rect", 15], [0.72, 0.72, "rect", 15]
  ];
  const nodes = nodeSpecs.map(([rx, ry, kind, size]) => ({ x: b.x + b.w * rx, y: b.y + b.h * ry, kind, size }));
  const edgePairs = [
    [0, 1], [1, 2], [2, 10], [3, 4], [3, 11], [4, 12], [5, 6], [5, 14], [6, 14],
    [7, 8], [8, 15], [8, 9], [9, 10], [10, 17], [11, 18], [12, 19], [13, 20], [14, 21], [14, 22],
    [15, 23], [15, 16], [16, 24], [17, 25], [18, 26], [18, 19], [19, 27], [20, 21], [21, 28], [22, 29],
    [23, 30], [24, 30], [25, 31], [26, 32], [27, 33], [28, 34], [29, 35], [31, 32], [32, 33], [34, 35],
    [2, 18], [10, 19], [12, 20], [20, 28], [24, 32], [25, 33], [5, 13], [13, 21], [6, 22], [22, 35]
  ];
  return {
    nodes,
    edges: edgePairs.map(([from, to]) => ({ from: nodes[from], to: nodes[to] }))
  };
}

function systemMapOrthogonalNetworkEdgeShapes(prefix, edges = [], source = {}) {
  const shapes = [];
  edges.forEach((edge, edgeIndex) => {
    shapes.push(...systemMapOrthogonalLineSegments(`${prefix}-native-network-edge-${edgeIndex}`, edge.from, edge.to, "#126CB4", 1.25, {
        ...source,
        detector: "system-map-native-network-edge",
        route: "orthogonal",
        edgeIndex
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

function systemMapDenseNetworkDetailShapes(prefix, b, source = {}) {
  const blue = "#126CB4";
  const shapes = [];
  const detailNodes = [
    [0.405, 0.185, "rect", 11], [0.418, 0.242, "rect", 10], [0.432, 0.365, "rect", 10], [0.430, 0.505, "circle", 11],
    [0.485, 0.168, "rect", 10], [0.495, 0.230, "circle", 11], [0.500, 0.315, "rect", 10], [0.498, 0.455, "rect", 10], [0.500, 0.615, "rect", 11],
    [0.535, 0.160, "rect", 11], [0.545, 0.220, "rect", 10], [0.545, 0.330, "circle", 11], [0.545, 0.490, "rect", 10], [0.545, 0.635, "rect", 10],
    [0.585, 0.205, "rect", 10], [0.595, 0.305, "rect", 10], [0.595, 0.455, "circle", 11], [0.605, 0.615, "rect", 10]
  ].map(([rx, ry, kind, size]) => ({ x: b.x + b.w * rx, y: b.y + b.h * ry, kind, size }));
  const detailEdges = [
    [0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7], [7, 8],
    [9, 10], [10, 11], [11, 12], [12, 13], [14, 15], [15, 16], [16, 17],
    [1, 5], [5, 10], [10, 14], [6, 11], [11, 15], [7, 12], [12, 16],
    [3, 8], [8, 13], [13, 17]
  ];
  detailEdges.forEach(([fromIndex, toIndex], index) => {
    shapes.push(...systemMapOrthogonalLineSegments(`${prefix}-native-network-detail-edge-${index}`, detailNodes[fromIndex], detailNodes[toIndex], blue, 1.0, {
      ...source,
      detector: "system-map-native-network-detail-edge",
      fromIndex,
      toIndex
    }));
  });
  detailNodes.forEach((node, index) => {
    shapes.push(systemMapShape(`${prefix}-native-network-detail-node-${index}`, node.kind === "circle" ? "ellipse" : "rect", {
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
      detailIndex: index
    }));
  });
  return shapes;
}

module.exports = {
  createSystemMapLayoutFactory,
  systemMapSearchChromeShapes
};
