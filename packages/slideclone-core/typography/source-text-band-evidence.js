"use strict";
// @ts-check

const { types } = require("node:util");

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {[number,number,number]} Color */
/** @typedef {{axis:number,support:number,stroke:boolean}} Edge */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is Box} */
function box(value) {
  return record(value) && finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h)
    && value.x >= 0 && value.y >= 0 && value.w > 0 && value.h > 0;
}

/**
 * OCR row alignment proposes a region, not a container. Require an independently
 * visible perimeter before materializing its fill or inventing an outline.
 * @param {unknown} input
 * @returns {{box:Box,strokeSupported:boolean,support:number}|null}
 */
function fitSourceTextBand(input) {
  return fitBand(input, false);
}

/** Failed straight-axis proposals may reuse the same edge thresholds with
 * local flanks and the original outline's 1.5px geometric allowance. Successful
 * measurements retain their exact geometry; callers must charge the raster
 * observation before using this recovery. @param {unknown} input */
function fitObservedSourceTextBand(input) {
  return fitBand(input, false) || fitBand(input, true);
}

/** @param {unknown} input @param {boolean} localEvidence */
function fitBand(input, localEvidence) {
  if (!record(input) || !record(input.image) || !record(input.slideSize) || !box(input.box)) return null;
  const { width, height, rgba } = input.image;
  const { widthPt, heightPt } = input.slideSize;
  if (!finite(width) || !finite(height) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 40000000
    || types.isProxy(rgba) || !types.isUint8Array(rgba)
    || !finite(widthPt) || !finite(heightPt) || widthPt <= 0 || heightPt <= 0
    || input.box.x + input.box.w > widthPt || input.box.y + input.box.h > heightPt) return null;
  const arrayPrototype=Object.getPrototypeOf(Uint8Array.prototype);
  if(!types.isArrayBuffer(Reflect.get(arrayPrototype,"buffer",rgba))
    ||Reflect.get(arrayPrototype,"length",rgba)!==width*height*4)return null;
  const sx = width / widthPt, sy = height / heightPt;
  const p = { x: input.box.x * sx, y: input.box.y * sy, w: input.box.w * sx, h: input.box.h * sy };
  if (![p.x, p.y, p.w, p.h].every(Number.isFinite) || p.w < 12 || p.h < 12) return null;
  const image = { width, height, rgba };
  const rx = Math.min(192, Math.max(6, p.w * 0.16));
  const ry = Math.min(96, Math.max(6, p.h * 0.3));
  const top = findEdge(image, false, p.y, p.x, p.w, 1, ry, localEvidence);
  const bottom = findEdge(image, false, p.y + p.h, p.x, p.w, -1, ry, localEvidence);
  if (!top || !bottom || bottom.axis <= top.axis) return null;
  const left = findEdge(image, true, p.x, top.axis, bottom.axis - top.axis, 1, rx, localEvidence);
  const right = findEdge(image, true, p.x + p.w, top.axis, bottom.axis - top.axis, -1, rx, localEvidence);
  if (!left || !right || right.axis <= left.axis) return null;
  // Recheck the complete perimeter, not four unrelated partial edges.
  const fittedTop = findEdge(image, false, top.axis, left.axis, right.axis - left.axis, 1, 2, localEvidence);
  const fittedBottom = findEdge(image, false, bottom.axis, left.axis, right.axis - left.axis, -1, 2, localEvidence);
  if (!fittedTop || !fittedBottom) return null;
  const result = { x: left.axis / sx, y: fittedTop.axis / sy,
    w: (right.axis - left.axis) / sx, h: (fittedBottom.axis - fittedTop.axis) / sy };
  if (result.w < input.box.w * 0.7 || result.w > input.box.w * 1.35
    || result.h < input.box.h * 0.55 || result.h > input.box.h * 1.6) return null;
  return { box: result, strokeSupported: [left, right, fittedTop, fittedBottom].every(edge => edge.stroke),
    support: Math.min(left.support, right.support, fittedTop.support, fittedBottom.support) };
}

/** @param {Raster} image @param {number} x @param {number} y @returns {Color|null} */
function pixel(image, x, y) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  const i = (y * image.width + x) * 4;
  if ((image.rgba[i + 3] ?? 0) < 240) return null;
  return [image.rgba[i] ?? 0, image.rgba[i + 1] ?? 0, image.rgba[i + 2] ?? 0];
}
/** @param {Color} a @param {Color} b */
function distance(a, b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])); }

