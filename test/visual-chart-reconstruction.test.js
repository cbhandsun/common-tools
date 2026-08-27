"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyVisualLayer } = require("../skills/pd-hifi-slideclone/scripts/lib/layer-classifier");
const { createVisualAtomNativeShapes } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

const SLIDE = { widthPt: 560, heightPt: 340 };

test("reconstructs a compact four-column pixel chart with both axes end to end", () => {
  const sourceImage = blankImage(SLIDE.widthPt, SLIDE.heightPt, "#ffffff");
  fillRect(sourceImage, 76, 60, 5, 227, "#64748b");
  fillRect(sourceImage, 76, 282, 382, 5, "#64748b");
  fillRect(sourceImage, 92, 186, 42, 96, "#2f80ed");
  fillRect(sourceImage, 168, 126, 42, 156, "#2f80ed");
  fillRect(sourceImage, 244, 214, 42, 68, "#2f80ed");
  fillRect(sourceImage, 320, 94, 42, 188, "#2f80ed");

  const image = classifyAndWrap(sourceImage, "bar-chart-axis-snapshot", "bar chart 柱状图");
  const shapes = createVisualAtomNativeShapes([image]);
  const atoms = image.source.layer.diagramUnderstanding.visualAtoms || [];
  const diagnostics = JSON.stringify({
    atoms: atoms.map((atom) => ({ kind: atom.kind, hint: atom.shapeHint, axis: atom.axis })),
    shapes: shapes.map((shape) => shape.source.detector)
  });

  assert.equal(image.source.layer.diagramUnderstanding.archetype, "bar-chart");
  assert.ok(shapes.filter((shape) => shape.source.detector === "visual-chart-native-axis").length >= 2, diagnostics);
  assert.ok(shapes.filter((shape) => shape.source.detector === "visual-chart-native-bar").length >= 4, diagnostics);
  assert.ok(shapes.every((shape) => shape.source.editable === true));
});

