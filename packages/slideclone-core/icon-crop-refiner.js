"use strict";

const { cropPng } = require("./png");
const { dominantBorderColor, makeEdgeConnectedBackgroundTransparent } = require("./edge-background-alpha");

function refineStandaloneIconCrop(image, options = {}) {
  if (!validImage(image)) throw new Error("image must contain a valid RGBA buffer");
  const paddingPx = positiveInteger(options.paddingPx, 2);
  const minimumDominance = finiteNumber(options.minimumDominance, 0.72);
  const border = dominantBorderColor(image, options.quantizationStep);
  const alphaReady = isNeutralLightBackground(border)
    ? makeEdgeConnectedBackgroundTransparent(image, options)
    : { ...image, rgba: Buffer.from(image.rgba) };
  const components = opaqueComponents(alphaReady, options.minimumAlpha ?? 32);
  if (components.length === 0) return unchanged(alphaReady);

  const primary = components.sort((left, right) => right.pixels.length - left.pixels.length)[0];
  const opaqueCount = components.reduce((sum, component) => sum + component.pixels.length, 0);
  if (primary.pixels.length / opaqueCount < minimumDominance) return unchanged(alphaReady);

  const detailPaddingPx = positiveInteger(options.detailPaddingPx, Math.max(2, paddingPx));
  const detailBox = expandBox(primary.box, image.width, image.height, detailPaddingPx);
  const retained = components.filter((component) => component === primary || boxContainedBy(component.box, detailBox));
  const retainedPixels = retained.reduce((sum, component) => sum + component.pixels.length, 0);
  const rgba = Buffer.from(alphaReady.rgba);
  const keep = new Uint8Array(image.width * image.height);
  retained.forEach((component) => component.pixels.forEach((pixel) => { keep[pixel] = 1; }));
  for (let pixel = 0; pixel < keep.length; pixel += 1) {
    if (!keep[pixel]) rgba[pixel * 4 + 3] = 0;
  }
  const contentBox = retained.map((component) => component.box).reduce(unionBox);
  const box = expandBox(contentBox, image.width, image.height, paddingPx);
  return {
    image: cropPng({ ...alphaReady, rgba }, box),
    box,
    refined: true,
    removedNeighborPixels: opaqueCount - retainedPixels,
    retainedDetailComponents: Math.max(0, retained.length - 1)
  };
}

function refineDenseIconCrop(image, options = {}) {
  if (!validImage(image)) throw new Error("image must contain a valid RGBA buffer");
  const requestedEdges = normalizeIntrusionEdges(options.intrusionEdges, options.trimTopIntrusion);
  const border = dominantBorderColor(image, options.quantizationStep);
  const alphaReady = isNeutralLightBackground(border)
    ? makeEdgeConnectedBackgroundTransparent(image, options)
    : { ...image, rgba: Buffer.from(image.rgba) };
  const radius = positiveInteger(options.radiusPx, 2);
  const minimumNeighbors = positiveInteger(options.minimumNeighbors, 13);
  const minimumAlpha = positiveInteger(options.minimumAlpha, 32);
  const mask = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    if (alphaReady.rgba[(y * image.width + x) * 4 + 3] < minimumAlpha) continue;
    let neighborCount = 0;
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && nx < image.width && ny >= 0 && ny < image.height && alphaReady.rgba[(ny * image.width + nx) * 4 + 3] >= minimumAlpha) neighborCount += 1;
    }
    if (neighborCount >= minimumNeighbors) mask[y * image.width + x] = 1;
  }
  const components = maskComponents(mask, image.width, image.height, alphaReady.rgba);
  if (!components.length) return unchanged(alphaReady);
  const primary = components.sort((left, right) => right.score - left.score)[0];
  if (primary.pixels < Math.max(12, image.width * image.height * 0.015)) return unchanged(alphaReady);
  const padding = positiveInteger(options.paddingPx, 3);
  const box = expandBox(primary.box, image.width, image.height, padding);
  const keep = new Uint8Array(image.width * image.height);
  for (const pixel of primary.members) {
    const x = pixel % image.width; const y = Math.floor(pixel / image.width);
    for (let dy = -padding; dy <= padding; dy += 1) for (let dx = -padding; dx <= padding; dx += 1) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && nx < image.width && ny >= 0 && ny < image.height) keep[ny * image.width + nx] = 1;
    }
  }
  const rgba = Buffer.from(alphaReady.rgba); let removedNeighborPixels = 0;
  for (let pixel = 0; pixel < keep.length; pixel += 1) if (!keep[pixel] && rgba[pixel * 4 + 3] > 0) { rgba[pixel * 4 + 3] = 0; removedNeighborPixels += 1; }
  const cropped = cropPng({ ...alphaReady, rgba }, box);
  const edgeTrim = trimNarrowEdgeIntrusions(cropped, requestedEdges);
  return {
    image: edgeTrim.image,
    box: {
      x: box.x + edgeTrim.left,
      y: box.y + edgeTrim.top,
      w: box.w - edgeTrim.left - edgeTrim.right,
      h: box.h - edgeTrim.top - edgeTrim.bottom
    },
    refined: true,
    removedNeighborPixels,
    removedOverlapPixels: edgeTrim.removedOverlapPixels,
    retainedDetailComponents: 0,
    trimmedTopIntrusionPx: edgeTrim.top,
    trimmedEdgeIntrusionPx: Object.freeze({ top: edgeTrim.top, right: edgeTrim.right, bottom: edgeTrim.bottom, left: edgeTrim.left })
  };
}

