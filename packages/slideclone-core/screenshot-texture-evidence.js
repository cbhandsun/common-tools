"use strict";

const MAX_PEAKS = 256;
const MAX_COORDINATE = 1000000;

function hasRepeatedAlignedDensityRows(peaks = []) {
  if (!Array.isArray(peaks) || peaks.length < 6 || peaks.length > MAX_PEAKS) return false;
  const normalized = [];
  for (const peak of peaks) {
    const box = readFinitePositiveBox(peak);
    if (!box) return false;
    normalized.push({
      x: box.x + box.w / 2,
      y: box.y + box.h / 2,
      size: Math.min(box.w, box.h)
    });
  }

  const medianSize = median(normalized.map((peak) => peak.size));
  if (!Number.isFinite(medianSize) || medianSize <= 0) return false;
  const rowTolerance = Math.max(1, medianSize * 0.65);
  const alignmentTolerance = Math.max(1, medianSize * 0.7);
  const rows = clusterRows(normalized, rowTolerance)
    .map((row) => ({ y: row.centerY, centers: uniqueCenters(row.peaks.map((peak) => peak.x), alignmentTolerance) }))
    .filter((row) => row.centers.length >= 3);
  if (rows.length < 2) return false;

  for (let leftIndex = 0; leftIndex < rows.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      if (Math.abs(rows[leftIndex].y - rows[rightIndex].y) < medianSize * 1.5) continue;
      if (alignedCenterCount(rows[leftIndex].centers, rows[rightIndex].centers, alignmentTolerance) >= 3) return true;
    }
  }
  return false;
}

function clusterRows(peaks, tolerance) {
  const rows = [];
  for (const peak of [...peaks].sort((left, right) => left.y - right.y || left.x - right.x)) {
    const row = rows.find((candidate) => Math.abs(peak.y - candidate.centerY) <= tolerance);
    if (row) {
      row.peaks.push(peak);
      row.centerY = row.peaks.reduce((sum, item) => sum + item.y, 0) / row.peaks.length;
    } else {
      rows.push({ centerY: peak.y, peaks: [peak] });
    }
  }
  return rows;
}

function uniqueCenters(values, tolerance) {
  const centers = [];
  for (const value of [...values].sort((left, right) => left - right)) {
    if (!centers.some((center) => Math.abs(value - center) <= tolerance)) centers.push(value);
  }
  return centers;
}

function alignedCenterCount(left, right, tolerance) {
  let count = 0;
  let rightStart = 0;
  for (const center of left) {
    while (rightStart < right.length && right[rightStart] < center - tolerance) rightStart += 1;
    if (rightStart < right.length && Math.abs(right[rightStart] - center) <= tolerance) { count += 1; rightStart += 1; }
  }
  return count;
}

function readFinitePositiveBox(peak) {
  const peakBox = ownDataValue(peak, "box");
  if (!peakBox || typeof peakBox !== "object" || Array.isArray(peakBox)) return null;
  const box = {};
  for (const key of ["x", "y", "w", "h"]) {
    const value = ownDataValue(peakBox, key);
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE) return null;
    box[key] = value;
  }
  return box.w > 0 && box.h > 0 ? box : null;
}

function ownDataValue(object, key) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

// Sparse glyph-sized peaks are not evidence for either UI rows or diagram nodes.
function hasScatteredTextureEvidence(atoms, region) {
  if (!Array.isArray(atoms) || atoms.length > MAX_PEAKS) return false;
  const bounds = readFinitePositiveBox({ box: region });
  if (!bounds) return false;
  const peaks = atoms.filter(atom => atom?.source?.detector === "dense-linked-node-visual-atom");
  if (peaks.length < 8 || peaks.length < atoms.length * 0.45) return false;
  const boxes = peaks.map(readFinitePositiveBox);
  if (boxes.some(box => !box)) return false;
  const area = boxes.reduce((sum, box) => sum + box.w * box.h, 0);
  if (area / (bounds.w * bounds.h) >= 0.02 || hasRepeatedAlignedDensityRows(peaks)) return false;
  const colors = new Map();
  for (const peak of peaks) {
    if (typeof peak.color !== "string" || !/^#?[a-f0-9]{6}$/i.test(peak.color)) return false;
    const color = peak.color.toLowerCase();
    colors.set(color, (colors.get(color) || 0) + 1);
  }
  if (Math.max(...colors.values()) < peaks.length * 0.72) return false;
  if (atoms.filter(atom => ["connector-line-candidate", "connector-arrow-candidate"].includes(atom?.kind)).length > 2) return false;
  const rows = atoms.filter(atom => atom?.kind === "grid-line-candidate")
    .map(readFinitePositiveBox).filter(box => box && box.w >= bounds.w * 0.38 && box.h <= bounds.h * 0.06);
  return rows.some((row, index) => rows.slice(index + 1).some(peer => Math.abs(peer.y - row.y) <= bounds.h * 0.08));
}

function hasUnverifiedNativeGeometry(image) {
  return image?.source?.layer?.diagramUnderstanding?.evidence?.nativeGeometryUnverified === true;
}

function assertUnverifiedRegionTextPreserved(page, sourceTextBoxes) {
  const regions = (page?.images || []).filter(image => hasUnverifiedNativeGeometry(image) && image.source?.textObjectified === true);
  for (const region of regions) {
    const expected = (sourceTextBoxes || []).filter(text => centerInside(text.box, region.box));
    const actual = (page.textBoxes || []).filter(text => centerInside(text.box, region.box))
      .map(text => String(text.text || "").replace(/\s/g, ""));
    if (expected.some(text => !actual.some(value => value.includes(String(text.text || "").replace(/\s/g, ""))))) {
      throw new Error("objectified region lost admitted OCR text");
    }
  }
}

function centerInside(box, region) {
  if (!box || !region) return false;
  const x = box.x + box.w / 2, y = box.y + box.h / 2;
  return x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h;
}

module.exports = { hasRepeatedAlignedDensityRows, hasScatteredTextureEvidence, hasUnverifiedNativeGeometry, assertUnverifiedRegionTextPreserved };
