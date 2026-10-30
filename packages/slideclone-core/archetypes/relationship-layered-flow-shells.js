"use strict";
const { validBox, boxCenter, boxArea, median, containsBox, normalizeDegrees } = require("./relationship-native-geometry");
const { swimlaneNodeShape, swimlaneConnectorShape, layeredStackShape, cycleLoopSegmentShapes } = require("./relationship-native-shapes");
const { isIgnorableContainedFragment } = require("./relationship-topology-helpers");

const MAX_FLOW_NODES = 16;

function createSwimlaneFlowShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const nodes = swimlaneNodes(atoms, image.box);
  const lanes = clusterSwimlaneNodes(nodes, image.box);
  if (!isSafeSwimlaneLanes(lanes, nodes, image.box)) return null;

  const nodePosition = new Map();
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    lanes[laneIndex].forEach((node, laneColumn) => nodePosition.set(node.id, { laneIndex, laneColumn }));
  }

  const allConnectors = Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors : [];
  const connectors = allConnectors.filter((connector) => nodePosition.has(connector?.fromAtomId) && nodePosition.has(connector?.toAtomId));
  const expectedConnectorCount = nodes.length - lanes.length;
  if (connectors.length !== expectedConnectorCount || allConnectors.length !== connectors.length) return null;

  const connectorAtoms = [];
  const coveredEdges = new Set();
  for (const connector of connectors) {
    const from = nodePosition.get(connector.fromAtomId);
    const to = nodePosition.get(connector.toAtomId);
    if (!from || !to || connector.axis !== "horizontal" || from.laneIndex !== to.laneIndex) return null;
    if (Math.abs(from.laneColumn - to.laneColumn) !== 1) return null;
    const edgeKey = `${from.laneIndex}:${Math.min(from.laneColumn, to.laneColumn)}`;
    if (coveredEdges.has(edgeKey)) return null;
    const atom = atoms.find((candidate) => candidate?.id === connector.atomId && validBox(candidate.box));
    if (!atom || !["connector-line-candidate", "connector-arrow-candidate"].includes(atom.kind)) return null;
    if (!isMeasuredInLaneConnector(atom, lanes[from.laneIndex][from.laneColumn], lanes[to.laneIndex][to.laneColumn])) return null;
    coveredEdges.add(edgeKey);
    connectorAtoms.push(atom);
  }
  if (coveredEdges.size !== expectedConnectorCount) return null;

  const handledIds = new Set([...nodes, ...connectorAtoms].map((atom) => atom.id));
  if (atoms.some((atom) => !handledIds.has(atom?.id) && !isIgnorableContainedFragment(atom, nodes, image.box))) return null;

  return {
    shapes: [
      ...connectorAtoms.map((atom, index) => swimlaneConnectorShape(image, atom, index, understanding)),
      ...lanes.flatMap((lane, laneIndex) => lane.map((atom, laneColumn) => swimlaneNodeShape(image, atom, laneIndex, laneColumn, understanding)))
    ],
    handledAtomCount: nodes.length + connectorAtoms.length,
    fullyObjectified: true,
    shellKind: "swimlane-flow"
  };
}

function createLayeredStackShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const layers = layeredStackNodes(atoms, image.box)
    .sort((left, right) => left.box.y - right.box.y || left.box.x - right.box.x);
  if (!isSafeLayeredStack(layers, image.box, understanding.structureSignature)) return null;
  const handledIds = new Set(layers.map((atom) => atom.id));
  if (atoms.some((atom) => !handledIds.has(atom?.id) && !isIgnorableContainedFragment(atom, layers, image.box))) return null;
  return {
    shapes: layers.map((atom, index) => layeredStackShape(image, atom, index, understanding)),
    handledAtomCount: layers.length,
    fullyObjectified: true,
    shellKind: "layered-stack"
  };
}

function createCycleLoopShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const segments = cycleLoopSegments(atoms);
  if (segments.length < 3 || segments.length > 8) return null;
  const parentBox = validBox(segments[0].donutParentBox);
  if (!parentBox || parentBox.w / parentBox.h < 0.72 || parentBox.w / parentBox.h > 1.38) return null;
  if (Math.min(parentBox.w, parentBox.h) < 54) return null;
  if (segments.some((segment) => !sameMeasuredParentRing(parentBox, segment.donutParentBox))) return null;
  const angles = segments.map(cycleSegmentAngles);
  if (angles.some((angle) => !angle)) return null;
  const coverage = cycleAngularCoverage(angles);
  const totalSweep = angles.reduce((sum, angle) => sum + angle.sweep, 0);
  if (coverage < 235 || totalSweep > 560 || coverage / Math.max(1, totalSweep) < 0.52) return null;

  const handledIds = new Set(segments.map((atom) => atom.id));
  if (atoms.some((atom) => !handledIds.has(atom?.id) && !isCycleCompositeArtifact(atom, parentBox))) return null;
  const ordered = segments
    .map((atom) => ({ atom, angle: cycleSegmentAngles(atom) }))
    .sort((left, right) => left.angle.startDeg - right.angle.startDeg);
  return {
    shapes: ordered.flatMap(({ atom, angle }, index) => cycleLoopSegmentShapes(image, atom, angle, index, understanding)),
    handledAtomCount: segments.length,
    fullyObjectified: true,
    shellKind: "cycle-loop"
  };
}