test("reconstructs a Gantt roadmap as one axis and whole native task bars", () => {
  const sourceImage = blankImage(SLIDE.widthPt, SLIDE.heightPt, "#ffffff");
  fillRect(sourceImage, 72, 70, 420, 4, "#64748b");
  for (const x of [132, 222, 312, 402]) fillRect(sourceImage, x, 64, 3, 18, "#64748b");
  fillRect(sourceImage, 102, 108, 152, 28, "#60a5fa");
  fillRect(sourceImage, 182, 156, 210, 28, "#34d399");
  fillRect(sourceImage, 292, 204, 142, 28, "#f59e0b");
  fillRect(sourceImage, 372, 252, 102, 28, "#a78bfa");

  const image = classifyAndWrap(sourceImage, "gantt-project-roadmap", "gantt project schedule roadmap", "complex-diagram");
  const shapes = createVisualAtomNativeShapes([image]);
  const axes = shapes.filter((shape) => shape.source.detector === "visual-gantt-native-axis");
  const taskBars = shapes.filter((shape) => shape.source.detector === "visual-gantt-native-task-bar");

  assert.equal(image.source.layer.diagramUnderstanding.archetype, "gantt-roadmap");
  assert.equal(image.source.layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(axes.length, 1);
  assert.equal(taskBars.length, 4);
  assert.deepEqual(taskBars.map((shape) => Math.round(shape.box.w)), [152, 210, 142, 102]);
  assert.ok(taskBars.every((shape) => shape.type === "rect" && shape.source.editable === true));
  assert.equal(shapes.some((shape) => shape.source.detector === "visual-atom-native-rect"), false);
  assert.equal(image.source.ganttRoadmapObjectified, true);
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("reconstructs a color-separated pie chart into measured native sectors", () => {
  const sourceImage = blankImage(SLIDE.widthPt, SLIDE.heightPt, "#ffffff");
  fillPie(sourceImage, 280, 170, 92, [
    { start: 0, end: 110, color: "#60a5fa" },
    { start: 110, end: 235, color: "#34d399" },
    { start: 235, end: 360, color: "#f59e0b" }
  ]);

  const image = classifyAndWrap(sourceImage, "pie-chart-snapshot", "pie chart market share proportion");
  const shapes = createVisualAtomNativeShapes([image]);
  const sectors = shapes.filter((shape) => shape.source.detector === "visual-chart-native-pie-segment");

  assert.equal(image.source.layer.diagramUnderstanding.archetype, "pie-chart");
  assert.equal(image.source.layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(sectors.length, 3);
  assert.deepEqual(sectors.map((shape) => shape.style.fill), ["#60a5fa", "#34d399", "#f59e0b"]);
  assert.ok(sectors.every((shape) => shape.type === "freeform" && shape.points.length >= 12 && shape.source.editable === true));
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("reconstructs a pixel heatmap matrix into native colored cells end to end", () => {
  const sourceImage = blankImage(520, 320, "#ffffff");
  for (const y of [58, 108, 158, 208, 258]) fillRect(sourceImage, 72, y, 376, 3, "#94a3b8");
  for (const x of [72, 166, 260, 354, 448]) fillRect(sourceImage, x, 58, 3, 203, "#94a3b8");
  const colors = ["#dcfce7", "#bbf7d0", "#fef3c7", "#fed7aa", "#fecaca", "#fca5a5", "#fde68a", "#86efac"];
  let colorIndex = 0;
  for (const y of [61, 111, 161, 211]) {
    for (const x of [75, 169, 263, 357]) {
      fillRect(sourceImage, x + 3, y + 3, 84, 40, colors[colorIndex % colors.length]);
      colorIndex += 1;
    }
  }

  const image = classifyAndWrap(sourceImage, "heatmap-risk-matrix-underlay", "热力图 风险矩阵 heatmap color scale");
  const shapes = createVisualAtomNativeShapes([image]);
  const cells = shapes.filter((shape) => shape.source.detector === "visual-chart-native-heatmap-cell");

  assert.equal(image.source.layer.diagramUnderstanding.archetype, "heatmap-matrix");
  assert.equal(image.source.layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(image.source.layer.diagramUnderstanding.visualGrid.cells.length, 16);
  assert.equal(cells.length, 16);
  assert.ok(new Set(cells.map((shape) => shape.style.fill)).size >= 6);
  assert.ok(cells.every((shape) => shape.source.editable === true));
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("reconstructs a pixel scatter chart into native axes and points end to end", () => {
  const sourceImage = blankImage(SLIDE.widthPt, SLIDE.heightPt, "#ffffff");
  fillRect(sourceImage, 56, 54, 5, 212, "#64748b");
  fillRect(sourceImage, 56, 261, 340, 5, "#64748b");
  for (const [x, y] of [[88, 224], [126, 188], [170, 204], [214, 142], [260, 166], [306, 108], [344, 132], [374, 82]]) {
    fillEllipse(sourceImage, x, y, 11, 11, "#2f80ed");
  }

  const image = classifyAndWrap(sourceImage, "scatter-chart-axis-snapshot", "scatter chart bubble plot 散点图");
  const shapes = createVisualAtomNativeShapes([image]);

  assert.equal(image.source.layer.diagramUnderstanding.archetype, "scatter-chart");
  assert.ok(shapes.filter((shape) => shape.source.detector === "visual-chart-native-axis").length >= 2);
  assert.ok(shapes.filter((shape) => shape.source.detector === "visual-chart-native-scatter-point").length >= 8);
  assert.ok(shapes.every((shape) => shape.source.editable === true));
});

test("reconstructs a pixel waterfall chart into native axes and floating bars", () => {
  const sourceImage = blankImage(SLIDE.widthPt, SLIDE.heightPt, "#ffffff");
  fillRect(sourceImage, 76, 282, 382, 5, "#64748b");
  fillRect(sourceImage, 76, 86, 5, 201, "#64748b");
  for (const [x, y, h, color] of [
    [108, 198, 84, "#2563eb"],
    [176, 146, 52, "#16a34a"],
    [244, 198, 36, "#ef4444"],
    [312, 122, 76, "#16a34a"],
    [380, 172, 50, "#ef4444"],
    [448, 118, 164, "#2563eb"]
  ]) fillRect(sourceImage, x, y, 42, h, color);

  const image = classifyAndWrap(sourceImage, "waterfall-variance-bridge-chart-snapshot", "waterfall chart variance bridge");
  const shapes = createVisualAtomNativeShapes([image]);

  assert.equal(image.source.layer.diagramUnderstanding.archetype, "waterfall-chart");
  assert.equal(image.source.layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-chart-native-axis").length, 2);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-chart-native-waterfall-bar").length, 6);
  assert.ok(shapes.every((shape) => shape.source.editable === true));
});

test("reconstructs adjacent treemap pixels into independent native tiles", () => {
  const sourceImage = blankImage(SLIDE.widthPt, SLIDE.heightPt, "#ffffff");
  fillRect(sourceImage, 70, 64, 230, 210, "#60a5fa");
  fillRect(sourceImage, 306, 64, 154, 100, "#93c5fd");
  fillRect(sourceImage, 466, 64, 40, 100, "#bfdbfe");
  fillRect(sourceImage, 306, 170, 92, 104, "#2563eb");
  fillRect(sourceImage, 404, 170, 102, 104, "#dbeafe");

  const image = classifyAndWrap(sourceImage, "treemap-area-composition-underlay", "treemap market share area composition");
  const shapes = createVisualAtomNativeShapes([image]);

  assert.equal(image.source.layer.diagramUnderstanding.archetype, "treemap-chart");
  assert.equal(image.source.layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-chart-native-treemap-tile").length, 5);
  assert.ok(shapes.every((shape) => shape.source.editable === true));
});

test("reconstructs a pixel gauge into an editable native arc and needle", () => {
  const sourceImage = blankImage(SLIDE.widthPt, SLIDE.heightPt, "#ffffff");
  fillEllipse(sourceImage, 192, 58, 176, 176, "#bfdbfe");
  fillEllipse(sourceImage, 216, 82, 128, 128, "#ffffff");
  fillRect(sourceImage, 192, 146, 176, 88, "#ffffff");
  fillLine(sourceImage, 280, 146, 334, 104, 6, "#2563eb");

  const image = classifyAndWrap(sourceImage, "gauge-speedometer-chart-snapshot", "gauge chart speedometer semi circle gauge");
  const shapes = createVisualAtomNativeShapes([image]);

  assert.equal(image.source.layer.diagramUnderstanding.archetype, "gauge-chart");
  assert.equal(image.source.layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-chart-native-gauge-arc").length, 1);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-chart-native-gauge-needle").length, 1);
  assert.ok(shapes.every((shape) => shape.source.editable === true));
});

test("reconstructs a pixel radar chart into editable axes and polygons", () => {
  const sourceImage = blankImage(SLIDE.widthPt, SLIDE.heightPt, "#ffffff");
  const center = { x: 280, y: 170 };
  const frame = [
    { x: 280, y: 74 }, { x: 372, y: 142 }, { x: 336, y: 254 },
    { x: 224, y: 254 }, { x: 188, y: 142 }
  ];
  const score = [
    { x: 280, y: 102 }, { x: 346, y: 152 }, { x: 320, y: 224 },
    { x: 242, y: 226 }, { x: 214, y: 148 }
  ];
  for (const point of frame) fillLine(sourceImage, center.x, center.y, point.x, point.y, 2, "#bfdbfe");
  fillPolygon(sourceImage, frame, "#e0f2fe");
  fillPolygon(sourceImage, score, "#38bdf8");

  const image = classifyAndWrap(sourceImage, "radar-chart-snapshot", "radar chart spider chart multi axis score");
  const shapes = createVisualAtomNativeShapes([image]);

  assert.equal(image.source.layer.diagramUnderstanding.archetype, "radar-chart");
  assert.equal(image.source.layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-chart-native-radar-axis").length, 5);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-chart-native-radar-frame").length, 1);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-chart-native-radar-score").length, 1);
  assert.ok(shapes.every((shape) => shape.source.editable === true));
});

function classifyAndWrap(sourceImage, detector, expressionSubtype, expressionForm = "chart-snapshot") {
  const box = { x: 0, y: 0, w: SLIDE.widthPt, h: SLIDE.heightPt };
  const layer = classifyVisualLayer({
    id: detector,
    type: "fidelity-crop",
    box,
    source: { detector, expressionForm, expressionSubtype }
  }, {}, SLIDE, { sourceImage });
  return { id: detector, box, source: { detector, layer } };
}

function blankImage(width, height, color) {
  const image = { width, height, rgba: Buffer.alloc(width * height * 4) };
  fillRect(image, 0, 0, width, height, color);
  return image;
}

function fillRect(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  for (let yy = Math.max(0, y); yy < Math.min(image.height, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(image.width, x + w); xx += 1) {
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillEllipse(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (((xx + 0.5 - cx) / (w / 2)) ** 2 + ((yy + 0.5 - cy) / (h / 2)) ** 2 > 1) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillPie(image, cx, cy, radius, segments) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if (Math.hypot(x - cx, y - cy) > radius) continue;
      const angle = (Math.atan2(y - cy, x - cx) * 180 / Math.PI + 360) % 360;
      const segment = segments.find((item) => angle >= item.start && angle < item.end);
      if (segment) fillRect(image, x, y, 1, 1, segment.color);
    }
  }
}

function fillLine(image, x1, y1, x2, y2, thickness, color) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let error = dx - dy;
  let x = x1;
  let y = y1;
  const radius = Math.max(0, Math.floor(thickness / 2));
  while (true) {
    fillRect(image, x - radius, y - radius, radius * 2 + 1, radius * 2 + 1, color);
    if (x === x2 && y === y2) break;
    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x += sx;
    }
    if (doubled < dx) {
      error += dx;
      y += sy;
    }
  }
}

function fillPolygon(image, points, color) {
  const rgb = parseHex(color);
  const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const maxX = Math.min(image.width - 1, Math.ceil(Math.max(...points.map((point) => point.x))));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const maxY = Math.min(image.height - 1, Math.ceil(Math.max(...points.map((point) => point.y))));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!pointInPolygon(x + 0.5, y + 0.5, points)) continue;
      const offset = (y * image.width + x) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const left = points[i];
    const right = points[j];
    const denominator = right.y - left.y || 1e-9;
    const crosses = (left.y > y) !== (right.y > y)
      && x < (right.x - left.x) * (y - left.y) / denominator + left.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function parseHex(value) {
  const hex = String(value).replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}
