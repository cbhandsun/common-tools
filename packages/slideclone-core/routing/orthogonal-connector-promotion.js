"use strict";

const EPSILON = 0.25;

// Promote only simple, route-like orthogonal chains. Decorative icon strokes and
// branched diagrams stay as individual primitives so their measured geometry is preserved.
function promoteOrthogonalConnectorRoutes(shapes = []) {
  const source = Array.isArray(shapes) ? shapes : [];
  const groups = new Map();
  source.forEach((shape, index) => {
    if (!isEligibleRouteSegment(shape)) return;
    const key = `${String(shape.source?.detector || "")}\u0000${styleKey(shape.style)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ index, shape });
  });

  const replacements = new Map();
  const removed = new Set();
  for (const segments of groups.values()) {
    for (const component of connectedComponents(segments)) {
      // A branch can attach to the interior of a long trunk without sharing an
      // endpoint. It is not an elbow route, even if the trunk plus two outer
      // branches happen to form an otherwise valid three-segment path.
      if (hasExternalInteriorJunction(component, segments)) continue;
      const promoted = promoteComponent(component);
      if (!promoted) continue;
      const firstIndex = Math.min(...component.map((item) => item.index));
      replacements.set(firstIndex, promoted);
      component.forEach((item) => removed.add(item.index));
      removed.delete(firstIndex);
    }
  }

  return source.flatMap((shape, index) => {
    if (replacements.has(index)) return [replacements.get(index)];
    return removed.has(index) ? [] : [shape];
  });
}

function isEligibleRouteSegment(shape = {}) {
  if (String(shape.type || "").toLowerCase() !== "line") return false;
  if (shape.source?.preserveMeasuredSegments === true) return false;
  const detector = String(shape.source?.detector || "");
  const id = String(shape.id || "");
  if (!/(connector|route|flow|loop|chain)/i.test(`${detector} ${id}`)) return false;
  const box = shape.box || {};
  const w = Number(box.w);
  const h = Number(box.h);
  if (![box.x, box.y, w, h].every((value) => Number.isFinite(Number(value)))) return false;
  return (Math.abs(w) <= EPSILON) !== (Math.abs(h) <= EPSILON);
}

function connectedComponents(segments) {
  const remaining = new Set(segments.map((item) => item.index));
  const byIndex = new Map(segments.map((item) => [item.index, item]));
  const result = [];
  while (remaining.size) {
    const seed = remaining.values().next().value;
    const component = [];
    const queue = [seed];
    remaining.delete(seed);
    while (queue.length) {
      const index = queue.shift();
      const item = byIndex.get(index);
      component.push(item);
      for (const candidate of [...remaining]) {
        if (!touches(item.shape, byIndex.get(candidate).shape)) continue;
        remaining.delete(candidate);
        queue.push(candidate);
      }
    }
    result.push(component);
  }
  return result;
}

function promoteComponent(component) {
  if (component.length < 2 || component.length > 4) return null;
  const ordered = orderUnbranchedPath(component);
  if (!ordered) return null;
  const axes = ordered.map(({ from, to }) => axisFor(from, to));
  if (axes.some((axis) => axis === null) || axes.slice(1).some((axis, index) => axis === axes[index])) return null;

  if (shouldUseSolidElbowArrow(ordered)) return createSolidElbowArrow(ordered);

  const first = ordered[0];
  const last = ordered.at(-1);
  const arrow = ordered.map(({ shape }) => shape.style?.endArrow || shape.style?.headArrow).find(Boolean);
  const startArrow = ordered.map(({ shape }) => shape.style?.startArrow || shape.style?.tailArrow).find(Boolean);
  const segmentIds = ordered.map(({ shape }) => shape.id).filter(Boolean);
  return {
    ...first.shape,
    id: `${String(first.shape.id || "connector")}-promoted`,
    type: "line",
    box: roundedBox({ x: first.from.x, y: first.from.y, w: last.to.x - first.from.x, h: last.to.y - first.from.y }),
    style: {
      ...(first.shape.style || {}),
      connectorType: `elbow-${ordered.length}`,
      ...(startArrow ? { startArrow } : {}),
      ...(arrow ? { endArrow: arrow } : {})
    },
    source: {
      ...(first.shape.source || {}),
      nativeConnectorRoute: true,
      promotedOrthogonalSegmentCount: ordered.length,
      promotedSegmentIds: segmentIds
    }
  };
}

function shouldUseSolidElbowArrow(ordered) {
  const strokeWidth = Number(ordered[0]?.shape?.style?.strokeWidthPt || 0);
  const arrow = ordered.map(({ shape }) => shape.style?.endArrow || shape.style?.headArrow).find(Boolean);
  return ordered.length === 2 && strokeWidth >= 4 && Boolean(arrow);
}

function createSolidElbowArrow(ordered) {
  const first = ordered[0];
  const second = ordered[1];
  const width = Number(first.shape.style?.strokeWidthPt || 4);
  const half = width / 2;
  const arrowLength = Math.max(width * 2.2, 10);
  const arrowHalfWidth = Math.max(width * 1.35, 7);
  const firstDirection = direction(first.from, first.to);
  const secondDirection = direction(second.from, second.to);
  const firstNormal = leftNormal(firstDirection);
  const secondNormal = leftNormal(secondDirection);
  const leftCorner = intersectOffsetLines(first.from, firstDirection, firstNormal, half, first.to, secondDirection, secondNormal, half);
  const rightCorner = intersectOffsetLines(first.from, firstDirection, firstNormal, -half, first.to, secondDirection, secondNormal, -half);
  if (!leftCorner || !rightCorner) return null;
  const arrowBase = translate(second.to, secondDirection, -arrowLength);
  const absolutePoints = [
    translate(first.from, firstNormal, half),
    leftCorner,
    translate(arrowBase, secondNormal, half),
    translate(arrowBase, secondNormal, arrowHalfWidth),
    second.to,
    translate(arrowBase, secondNormal, -arrowHalfWidth),
    translate(arrowBase, secondNormal, -half),
    rightCorner,
    translate(first.from, firstNormal, -half)
  ];
  const box = bounds(absolutePoints);
  const points = absolutePoints.map((point) => ({
    x: round((point.x - box.x) / Math.max(0.01, box.w)),
    y: round((point.y - box.y) / Math.max(0.01, box.h))
  }));
  const segmentIds = ordered.map(({ shape }) => shape.id).filter(Boolean);
  return {
    ...first.shape,
    id: `${String(first.shape.id || "connector")}-solid-elbow-arrow`,
    type: "freeform",
    points,
    box,
    style: { fill: first.shape.style?.stroke || "#000000", stroke: "none", closePath: true },
    source: {
      ...(first.shape.source || {}),
      nativeConnectorRoute: true,
      solidElbowArrow: true,
      promotedOrthogonalSegmentCount: ordered.length,
      promotedSegmentIds: segmentIds
    }
  };
}

function orderUnbranchedPath(component) {
  const nodes = new Map();
  for (const item of component) {
    for (const point of endpoints(item.shape)) {
      const key = pointKey(point);
      if (!nodes.has(key)) nodes.set(key, { point, items: [] });
      nodes.get(key).items.push(item);
    }
  }
  const endpointsOnly = [...nodes.values()].filter((node) => node.items.length === 1);
  if (endpointsOnly.length !== 2 || [...nodes.values()].some((node) => node.items.length > 2)) return null;

  const ordered = [];
  const consumed = new Set();
  let point = endpointsOnly[0].point;
  while (ordered.length < component.length) {
    const node = nodes.get(pointKey(point));
    const item = node.items.find((candidate) => !consumed.has(candidate.index));
    if (!item) return null;
    consumed.add(item.index);
    const [a, b] = endpoints(item.shape);
    const from = pointsEqual(point, a) ? a : b;
    const to = pointsEqual(point, a) ? b : a;
    ordered.push({ shape: item.shape, from, to });
    point = to;
  }
  return ordered;
}

function endpoints(shape) {
  const box = shape.box || {};
  const x = Number(box.x);
  const y = Number(box.y);
  return [{ x, y }, { x: x + Number(box.w), y: y + Number(box.h) }];
}

function touches(left, right) {
  return endpoints(left).some((a) => endpoints(right).some((b) => pointsEqual(a, b)));
}

function hasExternalInteriorJunction(component, allSegments) {
  const componentIndexes = new Set(component.map((item) => item.index));
  return allSegments
    .filter((item) => !componentIndexes.has(item.index))
    .some((external) => endpoints(external.shape).some((point) =>
      component.some((member) => pointOnSegmentInterior(point, member.shape))
    ));
}

function pointOnSegmentInterior(point, shape) {
  const [start, end] = endpoints(shape);
  if (axisFor(start, end) === "h") {
    if (Math.abs(point.y - start.y) > EPSILON) return false;
    return point.x > Math.min(start.x, end.x) + EPSILON && point.x < Math.max(start.x, end.x) - EPSILON;
  }
  if (axisFor(start, end) === "v") {
    if (Math.abs(point.x - start.x) > EPSILON) return false;
    return point.y > Math.min(start.y, end.y) + EPSILON && point.y < Math.max(start.y, end.y) - EPSILON;
  }
  return false;
}

function pointsEqual(a, b) {
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;
}

function pointKey(point) {
  return `${Math.round(point.x / EPSILON)}:${Math.round(point.y / EPSILON)}`;
}

function axisFor(from, to) {
  if (Math.abs(from.y - to.y) <= EPSILON) return "h";
  if (Math.abs(from.x - to.x) <= EPSILON) return "v";
  return null;
}

function direction(from, to) {
  const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
  return { x: dx, y: dy };
}

function leftNormal(vector) { return { x: -vector.y, y: vector.x }; }
function translate(point, vector, distance) { return { x: point.x + vector.x * distance, y: point.y + vector.y * distance }; }

function intersectOffsetLines(firstPoint, firstDirection, firstNormal, firstOffset, secondPoint, secondDirection, secondNormal, secondOffset) {
  const a = translate(firstPoint, firstNormal, firstOffset);
  const b = translate(secondPoint, secondNormal, secondOffset);
  if (firstDirection.x === 0 && secondDirection.y === 0) return { x: b.x, y: a.y };
  if (firstDirection.y === 0 && secondDirection.x === 0) return { x: a.x, y: b.y };
  return null;
}

function bounds(points) {
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  return roundedBox({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
}

function styleKey(style = {}) {
  return [style.stroke || "", style.strokeWidthPt || "", style.dash || "", style.opacity ?? "", style.lineCap || ""].join("|");
}

function roundedBox(box) {
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 10000) / 10000]));
}

function round(value) { return Math.round(Number(value) * 10000) / 10000; }

module.exports = { promoteOrthogonalConnectorRoutes };
