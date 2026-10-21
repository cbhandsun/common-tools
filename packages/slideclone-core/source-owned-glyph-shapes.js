// @ts-check
"use strict";

const { types } = require("node:util");
const { detectColorComponents } = require("./color-component-bounds");
const { textProbeRevision } = require("./owned-text-advance");

const MAX_SHAPES = 10_000;
const MAX_TEXT_BOXES = 2_000;
const MAX_MEASUREMENTS = 2_000;
const MAX_RASTER_PIXELS = 40_000_000;
const MAX_COMPONENT_SAMPLES = 2_000_000;
const MAX_COMPONENTS = 10_000;
const OCR_CONFIDENCE = 0.9;
const SHAPE_COLOR_DISTANCE = 36;
const SOURCE_COLOR_DISTANCE = 54;

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{r:number,g:number,b:number}} Rgb */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{rendererId:string,version:string,dpi:number,pixelWidth:number,pixelHeight:number,runtimeHash:string,sourceHash:string}} RenderProfile */
/** @typedef {{id:string,source:Box,rendered:Box,textRevision:string,eligible:boolean}} Measurement */
/** @typedef {{id:string,textId:string,textRevision:string}} RemovedShape */
/** @typedef {{text:Record<string,unknown>,id:string,evidence:Box,measurement:Measurement,color:Rgb,searchBox:Box}} Owner */
/** @typedef {{box:Box,areaPx:number,touchesBoundary:boolean}} SourceComponent */

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}

/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

/** @param {string} value */
function containsControlCodePoint(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

/** @param {unknown} value @param {number} maximum @param {string} message @returns {unknown[]} */
function list(value, maximum, message) {
  if (!Array.isArray(value) || types.isProxy(value) || value.length > maximum) throw new TypeError(message);
  return value;
}

/** @param {unknown} value @param {string} label @returns {string} */
function identifier(value, label) {
  if (typeof value !== "string" || !value || value.length > 256 || containsControlCodePoint(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

/** @param {unknown} value @returns {{widthPt:number,heightPt:number}} */
function slideSize(value) {
  if (!record(value) || !finite(value.widthPt) || !finite(value.heightPt)
    || value.widthPt <= 0 || value.heightPt <= 0 || value.widthPt > 100_000 || value.heightPt > 100_000
    || !Number.isFinite(value.widthPt * value.heightPt)) throw new TypeError("source-owned glyph slide size is invalid");
  return { widthPt: value.widthPt, heightPt: value.heightPt };
}

/** @param {unknown} value @param {{widthPt:number,heightPt:number}} size @returns {Box | null} */
function boundedBox(value, size) {
  if (!record(value) || !finite(value.x) || !finite(value.y) || !finite(value.w) || !finite(value.h)
    || value.x < 0 || value.y < 0 || value.w <= 0 || value.h <= 0
    || !Number.isFinite(value.x + value.w) || !Number.isFinite(value.y + value.h)
    || value.x + value.w > size.widthPt || value.y + value.h > size.heightPt) return null;
  return { x: value.x, y: value.y, w: value.w, h: value.h };
}

/** @param {unknown} value @returns {Raster | null} */
function raster(value) {
  if (value === null || value === undefined) return null;
  if (!record(value) || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)
    || !finite(value.width) || !finite(value.height) || value.width < 1 || value.height < 1
    || value.width > 16_384 || value.height > 16_384 || value.width * value.height > MAX_RASTER_PIXELS
    || !(value.rgba instanceof Uint8Array) || value.rgba.length !== value.width * value.height * 4) {
    throw new TypeError("source-owned glyph raster is invalid");
  }
  return { width: value.width, height: value.height, rgba: value.rgba };
}

/** @param {unknown} value @returns {RenderProfile} */
function renderProfile(value) {
  if (!record(value) || !["render-libreoffice", "render-powerpoint-com"].includes(String(value.rendererId))
    || typeof value.version !== "string" || !value.version || value.version.length > 128
    || containsControlCodePoint(value.version)
    || !finite(value.dpi) || value.dpi < 16 || value.dpi > 600
    || !Number.isSafeInteger(value.pixelWidth) || !Number.isSafeInteger(value.pixelHeight)
    || !finite(value.pixelWidth) || !finite(value.pixelHeight) || value.pixelWidth < 1 || value.pixelHeight < 1
    || value.pixelWidth > 16_384 || value.pixelHeight > 16_384 || value.pixelWidth * value.pixelHeight > MAX_RASTER_PIXELS
    || typeof value.runtimeHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.runtimeHash)
    || typeof value.sourceHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.sourceHash)) {
    throw new TypeError("source-owned glyph renderer profile is invalid");
  }
  return { rendererId: String(value.rendererId), version: value.version, dpi: value.dpi,
    pixelWidth: value.pixelWidth, pixelHeight: value.pixelHeight,
    runtimeHash: value.runtimeHash, sourceHash: value.sourceHash };
}

/** @param {RenderProfile} value */
function profileSignature(value) {
  return JSON.stringify(value);
}

/** @param {unknown} value @returns {Rgb | null} */
function hexColor(value) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/iu.test(value)) return null;
  return { r: Number.parseInt(value.slice(1, 3), 16), g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16) };
}

