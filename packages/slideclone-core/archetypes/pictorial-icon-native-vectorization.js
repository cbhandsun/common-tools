"use strict";

const { pixel, round, rgbToHex } = require("../scene-plan/raster-native-detection");
const { traceNativeMaskContours } = require("../scene-plan/native-mask-contours");
/** @typedef {{width:number,height:number,rgba:Buffer}} Image */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{id:string,type:string,box:Box,style:Record<string,unknown>,source:Record<string,unknown>}} Shape */
/** @typedef {Extract<ReturnType<typeof analyzeDenseIcon>,{accepted:true}>} Analysis */

/** @param {{image?:{width:number,height:number,rgba:Buffer},box?:{x:number,y:number,w:number,h:number},idPrefix?:string,sourceImageId?:string|null}} [input] */
function vectorizeDensePictorialIcon({ image, box, idPrefix, sourceImageId = null } = {}) {
  if(!image||!box||typeof idPrefix!=="string")throw new TypeError("pictorial icon input is invalid");
  validateInput(image, box, idPrefix);
  const analysis = analyzeDenseIcon(image);
  if (!analysis.accepted) return [];
  const fillShapes = densePictorialColorShapes(image, analysis, idPrefix, sourceImageId);
  return fillShapes.map((shape) => projectShape(shape, box, image));
}

/** @param {Image} image */
function analyzeDenseIcon(image) {
  let foreground = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const color = pixel(image, x, y);
      if (!pictorialColorClass(image, x, y)) continue;
      foreground += 1;
      sumR += color.r;
      sumG += color.g;
      sumB += color.b;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const total = Math.max(1, image.width * image.height);
  const foregroundRatio = foreground / total;
  if (foregroundRatio < 0.28 || foregroundRatio > 0.9 || maxX < minX || maxY < minY) return { accepted: /** @type {const} */(false) };
  const box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  return {
    accepted: /** @type {const} */(true),
    box,
    color: rgbToHex({ r: Math.round(sumR / foreground), g: Math.round(sumG / foreground), b: Math.round(sumB / foreground) }),
    foregroundRatio
  };
}

/** @param {Image} image @param {Analysis} analysis @param {string} idPrefix @param {string|null} sourceImageId */
function densePictorialColorShapes(image, analysis, idPrefix, sourceImageId) {
  const components = densePictorialColorComponents(image, analysis);
  if (!components.length || components.length > 32 || components.some((component) => !component.segments)) return [];
  // Preserve admitted base paths and paint. Reclassifying them would also
  // change contour simplification and could open gaps in existing ink.
  const details = densePictorialColorComponents(image, analysis, true, components);
  const separated = details.length && components.length + details.length <= 32 && details.every(component => component.segments);
  // A newly detected source distinction is an all-or-nothing paint contract.
  // Never recolor its body unless every independent ink contour can be emitted.
  if (components.some(component => component.bodyColor) && !separated) return [];
  const selected = separated ? [...components, ...details] : components;
  return selected.map((component, index) => nativeShape(`${idPrefix}-fill-${index + 1}`, "freeform", component.box, {
    fill: separated && component.bodyColor ? component.bodyColor : component.color,
    stroke: "none",
    strokeWidthPt: 0,
    freeformSegments: component.segments
  }, source("fill", sourceImageId, { ...analysis, foregroundRatio: component.foregroundRatio }, {
    colorClass: component.key,
    colorComponentIndex: index
  })));
}

/** @param {Image} image @param {Analysis} analysis @param {boolean} [chromaticInkOnly]
 * @param {{key:string,box:Box,bodyColor:string|null}[]} [baseComponents] */
