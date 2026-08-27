"use strict";

// Converts only explicitly non-semantic topology edges into bounded freeform
// batches. Semantic connectors remain individual PowerPoint connectors.
function compactDenseTopologyLineFamilies(shapes = [], options = {}) {
  const maxLinesPerCompound = positiveInt(options.maxLinesPerCompound, 64);
  const ownerId = safeToken(options.ownerId || "native-topology");
  const ownerKind = String(options.ownerKind || "dense-topology");
  const groups = new Map();
  const retained = [];

  for (const shape of Array.isArray(shapes) ? shapes : []) {
    if (!isCompactionEligible(shape)) {
      retained.push(shape);
      continue;
    }
    const key = familyKey(shape);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shape);
  }

  for (const lines of groups.values()) {
    if (lines.length < 2) {
      retained.push(...lines);
      continue;
    }
    for (let offset = 0; offset < lines.length; offset += maxLinesPerCompound) {
      retained.push(compoundLineFamily(lines.slice(offset, offset + maxLinesPerCompound), {
        ownerId,
        ownerKind,
        partIndex: Math.floor(offset / maxLinesPerCompound)
      }));
    }
  }
  return retained;
}

function isCompactionEligible(shape = {}) {
  if (shape?.type !== "line") return false;
  if (shape?.source?.compactionEligible !== true) return false;
  if (shape?.source?.semanticConnector === true) return false;
  if (shape?.source?.hasEndpointLabel === true) return false;
  if (shape?.style?.startArrow || shape?.style?.endArrow || shape?.style?.tailArrow || shape?.style?.headArrow) return false;
  return validLineBox(shape.box);
}

function familyKey(shape = {}) {
  const style = shape.style || {};
  const source = shape.source || {};
  const detector = String(source.detector || "dense-topology-edge");
  const partition = String(source.compactionPartition || source.axis || lineAxis(shape.box));
  return [
    detector,
    partition,
    String(style.stroke || "#126CB4").toUpperCase(),
    round(Number(style.strokeWidthPt || 1.2)),
    String(style.lineCap || "square"),
    round(Number(style.opacity ?? 1))
  ].join("|");
}

function compoundLineFamily(lines = [], options = {}) {
  const first = lines[0] || {};
  const endpoints = lines.flatMap(lineEndpoints);
  const minX = Math.min(...endpoints.map((point) => point.x));
  const minY = Math.min(...endpoints.map((point) => point.y));
  const maxX = Math.max(...endpoints.map((point) => point.x));
  const maxY = Math.max(...endpoints.map((point) => point.y));
  const width = Math.max(0.01, maxX - minX);
  const height = Math.max(0.01, maxY - minY);
  const normalize = (point) => ({ x: round((point.x - minX) / width), y: round((point.y - minY) / height) });
  const freeformSegments = [];
  for (let index = 0; index < endpoints.length; index += 2) {
    freeformSegments.push(
      { type: "moveTo", points: [normalize(endpoints[index])] },
      { type: "lnTo", points: [normalize(endpoints[index + 1])] }
    );
  }
  const detector = String(first.source?.detector || "dense-topology-edge");
  const partition = String(first.source?.compactionPartition || first.source?.axis || lineAxis(first.box));
  return {
    id: `${safeToken(options.ownerId)}-${safeToken(detector)}-compound-${safeToken(partition)}-${Number(options.partIndex || 0)}`,
    type: "freeform",
    box: roundedBox({ x: minX, y: minY, w: width, h: height }),
    style: {
      fill: "none",
      stroke: first.style?.stroke || "#126CB4",
      strokeWidthPt: Number(first.style?.strokeWidthPt || 1.2),
      lineCap: first.style?.lineCap || "square",
      opacity: first.style?.opacity,
      closePath: false,
      freeformSegments
    },
    source: {
      ...(first.source || {}),
      detector: `${detector}-compound`,
      nativeComponentMinimumUnit: "semantic-path-family",
      compactedLineCount: lines.length,
      compactedDetector: detector,
      compactedPartition: partition,
      compactedPartIndex: Number(options.partIndex || 0),
      compactionEligible: undefined,
      componentOwnerId: options.ownerId,
      componentOwnerKind: options.ownerKind
    }
  };
}

function lineEndpoints(line = {}) {
  const box = line.box || {};
  return [
    { x: Number(box.x || 0), y: Number(box.y || 0) },
    { x: Number(box.x || 0) + Number(box.w || 0), y: Number(box.y || 0) + Number(box.h || 0) }
  ];
}

function validLineBox(box = {}) {
  return [box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value)));
}

function lineAxis(box = {}) {
  return Math.abs(Number(box.w || 0)) >= Math.abs(Number(box.h || 0)) ? "h" : "v";
}

function positiveInt(value, fallback) {
  const number = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(number) && number > 1 ? number : fallback;
}

function safeToken(value) {
  return String(value || "unknown").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "unknown";
}

function roundedBox(box = {}) {
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, round(value)]));
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

module.exports = { compactDenseTopologyLineFamilies, isCompactionEligible };
