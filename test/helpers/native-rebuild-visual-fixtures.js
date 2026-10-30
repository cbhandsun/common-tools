"use strict";
// Deterministic visual fixture factories shared by the native rebuild suite.

function chartZoneImage(id, archetype, visualAtoms) {
  return {
    id,
    box: { x: 0, y: 0, w: 460, h: 320 },
    source: {
      detector: `${archetype}-axis-series-crop`,
      layer: {
        layerType: "chart-zone",
        recommendedAction: "attempt-native-reconstruction",
        diagramUnderstanding: {
          archetype,
          nativeReadiness: "native-rebuild",
          confidence: 0.86,
          visualAtoms
        }
      }
    }
  };
}

function chartAxisAtom(id, axis, box) {
  return {
    id,
    kind: "grid-line-candidate",
    axis,
    shapeHint: axis === "h" ? "grid-line-horizontal" : "grid-line-vertical",
    box,
    color: "#64748B",
    nativeCandidate: true,
    residualCandidate: false,
    density: 0.88
  };
}

function chartRectAtom(id, box, color) {
  return {
    id,
    kind: "native-rect-candidate",
    shapeHint: "bar",
    box,
    color,
    nativeCandidate: true,
    residualCandidate: false,
    density: 0.9
  };
}

function chartLineAtom(id, from, to, color) {
  return {
    id,
    kind: "connector-line-candidate",
    shapeHint: "line-diagonal",
    box: {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      w: Math.abs(to.x - from.x),
      h: Math.abs(to.y - from.y)
    },
    lineEndpoints: { from, to },
    color,
    nativeCandidate: true,
    residualCandidate: false,
    density: 0.82
  };
}

function chartPointAtom(id, box) {
  return {
    id,
    kind: "native-scatter-point-candidate",
    shapeHint: "scatter-point",
    box,
    color: "#F2994A",
    nativeCandidate: true,
    residualCandidate: false,
    density: 0.84
  };
}

function chartDonutAtom(id, box, color) {
  return {
    id,
    kind: "native-donut-candidate",
    shapeHint: "donut",
    box,
    color,
    holeRatio: 0.52,
    nativeCandidate: true,
    residualCandidate: false,
    density: 0.86
  };
}

function chartDonutSegmentAtom(id, box, color, startDeg, endDeg) {
  return {
    id,
    kind: "native-donut-segment-candidate",
    shapeHint: "donut-segment",
    box,
    donutParentBox: { x: 92, y: 70, w: 144, h: 144 },
    donutSegmentAngles: { startDeg, endDeg },
    color,
    holeRatio: 0.52,
    nativeCandidate: true,
    residualCandidate: false,
    density: 0.42
  };
}

function chartArcArrowSegmentAtom(id, box, color, startDeg, endDeg, arcArrowHead) {
  return {
    id,
    kind: "native-arc-arrow-segment-candidate",
    shapeHint: "arc-arrow-segment",
    box,
    donutParentBox: { x: 82, y: 52, w: 144, h: 144 },
    donutSegmentAngles: { startDeg, endDeg },
    color,
    holeRatio: 0.62,
    arcArrowHead,
    nativeCandidate: true,
    residualCandidate: false,
    density: 0.38
  };
}


function visualAtomImage(layerType, visualAtoms, archetype = null, understandingOverrides = {}) {
  return {
    id: `${layerType}-layer`,
    box: { x: 0, y: 0, w: 400, h: 240 },
    source: {
      layer: {
        layerType,
        diagramUnderstanding: {
          archetype: archetype || (layerType === "table-zone" ? "matrix-or-grid" : "generic-node-diagram"),
          visualAtoms,
          ...understandingOverrides
        }
      }
    }
  };
}


function component(color) {
  return {
    box: { x: 0, y: 0, w: 60, h: 60 },
    area: 2400,
    density: 0.67,
    color
  };
}