function densePictorialColorComponents(image, analysis, chromaticInkOnly = false, baseComponents = []) {
  const bounds = analysis.box;
  const width = image.width;
  const height = image.height;
  const seen = new Uint8Array(width * height);
  const components = [];
  /** @param {number} x @param {number} y */
  const classify = (x, y) => {
    const key = pictorialColorClass(image, x, y);
    if (!chromaticInkOnly) return key;
    if (!key || key === "dark" || key === "neutral") return null;
    const color = pixel(image, x, y);
    const saturation = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
    const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
    if (luma > 92) return null;
    if (saturation <= 90) return "dark";
    // Saturated ink is meaningful when its admitted source component also
    // contains a distinct pale paint. A uniform vivid fill keeps its exact
    // old representation, rather than acquiring a duplicate dark overlay.
    return baseComponents.some(component => component.bodyColor && component.key === key
      && x >= component.box.x && x < component.box.x + component.box.w
      && y >= component.box.y && y < component.box.y + component.box.h) ? `ink-${key}` : null;
  };
  for (let y = bounds.y; y < bounds.y + bounds.h; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x += 1) {
      const index = y * width + x;
      const key = classify(x, y);
      if (seen[index] || !key) continue;
      const stack = [{ x, y }];
      const points = [];
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let minLuma = Infinity, maxLuma = -Infinity, inkPixels = 0, inkR = 0, inkG = 0, inkB = 0;
      seen[index] = 1;
      while (stack.length) {
        const point = stack.pop();
        if(!point)throw new TypeError("pictorial component is invalid");
        const color = pixel(image, point.x, point.y);
        points.push(point);
        sumR += color.r;
        sumG += color.g;
        sumB += color.b;
        const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
        const saturation = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
        minLuma = Math.min(minLuma, luma); maxLuma = Math.max(maxLuma, luma);
        if (luma <= 92 && saturation > 90) { inkPixels++; inkR += color.r; inkG += color.g; inkB += color.b; }
        for (const next of neighbors(point, bounds, width, height)) {
          const nextIndex = next.y * width + next.x;
          if (seen[nextIndex] || classify(next.x, next.y) !== key) continue;
          seen[nextIndex] = 1;
          stack.push(next);
        }
      }
      const box = pointBounds(points);
      const totalRatio = points.length / Math.max(1, image.width * image.height);
      if (points.length < 28 || totalRatio < 0.0025 || Math.max(box.w, box.h) < 4) {
        // The existing line-art path admits source strokes from 12 cells.
        // Dense paint must reject the whole icon when it would omit one of
        // those strokes, so its caller can try that complete representation.
        if (!chromaticInkOnly && points.length >= 12) return [];
        continue;
      }
      let segments = null;
      for (const tolerancePx of [0.75, 1.25, 2]) {
        segments = traceNativeMaskContours(points, box, { tolerancePx });
        if (segments) break;
      }
      components.push({
        key,
        box,
        segments,
        color: rgbToHex({ r: Math.round(sumR / points.length), g: Math.round(sumG / points.length), b: Math.round(sumB / points.length) }),
        bodyColor: !chromaticInkOnly && maxLuma - minLuma >= 42 && inkPixels >= 28 && points.length - inkPixels >= 28
          ? rgbToHex({ r: Math.round((sumR - inkR) / (points.length - inkPixels)),
            g: Math.round((sumG - inkG) / (points.length - inkPixels)), b: Math.round((sumB - inkB) / (points.length - inkPixels)) }) : null,
        foregroundRatio: totalRatio
      });
    }
  }
  return components.sort((left, right) => (right.box.w * right.box.h) - (left.box.w * left.box.h));
}

/** @param {Image} image @param {number} x @param {number} y */
function pictorialColorClass(image, x, y) {
  const color = pixel(image, x, y);
  if (color.a <= 20) return null;
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const saturation = max - min;
  const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  if (saturation >= 42 && luma <= 235 && color.b >= color.r + 28 && color.b >= color.g + 4) return "blue";
  if (saturation >= 42 && luma <= 235) {
    if (color.r === max) return color.g - min > saturation * 0.55 ? "yellow" : color.b - min > saturation * 0.55 ? "magenta" : "red";
    if (color.g === max) return color.b - min > saturation * 0.55 ? "cyan" : "green";
    return "violet";
  }
  if (luma <= 92 && saturation <= 90) return "dark";
  if (luma > 92 && luma <= 190 && saturation <= 85) return "neutral";
  return null;
}


/** @param {Shape} shape @param {Box} targetBox @param {Image} image */
function projectShape(shape, targetBox, image) {
  const local = shape.box;
  return {
    ...shape,
    box: {
      x: round(targetBox.x + targetBox.w * local.x / image.width),
      y: round(targetBox.y + targetBox.h * local.y / image.height),
      w: round(targetBox.w * local.w / image.width),
      h: round(targetBox.h * local.h / image.height)
    }
  };
}

/** @param {string} id @param {string} type @param {Box} box @param {Record<string,unknown>} style @param {Record<string,unknown>} source @param {Record<string,unknown>} [extra] @returns {Shape} */
function nativeShape(id, type, box, style, source, extra = {}) {
  return {
    id,
    type,
    box: { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) },
    style,
    source,
    ...extra
  };
}

/** @param {string} part @param {string|null} sourceImageId @param {{foregroundRatio:number}} analysis @param {Record<string,unknown>} [extra] */
function source(part, sourceImageId, analysis, extra = {}) {
  return {
    editable: true,
    nativeRebuild: true,
    detector: "dense-pictorial-icon-native-vector",
    nativeComponentRole: "pictorial",
    semanticPictorialNative: true,
    pictorialVectorized: true,
    pictorialVectorPart: part,
    sourceImageId,
    foregroundRatio: round(analysis.foregroundRatio),
    ...extra
  };
}

/** @param {Point[]} points */
function pointBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** @param {Point} point @param {Box} bounds @param {number} width @param {number} height */
function neighbors(point, bounds, width, height) {
  const out = [];
  /** @type {[number,number][]} */const shifts=[[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of shifts) {
    const x = point.x + dx;
    const y = point.y + dy;
    if (x < bounds.x || y < bounds.y || x >= bounds.x + bounds.w || y >= bounds.y + bounds.h || x < 0 || y < 0 || x >= width || y >= height) continue;
    out.push({ x, y });
  }
  return out;
}

/** @param {Image} image @param {Box} box @param {string} idPrefix */
function validateInput(image, box, idPrefix) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0
    || image.width > 2048 || image.height > 2048 || image.width * image.height > 1_000_000
    || !Buffer.isBuffer(image.rgba) || image.rgba.length !== image.width * image.height * 4) throw new TypeError("pictorial icon image is invalid");
  if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) throw new TypeError("pictorial icon box is invalid");
  if (typeof idPrefix !== "string" || !idPrefix) throw new TypeError("pictorial icon id prefix is invalid");
}

module.exports = { vectorizeDensePictorialIcon, _private: { analyzeDenseIcon, densePictorialColorComponents } };