/** @param {Rgb} left @param {Rgb} right */
function colorDistance(left, right) {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

/** @param {Box} left @param {Box} right */
function overlapArea(left, right) {
  return Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x))
    * Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
}

/** @param {Box} box */
function area(box) { return box.w * box.h; }

/** @param {Box} left @param {Box} right */
function union(left, right) {
  const x = Math.min(left.x, right.x), y = Math.min(left.y, right.y);
  const farX = Math.max(left.x + left.w, right.x + right.w), farY = Math.max(left.y + left.h, right.y + right.h);
  return { x, y, w: farX - x, h: farY - y };
}

/** @param {Box} box @param {{widthPt:number,heightPt:number}} size @param {number} padding */
function expand(box, size, padding) {
  const x = Math.max(0, box.x - padding), y = Math.max(0, box.y - padding);
  const farX = Math.min(size.widthPt, box.x + box.w + padding), farY = Math.min(size.heightPt, box.y + box.h + padding);
  return { x, y, w: farX - x, h: farY - y };
}

/** @param {Box} box @param {Raster} image @param {{widthPt:number,heightPt:number}} size */
function toPixelRegion(box, image, size) {
  const sx = image.width / size.widthPt, sy = image.height / size.heightPt;
  const x = Math.max(0, Math.floor(box.x * sx)), y = Math.max(0, Math.floor(box.y * sy));
  const farX = Math.min(image.width, Math.ceil((box.x + box.w) * sx));
  const farY = Math.min(image.height, Math.ceil((box.y + box.h) * sy));
  return { x, y, w: farX - x, h: farY - y, sx, sy };
}

/** @param {unknown[]} values @param {string} label */
function validateUniqueIds(values, label) {
  const ids = new Set();
  for (const value of values) {
    if (!record(value)) throw new TypeError(`${label} is invalid`);
    const id = identifier(value.id, `${label} id`);
    if (ids.has(id)) throw new TypeError(`${label} ids are ambiguous`);
    ids.add(id);
  }
}

/** @param {unknown} value @returns {string | null} */
function optionalSourceHash(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError("source-owned glyph source hash is invalid");
  }
  return value;
}

