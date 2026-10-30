'use strict';

const { colorDistance, darkerHex, normalizeHex, parseHex, rgbToHsl, round } = require('./raster-native-detection');

function normalizeHexColor(color) {
  const value = String(color || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(value)) return `#${value.toUpperCase()}`;
  return null;
}

function createChartZoneNativeShellShapes(image = {}, atoms = [], layer = {}, understanding = {}) {
  if (!shouldObjectifyChartZoneNativeShell(layer, understanding, atoms)) return [];
  const archetype = String(understanding.archetype || "");
  if (archetype === "bar-chart") return createBarChartNativeShellShapes(image, atoms, understanding);
  if (archetype === "line-chart") return createLineChartNativeShellShapes(image, atoms, understanding);
  if (archetype === "scatter-chart") return createScatterChartNativeShellShapes(image, atoms, understanding);
  if (archetype === "donut-chart") return createDonutChartNativeShellShapes(image, atoms, understanding);
  if (archetype === "pie-chart") return createPieChartNativeShellShapes(image, atoms, understanding);
  if (archetype === "waterfall-chart") return createWaterfallChartNativeShellShapes(image, atoms, understanding);
  if (archetype === "treemap-chart") return createTreemapChartNativeShellShapes(image, atoms, understanding);
  if (archetype === "heatmap-matrix") return createHeatmapMatrixNativeShellShapes(image, understanding);
  if (archetype === "gauge-chart") return createGaugeChartNativeShellShapes(image, atoms, understanding);
  if (archetype === "radar-chart") return createRadarChartNativeShellShapes(image, atoms, understanding);
  return [];
}

function shouldObjectifyChartZoneNativeShell(layer = {}, understanding = {}, atoms = []) {
  const archetype = String(understanding.archetype || "");
  const layerType = String(layer.layerType || "");
  if (layerType === "diagram-zone" && String(understanding.nativeReadiness || "") !== "native-rebuild") return false;
  if (archetype === "heatmap-matrix") {
    if (!["diagram-zone", "table-zone", "chart-zone"].includes(layerType)) return false;
  } else if (layerType !== "chart-zone" && !(layerType === "diagram-zone" && hasMeasuredNativeChartEvidence(archetype, atoms))) return false;
  if (!["bar-chart", "line-chart", "scatter-chart", "donut-chart", "pie-chart", "waterfall-chart", "treemap-chart", "heatmap-matrix", "gauge-chart", "radar-chart"].includes(archetype)) return false;
  if (Number(understanding.confidence || 0) < 0.68) return false;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return false;
  return true;
}

function hasMeasuredNativeChartEvidence(archetype, atoms = []) {
  const count = (kind) => atoms.filter((atom) => atom?.kind === kind).length;
  const axisCount = atoms.filter((atom) => ["grid-line-candidate", "connector-line-candidate"].includes(atom?.kind)).length;
  if (archetype === "bar-chart") return axisCount >= 1 && count("native-rect-candidate") >= 3;
  if (archetype === "line-chart") return axisCount >= 3;
  if (archetype === "scatter-chart") return axisCount >= 1 && count("native-scatter-point-candidate") >= 5;
  if (archetype === "donut-chart") return count("native-donut-candidate") >= 1 || count("native-donut-segment-candidate") >= 2;
  if (archetype === "pie-chart") return count("native-pie-segment-candidate") >= 2;
  if (archetype === "waterfall-chart") return axisCount >= 1 && count("native-rect-candidate") >= 4;
  if (archetype === "treemap-chart") return count("native-rect-candidate") >= 3;
  if (archetype === "gauge-chart") return count("native-gauge-arc-candidate") === 1 && count("native-gauge-needle-candidate") === 1;
  if (archetype === "radar-chart") return count("native-radar-frame-candidate") >= 1 && count("native-radar-score-candidate") >= 1;
  return false;
}

function createBarChartNativeShellShapes(image = {}, atoms = [], understanding = {}) {
  const axes = chartAxisAtoms(atoms);
  const bars = atoms
    .filter((atom) => atom?.kind === "native-rect-candidate" && atom?.box)
    .filter((atom) => !isVisualChartLegendMarker(image, atom, understanding))
    .sort((a, b) => (Number(a.box.y || 0) - Number(b.box.y || 0)) || (Number(a.box.x || 0) - Number(b.box.x || 0)));
  if (axes.length < 1 || bars.length < 3) return [];
  return [
    ...axes.slice(0, 4).map((atom, index) => chartAxisNativeShape(image, atom, index, understanding)),
    ...bars.slice(0, 32).map((atom, index) => chartBarNativeShape(image, atom, index, understanding))
  ].filter(Boolean);
}