function normalizeIntrusionEdges(value, legacyTop) {
  if (value == null) return legacyTop === true ? ["top"] : [];
  if (!Array.isArray(value)) throw new TypeError("intrusionEdges must be an array");
  const allowed = new Set(["top", "right", "bottom", "left"]); const result = [];
  for (const edge of value) {
    if (!allowed.has(edge)) throw new RangeError(`unsupported intrusion edge: ${String(edge)}`);
    if (!result.includes(edge)) result.push(edge);
  }
  return result;
}

function trimNarrowEdgeIntrusions(image, edges) {
  let current = image; let removedOverlapPixels = 0; const trim = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const edge of edges) {
    const amount = edgeTrimAmount(current, edge);
    if (amount <= 0) continue;
    trim[edge] += amount;
    current = cropPng(current, {
      x: edge === "left" ? amount : 0,
      y: edge === "top" ? amount : 0,
      w: current.width - (edge === "left" || edge === "right" ? amount : 0),
      h: current.height - (edge === "top" || edge === "bottom" ? amount : 0)
    });
    const overlapCleanup = removeTrimmedEdgeOutliers(current, edge);
    current = overlapCleanup.image; trim[edge] += overlapCleanup.additionalTrimPx; removedOverlapPixels += overlapCleanup.removedPixels;
  }
  return { image: current, removedOverlapPixels, ...trim };
}

function removeTrimmedEdgeOutliers(image, edge) {
  const horizontalEdge = edge === "top" || edge === "bottom";
  const depth = horizontalEdge ? image.height : image.width;
  const span = horizontalEdge ? image.width : image.height;
  const bandDepth = Math.min(6, Math.max(0, depth - 5));
  if (bandDepth < 3) return { image, removedPixels: 0, additionalTrimPx: 0 };
  const lines = Array.from({ length: Math.min(depth, bandDepth + 5) }, (_, inward) => edgeLine(image, edge, inward));
  const anchorCenters = lines.slice(bandDepth, bandDepth + 5).filter((line) => line.count > 0).map((line) => (line.minimum + line.maximum) / 2).sort((left, right) => left - right);
  if (!anchorCenters.length) return { image, removedPixels: 0, additionalTrimPx: 0 };
  const anchorCenter = anchorCenters[Math.floor(anchorCenters.length / 2)];
  const edgeCenters = lines.slice(0, bandDepth).filter((line) => line.count > 0).map((line) => (line.minimum + line.maximum) / 2);
  const deviation = edgeCenters.reduce((maximum, center) => Math.max(maximum, Math.abs(center - anchorCenter)), 0);
  if (deviation < Math.max(3, span * 0.06)) return { image, removedPixels: 0, additionalTrimPx: 0 };
  const rgba = Buffer.from(image.rgba); let removedPixels = 0;
  for (let inward = 0; inward < bandDepth; inward += 1) {
    const line = lines[inward];
    if (line.count <= 0) continue;
    const halfWidth = Math.max(2, line.count / 2 + 0.5);
    for (let across = 0; across < span; across += 1) {
      if (Math.abs(across - anchorCenter) <= halfWidth) continue;
      const coordinate = edge === "bottom" || edge === "right" ? depth - inward - 1 : inward;
      const x = horizontalEdge ? across : coordinate; const y = horizontalEdge ? coordinate : across;
      const alphaOffset = (y * image.width + x) * 4 + 3;
      if (rgba[alphaOffset] < 32) continue;
      rgba[alphaOffset] = 0; removedPixels += 1;
    }
  }
  if (removedPixels > Math.max(24, image.width * image.height * 0.005)) return { image, removedPixels: 0, additionalTrimPx: 0 };
  const runCleanup = removeSmallEdgeRuns({ ...image, rgba }, edge, Math.min(3, bandDepth));
  removedPixels += runCleanup.removedPixels;
  const cleaned = runCleanup.image;
  const first = edgeLine(cleaned, edge, 0);
  const widest = Array.from({ length: Math.min(depth, 12) }, (_, inward) => edgeLine(cleaned, edge, inward)).reduce((maximum, line) => Math.max(maximum, line.count), 0);
  const additionalTrimPx = first.count > 0 && first.count < widest * 0.42 ? 1 : 0;
  return {
    image: additionalTrimPx ? cropEdge(cleaned, edge, additionalTrimPx) : cleaned,
    removedPixels,
    additionalTrimPx
  };
}