function cycleLoopSegments(atoms = []) {
  return atoms.filter((atom) => atom?.kind === "native-arc-arrow-segment-candidate"
    && validBox(atom.box)
    && validBox(atom.donutParentBox));
}

function sameMeasuredParentRing(expected = {}, value = {}) {
  const actual = validBox(value);
  if (!actual) return false;
  const tolerance = Math.max(3, Math.max(expected.w, expected.h) * 0.035);
  return Math.abs(actual.x - expected.x) <= tolerance
    && Math.abs(actual.y - expected.y) <= tolerance
    && Math.abs(actual.w - expected.w) <= tolerance
    && Math.abs(actual.h - expected.h) <= tolerance;
}

function cycleSegmentAngles(atom = {}) {
  const startDeg = normalizeDegrees(atom.donutSegmentAngles?.startDeg);
  const endDeg = normalizeDegrees(atom.donutSegmentAngles?.endDeg);
  if (startDeg === null || endDeg === null) return null;
  const sweep = (endDeg - startDeg + 360) % 360;
  if (sweep < 18 || sweep > 178) return null;
  return { startDeg, endDeg, sweep };
}

function cycleAngularCoverage(angles = []) {
  const covered = new Uint8Array(360);
  for (const angle of angles) {
    const steps = Math.max(1, Math.ceil(angle.sweep));
    for (let offset = 0; offset < steps; offset += 1) covered[Math.floor((angle.startDeg + offset) % 360)] = 1;
  }
  return covered.reduce((sum, value) => sum + value, 0);
}

function isCycleCompositeArtifact(atom = {}, parentBox = {}) {
  if (!validBox(atom.box) || atom.residualCandidate === true) return false;
  const atomArea = boxArea(atom.box);
  const overlap = intersectionBoxArea(atom.box, parentBox) / Math.max(1, atomArea);
  if (overlap < 0.82) return false;
  if (["connector-line-candidate", "connector-arrow-candidate", "grid-line-candidate"].includes(atom.kind)) return true;
  if (atom.kind !== "native-triangle-candidate" || atomArea > boxArea(parentBox) * 0.12) return false;
  const center = boxCenter(atom.box);
  const parentCenter = boxCenter(parentBox);
  const radius = Math.max(parentBox.w, parentBox.h) / 2;
  return Math.hypot(center.x - parentCenter.x, center.y - parentCenter.y) >= radius * 0.48;
}