function createLineChartNativeShellShapes(image = {}, atoms = [], understanding = {}) {
  const axes = chartAxisAtoms(atoms);
  const segments = atoms
    .filter((atom) => atom?.kind === "connector-line-candidate" && atom?.box)
    .filter((atom) => atom?.lineEndpoints?.from && atom?.lineEndpoints?.to)
    .filter((atom) => String(atom.shapeHint || "").includes("diagonal") || Math.abs(Number(atom.box?.w || 0)) > 6)
    .sort((a, b) => chartLineStartX(a) - chartLineStartX(b));
  if (axes.length < 1 || segments.length < 2) return [];
  const points = chartLineEndpointPoints(segments);
  return [
    ...axes.slice(0, 4).map((atom, index) => chartAxisNativeShape(image, atom, index, understanding)),
    ...segments.slice(0, 32).map((atom, index) => chartLineSegmentNativeShape(image, atom, index, understanding)),
    ...points.slice(0, 36).map((point, index) => chartPointNativeShape(image, point, index, understanding, "visual-chart-native-line-point"))
  ].filter(Boolean);
}

function createScatterChartNativeShellShapes(image = {}, atoms = [], understanding = {}) {
  const axes = chartAxisAtoms(atoms);
  const points = atoms
    .filter((atom) => atom?.kind === "native-scatter-point-candidate" && atom?.box)
    .filter((atom) => !isVisualChartLegendMarker(image, atom, understanding))
    .sort((a, b) => (Number(a.box.y || 0) - Number(b.box.y || 0)) || (Number(a.box.x || 0) - Number(b.box.x || 0)));
  if (axes.length < 1 || points.length < 5) return [];
  return [
    ...axes.slice(0, 4).map((atom, index) => chartAxisNativeShape(image, atom, index, understanding)),
    ...points.slice(0, 72).map((atom, index) => chartPointNativeShape(image, atom, index, understanding, "visual-chart-native-scatter-point"))
  ].filter(Boolean);
}

function createDonutChartNativeShellShapes(image = {}, atoms = [], understanding = {}) {
  const rings = atoms
    .filter((atom) => atom?.kind === "native-donut-candidate" && atom?.box)
    .filter((atom) => !isVisualChartLegendMarker(image, atom, understanding))
    .sort((a, b) => (Number(a.box.y || 0) - Number(b.box.y || 0)) || (Number(a.box.x || 0) - Number(b.box.x || 0)));
  const segments = atoms
    .filter((atom) => atom?.kind === "native-donut-segment-candidate" && atom?.box)
    .filter((atom) => !isVisualChartLegendMarker(image, atom, understanding))
    .sort((a, b) => donutSegmentStartDegrees(a) - donutSegmentStartDegrees(b));
  if (segments.length >= 2) {
    return segments.slice(0, 12).map((atom, index) => chartDonutSegmentNativeShape(image, atom, index, understanding, segments.length)).filter(Boolean);
  }
  if (rings.length < 1) return [];
  return rings.slice(0, 8).map((atom, index) => chartDonutNativeShape(image, atom, index, understanding)).filter(Boolean);
}

function createPieChartNativeShellShapes(image = {}, atoms = [], understanding = {}) {
  const segments = atoms
    .filter((atom) => atom?.kind === "native-pie-segment-candidate" && atom?.pieParentBox && atom?.pieSegmentAngles)
    .filter((atom) => !isVisualChartLegendMarker(image, atom, understanding))
    .sort((left, right) => Number(left.pieSegmentAngles.startDeg || 0) - Number(right.pieSegmentAngles.startDeg || 0));
  if (segments.length < 2 || segments.length > 12) return [];
  const totalSweep = segments.reduce((sum, atom) => sum + positiveAngleSweep(atom.pieSegmentAngles.startDeg, atom.pieSegmentAngles.endDeg), 0);
  if (totalSweep < 345 || totalSweep > 375) return [];
  return segments.map((atom, index) => applyPluginChartStyleToVisualAtomShape({
      id: `${image.id || "layer"}-visual-chart-pie-segment-${index}`,
      type: "freeform",
      box: atom.pieParentBox,
      points: pieSegmentFreeformPoints(atom.pieSegmentAngles.startDeg, atom.pieSegmentAngles.endDeg),
      style: {
        fill: atom.color || "#2F80ED",
        stroke: atom.color || "#2F80ED",
        strokeWidthPt: 0,
        opacity: 0.98
      },
      source: chartNativeSource(image, atom, understanding, "visual-chart-native-pie-segment", {
        seriesIndex: index,
        startDeg: atom.pieSegmentAngles.startDeg,
        endDeg: atom.pieSegmentAngles.endDeg
      })
    }, image, atom, index, understanding));
}

function createWaterfallChartNativeShellShapes(image = {}, atoms = [], understanding = {}) {
  const axes = chartAxisAtoms(atoms);
  const bars = atoms
    .filter((atom) => atom?.kind === "native-rect-candidate" && atom?.box)
    .filter((atom) => !isVisualChartLegendMarker(image, atom, understanding))
    .sort((a, b) => Number(a.box.x || 0) - Number(b.box.x || 0));
  if (axes.length < 1 || bars.length < 4) return [];
  return [
    ...axes.slice(0, 4).map((atom, index) => chartAxisNativeShape(image, atom, index, understanding)),
    ...bars.slice(0, 32).map((atom, index) => chartBarNativeShape(image, atom, index, understanding, "visual-chart-native-waterfall-bar"))
  ].filter(Boolean);
}