/** @param {Raster} image @param {boolean} vertical @param {number} estimate @param {number} start @param {number} length @param {number} inward @param {number} radius @param {boolean} localEvidence @returns {Edge|null} */
function findEdge(image, vertical, estimate, start, length, inward, radius, localEvidence) {
  const limit = vertical ? image.width : image.height;
  const from = Math.max(3, Math.round(estimate - radius));
  const to = Math.min(limit - 4, Math.round(estimate + radius));
  /** @type {Edge[]} */ const candidates = [];
  for (let axis = from; axis <= to; axis++) {
    let transitions = 0, strokes = 0;
    for (let sample = 0; sample < 41; sample++) {
      const along = start + length * (0.15 + 0.7 * sample / 40);
      let hasTransition = false, hasStroke = false;
      for (const delta of localEvidence ? [0, -1, 1] : [0]) {
      const probeAxis = axis + delta;
      const a = vertical ? pixel(image, probeAxis + inward * 3, along) : pixel(image, along, probeAxis + inward * 3);
      const b = vertical ? pixel(image, probeAxis - inward * 3, along) : pixel(image, along, probeAxis - inward * 3);
      const center = vertical ? pixel(image, probeAxis, along) : pixel(image, along, probeAxis);
      const inner = vertical ? pixel(image, probeAxis + inward * 9, along) : pixel(image, along, probeAxis + inward * 9);
      const outer = vertical ? pixel(image, probeAxis - inward * 9, along) : pixel(image, along, probeAxis - inward * 9);
      if (!a || !b || !center) continue;
      const stable = !!inner && !!outer && distance(a, inner) <= 6 && distance(b, outer) <= 6;
      if (stable && distance(a, b) >= 6) hasTransition = true;
      const oldStroke = stable && distance(center, a) >= 18 && distance(center, b) >= 18 && distance(a, b) <= 16;
      // A separately visible dark line need not have identical backgrounds on
      // both sides. Verify a narrow local minimum and stable local flanks;
      // pictorial ink farther inside does not invalidate this perimeter proof.
      const nearInner = vertical ? pixel(image, probeAxis + inward * 4, along) : pixel(image, along, probeAxis + inward * 4);
      const nearOuter = vertical ? pixel(image, probeAxis - inward * 4, along) : pixel(image, along, probeAxis - inward * 4);
      const localStroke = nearInner && nearOuter && distance(a, nearInner) <= 6 && distance(b, nearOuter) <= 6
        && (center.every((v, c) => v <= (a[c] ?? 0) - 18 && v <= (b[c] ?? 0) - 18)
          || localEvidence && center.every((v, c) => v <= (a[c] ?? 0) - 6 && v <= (b[c] ?? 0) - 6)
            && (distance(center, a) >= 18 || distance(center, b) >= 18));
      if (localEvidence && !stable && nearInner && nearOuter && distance(a, nearInner) <= 6
        && distance(b, nearOuter) <= 6 && distance(a, b) >= 6) hasTransition = true;
      if (oldStroke || localStroke) hasStroke = true;
      }
      if (hasTransition) transitions++;
      if (hasStroke) strokes++;
    }
    const support = Math.max(transitions, strokes) / 41;
    if (support < 0.8) continue;
    candidates.push({ axis, support, stroke: strokes / 41 >= 0.8 });
  }
  if (!candidates.length) return null;
  // Stroke evidence is not permission to jump over a nearer measured edge.
  // Prefer an outline only within the nearest edge's local sampling plateau.
  const nearest = Math.min(...candidates.map(candidate => Math.abs(candidate.axis - estimate)));
  const local = candidates.filter(candidate => Math.abs(candidate.axis - estimate) <= nearest + 3);
  const strokes = local.filter(candidate => candidate.stroke);
  const preferred = strokes.length ? strokes : local;
  preferred.sort((a, b) => Math.abs(a.axis - estimate) - Math.abs(b.axis - estimate) || b.support - a.support);
  const best = preferred[0];
  if (!best) return null;
  const plateau = preferred.filter(candidate => Math.abs(candidate.axis - best.axis) <= 6
    && candidate.support >= best.support * 0.97);
  return { ...best, axis: plateau.reduce((sum, edge) => sum + edge.axis, 0) / plateau.length };
}

module.exports = { fitSourceTextBand, fitObservedSourceTextBand };