function intersectionBoxArea(first = {}, second = {}) {
  const left = Math.max(Number(first.x || 0), Number(second.x || 0));
  const top = Math.max(Number(first.y || 0), Number(second.y || 0));
  const right = Math.min(Number(first.x || 0) + Number(first.w || 0), Number(second.x || 0) + Number(second.w || 0));
  const bottom = Math.min(Number(first.y || 0) + Number(first.h || 0), Number(second.y || 0) + Number(second.h || 0));
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function layeredStackNodes(atoms = [], layerBox = {}) {
  const layerArea = boxArea(layerBox);
  const candidates = atoms
    .filter((atom) => ["native-rect-candidate", "native-funnel-candidate"].includes(atom?.kind) && validBox(atom.box))
    .filter((atom) => {
      const aspect = atom.box.w / atom.box.h;
      return boxArea(atom.box) >= layerArea * 0.008
        && atom.box.w >= 28
        && atom.box.h >= 18
        && aspect >= 0.45
        && aspect <= 9;
    });
  return candidates.filter((atom) => !candidates.some((other) => other !== atom
    && containsBox(other.box, atom.box, 1)
    && boxArea(other.box) > boxArea(atom.box) * 1.5));
}

function isSafeLayeredStack(layers = [], layerBox = {}, signature = {}) {
  if (layers.length < 3 || layers.length > 8) return false;
  const centers = layers.map((layer) => boxCenter(layer.box).x);
  const centerSpread = Math.max(...centers) - Math.min(...centers);
  if (centerSpread > Math.max(9, Number(layerBox.w || 0) * 0.045)) return false;
  const heights = layers.map((layer) => layer.box.h);
  const medianHeight = median(heights);
  if (layers.some((layer) => layer.box.h < medianHeight * 0.48 || layer.box.h > medianHeight * 2.1)) return false;
  for (let index = 0; index < layers.length - 1; index += 1) {
    const gap = layers[index + 1].box.y - (layers[index].box.y + layers[index].box.h);
    if (gap < -2 || gap > Math.max(medianHeight * 1.25, Number(layerBox.h || 0) * 0.2)) return false;
  }
  const widths = layers.map((layer) => layer.box.w);
  const tolerance = Math.max(4, median(widths) * 0.04);
  const nondecreasing = widths.every((width, index) => index === 0 || width >= widths[index - 1] - tolerance);
  const nonincreasing = widths.every((width, index) => index === 0 || width <= widths[index - 1] + tolerance);
  if (!nondecreasing && !nonincreasing) return false;
  const direction = String(signature?.direction || "");
  if (direction === "pyramid-down" && !nondecreasing) return false;
  if (direction === "funnel-down" && !nonincreasing) return false;
  return Math.max(...widths) - Math.min(...widths) >= Math.max(10, Number(layerBox.w || 0) * 0.08)
    || widths.every((width) => Math.abs(width - median(widths)) <= tolerance);
}

function swimlaneNodes(atoms = [], layerBox = {}) {
  return dominantRectNodes(atoms, layerBox).slice(0, MAX_FLOW_NODES);
}

function clusterSwimlaneNodes(nodes = [], layerBox = {}) {
  if (nodes.length === 0) return [];
  const tolerance = Math.max(12, median(nodes.map((node) => node.box.h)) * 0.62, Number(layerBox.h || 0) * 0.045);
  const lanes = [];
  for (const node of [...nodes].sort((left, right) => boxCenter(left.box).y - boxCenter(right.box).y || left.box.x - right.box.x)) {
    const centerY = boxCenter(node.box).y;
    const lane = lanes.find((candidate) => Math.abs(candidate.centerY - centerY) <= tolerance);
    if (lane) {
      lane.nodes.push(node);
      lane.centerY = lane.nodes.reduce((sum, item) => sum + boxCenter(item.box).y, 0) / lane.nodes.length;
    } else {
      lanes.push({ centerY, nodes: [node] });
    }
  }
  return lanes.sort((left, right) => left.centerY - right.centerY)
    .map((lane) => lane.nodes.sort((left, right) => left.box.x - right.box.x));
}

function isSafeSwimlaneLanes(lanes = [], nodes = [], layerBox = {}) {
  if (lanes.length < 2 || lanes.length > 5 || nodes.length < 4 || nodes.length > MAX_FLOW_NODES) return false;
  if (lanes.some((lane) => lane.length < 2 || lane.length > 8)) return false;
  const medianHeight = median(nodes.map((node) => node.box.h));
  const laneCenters = lanes.map((lane) => median(lane.map((node) => boxCenter(node.box).y)));
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    const lane = lanes[laneIndex];
    const centerSpread = Math.max(...lane.map((node) => boxCenter(node.box).y)) - Math.min(...lane.map((node) => boxCenter(node.box).y));
    if (centerSpread > Math.max(10, medianHeight * 0.42)) return false;
    const horizontalSpan = lane[lane.length - 1].box.x + lane[lane.length - 1].box.w - lane[0].box.x;
    if (horizontalSpan < Number(layerBox.w || 0) * 0.28) return false;
    for (let column = 0; column < lane.length - 1; column += 1) {
      const gap = lane[column + 1].box.x - (lane[column].box.x + lane[column].box.w);
      if (gap < Math.max(4, medianHeight * 0.08) || gap > Number(layerBox.w || 0) * 0.48) return false;
    }
    if (laneIndex > 0 && laneCenters[laneIndex] - laneCenters[laneIndex - 1] < Math.max(medianHeight * 1.35, Number(layerBox.h || 0) * 0.16)) return false;
  }
  return true;
}

function isMeasuredInLaneConnector(atom = {}, firstNode = {}, secondNode = {}) {
  const box = atom.box;
  if (!validBox(box) || box.w < box.h * 4) return false;
  const left = firstNode.box.x <= secondNode.box.x ? firstNode.box : secondNode.box;
  const right = firstNode.box.x <= secondNode.box.x ? secondNode.box : firstNode.box;
  const gapLeft = left.x + left.w;
  const gapRight = right.x;
  const centerY = box.y + box.h / 2;
  const laneCenterY = (boxCenter(left).y + boxCenter(right).y) / 2;
  return box.x >= gapLeft - 8
    && box.x + box.w <= gapRight + 8
    && Math.abs(centerY - laneCenterY) <= Math.max(8, Math.max(left.h, right.h) * 0.28);
}

function dominantRectNodes(atoms = [], layerBox = {}) {
  const layerArea = boxArea(layerBox);
  const candidates = atoms
    .filter((atom) => atom?.kind === "native-rect-candidate" && validBox(atom.box))
    .filter((atom) => {
      const box = atom.box;
      const aspect = box.w / box.h;
      return boxArea(box) >= layerArea * 0.008
        && box.w >= 28
        && box.h >= 18
        && aspect >= 0.65
        && aspect <= 7;
    });
  return candidates
    .filter((atom) => !candidates.some((other) => other !== atom && containsBox(other.box, atom.box, 1) && boxArea(other.box) > boxArea(atom.box) * 1.5));
}

module.exports = {
  createSwimlaneFlowShell,
  createLayeredStackShell,
  createCycleLoopShell,
  cycleLoopSegments,
  sameMeasuredParentRing,
  cycleSegmentAngles,
  cycleAngularCoverage,
  isCycleCompositeArtifact,
  intersectionBoxArea,
  layeredStackNodes,
  isSafeLayeredStack,
  swimlaneNodes,
  clusterSwimlaneNodes,
  isSafeSwimlaneLanes,
  isMeasuredInLaneConnector
};