function createTreemapChartNativeShellShapes(image = {}, atoms = [], understanding = {}) {
  const tiles = atoms
    .filter((atom) => atom?.kind === "native-rect-candidate" && atom?.box)
    .filter((atom) => !isVisualChartLegendMarker(image, atom, understanding))
    .sort((a, b) => (Number(a.box.y || 0) - Number(b.box.y || 0)) || (Number(a.box.x || 0) - Number(b.box.x || 0)));
  if (tiles.length < 3) return [];
  return tiles.slice(0, 64).map((atom, index) => chartBarNativeShape(image, atom, index, understanding, "visual-chart-native-treemap-tile")).filter(Boolean);
}

function createHeatmapMatrixNativeShellShapes(image = {}, understanding = {}) {
  const grid = understanding.visualGrid || {};
  const rows = Number(grid.rows || 0);
  const columns = Number(grid.columns || 0);
  const cells = Array.isArray(grid.cells) ? grid.cells : [];
  if (rows < 2 || columns < 2 || cells.length !== rows * columns || cells.length > 4096) return [];
  const stroke = normalizeHexColor(grid.stroke) || "#94A3B8";
  return cells.map((cell, index) => ({
    id: `${image.id || "layer"}-visual-chart-heatmap-cell-${index}`,
    type: "rect",
    box: cell.box,
    style: {
      fill: normalizeHexColor(cell.fill) || "#FFFFFF",
      stroke,
      strokeWidthPt: 0.75,
      radiusRatio: 0
    },
    source: chartNativeSource(image, cell, understanding, "visual-chart-native-heatmap-cell", {
      row: cell.row,
      column: cell.column
    })
  }));
}

function createGaugeChartNativeShellShapes(image = {}, atoms = [], understanding = {}) {
  const arc = atoms.find((atom) => atom?.kind === "native-gauge-arc-candidate" && atom?.box);
  const needle = atoms.find((atom) => atom?.kind === "native-gauge-needle-candidate" && atom?.lineEndpoints?.from && atom?.lineEndpoints?.to);
  if (!arc || !needle) return [];
  const arcShape = {
    id: `${image.id || "layer"}-visual-chart-gauge-arc`,
    type: "freeform",
    box: arc.box,
    points: donutSegmentFreeformPoints(180, 360, Number(arc.gaugeHoleRatio || 0.66)),
    style: {
      fill: arc.color || "#BFDBFE",
      stroke: arc.color || "#BFDBFE",
      strokeWidthPt: 0,
      opacity: 0.98
    },
    source: chartNativeSource(image, arc, understanding, "visual-chart-native-gauge-arc")
  };
  const from = needle.lineEndpoints.from;
  const to = needle.lineEndpoints.to;
  const needleShape = {
    id: `${image.id || "layer"}-visual-chart-gauge-needle`,
    type: "line",
    box: {
      x: round(Number(from.x || 0)),
      y: round(Number(from.y || 0)),
      w: round(Number(to.x || 0) - Number(from.x || 0)),
      h: round(Number(to.y || 0) - Number(from.y || 0))
    },
    style: {
      stroke: needle.color || "#2563EB",
      strokeWidthPt: Math.max(2, Math.min(6, Math.max(Number(needle.box?.w || 1), Number(needle.box?.h || 1)) * 0.08)),
      connectorType: "straight",
      lineCap: "round"
    },
    source: chartNativeSource(image, needle, understanding, "visual-chart-native-gauge-needle")
  };
  return [
    applyPluginChartStyleToVisualAtomShape(arcShape, image, arc, 0, understanding),
    applyPluginChartStyleToVisualAtomShape(needleShape, image, needle, 1, understanding)
  ].filter(Boolean);
}

function createRadarChartNativeShellShapes(image = {}, atoms = [], understanding = {}) {
  const frame = atoms.find((atom) => atom?.kind === "native-radar-frame-candidate" && atom?.box && atom?.radarVertices?.length >= 3);
  const score = atoms.find((atom) => atom?.kind === "native-radar-score-candidate" && atom?.box && atom?.radarVertices?.length >= 3);
  if (!frame || !score) return [];
  const center = {
    x: Number(frame.box.x || 0) + Number(frame.box.w || 0) / 2,
    y: Number(frame.box.y || 0) + Number(frame.box.h || 0) / 2
  };
  const frameShape = chartRadarPolygonNativeShape(image, frame, 0, understanding, "visual-chart-native-radar-frame", 0.96);
  const axes = frame.radarVertices.slice(0, 12).map((vertex, index) => {
    const atom = { ...frame, id: `${frame.id || "radar-frame"}-axis-${index}` };
    const shape = {
      id: `${image.id || "layer"}-visual-chart-radar-axis-${index}`,
      type: "line",
      box: {
        x: round(center.x),
        y: round(center.y),
        w: round(Number(vertex.x || 0) - center.x),
        h: round(Number(vertex.y || 0) - center.y)
      },
      style: {
        stroke: "#BFDBFE",
        strokeWidthPt: 1.1,
        connectorType: "straight"
      },
      source: chartNativeSource(image, atom, understanding, "visual-chart-native-radar-axis", { axisIndex: index })
    };
    return applyPluginChartStyleToVisualAtomShape(shape, image, atom, index + 1, understanding);
  });
  const scoreShape = chartRadarPolygonNativeShape(image, score, axes.length + 1, understanding, "visual-chart-native-radar-score", 0.9);
  return [frameShape, ...axes, scoreShape].filter(Boolean);
}