/** @param {unknown[]} values @param {{widthPt:number,heightPt:number}} size @param {RenderProfile | null} requestedProfile @param {Raster | null} image @param {string | null} sourceHash */
function measurementMap(values, size, requestedProfile, image, sourceHash) {
  /** @type {Map<string,Measurement>} */
  const result = new Map();
  /** @type {RenderProfile | null} */
  let expected = requestedProfile;
  for (const value of values) {
    if (!record(value)) throw new TypeError("source-owned glyph measurement is invalid");
    const id = identifier(value.id, "source-owned glyph measurement id");
    if (result.has(id)) throw new TypeError("source-owned glyph measurement ids are ambiguous");
    if (typeof value.textRevision !== "string" || !/^[a-f0-9]{64}$/u.test(value.textRevision)) {
      throw new TypeError("source-owned glyph measurement revision is invalid");
    }
    const source = boundedBox(value.source, size), rendered = boundedBox(value.rendered, size);
    if (!source || !rendered) throw new TypeError("source-owned glyph measurement bounds are invalid");
    const observed = renderProfile(value.renderProfile);
    if (!expected) expected = observed;
    const profileMatchesRequest = profileSignature(observed) === profileSignature(expected);
    const slideAspect = size.widthPt / size.heightPt;
    const profileMatchesSource = image !== null && sourceHash !== null && observed.sourceHash === sourceHash
      && Math.abs((observed.pixelWidth / observed.pixelHeight) / slideAspect - 1) <= 0.01
      && Math.abs((image.width / image.height) / slideAspect - 1) <= 0.01;
    result.set(id, { id, source, rendered, textRevision: value.textRevision,
      eligible: value.sourceComplete === true && value.renderedComplete === true
        && value.renderedOwnership === "isolated" && profileMatchesRequest && profileMatchesSource });
  }
  return result;
}

/** @param {Record<string,unknown>} text @param {Measurement | undefined} measurement @param {{widthPt:number,heightPt:number}} size @returns {Owner | null} */
function owner(text, measurement, size) {
  if (!measurement || !measurement.eligible || !record(text.source) || !record(text.font)
    || typeof text.text !== "string" || !text.text.trim() || text.text.length > 16_384) return null;
  const source = text.source, font = text.font;
  if (source.editable !== true || typeof source.ocrProvider !== "string" || !source.ocrProvider || source.ocrProvider.length > 256
    || !finite(source.confidence) || source.confidence < OCR_CONFIDENCE || source.confidence > 1) return null;
  const evidence = boundedBox(source.componentQualityBox, size) || boundedBox(source.evidenceBox, size);
  const color = hexColor(font.color);
  if (!evidence || !color || measurement.textRevision !== textProbeRevision(text)
    || overlapArea(evidence, measurement.source) / area(measurement.source) < 0.85) return null;
  return { text, id: /** @type {string} */ (text.id), evidence, measurement, color,
    searchBox: expand(union(evidence, measurement.source), size, 1.5) };
}

/** @param {Record<string,unknown>} shape */
function protectedShape(shape) {
  const source = record(shape.source) ? shape.source : {};
  const style = record(shape.style) ? shape.style : {};
  const groupKeys = [shape.groupId, shape.componentGroupId, source.componentGroupId,
    source.nativeComponentGroupId, source.semanticComponentGroupId, style.nativeComponentGroupId];
  if (groupKeys.some(value => typeof value === "string" && value.trim())) return true;
  if (source.nativeComponentInstance === true || source.semanticPictorialNative === true
    || source.pictorialVectorized === true || source.protectedMinimumUnit === true) return true;
  const semantic = `${String(source.nativeComponentRole || "")} ${String(source.nativeComponentPart || "")} ${String(source.componentOwnerKind || "")}`;
  if (/pictorial|(?:^|\s)icon(?:\s|$)/iu.test(semantic)) return true;
  return typeof source.containerAtomId === "string" && source.containerAtomId.length > 0
    || typeof source.topologyRole === "string" && source.topologyRole.length > 0
    || Array.isArray(source.containedAtomIds) && source.containedAtomIds.length > 0;
}

