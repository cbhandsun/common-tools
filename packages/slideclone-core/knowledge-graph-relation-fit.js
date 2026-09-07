"use strict";
// @ts-check
const {
  fitKnowledgeGraphGrayNodes,
} = require("./knowledge-graph-gray-node-fit");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{width:number,height:number}} Slide */
/** @typedef {{samples:number}} Samples */
/** @typedef {Record<string, unknown>} Shape */
const MAX_PIXELS = 40_000_000,
  MAX_DIMENSION = 16_384,
  MAX_SHAPES = 2_000,
  MAX_SAMPLES = 5_000_000,
  MAX_COORDINATE = 100_000;
const UPPER_ID = "team-knowledge-graph-right-high-target",
  LOWER_ID = "team-knowledge-graph-right-work-target-lower";
/** @param {unknown} v @returns {v is Record<string,unknown>} */ function record(
  v,
) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
/** @param {unknown} v @returns {v is number} */ function finite(v) {
  return typeof v === "number" && Number.isFinite(v);
}
/** @param {unknown} v @returns {v is Box} */ function validBox(v) {
  return (
    record(v) &&
    finite(v.x) &&
    finite(v.y) &&
    finite(v.w) &&
    finite(v.h) &&
    v.x >= 0 &&
    v.y >= 0 &&
    v.w > 0 &&
    v.h > 0 &&
    v.x + v.w <= MAX_COORDINATE &&
    v.y + v.h <= MAX_COORDINATE
  );
}
/** @param {unknown} v @returns {v is Shape} */ function shape(v) {
  return record(v);
}
/** @param {unknown} v @returns {Raster} */ function parseImage(v) {
  if (
    !record(v) ||
    typeof v.width !== "number" ||
    typeof v.height !== "number" ||
    !Number.isInteger(v.width) ||
    !Number.isInteger(v.height) ||
    v.width < 1 ||
    v.height < 1 ||
    v.width > MAX_DIMENSION ||
    v.height > MAX_DIMENSION ||
    v.width * v.height > MAX_PIXELS ||
    !(v.rgba instanceof Uint8Array) ||
    v.rgba.length !== v.width * v.height * 4
  )
    throw new TypeError("knowledge graph relation fit image is invalid");
  return { width: v.width, height: v.height, rgba: v.rgba };
}
/** @param {unknown} v @returns {Slide} */ function parseSlide(v) {
  if (
    !record(v) ||
    !finite(v.widthPt) ||
    !finite(v.heightPt) ||
    v.widthPt <= 0 ||
    v.heightPt <= 0 ||
    v.widthPt > MAX_COORDINATE ||
    v.heightPt > MAX_COORDINATE
  )
    throw new TypeError("knowledge graph relation fit slide size is invalid");
  return { width: v.widthPt, height: v.heightPt };
}
/** @param {Shape} v */ function eligible(v) {
  return (
    typeof v.id === "string" &&
    (v.id === UPPER_ID || v.id === LOWER_ID) &&
    v.type === "arc" &&
    record(v.source) &&
    v.source.semanticNativeStructure === true &&
    record(v.style) &&
    v.style.shapeType === "arc" &&
    typeof v.style.stroke === "string" &&
    v.style.stroke.toUpperCase() === "#4F81E0"
  );
}
/** @param {Shape} v @returns {Box|null} */ function shapeBox(v) {
  return validBox(v.box) ? v.box : null;
}
/** @param {unknown} input */
function fitKnowledgeGraphRelations(input) {
  if (
    !record(input) ||
    !Array.isArray(input.shapes) ||
    input.shapes.length > MAX_SHAPES
  )
    throw new TypeError("knowledge graph relation fit input is invalid");
  const image = parseImage(input.image),
    slide = parseSlide(input.slideSize);
  /** @type {unknown[]} */
  const shapes = input.shapes.slice();
  const samples = { samples: 0 },
    ids = /** @type {[string,string,string,string,string]} */ ([
      UPPER_ID,
      LOWER_ID,
      "team-knowledge-graph-node-3",
      "team-knowledge-graph-node-4",
      "team-knowledge-graph-node-5",
    ]);
  if (!finite(image.width / slide.width) || !finite(image.height / slide.height)) {
    throw new RangeError("knowledge graph relation fit pixel scale is invalid");
  }
  for (const id of ids)
    if (shapes.filter((item) => shape(item) && item.id === id).length > 1)
      throw new TypeError("knowledge graph relation fit ids are ambiguous");
  const gray = fitKnowledgeGraphGrayNodes({
    shapes,
    image,
    slideSize: input.slideSize,
  }).shapes;
  const node = /** @type {(n:number)=>Box|null} */ (
    (n) => {
      const found = gray.find(
        (item) => shape(item) && item.id === `team-knowledge-graph-node-${n}`,
      );
      return found && shape(found) ? shapeBox(found) : null;
    }
  );
  const high = node(3),
    work = node(4),
    target = node(5);
  if ([high, work, target].some((item) => item && !inside(item, slide)))
    throw new RangeError(
      "knowledge graph relation fit nodes are outside slide",
    );
  const apply = /** @type {(id:string,fitted:Box|null)=>boolean} */ (
    (id, fitted) => {
      const index = shapes.findIndex((item) => shape(item) && item.id === id),
        original = index < 0 ? null : shapes[index];
      if (!fitted || !shape(original) || !eligible(original)) return false;
      shapes[index] = relation(
        original,
        id.endsWith("lower") ? "line" : "arc",
        fitted,
      );
      return true;
    }
  );
  const upperCandidate = shapes.find(
      (item) => shape(item) && item.id === UPPER_ID,
    ),
    lowerCandidate = shapes.find((item) => shape(item) && item.id === LOWER_ID);
  return {
    shapes,
    evidence: {
      upperAccepted:
        high && target && shape(upperCandidate) && eligible(upperCandidate)
          ? apply(UPPER_ID, upper(high, target, image, slide, samples))
          : false,
      lowerAccepted:
        work && target && shape(lowerCandidate) && eligible(lowerCandidate)
          ? apply(LOWER_ID, lower(work, target, image, slide, samples))
          : false,
      samples: samples.samples,
    },
  };
}
/** @param {Shape} original @param {"arc"|"line"} type @param {Box} box */ function relation(
  original,
  type,
  box,
) {
  const style = /** @type {Record<string,unknown>} */ ({
    ...(record(original.style) ? original.style : {}),
    fill: "none",
    endArrow: "triangle",
  });
  delete style.startArrow;
  if (type === "arc") {
    style.shapeType = "arc";
    style.adjustments = [270, 360];
  } else {
    style.connectorType = "straight";
    delete style.shapeType;
    delete style.adjustments;
  }
  return {
    ...original,
    type,
    box,
    style,
    source: {
      ...(record(original.source) ? original.source : {}),
      relationFit: "source-supported",
    },
  };
}
/** @param {Box} high @param {Box} target @param {Raster} image @param {Slide} slide @param {Samples} samples @returns {Box|null} */ function upper(
  high,
  target,
  image,
  slide,
  samples,
) {
  const sx = image.width / slide.width,
    sy = image.height / slide.height,
    x0 = (high.x + high.w) * sx,
    y0 = (high.y + high.h / 2) * sy,
    seedRx = (target.x + target.w / 2) * sx - x0,
    seedRy = target.y * sy - y0;
  if (seedRx < 20 || seedRy < 20) return null;
  let best = null;
  for (let rx = Math.round(seedRx) - 28; rx <= Math.round(seedRx) + 28; rx += 2)
    for (
      let ry = Math.round(seedRy) - 28;
      ry <= Math.round(seedRy) + 28;
      ry += 2
    ) {
      if (rx < 20 || ry < 20) continue;
      let score = 0,
        support = 0;
      for (let n = 0; n <= 64; n++) {
        const t = (n * Math.PI) / 128,
          d = nearest(
            image,
            x0 + rx * Math.sin(t),
            y0 + ry * (1 - Math.cos(t)),
            4,
            samples,
          );
        score += d;
        if (d <= 9) support++;
      }
      const candidate = { rx, ry, score, support: support / 65 };
      if (!best || candidate.score < best.score) best = candidate;
    }
  if (
    !best ||
    best.support < 0.95 ||
    best.score / 65 > 2 ||
    Math.abs(best.rx - Math.round(seedRx)) === 28 ||
    Math.abs(best.ry - Math.round(seedRy)) === 28
  )
    return null;
  const result = {
    x: (x0 - best.rx) / sx,
    y: y0 / sy,
    w: (2 * best.rx) / sx,
    h: (2 * best.ry) / sy,
  };
  return inside(result, slide) ? result : null;
}
/** @param {Box} work @param {Box} target @param {Raster} image @param {Slide} slide @param {Samples} samples @returns {Box|null} */ function lower(
  work,
  target,
  image,
  slide,
  samples,
) {
  const sx = image.width / slide.width,
    sy = image.height / slide.height,
    start = work.x + work.w,
    y0 = (work.y + work.h) * sy,
    x0 = start * sx,
    tip0 = (target.x + target.w / 2) * sx;
  let best = null;
  for (let y = Math.round(y0) - 8; y <= Math.round(y0) + 8; y++)
    for (let tip = Math.round(tip0) - 24; tip <= Math.round(tip0) + 24; tip++) {
      const from = Math.round(x0) + 4,
        to = tip - 10;
      if (to <= from) continue;
      let hits = 0,
        gap = 0,
        maxGap = 0;
      for (let x = from; x <= to; x++)
        if (blue(image, x, y, samples)) {
          hits++;
          gap = 0;
        } else {
          gap++;
          maxGap = Math.max(maxGap, gap);
        }
      const support = hits / (to - from + 1);
      if (support < 0.9 || maxGap > 3 || !triangle(image, tip, y, samples))
        continue;
      const candidate = {
        tip,
        y,
        score: support - Math.abs(y - y0) / 100 - Math.abs(tip - tip0) / 1000,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
  if (!best) return null;
  const result = {
    x: start,
    y: best.y / sy,
    w: best.tip / sx - start,
    h: 0.000001,
  };
  return result.w > 0 && inside(result, slide) ? { ...result, h: 0 } : null;
}
/** @param {Raster} image @param {number} tip @param {number} y @param {Samples} samples */ function triangle(
  image,
  tip,
  y,
  samples,
) {
  let previous = Infinity;
  for (let row = 1; row <= 3; row++) {
    let run = 0;
    for (let x = tip - 9; x <= tip - 1; x++)
      if (blue(image, x, y + row, samples)) run++;
    if (run < 2 || run >= previous) return false;
    previous = run;
  }
  return !blue(image, tip + 1, y + 3, samples);
}
/** @param {Raster} image @param {number} x @param {number} y @param {number} radius @param {Samples} samples */ function nearest(
  image,
  x,
  y,
  radius,
  samples,
) {
  let result = 25;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      if (
        dx * dx + dy * dy < result &&
        blue(image, Math.round(x) + dx, Math.round(y) + dy, samples)
      )
        result = dx * dx + dy * dy;
  return result;
}
/** @param {Raster} image @param {number} x @param {number} y @param {Samples} samples */ function blue(
  image,
  x,
  y,
  samples,
) {
  if (++samples.samples > MAX_SAMPLES)
    throw new RangeError(
      "knowledge graph relation fit sampling limit exceeded",
    );
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
  const i = (y * image.width + x) * 4,
    r = image.rgba[i] ?? 0,
    g = image.rgba[i + 1] ?? 0,
    b = image.rgba[i + 2] ?? 0,
    a = image.rgba[i + 3] ?? 0;
  return (
    a > 160 &&
    b > 160 &&
    b - r > 70 &&
    g - r > 20 &&
    g < 210 &&
    Math.hypot(r - 79, g - 129, b - 224) <= 155
  );
}
/** @param {Box} value @param {Slide} slide */ function inside(value, slide) {
  return (
    value.x >= 0 &&
    value.y >= 0 &&
    value.x + value.w <= slide.width &&
    value.y + value.h <= slide.height
  );
}
module.exports = { fitKnowledgeGraphRelations };