function removeSmallEdgeRuns(image, edge, depth) {
  const horizontalEdge = edge === "top" || edge === "bottom";
  const axisDepth = horizontalEdge ? image.height : image.width;
  const span = horizontalEdge ? image.width : image.height;
  const rgba = Buffer.from(image.rgba); let removedPixels = 0;
  for (let inward = 0; inward < depth; inward += 1) {
    const coordinate = edge === "bottom" || edge === "right" ? axisDepth - inward - 1 : inward;
    const runs = []; let start = -1;
    for (let across = 0; across <= span; across += 1) {
      const opaque = across < span && rgba[((horizontalEdge ? coordinate : across) * image.width + (horizontalEdge ? across : coordinate)) * 4 + 3] >= 32;
      if (opaque && start < 0) start = across;
      if (!opaque && start >= 0) { runs.push({ start, end: across - 1, length: across - start }); start = -1; }
    }
    if (runs.length <= 1) continue;
    const primary = runs.sort((left, right) => right.length - left.length)[0];
    for (const run of runs) {
      if (run === primary || run.length > Math.max(3, primary.length * 0.15)) continue;
      for (let across = run.start; across <= run.end; across += 1) {
        const x = horizontalEdge ? across : coordinate; const y = horizontalEdge ? coordinate : across;
        rgba[(y * image.width + x) * 4 + 3] = 0; removedPixels += 1;
      }
    }
  }
  return { image: removedPixels ? { ...image, rgba } : image, removedPixels };
}

function cropEdge(image, edge, amount) {
  return cropPng(image, {
    x: edge === "left" ? amount : 0,
    y: edge === "top" ? amount : 0,
    w: image.width - (edge === "left" || edge === "right" ? amount : 0),
    h: image.height - (edge === "top" || edge === "bottom" ? amount : 0)
  });
}

function edgeLine(image, edge, inward) {
  const horizontalEdge = edge === "top" || edge === "bottom";
  const depth = horizontalEdge ? image.height : image.width;
  const span = horizontalEdge ? image.width : image.height;
  const coordinate = edge === "bottom" || edge === "right" ? depth - inward - 1 : inward;
  let count = 0; let minimum = span; let maximum = -1;
  for (let across = 0; across < span; across += 1) {
    const x = horizontalEdge ? across : coordinate; const y = horizontalEdge ? coordinate : across;
    if (image.rgba[(y * image.width + x) * 4 + 3] < 32) continue;
    count += 1; minimum = Math.min(minimum, across); maximum = Math.max(maximum, across);
  }
  return { count, minimum, maximum };
}

function edgeTrimAmount(image, edge) {
  const horizontalEdge = edge === "top" || edge === "bottom";
  const depth = horizontalEdge ? image.height : image.width;
  const lines = [];
  for (let inward = 0; inward < depth; inward += 1) {
    lines.push(edgeLine(image, edge, inward));
  }
  const widest = lines.reduce((best, line) => line.count > best.count ? line : best, lines[0]);
  if (!widest || widest.count < 8) return 0;
  const bodyCenter = (widest.minimum + widest.maximum) / 2;
  const minimumBodyWidth = Math.max(6, Math.ceil(widest.count * 0.19));
  const searchLimit = Math.max(1, Math.floor(depth * 0.45));
  const bodyStart = lines.findIndex((line, index) => index <= searchLimit
    && line.count >= minimumBodyWidth && line.minimum <= bodyCenter && line.maximum >= bodyCenter);
  return bodyStart > 1 && bodyStart <= searchLimit ? bodyStart : 0;
}