/** @param {Record<string,unknown>} shape @param {{widthPt:number,heightPt:number}} size */
function glyphShape(shape, size) {
  const source = record(shape.source) ? shape.source : null;
  if (!source || source.detector !== "visual-atom-native-rect" || !["rect", "roundRect"].includes(String(shape.type))) return null;
  if (protectedShape(shape)) return null;
  const box = boundedBox(shape.box, size);
  const style = record(shape.style) ? shape.style : null;
  const directColor = hexColor(shape.color), fillColor = style ? hexColor(style.fill) : null;
  if (!box) throw new TypeError("source-owned glyph candidate bounds are invalid");
  if (directColor && fillColor && colorDistance(directColor, fillColor) > SHAPE_COLOR_DISTANCE) return null;
  const color = directColor || fillColor;
  if (!color) throw new TypeError("source-owned glyph candidate color is invalid");
  return { box, color };
}

/** @param {Owner} value @param {Raster} image @param {{widthPt:number,heightPt:number}} size @param {{samples:number}} budget */
function sourceComponents(value, image, size, budget) {
  const region = toPixelRegion(value.searchBox, image, size);
  const samples = region.w * region.h;
  if (!Number.isSafeInteger(samples) || samples < 1 || budget.samples + samples > MAX_COMPONENT_SAMPLES) {
    throw new RangeError("source-owned glyph sampling exceeds the processing boundary");
  }
  budget.samples += samples;
  const components = detectColorComponents(image, {
    region: { x: region.x, y: region.y, w: region.w, h: region.h },
    stride: 1,
    minAreaPx: 4,
    predicate: (/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b, /** @type {number} */ a) =>
      a >= 160 && colorDistance({ r, g, b }, value.color) <= SOURCE_COLOR_DISTANCE
  });
  if (components.length > MAX_COMPONENTS) throw new RangeError("source-owned glyph components exceed the processing boundary");
  return components.map((/** @type {unknown} */ component) => {
    if (!record(component) || !finite(component.x) || !finite(component.y) || !finite(component.w) || !finite(component.h)
      || !finite(component.areaPx) || component.w <= 0 || component.h <= 0 || component.areaPx <= 0) {
      throw new TypeError("source-owned glyph component evidence is invalid");
    }
    return { box: { x: component.x / region.sx, y: component.y / region.sy,
      w: component.w / region.sx, h: component.h / region.sy }, areaPx: component.areaPx,
    touchesBoundary: component.x <= region.x || component.y <= region.y
      || component.x + component.w >= region.x + region.w || component.y + component.h >= region.y + region.h };
  });
}

/** @param {{box:Box,color:Rgb}} candidate @param {Owner} value @param {SourceComponent[]} components @param {Raster} image @param {{widthPt:number,heightPt:number}} size */
function ownedBy(candidate, value, components, image, size) {
  const shape = candidate.box, glyphHeight = value.measurement.source.h, shapeArea = area(shape);
  if (colorDistance(candidate.color, value.color) > SHAPE_COLOR_DISTANCE
    || overlapArea(shape, value.evidence) / shapeArea < 0.8
    || overlapArea(shape, value.measurement.source) / shapeArea < 0.8
    || shape.w > Math.min(28, glyphHeight * 0.72) || shape.h > Math.min(28, glyphHeight * 0.72)
    || shapeArea > glyphHeight * glyphHeight * 0.45) return false;
  const sx = image.width / size.widthPt, sy = image.height / size.heightPt;
  const matching = components.filter(component => {
    if (component.touchesBoundary) return false;
    const box = component.box, componentArea = area(box), intersection = overlapArea(shape, box);
    const heightRatio = box.h / glyphHeight, widthRatio = box.w / glyphHeight;
    const horizontalExtension = Math.max(0, shape.x - box.x) + Math.max(0, box.x + box.w - shape.x - shape.w);
    const verticalExtension = Math.max(0, shape.y - box.y) + Math.max(0, box.y + box.h - shape.y - shape.h);
    const requiredExtension = Math.max(2, glyphHeight * 0.2);
    const minimumInk = Math.max(4, shapeArea * sx * sy * 0.12);
    return intersection / shapeArea >= 0.8
      && heightRatio >= 0.72 && heightRatio <= 1.3 && widthRatio >= 0.1 && widthRatio <= 2.5
      && componentArea - intersection >= shapeArea * 0.75
      && (box.w >= shape.w * 1.35 || box.h >= shape.h * 1.35)
      && Math.max(horizontalExtension, verticalExtension) >= requiredExtension
      && component.areaPx >= minimumInk;
  });
  return matching.length === 1;
}