function chartRadarPolygonNativeShape(image = {}, atom = {}, index = 0, understanding = {}, detector, opacity) {
  const box = atom.box || {};
  const width = Math.max(1, Number(box.w || 0));
  const height = Math.max(1, Number(box.h || 0));
  const points = (atom.radarVertices || []).map((point) => ({
    x: round((Number(point.x || 0) - Number(box.x || 0)) / width),
    y: round((Number(point.y || 0) - Number(box.y || 0)) / height)
  }));
  const shape = {
    id: `${image.id || "layer"}-${detector}-${index}`,
    type: "freeform",
    box,
    points,
    style: {
      fill: atom.color || (detector.endsWith("score") ? "#38BDF8" : "#E0F2FE"),
      stroke: atom.color || (detector.endsWith("score") ? "#38BDF8" : "#BFDBFE"),
      strokeWidthPt: detector.endsWith("score") ? 0.8 : 1,
      opacity
    },
    source: chartNativeSource(image, atom, understanding, detector, { seriesIndex: index })
  };
  return applyPluginChartStyleToVisualAtomShape(shape, image, atom, index, understanding);
}

function chartAxisAtoms(atoms = []) {
  return atoms
    .filter((atom) => atom?.box && (atom.kind === "grid-line-candidate" || atom.kind === "connector-line-candidate"))
    .filter((atom) => {
      const box = atom.box || {};
      const width = Math.abs(Number(box.w || 0));
      const height = Math.abs(Number(box.h || 0));
      const hint = String(atom.axis || atom.shapeHint || "").toLowerCase();
      return hint.includes("horizontal")
        || hint.includes("vertical")
        || hint === "h"
        || hint === "v"
        || width >= height * 5
        || height >= width * 5;
    })
    .sort((a, b) => chartAxisScore(b) - chartAxisScore(a));
}

function chartAxisScore(atom = {}) {
  const box = atom.box || {};
  return Math.max(Math.abs(Number(box.w || 0)), Math.abs(Number(box.h || 0))) * Math.max(0.2, Number(atom.density ?? 0.5));
}

function chartAxisNativeShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const box = atom.box || {};
  const horizontal = normalizeVisualGridAtomAxis(atom) === "h";
  const lineBoxValue = horizontal
    ? { x: round(Number(box.x || 0)), y: round(Number(box.y || 0) + Number(box.h || 0) / 2), w: round(Number(box.w || 0)), h: 0 }
    : { x: round(Number(box.x || 0) + Number(box.w || 0) / 2), y: round(Number(box.y || 0)), w: 0, h: round(Number(box.h || 0)) };
  const shape = {
    id: `${image.id || "layer"}-visual-chart-axis-${index}`,
    type: "line",
    box: lineBoxValue,
    style: {
      stroke: atom.color || "#64748B",
      strokeWidthPt: Math.max(0.75, Math.min(2.2, horizontal ? Number(box.h || 1) : Number(box.w || 1))),
      connectorType: "straight"
    },
    source: chartNativeSource(image, atom, understanding, "visual-chart-native-axis", { axis: horizontal ? "horizontal" : "vertical" })
  };
  return applyPluginChartStyleToVisualAtomShape(shape, image, atom, index, understanding);
}

function chartBarNativeShape(image = {}, atom = {}, index = 0, understanding = {}, detector = "visual-chart-native-bar") {
  const shape = {
    id: `${image.id || "layer"}-visual-chart-bar-${index}`,
    type: "rect",
    box: atom.box,
    style: {
      fill: atom.color || "#2F80ED",
      stroke: atom.color || "#2F80ED",
      strokeWidthPt: 0,
      opacity: 0.98
    },
    source: chartNativeSource(image, atom, understanding, detector, { seriesIndex: index })
  };
  return applyPluginChartStyleToVisualAtomShape(shape, image, atom, index, understanding);
}

function chartLineSegmentNativeShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const shape = {
    id: `${image.id || "layer"}-visual-chart-line-segment-${index}`,
    type: "line",
    box: {
      x: round(Number(atom.lineEndpoints.from.x || 0)),
      y: round(Number(atom.lineEndpoints.from.y || 0)),
      w: round(Number(atom.lineEndpoints.to.x || 0) - Number(atom.lineEndpoints.from.x || 0)),
      h: round(Number(atom.lineEndpoints.to.y || 0) - Number(atom.lineEndpoints.from.y || 0))
    },
    style: {
      stroke: atom.color || "#2F80ED",
      strokeWidthPt: Math.max(1.1, Math.min(3.2, Math.max(Number(atom.box?.h || 1), Number(atom.box?.w || 1)) * 0.08)),
      connectorType: "straight",
      lineCap: "round"
    },
    source: chartNativeSource(image, atom, understanding, "visual-chart-native-line-segment", { seriesIndex: index })
  };
  return applyPluginChartStyleToVisualAtomShape(shape, image, atom, index, understanding);
}

function chartPointNativeShape(image = {}, atom = {}, index = 0, understanding = {}, detector = "visual-chart-native-point") {
  const shape = {
    id: `${image.id || "layer"}-${detector}-${index}`,
    type: "ellipse",
    box: atom.box,
    style: {
      fill: atom.color || "#2F80ED",
      stroke: atom.color || "#2F80ED",
      strokeWidthPt: 0,
      opacity: 0.98
    },
    source: chartNativeSource(image, atom, understanding, detector, { seriesIndex: index })
  };
  return applyPluginChartStyleToVisualAtomShape(shape, image, atom, index, understanding);
}

function chartDonutNativeShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const shape = {
    id: `${image.id || "layer"}-visual-chart-donut-${index}`,
    type: "donut",
    box: atom.box,
    style: {
      fill: atom.color || "#2F80ED",
      stroke: atom.color || "#2F80ED",
      strokeWidthPt: 0,
      opacity: 0.98,
      holeRatio: Math.max(0.28, Math.min(0.72, Number(atom.holeRatio || 0.55)))
    },
    source: chartNativeSource(image, atom, understanding, "visual-chart-native-donut", { seriesIndex: index })
  };
  return applyPluginChartStyleToVisualAtomShape(shape, image, atom, index, understanding);
}

function chartDonutSegmentNativeShape(image = {}, atom = {}, index = 0, understanding = {}, segmentCount = 1) {
  const parentBox = atom.donutParentBox || atom.box;
  const angles = normalizedDonutSegmentAngles(atom, index, segmentCount);
  const shape = {
    id: `${image.id || "layer"}-visual-chart-donut-segment-${index}`,
    type: "freeform",
    box: parentBox,
    points: donutSegmentFreeformPoints(angles.startDeg, angles.endDeg, Number(atom.holeRatio || 0.52)),
    style: {
      fill: atom.color || "#2F80ED",
      stroke: atom.color || "#2F80ED",
      strokeWidthPt: 0,
      opacity: 0.98
    },
    source: chartNativeSource(image, atom, understanding, "visual-chart-native-donut-segment", {
      seriesIndex: index,
      startDeg: angles.startDeg,
      endDeg: angles.endDeg
    })
  };
  return applyPluginChartStyleToVisualAtomShape(shape, image, atom, index, understanding);
}

function normalizedDonutSegmentAngles(atom = {}, index = 0, segmentCount = 1) {
  const start = Number(atom.donutSegmentAngles?.startDeg);
  const end = Number(atom.donutSegmentAngles?.endDeg);
  if (Number.isFinite(start) && Number.isFinite(end)) {
    return { startDeg: normalizeDegrees(start), endDeg: normalizeDegrees(end) };
  }
  const slice = 360 / Math.max(1, Number(segmentCount || 1));
  return { startDeg: normalizeDegrees(index * slice - 90), endDeg: normalizeDegrees((index + 1) * slice - 90) };
}

function donutSegmentStartDegrees(atom = {}) {
  const value = Number(atom.donutSegmentAngles?.startDeg);
  return Number.isFinite(value) ? normalizeDegrees(value) : 0;
}

function donutSegmentFreeformPoints(startDeg, endDeg, holeRatio = 0.52) {
  const sweep = positiveAngleSweep(startDeg, endDeg);
  const steps = Math.max(4, Math.min(20, Math.ceil(sweep / 16)));
  const outer = [];
  const inner = [];
  const innerRadius = Math.max(0.18, Math.min(0.78, Number(holeRatio || 0.52))) * 0.5;
  for (let index = 0; index <= steps; index += 1) {
    const angle = normalizeDegrees(Number(startDeg || 0) + sweep * index / steps);
    outer.push(pointOnNormalizedCircle(angle, 0.5));
  }
  for (let index = steps; index >= 0; index -= 1) {
    const angle = normalizeDegrees(Number(startDeg || 0) + sweep * index / steps);
    inner.push(pointOnNormalizedCircle(angle, innerRadius));
  }
  return [...outer, ...inner];
}

