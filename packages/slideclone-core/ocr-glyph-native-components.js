// @ts-check
"use strict";

const { extractVisualAtoms } = require("./visual-atoms");
const { vectorizeVerifiedLineArtIcon } = require("./sparse-icon-native-contours");

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

/** @param {unknown} value */
function validBox(value) {
  return isRecord(value) && finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h)
    && value.w > 0 && value.h > 0;
}

/** @param {number} value */
function round(value) { return Math.round(value * 100) / 100; }

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

/** @param {{width: number, height: number, rgba: Buffer}} image */
function dominantForegroundColor(image) {
  const samples = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.rgba[offset + 3];
      if (alpha < 64) continue;
      const r = image.rgba[offset];
      const g = image.rgba[offset + 1];
      const b = image.rgba[offset + 2];
      if (r + g + b > 620) continue;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 52 && r + g + b > 390) continue;
      samples.push([r, g, b]);
    }
  }
  if (samples.length === 0) return "#111827";
  samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const index = Math.floor(samples.length * 0.35);
  const sample = samples[clamp(index, 0, samples.length - 1)];
  return `#${sample.map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

/** @param {{width: number, height: number, rgba: Buffer}} image */
function dominantInteriorFillColor(image) {
  const samples = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.rgba[offset + 3];
      if (alpha < 64) continue;
      const r = image.rgba[offset];
      const g = image.rgba[offset + 1];
      const b = image.rgba[offset + 2];
      const brightness = r + g + b;
      if (brightness < 420 || brightness > 735) continue;
      if (Math.max(r, g, b) - Math.min(r, g, b) < 8) continue;
      samples.push([r, g, b]);
    }
  }
  if (samples.length === 0) return "#EAF3FF";
  samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const sample = samples[Math.floor(samples.length * 0.58)];
  return `#${sample.map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * OCR fallback crops sometimes hold small pictorial glyphs rather than text.
 * Detect only compact avatar/team silhouettes with strong source evidence; all
 * other glyphs remain exact raster crops.
 * @param {{width: number, height: number, rgba: Buffer}} image
 */
function classifyOcrGlyphNativeIcon(image) {
  if (!image || !Buffer.isBuffer(image.rgba)
    || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width < 24 || image.height < 24 || image.width > 512 || image.height > 512
    || image.rgba.length !== image.width * image.height * 4) return null;
  const aspect = image.width / Math.max(1, image.height);
  if (aspect < 0.55 || aspect > 1.65) return null;
  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: image.width, h: image.height }, { widthPt: image.width, heightPt: image.height }, { maxAtoms: 12 });
  const hasPerson = atoms.some((atom) => atom?.kind === "native-person-candidate" || atom?.kind === "native-team-candidate");
  const largeOutline = atoms.some((atom) => {
    const area = Number(atom?.areaRatio || 0);
    const density = Number(atom?.density || 0);
    return (atom?.kind === "native-cycle-arrow-candidate" || atom?.shapeHint === "cycle-arrow" || atom?.kind === "connector-line-candidate")
      && area >= 0.32 && area <= 0.9 && density >= 0.18 && density <= 0.62;
  });
  const filledInterior = atoms.some((atom) => {
    const box = atom?.box;
    const area = Number(atom?.areaRatio || 0);
    const density = Number(atom?.density || 0);
    return validBox(box) && atom?.kind === "native-rect-candidate" && area >= 0.035 && area <= 0.22
      && density >= 0.45 && Number(box.y) <= image.height * 0.58;
  });
  const outlineSegments = atoms.filter((atom) => {
    const area = Number(atom?.areaRatio || 0);
    const density = Number(atom?.density || 0);
    return (atom?.kind === "grid-line-candidate" || atom?.kind === "connector-line-candidate")
      && area >= 0.012 && area <= 0.08 && density >= 0.32 && density <= 0.7;
  }).length;
  if (!hasPerson && !(largeOutline && (filledInterior || outlineSegments >= 2))) return null;
  return {
    kind: largeOutline ? "team" : "person",
    color: dominantForegroundColor(image),
    evidence: {
      provider: "ocr-glyph-native-icon-detector-v1",
      atomCount: atoms.length,
      hasPerson,
      largeOutline,
      filledInterior,
      outlineSegments
    }
  };
}

/** @param {string} id @param {string} type @param {Record<string, number>} box @param {Record<string, unknown>} style @param {Record<string, unknown>} source */
function shape(id, type, box, style, source) {
  return {
    id,
    type,
    box: {
      x: round(Number(box.x)),
      y: round(Number(box.y)),
      w: round(Number(box.w)),
      h: round(Number(box.h))
    },
    style,
    source
  };
}


/** @param {string} id @param {{x: number, y: number, w: number, h: number}} box @param {string} stroke @param {string} fill @param {Record<string, unknown>} source */
function avatarPersonShapes(id, box, stroke, fill, source) {
  return [
    shape(`${id}-head`, "ellipse", {
      x: box.x + box.w * 0.29,
      y: box.y + box.h * 0.02,
      w: box.w * 0.42,
      h: box.h * 0.42
    }, { fill, stroke, strokeWidthPt: 2.2 }, { ...source, iconPart: "head" }),
    shape(`${id}-body`, "roundRect", {
      x: box.x + box.w * 0.06,
      y: box.y + box.h * 0.43,
      w: box.w * 0.64,
      h: box.h * 0.44
    }, { fill, stroke, strokeWidthPt: 2.2, radiusRatio: 0.32 }, { ...source, iconPart: "body" })
  ];
}

/**
 * @param {{id: string, box: {x: number, y: number, w: number, h: number}, cropImage: {width: number, height: number, rgba: Buffer}}} input
 * @returns {{shapes: Array<Record<string, unknown>>, evidence: Record<string, unknown>} | null}
 */
function createNativeOcrGlyphIcon(input) {
  if (!isRecord(input) || typeof input.id !== "string" || !validBox(input.box)) return null;
  const classification = classifyOcrGlyphNativeIcon(input.cropImage);
  if (!classification) return null;
  const box = input.box;
  const stroke = classification.color;
  const fill = dominantInteriorFillColor(input.cropImage);
  const source = {
    editable: true,
    nativeRebuild: true,
    detector: "ocr-glyph-native-icon",
    strategy: "native-avatar-glyph",
    iconKind: classification.kind,
    ocrGlyphFallbackReplaced: true,
    evidence: classification.evidence
  };
  const id = `${input.id}-native`;
  const contours = vectorizeVerifiedLineArtIcon({ image: input.cropImage, box, idPrefix: id, source });
  if (contours.length > 0) return { shapes: contours, evidence: classification.evidence };
  const scaffold = classification.kind === "team"
    ? [
        ...avatarPersonShapes(`${id}-primary`, { x: box.x, y: box.y, w: box.w * 0.74, h: box.h * 0.92 }, stroke, fill, { ...source, iconRole: "primary" }),
        shape(`${id}-secondary-head`, "ellipse", {
          x: box.x + box.w * 0.55,
          y: box.y + box.h * 0.42,
          w: box.w * 0.36,
          h: box.h * 0.36
        }, { fill, stroke, strokeWidthPt: 2.1 }, { ...source, iconRole: "secondary", iconPart: "head" })
      ]
    : avatarPersonShapes(id, box, stroke, fill, source);
  return { shapes: scaffold, evidence: classification.evidence };
}

module.exports = { classifyOcrGlyphNativeIcon, createNativeOcrGlyphIcon };