function inferIntrusionEdges({ box, relationships = [], fallbackPoint = null, maximumDistance } = {}) {
  const target = finiteBox(box, "box");
  if (!Array.isArray(relationships)) throw new TypeError("relationships must be an array");
  const distanceLimit = finiteNumber(maximumDistance, Math.max(4, Math.min(target.w, target.h) * 0.18));
  if (distanceLimit < 0) throw new RangeError("maximumDistance must be non-negative");
  const cornerAlignmentLimit = Math.max(distanceLimit, Math.min(target.w, target.h) * 0.32);
  const fallbackEdge = fallbackPoint == null ? null : edgeTowardPoint(target, finitePoint(fallbackPoint, "fallbackPoint"));
  const matches = [];
  for (const relationship of relationships) {
    const segment = relationshipSegment(relationship);
    if (!segment) continue;
    for (const [contact, opposite] of [[segment.start, segment.end], [segment.end, segment.start]]) {
      const distance = distanceToBox(contact, target);
      if (distance > distanceLimit || pointInsideBox(opposite, target)) continue;
      matches.push({ edge: contactEdge(contact, target, cornerAlignmentLimit, fallbackEdge), distance });
    }
  }
  matches.sort((left, right) => left.distance - right.distance);
  const edges = [...new Set(matches.map((match) => match.edge))];
  if (edges.length || fallbackPoint == null) return edges;
  return [fallbackEdge];
}

function inferPointFacingEdges(box, point, ambiguityRatio = 1.35) {
  const target = finiteBox(box, "box"); const focus = finitePoint(point, "point");
  const ratio = finiteNumber(ambiguityRatio, 1.35);
  if (ratio < 1) throw new RangeError("ambiguityRatio must be at least 1");
  const dx = focus.x - (target.x + target.w / 2); const dy = focus.y - (target.y + target.h / 2);
  const horizontal = dx >= 0 ? "right" : "left"; const vertical = dy >= 0 ? "bottom" : "top";
  const minimum = Math.min(Math.abs(dx), Math.abs(dy)); const maximum = Math.max(Math.abs(dx), Math.abs(dy));
  if (minimum > 0 && maximum / minimum <= ratio) return [horizontal, vertical];
  return Math.abs(dx) > Math.abs(dy) ? [horizontal] : [vertical];
}

function relationshipSegment(value) {
  const candidate = value?.box ?? value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const values = [candidate.x, candidate.y, candidate.w, candidate.h].map(Number);
  if (!values.every(Number.isFinite)) return null;
  return { start: { x: values[0], y: values[1] }, end: { x: values[0] + values[2], y: values[1] + values[3] } };
}

function distanceToBox(point, box) {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.w));
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.h));
  return Math.hypot(dx, dy);
}

function pointInsideBox(point, box) {
  return point.x > box.x && point.x < box.x + box.w && point.y > box.y && point.y < box.y + box.h;
}

function closestBoxEdge(point, box) {
  const distances = [
    ["top", Math.abs(point.y - box.y)],
    ["right", Math.abs(point.x - (box.x + box.w))],
    ["bottom", Math.abs(point.y - (box.y + box.h))],
    ["left", Math.abs(point.x - box.x)]
  ];
  return distances.sort((left, right) => left[1] - right[1])[0][0];
}

function contactEdge(point, box, distanceLimit, fallbackEdge) {
  const distances = new Map([
    ["top", Math.abs(point.y - box.y)],
    ["right", Math.abs(point.x - (box.x + box.w))],
    ["bottom", Math.abs(point.y - (box.y + box.h))],
    ["left", Math.abs(point.x - box.x)]
  ]);
  if (fallbackEdge && distances.get(fallbackEdge) <= distanceLimit) return fallbackEdge;
  return closestBoxEdge(point, box);
}

function edgeTowardPoint(box, point) {
  const dx = point.x - (box.x + box.w / 2); const dy = point.y - (box.y + box.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function maskComponents(mask, width, height, rgba) {
  const visited = new Uint8Array(mask.length); const result = [];
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || visited[seed]) continue;
    const queue = [seed]; const members = []; visited[seed] = 1; let pixels = 0; let saturation = 0;
    let minX = width; let minY = height; let maxX = 0; let maxY = 0;
    while (queue.length) {
      const pixel = queue.pop(); const x = pixel % width; const y = Math.floor(pixel / width); pixels += 1;
      members.push(pixel);
      const offset = pixel * 4; const maximum = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]); const minimum = Math.min(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
      saturation += maximum === 0 ? 0 : (maximum - minimum) / maximum;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const neighbor of neighbors(x, y, width, height)) if (mask[neighbor] && !visited[neighbor]) { visited[neighbor] = 1; queue.push(neighbor); }
    }
    result.push({ pixels, members, score: pixels * (1 + 2 * saturation / pixels), box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } });
  }
  return result;
}