/** Remove only revision-bound OCR glyph fragments represented twice as text and tiny native rectangles.
 * @param {unknown} input
 * @returns {{shapes:unknown[],removedShapeIds:string[],removedShapes:RemovedShape[]}}
 */
function pruneSourceOwnedGlyphShapes(input) {
  if (!record(input) || !record(input.page)) throw new TypeError("source-owned glyph request is invalid");
  const size = slideSize(input.slideSize);
  const shapes = list(input.page.shapes, MAX_SHAPES, "source-owned glyph shapes are invalid");
  const textBoxes = list(input.page.textBoxes, MAX_TEXT_BOXES, "source-owned glyph text boxes are invalid");
  const measurements = list(input.measurements, MAX_MEASUREMENTS, "source-owned glyph measurements are invalid");
  validateUniqueIds(shapes, "source-owned glyph shape");
  validateUniqueIds(textBoxes, "source-owned glyph text box");
  const image = raster(input.sourceImage);
  const sourceHash = optionalSourceHash(input.sourceHash);
  const requestedProfile = input.renderProfile === undefined || input.renderProfile === null ? null : renderProfile(input.renderProfile);
  const measured = measurementMap(measurements, size, requestedProfile, image, sourceHash);
  if (!image || shapes.length === 0 || textBoxes.length === 0 || measurements.length === 0) {
    return { shapes: [...shapes], removedShapeIds: [], removedShapes: [] };
  }
  /** @type {Owner[]} */
  const owners = [];
  for (const value of textBoxes) {
    const text = /** @type {Record<string,unknown>} */ (value);
    const current = owner(text, measured.get(/** @type {string} */ (text.id)), size);
    if (current) owners.push(current);
  }
  if (owners.length === 0) return { shapes: [...shapes], removedShapeIds: [], removedShapes: [] };
  /** @type {Map<string,SourceComponent[]>} */
  const componentCache = new Map();
  const budget = { samples: 0 };
  /** @type {unknown[]} */
  const kept = [];
  /** @type {RemovedShape[]} */
  const removedShapes = [];
  for (const item of shapes) {
    const shape = /** @type {Record<string,unknown>} */ (item);
    const candidate = glyphShape(shape, size);
    if (!candidate) { kept.push(item); continue; }
    /** @type {Owner[]} */
    const matchingOwners = [];
    for (const value of owners) {
      if (colorDistance(candidate.color, value.color) > SHAPE_COLOR_DISTANCE
        || overlapArea(candidate.box, value.evidence) / area(candidate.box) < 0.8) continue;
      let components = componentCache.get(value.id);
      if (!components) {
        components = sourceComponents(value, image, size, budget);
        componentCache.set(value.id, components);
      }
      if (ownedBy(candidate, value, components, image, size)) matchingOwners.push(value);
    }
    if (matchingOwners.length !== 1) { kept.push(item); continue; }
    const matched = /** @type {Owner} */ (matchingOwners[0]);
    removedShapes.push({ id: /** @type {string} */ (shape.id), textId: matched.id,
      textRevision: matched.measurement.textRevision });
  }
  return { shapes: kept, removedShapeIds: removedShapes.map(value => value.id), removedShapes };
}

module.exports = { pruneSourceOwnedGlyphShapes };