function makeImage(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  const parsed = parseHex(color);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = parsed.r;
    rgba[i * 4 + 1] = parsed.g;
    rgba[i * 4 + 2] = parsed.b;
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

function fillRect(image, x, y, w, h, color) {
  const parsed = parseHex(color);
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = parsed.r;
      image.rgba[offset + 1] = parsed.g;
      image.rgba[offset + 2] = parsed.b;
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillRightTriangle(image, x, y, w, h, color) {
  for (let yy = 0; yy < h; yy += 1) {
    const halfWidth = Math.max(1, Math.round((1 - Math.abs(yy - h / 2) / Math.max(1, h / 2)) * w));
    for (let xx = 0; xx < halfWidth; xx += 1) {
      setPixel(image, x + xx, y + yy, color);
    }
  }
}

function setPixel(image, x, y, color) {
  const parsed = parseHex(color);
  const offset = (y * image.width + x) * 4;
  image.rgba[offset] = parsed.r;
  image.rgba[offset + 1] = parsed.g;
  image.rgba[offset + 2] = parsed.b;
  image.rgba[offset + 3] = 255;
}

function matrixTextBoxes(box, columns, rows) {
  const result = [];
  const cellW = box.w / columns;
  const cellH = box.h / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      result.push({
        text: `r${row}c${column}`,
        box: {
          x: box.x + column * cellW + cellW * 0.25,
          y: box.y + row * cellH + cellH * 0.35,
          w: cellW * 0.5,
          h: cellH * 0.2
        },
        font: { color: "#222222" }
      });
    }
  }
  return result;
}

function quadrantTextBoxes(box) {
  const positions = [
    [0.18, 0.18],
    [0.68, 0.18],
    [0.18, 0.68],
    [0.68, 0.68]
  ];
  return positions.flatMap(([xRatio, yRatio], index) => [
    {
      text: `title-${index}`,
      box: { x: box.x + box.w * xRatio, y: box.y + box.h * yRatio, w: 90, h: 22 },
      font: { color: "#111111" }
    },
    {
      text: `body-${index}`,
      box: { x: box.x + box.w * xRatio, y: box.y + box.h * yRatio + 36, w: 180, h: 18 },
      font: { color: "#111111" }
    }
  ]);
}

function drawSyntheticNetwork(image, box, count) {
  const center = { x: box.x + box.w / 2, y: box.y + box.h * 0.52 };
  for (let index = 0; index < count; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const lane = Math.floor(index / 2);
    const yRatio = 0.08 + (lane % (count / 2)) / Math.max(1, count / 2 - 1) * 0.84;
    const x = side < 0 ? box.x + 40 + (lane % 4) * 34 : box.x + box.w - 56 - (lane % 4) * 34;
    const y = box.y + box.h * yRatio;
    const color = index % 3 === 0 ? "#21B874" : "#087AD8";
    drawLine(image, Math.round(center.x), Math.round(center.y), Math.round(x + 8), Math.round(y + 8), color);
    fillRect(image, Math.round(x), Math.round(y), 16, 16, color);
  }
}

function drawLine(image, x1, y1, x2, y2, color) {
  const parsed = parseHex(color);
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let index = 0; index <= steps; index += 1) {
    const x = Math.round(x1 + (x2 - x1) * index / Math.max(1, steps));
    const y = Math.round(y1 + (y2 - y1) * index / Math.max(1, steps));
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height) continue;
        const offset = (yy * image.width + xx) * 4;
        image.rgba[offset] = parsed.r;
        image.rgba[offset + 1] = parsed.g;
        image.rgba[offset + 2] = parsed.b;
        image.rgba[offset + 3] = 255;
      }
    }
  }
}

function getPixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return {
    r: image.rgba[offset],
    g: image.rgba[offset + 1],
    b: image.rgba[offset + 2],
    a: image.rgba[offset + 3]
  };
}

function parseHex(value) {
  const raw = value.replace(/^#/, "");
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16)
  };
}

function colorDistanceForTest(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function createOpenXmlBatchSmokeIr(text) {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      sourceImage: "",
      background: { fill: "#FFFFFF" },
      shapes: [{
        id: "card",
        type: "roundrect",
        box: { x: 100, y: 90, w: 280, h: 90 },
        style: { fill: "#EAF2FF", stroke: "#4472C4", strokeWidth: 1 },
        source: { nativeComponentGroupId: "batch-card" }
      }],
      textBoxes: [{
        id: "label",
        text,
        box: { x: 120, y: 115, w: 240, h: 32 },
        font: { family: "Arial", sizePt: 18, weight: "bold", color: "#1F1F1F", align: "center", valign: "mid", lineHeightMultiple: 1 },
        style: {},
        source: { nativeComponentGroupId: "batch-card" }
      }],
      images: [],
      tables: [],
      charts: []
    }]
  };
}

module.exports={createOpenXmlBatchSmokeIr,chartZoneImage,chartAxisAtom,chartRectAtom,chartLineAtom,chartPointAtom,chartDonutAtom,chartDonutSegmentAtom,chartArcArrowSegmentAtom,visualAtomImage,component,makeImage,fillRect,fillRightTriangle,setPixel,matrixTextBoxes,quadrantTextBoxes,drawSyntheticNetwork,drawLine,getPixel,parseHex,colorDistanceForTest};