function mapReferenceBoxToSourcePixels(referenceBox, referenceSize, sourceSize, options = {}) {
  const box = finiteBox(referenceBox, "referenceBox");
  const reference = finiteSize(referenceSize, "referenceSize");
  const source = finiteSize(sourceSize, "sourceSize");
  if (box.x + box.w > reference.width || box.y + box.h > reference.height) {
    throw new RangeError("referenceBox exceeds referenceSize bounds");
  }
  const paddingPx = positiveInteger(options.paddingPx, 0);
  const scaleX = source.width / reference.width;
  const scaleY = source.height / reference.height;
  const left = Math.max(0, Math.floor(box.x * scaleX) - paddingPx);
  const top = Math.max(0, Math.floor(box.y * scaleY) - paddingPx);
  const right = Math.min(source.width, Math.ceil((box.x + box.w) * scaleX) + paddingPx);
  const bottom = Math.min(source.height, Math.ceil((box.y + box.h) * scaleY) + paddingPx);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function opaqueComponents(image, minimumAlpha) {
  const total = image.width * image.height;
  const visited = new Uint8Array(total);
  const components = [];
  for (let seed = 0; seed < total; seed += 1) {
    if (visited[seed] || image.rgba[seed * 4 + 3] < minimumAlpha) continue;
    const pixels = [];
    const queue = [seed];
    visited[seed] = 1;
    let minX = image.width, minY = image.height, maxX = 0, maxY = 0;
    while (queue.length) {
      const pixel = queue.pop();
      const x = pixel % image.width;
      const y = Math.floor(pixel / image.width);
      pixels.push(pixel);
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const neighbor of neighbors(x, y, image.width, image.height)) {
        if (visited[neighbor] || image.rgba[neighbor * 4 + 3] < minimumAlpha) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    components.push({ pixels, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } });
  }
  return components;
}

function neighbors(x, y, width, height) {
  const result = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) result.push(ny * width + nx);
    }
  }
  return result;
}

function isNeutralLightBackground(color = {}) {
  const values = [Number(color.r), Number(color.g), Number(color.b)];
  return values.every(Number.isFinite)
    && Math.max(...values) - Math.min(...values) <= 26
    && (values[0] + values[1] + values[2]) / 3 >= 170;
}

function expandBox(box, width, height, padding) {
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  const right = Math.min(width, box.x + box.w + padding);
  const bottom = Math.min(height, box.y + box.h + padding);
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

function unionBox(left, right) {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const farX = Math.max(left.x + left.w, right.x + right.w);
  const farY = Math.max(left.y + left.h, right.y + right.h);
  return { x, y, w: farX - x, h: farY - y };
}

function boxContainedBy(inner, outer) {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w
    && inner.y + inner.h <= outer.y + outer.h;
}

function finiteBox(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const values = [value.x, value.y, value.w, value.h].map(Number);
  if (!values.every(Number.isFinite) || values[0] < 0 || values[1] < 0 || values[2] <= 0 || values[3] <= 0) {
    throw new RangeError(`${label} must contain finite non-negative x/y and positive w/h`);
  }
  return { x: values[0], y: values[1], w: values[2], h: values[3] };
}

function finiteSize(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const width = Number(value.width), height = Number(value.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError(`${label} must contain positive finite width and height`);
  }
  return { width, height };
}

function finitePoint(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const x = Number(value.x), y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError(`${label} must contain finite x/y`);
  return { x, y };
}

function unchanged(image) { return { image, box: { x: 0, y: 0, w: image.width, h: image.height }, refined: false, removedNeighborPixels: 0, retainedDetailComponents: 0 }; }
function validImage(image) { return Number.isInteger(image?.width) && image.width > 0 && Number.isInteger(image?.height) && image.height > 0 && Buffer.isBuffer(image?.rgba) && image.rgba.length === image.width * image.height * 4; }
function finiteNumber(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function positiveInteger(value, fallback) { const number = Math.round(Number(value)); return Number.isFinite(number) && number >= 0 ? number : fallback; }

module.exports = { inferIntrusionEdges, inferPointFacingEdges, mapReferenceBoxToSourcePixels, refineDenseIconCrop, refineStandaloneIconCrop };
