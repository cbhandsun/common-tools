"use strict";
const { validBox, boxCenter, boxArea, intersectionArea, median, safeColor, containsBox } = require("./relationship-native-geometry");
const { vennEllipseShape, vennSupplementaryShape, concentricLayerShape, quadrantPanelShape, quadrantAxisShape, comparisonCellShape, comparisonGridLineShape, timelineAxisShape, timelineMilestoneShape } = require("./relationship-native-shapes");
const { isConnectedTopology, isIgnorableContainedFragment } = require("./relationship-topology-helpers");

function createVennOverlapShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const ellipses = atoms
    .filter((atom) => atom?.kind === "native-venn-ellipse-candidate" && validBox(atom.box))
    .sort((left, right) => boxCenter(left.box).x - boxCenter(right.box).x);
  if (ellipses.length < 2 || ellipses.length > 5) return null;
  if (ellipses.some((atom) => Number(atom.vennRecoveryConfidence || 0) < 0.72 || !validBox(atom.vennObservedBox))) return null;
  const widths = ellipses.map((atom) => atom.box.w);
  const heights = ellipses.map((atom) => atom.box.h);
  const medianWidth = median(widths);
  const medianHeight = median(heights);
  if (ellipses.some((atom) => Math.abs(atom.box.w - medianWidth) > medianWidth * 0.12
    || Math.abs(atom.box.h - medianHeight) > medianHeight * 0.12)) return null;
  const adjacency = new Map(ellipses.map((atom) => [atom.id, new Set()]));
  for (let i = 0; i < ellipses.length; i += 1) {
    for (let j = i + 1; j < ellipses.length; j += 1) {
      const overlap = intersectionArea(ellipses[i].box, ellipses[j].box);
      const ratio = overlap / Math.max(1, Math.min(boxArea(ellipses[i].box), boxArea(ellipses[j].box)));
      if (ratio < 0.05 || ratio > 0.72) continue;
      adjacency.get(ellipses[i].id).add(ellipses[j].id);
      adjacency.get(ellipses[j].id).add(ellipses[i].id);
    }
  }
  if (!isConnectedTopology(ellipses, adjacency)) return null;
  const layerArea = boxArea(image.box);
  const supplementary = atoms.filter((atom) => atom?.kind === "native-rect-candidate"
    && validBox(atom.box)
    && boxArea(atom.box) >= layerArea * 0.004
    && !ellipses.some((ellipse) => intersectionArea(ellipse.box, atom.box) / Math.max(1, boxArea(atom.box)) >= 0.5));
  if (supplementary.length > ellipses.length * 2) return null;
  const handled = new Set([...ellipses, ...supplementary].map((atom) => atom.id));
  if (atoms.some((atom) => !handled.has(atom?.id)
    && !isIgnorableContainedFragment(atom, [...ellipses, ...supplementary], image.box))) return null;
  return {
    shapes: [
      ...ellipses.map((atom, index) => vennEllipseShape(image, atom, index, understanding)),
      ...supplementary.map((atom, index) => vennSupplementaryShape(image, atom, index, understanding))
    ],
    handledAtomCount: handled.size,
    fullyObjectified: true,
    shellKind: "venn-overlap"
  };
}

function createConcentricCirclesShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72) return null;
  const layerBox = validBox(image.box);
  if (!layerBox) return null;
  const layers = atoms
    .filter((atom) => atom?.kind === "native-concentric-circle-candidate" && validBox(atom.box))
    .sort((left, right) => Number(left.concentricLayerIndex ?? 99) - Number(right.concentricLayerIndex ?? 99));
  if (layers.length < 2 || layers.length > 8) return null;
  if (!isSafeConcentricLayerSequence(layers)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  return {
    shapes: layers.map((atom, index) => concentricLayerShape(image, atom, index, understanding)),
    handledAtomCount: layers.length,
    fullyObjectified: true,
    shellKind: "concentric-circles"
  };
}

function createQuadrantMatrixShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72) return null;
  const layerBox = validBox(image.box);
  if (!layerBox) return null;
  const panels = atoms
    .filter((atom) => atom?.kind === "native-quadrant-panel-candidate" && validBox(atom.box))
    .sort((left, right) => Number(left.quadrantRow ?? 99) - Number(right.quadrantRow ?? 99) || Number(left.quadrantColumn ?? 99) - Number(right.quadrantColumn ?? 99));
  if (panels.length !== 4 || new Set(panels.map((panel) => `${panel.quadrantRow}:${panel.quadrantColumn}`)).size !== 4) return null;
  const lineAtoms = atoms
    .filter((atom) => ["grid-line-candidate", "connector-line-candidate"].includes(atom?.kind) && validBox(atom.box));
  const horizontal = longestAxisAtom(lineAtoms, "h", layerBox);
  const vertical = longestAxisAtom(lineAtoms, "v", layerBox);
  if (!horizontal || !vertical) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  return {
    shapes: [
      ...panels.map((atom, index) => quadrantPanelShape(image, atom, index, understanding)),
      quadrantAxisShape(image, horizontal, "h", understanding),
      quadrantAxisShape(image, vertical, "v", understanding)
    ],
    handledAtomCount: panels.length + 2,
    fullyObjectified: true,
    shellKind: "quadrant-matrix"
  };
}

function createComparisonMatrixShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  const grid = understanding.visualGrid;
  const xLines = validGridLines(grid?.xLines);
  const yLines = validGridLines(grid?.yLines);
  if (xLines.length < 3 || yLines.length < 3 || xLines.length > 17 || yLines.length > 17) return null;
  const rows = yLines.length - 1;
  const columns = xLines.length - 1;
  if (Number(grid?.rows) !== rows || Number(grid?.columns) !== columns) return null;
  if (Number(understanding.nodeCount || 0) < columns) return null;
  const cells = Array.isArray(grid?.cells) ? grid.cells : [];
  if (cells.length !== rows * columns || !isCompleteCellGrid(cells, xLines, yLines)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const stroke = safeColor(grid?.stroke, "#64748B");
  return {
    shapes: [
      ...cells.map((cell, index) => comparisonCellShape(image, cell, index, understanding)),
      ...yLines.map((y, index) => comparisonGridLineShape(image, { x: xLines[0], y, w: xLines[xLines.length - 1] - xLines[0], h: 0 }, "h", index, stroke, understanding)),
      ...xLines.map((x, index) => comparisonGridLineShape(image, { x, y: yLines[0], w: 0, h: yLines[yLines.length - 1] - yLines[0] }, "v", index, stroke, understanding))
    ],
    handledAtomCount: atoms.length,
    fullyObjectified: true,
    shellKind: "comparison-matrix"
  };
}

function createTimelineRoadmapShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.66 || !validBox(image.box)) return null;
  const candidates = atoms.filter((atom) => atom?.kind === "native-timeline-candidate" && validBox(atom.box));
  if (candidates.length !== 1 || atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const timeline = candidates[0];
  const milestones = normalizeTimelineMilestones(timeline.timelineMilestones, timeline.box);
  if (milestones.length < 3 || milestones.length > 12) return null;
  const diameter = Math.max(median(milestones.map((item) => item.widthPt)), Number(timeline.box.h || 0));
  if (!Number.isFinite(diameter) || diameter < 5 || diameter > timeline.box.h * 1.15) return null;
  const centerY = timeline.box.y + timeline.box.h / 2;
  const strokeWidth = Math.max(1.5, Math.min(5, diameter * 0.16));
  const color = safeColor(timeline.color, "#2563EB");
  return {
    shapes: [
      timelineAxisShape(image, timeline, centerY, strokeWidth, color, understanding),
      ...milestones.map((milestone, index) => timelineMilestoneShape(image, timeline, milestone, centerY, color, index, understanding))
    ],
    handledAtomCount: 1,
    fullyObjectified: true,
    shellKind: "timeline-roadmap"
  };
}

function normalizeTimelineMilestones(values, box) {
  if (!Array.isArray(values) || !validBox(box)) return [];
  const normalized = values.map((item) => ({ x: Number(item?.x), widthPt: Number(item?.widthPt) }));
  if (normalized.some((item) => !Number.isFinite(item.x) || !Number.isFinite(item.widthPt) || item.widthPt <= 0)) return [];
  if (normalized.some((item) => item.x < box.x - 1 || item.x > box.x + box.w + 1)) return [];
  const sorted = [...normalized].sort((left, right) => left.x - right.x);
  if (sorted.some((item, index) => index > 0 && item.x - sorted[index - 1].x < Math.max(4, Math.min(item.widthPt, sorted[index - 1].widthPt) * 0.55))) return [];
  return sorted;
}

function validGridLines(values) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 17) return [];
  const lines = values.map(Number);
  if (lines.some((value) => !Number.isFinite(value) || value < 0 || value > 100000)) return [];
  return lines.every((value, index) => index === 0 || value > lines[index - 1]) ? lines : [];
}

function isCompleteCellGrid(cells, xLines, yLines) {
  const expected = new Set();
  for (let row = 0; row < yLines.length - 1; row += 1) {
    for (let column = 0; column < xLines.length - 1; column += 1) expected.add(`${row}:${column}`);
  }
  for (const cell of cells) {
    const key = `${cell?.row}:${cell?.column}`;
    if (!expected.delete(key) || !validBox(cell?.box)) return false;
  }
  return expected.size === 0;
}

function longestAxisAtom(atoms = [], axis, layerBox = {}) {
  return atoms
    .filter((atom) => lineAxis(atom) === axis)
    .filter((atom) => (axis === "h" ? atom.box.w : atom.box.h) >= (axis === "h" ? layerBox.w : layerBox.h) * 0.42)
    .sort((left, right) => (axis === "h" ? right.box.w - left.box.w : right.box.h - left.box.h))[0] || null;
}

function lineAxis(atom = {}) {
  const raw = String(atom.axis || atom.shapeHint || "").toLowerCase();
  if (raw === "h" || raw.includes("horizontal")) return "h";
  if (raw === "v" || raw.includes("vertical")) return "v";
  return Number(atom.box?.w || 0) >= Number(atom.box?.h || 0) ? "h" : "v";
}

function isSafeConcentricLayerSequence(layers = []) {
  const outerCenter = boxCenter(layers[0].box);
  for (let index = 0; index < layers.length; index += 1) {
    const current = layers[index].box;
    const aspect = current.w / current.h;
    if (aspect < 0.72 || aspect > 1.38) return false;
    const center = boxCenter(current);
    if (Math.hypot(center.x - outerCenter.x, center.y - outerCenter.y) > Math.max(5, layers[0].box.w * 0.055)) return false;
    if (index === 0) continue;
    const previous = layers[index - 1].box;
    if (!containsBox(previous, current, 3)) return false;
    if (current.w / previous.w > 0.9 || current.h / previous.h > 0.9) return false;
  }
  return true;
}

module.exports = {
  createVennOverlapShell,
  createConcentricCirclesShell,
  createQuadrantMatrixShell,
  createComparisonMatrixShell,
  createTimelineRoadmapShell,
  normalizeTimelineMilestones,
  validGridLines,
  isCompleteCellGrid,
  longestAxisAtom,
  lineAxis,
  isSafeConcentricLayerSequence
};
