"use strict";
const {chartAxisNativeShape, normalizeVisualGridAtomAxis} = require("./native-chart-shell-shapes");

function createGanttRoadmapNativeShellShapes(image = {}, atoms = [], layer = {}, understanding = {}) {
  if (String(understanding.archetype || "") !== "gantt-roadmap") return [];
  if (String(understanding.nativeReadiness || "") !== "native-rebuild") return [];
  if (String(layer.layerType || "") !== "diagram-zone") return [];
  if (Number(understanding.confidence || 0) < 0.68) return [];

  const imageBox = image.box || {};
  const width = Number(imageBox.w || 0);
  const height = Number(imageBox.h || 0);
  if (!(width > 0 && height > 0)) return [];
  const axes = atoms
    .filter((atom) => atom?.box && normalizeVisualGridAtomAxis(atom) === "h")
    .filter((atom) => Number(atom.box.w || 0) >= width * 0.4 && Number(atom.box.h || 0) <= height * 0.05)
    .sort((a, b) => Number(b.box.w || 0) - Number(a.box.w || 0));
  if (axes.length === 0) return [];
  const axis = axes[0];
  const axisY = Number(axis.box.y || 0) + Number(axis.box.h || 0) / 2;
  const taskBars = atoms
    .filter((atom) => looksLikeGanttTaskBarAtom(atom, imageBox, axisY))
    .sort((a, b) => (Number(a.box.y || 0) - Number(b.box.y || 0)) || (Number(a.box.x || 0) - Number(b.box.x || 0)));
  if (taskBars.length < 3) return [];
  const unexplainedResiduals = atoms.filter((atom) => atom?.residualCandidate === true && !taskBars.includes(atom));
  if (unexplainedResiduals.length > 0) return [];

  const axisShape = chartAxisNativeShape(image, axis, 0, understanding);
  axisShape.id = `${image.id || "layer"}-visual-gantt-axis`;
  axisShape.source = ganttNativeSource(image, axis, understanding, "visual-gantt-native-axis", { part: "axis" });
  const barShapes = taskBars.slice(0, 48).map((atom, index) => ({
    id: `${image.id || "layer"}-visual-gantt-task-bar-${index}`,
    type: "rect",
    box: atom.box,
    style: {
      fill: atom.color || "#2F80ED",
      stroke: atom.color || "#2F80ED",
      strokeWidthPt: 0,
      opacity: 0.98
    },
    source: ganttNativeSource(image, atom, understanding, "visual-gantt-native-task-bar", {
      part: "task-bar",
      rowIndex: index
    })
  }));
  return [axisShape, ...barShapes];
}

function looksLikeGanttTaskBarAtom(atom = {}, imageBox = {}, axisY = 0) {
  if (!atom?.box) return false;
  if (!["native-rect-candidate", "complex-shape-crop-candidate"].includes(String(atom.kind || ""))) return false;
  const box = atom.box;
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const imageWidth = Number(imageBox.w || 0);
  const imageHeight = Number(imageBox.h || 0);
  return width >= imageWidth * 0.08
    && height >= imageHeight * 0.025
    && height <= imageHeight * 0.18
    && width >= height * 3
    && Number(box.y || 0) > axisY + Math.max(2, imageHeight * 0.01);
}

function ganttNativeSource(image = {}, atom = {}, understanding = {}, detector, extra = {}) {
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    layerSourceId: image.id || null,
    layerType: "diagram-zone",
    atomId: atom.id || null,
    atomKind: atom.kind || null,
    diagramArchetype: understanding.archetype || null,
    confidence: atom.density ?? understanding.confidence ?? null,
    ...extra
  };
}

module.exports = { createGanttRoadmapNativeShellShapes, ganttNativeSource, looksLikeGanttTaskBarAtom };
