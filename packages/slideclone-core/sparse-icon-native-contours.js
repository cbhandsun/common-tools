"use strict";

const { traceNativeMaskContours } = require("./native-mask-contours");

/** @param {{image?: {width: number, height: number, rgba: Buffer}, box?: {x: number, y: number, w: number, h: number}, idPrefix?: string, source?: Record<string, unknown>}} [input] */
function vectorizeVerifiedLineArtIcon({ image, box, idPrefix, source = {} } = {}) {
  if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width < 1 || image.height < 1 || image.width > 512 || image.height > 512
    || !Buffer.isBuffer(image.rgba) || image.rgba.length !== image.width * image.height * 4
    || !box || ![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0
    || typeof idPrefix !== "string" || !idPrefix || idPrefix.length > 512) throw new TypeError("Invalid line art icon input");
  const labels = new Uint8Array(image.width * image.height);
  for (let i = 0; i < labels.length; i += 1) {
    const offset = i * 4;
    const r = image.rgba[offset] ?? 0, g = image.rgba[offset + 1] ?? 0, b = image.rgba[offset + 2] ?? 0;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if ((image.rgba[offset + 3] ?? 0) < 64) continue;
    if (luma < 132) labels[i] = 1;
    else if (luma < 240 && Math.max(r, g, b) - Math.min(r, g, b) >= 18) labels[i] = 2;
  }
  const seen = new Uint8Array(labels.length);
  const components = [];
  for (let seed = 0; seed < labels.length; seed += 1) {
    if (!labels[seed] || seen[seed]) continue;
    const label = labels[seed] ?? 0;
    const stack = [seed];
    const points = [];
    let minX = image.width, minY = image.height, maxX = 0, maxY = 0;
    let r = 0, g = 0, b = 0;
    seen[seed] = 1;
    while (stack.length) {
      const index = stack.pop();
      if (index === undefined) throw new Error("Invalid line art traversal");
      const x = index % image.width, y = Math.floor(index / image.width);
      points.push({ x, y });
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      r += image.rgba[index * 4] ?? 0; g += image.rgba[index * 4 + 1] ?? 0; b += image.rgba[index * 4 + 2] ?? 0;
      const adjacent = [];
      if (x > 0) adjacent.push(index - 1);
      if (x + 1 < image.width) adjacent.push(index + 1);
      if (y > 0) adjacent.push(index - image.width);
      if (y + 1 < image.height) adjacent.push(index + image.width);
      for (const next of adjacent) if (!seen[next] && labels[next] === label) { seen[next] = 1; stack.push(next); }
    }
    if (points.length < 12) continue;
    const bounds = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    let segments = null;
    for (const tolerancePx of [0.5, 1, 1.5]) {
      segments = traceNativeMaskContours(points, bounds, { tolerancePx });
      if (segments) break;
    }
    if (!segments || components.length >= 16) return [];
    const color = `#${[r, g, b].map((sum) => Math.round(sum / points.length).toString(16).padStart(2, "0")).join("")}`;
    components.push({ label, bounds, segments, color });
  }
  // Interior fills precede outlines; each connected contour remains one object.
  return components.sort((a, b) => b.label - a.label).map((component, index) => ({
    id: `${idPrefix}-contour-${index + 1}`, type: "freeform",
    box: {
      x: box.x + component.bounds.x * box.w / image.width,
      y: box.y + component.bounds.y * box.h / image.height,
      w: component.bounds.w * box.w / image.width,
      h: component.bounds.h * box.h / image.height
    },
    style: { fill: component.color, stroke: "none", strokeWidthPt: 0, freeformSegments: component.segments },
    source: { ...source, iconPart: component.label === 1 ? "outline-contour" : "interior-contour", sourceIconBox: { ...box } }
  }));
}

module.exports = { vectorizeVerifiedLineArtIcon };