function pieSegmentFreeformPoints(startDeg, endDeg) {
  const sweep = positiveAngleSweep(startDeg, endDeg);
  const steps = Math.max(4, Math.min(24, Math.ceil(sweep / 12)));
  const points = [{ x: 0.5, y: 0.5 }];
  for (let index = 0; index <= steps; index += 1) {
    const angle = normalizeDegrees(Number(startDeg || 0) + sweep * index / steps);
    points.push(pointOnNormalizedCircle(angle, 0.5));
  }
  points.push({ x: 0.5, y: 0.5 });
  return points;
}

function positiveAngleSweep(startDeg, endDeg) {
  const start = normalizeDegrees(startDeg);
  const end = normalizeDegrees(endDeg);
  const sweep = end >= start ? end - start : end + 360 - start;
  return Math.max(6, Math.min(354, sweep));
}

function pointOnNormalizedCircle(deg, radius) {
  const radians = normalizeDegrees(deg) * Math.PI / 180;
  return {
    x: round(0.5 + Math.cos(radians) * radius),
    y: round(0.5 + Math.sin(radians) * radius)
  };
}

function normalizeDegrees(value) {
  return ((Number(value || 0) % 360) + 360) % 360;
}

function chartLineEndpointPoints(segments = []) {
  const seen = new Set();
  const points = [];
  for (const segment of segments) {
    for (const endpoint of [segment.lineEndpoints?.from, segment.lineEndpoints?.to]) {
      if (!endpoint) continue;
      const key = `${round(endpoint.x)}:${round(endpoint.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const size = Math.max(4, Math.min(8, Math.max(Number(segment.box?.h || 1), Number(segment.box?.w || 1)) * 0.16));
      points.push({
        id: `${segment.id || "line"}-point-${points.length}`,
        kind: "native-scatter-point-candidate",
        box: { x: round(Number(endpoint.x || 0) - size / 2), y: round(Number(endpoint.y || 0) - size / 2), w: round(size), h: round(size) },
        color: segment.color || "#2F80ED",
        nativeCandidate: true,
        density: segment.density ?? null
      });
    }
  }
  return points.sort((a, b) => Number(a.box.x || 0) - Number(b.box.x || 0));
}

function chartLineStartX(atom = {}) {
  return Math.min(Number(atom.lineEndpoints?.from?.x || atom.box?.x || 0), Number(atom.lineEndpoints?.to?.x || atom.box?.x || 0));
}

function chartNativeSource(image = {}, atom = {}, understanding = {}, detector, extra = {}) {
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    layerSourceId: image.id || null,
    layerType: "chart-zone",
    atomId: atom.id || null,
    atomKind: atom.kind || null,
    chartArchetype: understanding.archetype || null,
    confidence: atom.density ?? understanding.confidence ?? null,
    ...extra
  };
}

function applyPluginChartStyleToVisualAtomShape(shapeOrShapes, image = {}, atom = {}, index = 0, understanding = {}) {
  const hints = pluginChartStyleHints(image, atom, index, understanding);
  if (!hints) return shapeOrShapes;
  if (Array.isArray(shapeOrShapes)) {
    return shapeOrShapes.map((shape) => applyPluginChartStyleToVisualAtomShape(shape, image, atom, index, understanding));
  }
  if (!shapeOrShapes?.style) return shapeOrShapes;
  const detector = String(shapeOrShapes.source?.detector || "");
  const diagonalLine = (detector === "visual-atom-native-connector" && shapeOrShapes.source?.axis === "diagonal")
    || detector === "visual-chart-native-line-segment";
  const connector = detector === "visual-atom-native-connector"
    || detector === "visual-chart-native-axis"
    || detector === "visual-chart-native-line-segment";
  const fillShape = /visual-atom-native-(?:rect|ellipse|scatter-point|donut|donut-segment|pie-segment|legend-marker)/.test(detector)
    || /visual-chart-native-(?:bar|line-point|scatter-point|donut|donut-segment|pie-segment)/.test(detector);
  if (!connector && !fillShape) return shapeOrShapes;
  const style = { ...shapeOrShapes.style };
  if (connector) {
    style.stroke = diagonalLine ? hints.accent : hints.neutral;
    style.strokeWidthPt = diagonalLine
      ? Math.max(Number(style.strokeWidthPt || 0), 2.1)
      : Math.max(0.9, Math.min(Number(style.strokeWidthPt || 1), 1.6));
  } else {
    style.fill = hints.seriesColor;
    const pointLike = detector === "visual-atom-native-scatter-point"
      || detector === "visual-chart-native-scatter-point"
      || detector === "visual-chart-native-line-point"
      || detector === "visual-atom-native-legend-marker";
    style.stroke = pointLike ? hints.seriesStroke : hints.seriesColor;
    style.strokeWidthPt = pointLike ? Math.max(0.75, Number(style.strokeWidthPt || 0)) : Number(style.strokeWidthPt || 0);
    if (detector === "visual-atom-native-rect" || detector === "visual-chart-native-bar") style.radiusRatio = Math.max(Number(style.radiusRatio || 0), 0.025);
  }
  return {
    ...shapeOrShapes,
    style,
    source: {
      ...(shapeOrShapes.source || {}),
      pluginChartStyleApplied: true,
      pluginChartStyleProvider: hints.provider,
      pluginChartStyleGroupId: hints.groupId,
      pluginChartStylePalette: hints.palette
    }
  };
}

function pluginChartStyleHints(image = {}, atom = {}, index = 0, understanding = {}) {
  const layerType = String(image?.source?.layer?.layerType || "");
  const archetype = String(understanding?.archetype || image?.source?.layer?.diagramUnderstanding?.archetype || "");
  if (layerType !== "chart-zone" || !/chart/.test(archetype)) return null;
  const paletteInfo = pluginComponentPaletteInfo(image);
  if (paletteInfo.palette.length === 0) return null;
  const dataIndex = isVisualChartLegendMarker(image, atom, understanding)
    ? visualChartLegendMarkerIndex(atom, index, understanding)
    : atom.kind === "native-scatter-point-candidate" || atom.kind === "native-rect-candidate" || atom.kind === "native-donut-candidate" || atom.kind === "native-pie-segment-candidate"
    ? visualChartDataAtomIndex(atom, index, understanding)
    : 0;
  const accent = paletteInfo.palette[dataIndex % paletteInfo.palette.length];
  return {
    provider: paletteInfo.provider,
    groupId: paletteInfo.groupId,
    palette: paletteInfo.palette,
    accent,
    seriesColor: accent,
    seriesStroke: darkerHex(accent, 0.32),
    neutral: paletteInfo.neutral || "#64748B"
  };
}

function visualChartLegendMarkerIndex(atom = {}, fallbackIndex = 0, understanding = {}) {
  if (Number.isFinite(Number(atom.legendIndex))) return Math.max(0, Number(atom.legendIndex));
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  const legendMarkers = atoms.filter((item) => isExplicitVisualChartLegendMarker(item));
  const found = legendMarkers.findIndex((item) => item === atom || (item?.id && item.id === atom.id));
  return found >= 0 ? found : Math.max(0, Number(fallbackIndex || 0));
}

function visualChartDataAtomIndex(atom = {}, fallbackIndex = 0, understanding = {}) {
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  const dataAtoms = atoms.filter((item) =>
    item?.kind === "native-scatter-point-candidate"
    || item?.kind === "native-rect-candidate"
    || item?.kind === "native-donut-candidate"
    || item?.kind === "native-pie-segment-candidate");
  const found = dataAtoms.findIndex((item) => item === atom || (item?.id && item.id === atom.id));
  return found >= 0 ? found : Math.max(0, Number(fallbackIndex || 0));
}

function pluginComponentPaletteInfo(image = {}) {
  const assets = Array.isArray(image?.source?.componentLocalAssets) ? image.source.componentLocalAssets : [];
  for (const asset of assets) {
    const groups = Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : [];
    for (const group of groups) {
      const palette = sanitizePluginComponentPalette(group.topColors);
      if (palette.length === 0) continue;
      const neutral = sanitizePluginComponentPalette(group.topColors, { neutralOnly: true })[0] || null;
      return {
        provider: String(asset.provider || "plugin").slice(0, 40),
        groupId: String(group.id || "").slice(0, 80),
        palette,
        neutral
      };
    }
  }
  return { provider: "", groupId: "", palette: [], neutral: null };
}

function sanitizePluginComponentPalette(topColors = [], options = {}) {
  return (Array.isArray(topColors) ? topColors : [])
    .map((entry) => normalizeHex(entry?.value, ""))
    .filter(Boolean)
    .filter((color) => !isPluginPaletteNearWhite(color) && !isPluginPaletteNearBlack(color))
    .filter((color) => options.neutralOnly ? isPluginPaletteNeutral(color) : !isPluginPaletteNeutral(color))
    .slice(0, 6);
}

function isPluginPaletteNearWhite(color) {
  const rgb = parseHex(color);
  return rgb.r >= 238 && rgb.g >= 238 && rgb.b >= 238;
}

function isPluginPaletteNearBlack(color) {
  const rgb = parseHex(color);
  return rgb.r <= 32 && rgb.g <= 32 && rgb.b <= 32;
}

function isPluginPaletteNeutral(color) {
  const rgb = parseHex(color);
  const hsl = rgbToHsl(rgb);
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) <= 18
    || (hsl.s <= 0.28 && hsl.l >= 0.24 && hsl.l <= 0.86);
}

function normalizeVisualGridAtomAxis(atom = {}) {
  const raw = String(atom.axis || atom.shapeHint || "").toLowerCase();
  if (raw === "h" || raw.includes("horizontal")) return "h";
  if (raw === "v" || raw.includes("vertical")) return "v";
  const box = atom.box || {};
  return Number(box.w || 0) >= Number(box.h || 0) ? "h" : "v";
}

function isVisualChartLegendMarker(image = {}, atom = {}, understanding = {}) {
  const layerType = String(image?.source?.layer?.layerType || "");
  const archetype = String(understanding?.archetype || "");
  if (layerType !== "chart-zone" || !/chart/.test(archetype)) return false;
  if (isExplicitVisualChartLegendMarker(atom)) return true;
  return isHeuristicVisualChartLegendMarker(image, atom, understanding);
}

function isExplicitVisualChartLegendMarker(atom = {}) {
  const text = [
    atom.shapeHint,
    atom.semanticRole,
    atom.role,
    atom.detector,
    atom.kindHint
  ].filter(Boolean).join(" ").toLowerCase();
  return atom.legendMarker === true || /legend[-_\s]?marker|legend[-_\s]?swatch|图例/.test(text);
}

function isHeuristicVisualChartLegendMarker(image = {}, atom = {}, understanding = {}) {
  if (!["native-rect-candidate", "native-ellipse-candidate", "native-scatter-point-candidate"].includes(atom?.kind)) return false;
  const box = atom.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const layerBox = image.box || {};
  if (w < 5 || h < 5 || w > 18 || h > 18) return false;
  if (w * h > Math.max(1, Number(layerBox.w || 0) * Number(layerBox.h || 0)) * 0.008) return false;
  const cx = Number(box.x || 0) + w / 2;
  const cy = Number(box.y || 0) + h / 2;
  const lx = Number(layerBox.x || 0);
  const ly = Number(layerBox.y || 0);
  const lw = Number(layerBox.w || 1);
  const lh = Number(layerBox.h || 1);
  const inRightLegendBand = cx >= lx + lw * 0.68 && cy <= ly + lh * 0.42;
  const inBottomLegendBand = cy >= ly + lh * 0.72 && cx >= lx + lw * 0.18 && cx <= lx + lw * 0.88;
  if (!inRightLegendBand && !inBottomLegendBand) return false;
  return hasMatchingChartSeriesColor(atom, understanding);
}

function hasMatchingChartSeriesColor(atom = {}, understanding = {}) {
  const color = parseHex(atom.color || "");
  if (!color) return false;
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  return atoms.some((candidate) => {
    if (candidate === atom || candidate?.id === atom.id) return false;
    if (!["native-rect-candidate", "native-scatter-point-candidate", "native-donut-candidate", "native-pie-segment-candidate", "connector-line-candidate"].includes(candidate?.kind)) return false;
    if (isExplicitVisualChartLegendMarker(candidate)) return false;
    if (!candidate.color) return false;
    const candidateColor = parseHex(candidate.color);
    if (!candidateColor || colorDistance(color, candidateColor) > 36) return false;
    const candidateBox = candidate.box || {};
    const area = Number(candidateBox.w || 0) * Number(candidateBox.h || 0);
    const atomArea = Number(atom.box?.w || 0) * Number(atom.box?.h || 0);
    return candidate.kind === "connector-line-candidate" || area >= atomArea * 2.2;
  });
}

module.exports = {
  normalizeHexColor,
  createChartZoneNativeShellShapes,
  shouldObjectifyChartZoneNativeShell,
  hasMeasuredNativeChartEvidence,
  createBarChartNativeShellShapes,
  createLineChartNativeShellShapes,
  createScatterChartNativeShellShapes,
  createDonutChartNativeShellShapes,
  createPieChartNativeShellShapes,
  createWaterfallChartNativeShellShapes,
  createTreemapChartNativeShellShapes,
  createHeatmapMatrixNativeShellShapes,
  createGaugeChartNativeShellShapes,
  createRadarChartNativeShellShapes,
  chartRadarPolygonNativeShape,
  chartAxisAtoms,
  chartAxisScore,
  chartAxisNativeShape,
  chartBarNativeShape,
  chartLineSegmentNativeShape,
  chartPointNativeShape,
  chartDonutNativeShape,
  chartDonutSegmentNativeShape,
  normalizedDonutSegmentAngles,
  donutSegmentStartDegrees,
  donutSegmentFreeformPoints,
  pieSegmentFreeformPoints,
  positiveAngleSweep,
  pointOnNormalizedCircle,
  normalizeDegrees,
  chartLineEndpointPoints,
  chartLineStartX,
  chartNativeSource,
  applyPluginChartStyleToVisualAtomShape,
  pluginChartStyleHints,
  visualChartLegendMarkerIndex,
  visualChartDataAtomIndex,
  pluginComponentPaletteInfo,
  sanitizePluginComponentPalette,
  isPluginPaletteNearWhite,
  isPluginPaletteNearBlack,
  isPluginPaletteNeutral,
  normalizeVisualGridAtomAxis,
  isVisualChartLegendMarker,
  isExplicitVisualChartLegendMarker,
  isHeuristicVisualChartLegendMarker,
  hasMatchingChartSeriesColor
};
