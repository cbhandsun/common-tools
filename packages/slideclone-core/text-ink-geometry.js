// @ts-check
"use strict";
const {partitionSourceTextOverlaps}=require("./source-text-separator");
const {createJointTextInkEvidence}=require('./text-ink-joint-evidence');

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is Box} */
function box(value) { return record(value) && finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h) && value.x >= 0 && value.y >= 0 && value.w > 0 && value.h > 0; }
/** @param {unknown} value @param {{widthPt:number,heightPt:number}} size @returns {Box | null} */
function boundedBox(value, size) {
  if (!box(value) || value.x + value.w > size.widthPt || value.y + value.h > size.heightPt) return null;
  return { x: value.x, y: value.y, w: value.w, h: value.h };
}
/** @param {unknown} value @returns {Raster} */
function raster(value) {
  if (!record(value) || !finite(value.width) || !finite(value.height) || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)
    || value.width < 1 || value.height < 1 || value.width > 16384 || value.height > 16384 || value.width * value.height > 40_000_000
    || !(value.rgba instanceof Uint8Array) || value.rgba.length !== value.width * value.height * 4) throw new TypeError("text ink raster is invalid");
  return { width: value.width, height: value.height, rgba: value.rgba };
}
/** @param {Raster} image @param {Box} region @param {{widthPt:number,heightPt:number}} size @param {number} [padding] */
function windowFor(image, region, size, padding = 2) {
  const sx = image.width / size.widthPt, sy = image.height / size.heightPt;
  return { sx, sy, left: Math.max(0, Math.floor((region.x - padding) * sx)), right: Math.min(image.width, Math.ceil((region.x + region.w + padding) * sx)),
    top: Math.max(0, Math.floor((region.y - padding) * sy)), bottom: Math.min(image.height, Math.ceil((region.y + region.h + padding) * sy)) };
}

/** Partition only background padding between disjoint OCR seeds. Actual seed
 * overlap remains ambiguous, and ink touching a partition is still censored.
 * No extra raster scan or expansion is authorized by this geometry operation.
 * @param {{seed:Box|null,window:ReturnType<typeof windowFor>}[]} entries */
function separateSourceWindows(entries) {
  for (const entry of entries) {
    if (!entry.seed) continue;
    for (const other of entries) {
      if (other === entry || !other.seed) continue;
      const a = entry.seed, b = other.seed, { sx, sy } = entry.window;
      // Ownership is determined by the source seeds, not their measurement
      // padding. Disjoint seeds can share that padding even when their gap
      // is less than two pixels. Rounded partitions may leave a pixel unused;
      // actual seed overlap and ink touching the partition remain rejected.
      if (a.y < b.y + b.h && a.y + a.h > b.y) {
        if (b.x >= a.x + a.w) entry.window.right = Math.min(entry.window.right, Math.floor((a.x + a.w + b.x) * sx / 2));
        if (a.x >= b.x + b.w) entry.window.left = Math.max(entry.window.left, Math.ceil((b.x + b.w + a.x) * sx / 2));
      }
      if (a.x < b.x + b.w && a.x + a.w > b.x) {
        if (b.y >= a.y + a.h) entry.window.bottom = Math.min(entry.window.bottom, Math.floor((a.y + a.h + b.y) * sy / 2));
        if (a.y >= b.y + b.h) entry.window.top = Math.max(entry.window.top, Math.ceil((b.y + b.h + a.y) * sy / 2));
      }
    }
  }
}
/** @param {Raster} image @param {ReturnType<typeof windowFor>} window @param {number[]} color @param {{allowDenseLightInk?: boolean,clipped?:boolean,left?:boolean,right?:boolean,top?:boolean,bottom?:boolean,accept?:(x:number,y:number)=>boolean}=} options */
function measure(image, window, color, options = {}) {
  let left = image.width, right = -1, top = image.height, bottom = -1, pixels = 0;
  const width = window.right - window.left, height = window.bottom - window.top;
  const area = Math.max(1, width * height);
  const lightInk = Math.min(...color) > 190;
  /** @param {number} x @param {number} y */
  function matches(x, y) {
    if(options.accept&&!options.accept(x,y))return false;
    const offset = (y * image.width + x) * 4;
    return (image.rgba[offset + 3] ?? 0) >= 160
      && !color.some((channel, index) => Math.abs((image.rgba[offset + index] ?? 255) - channel) > 65);
  }
  const edgeBackground = lightInk ? new Uint8Array(area) : null;
  if (edgeBackground) {
    const background = edgeBackground;
    /** @type {[number, number][]} */
    const queue = [];
    /** @param {number} x @param {number} y */
    function enqueue(x, y) {
      if (x < window.left || x >= window.right || y < window.top || y >= window.bottom || !matches(x, y)) return;
      const index = (y - window.top) * width + (x - window.left);
      if (background[index]) return;
      background[index] = 1;
      queue.push([x, y]);
    }
    for (let x = window.left; x < window.right; x += 1) {
      enqueue(x, window.top);
      enqueue(x, window.bottom - 1);
    }
    for (let y = window.top + 1; y < window.bottom - 1; y += 1) {
      enqueue(window.left, y);
      enqueue(window.right - 1, y);
    }
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      if (!item) continue;
      const [x, y] = item;
      enqueue(x + 1, y); enqueue(x - 1, y); enqueue(x, y + 1); enqueue(x, y - 1);
    }
  }
  for (let y = window.top; y < window.bottom; y += 1) for (let x = window.left; x < window.right; x += 1) {
    if (edgeBackground?.[(y - window.top) * width + (x - window.left)]) continue;
    if (!matches(x, y)) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); pixels += 1;
  }
  if (pixels < 8 && edgeBackground) {
    left = image.width; right = -1; top = image.height; bottom = -1; pixels = 0;
    for (let y = window.top; y < window.bottom; y += 1) for (let x = window.left; x < window.right; x += 1) {
      if (!matches(x, y)) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); pixels += 1;
    }
  }
  if (pixels < 8) return null;
  if (pixels / area > 0.72 && !(lightInk && options.allowDenseLightInk === true && pixels / area <= 0.95)) return null;
  // A boundary-touching union may be censored; never fit text to its truncated dimensions.
  if (left === window.left || right === window.right - 1 || top === window.top || bottom === window.bottom - 1) {
    options.clipped = true;
    options.left = left === window.left;
    options.right = right === window.right - 1;
    options.top = top === window.top;
    options.bottom = bottom === window.bottom - 1;
    return null;
  }
  return { x: left / window.sx, y: top / window.sy, w: (right - left + 1) / window.sx, h: (bottom - top + 1) / window.sy };
}

/** Measure color-near ink in bounded OCR windows, without modifying pixels or deciding whether to edit text.
 * Nearby same-color graphics can contaminate a measurement; downstream planning and re-render validation are required.
 * @param {unknown} input
 * @returns {{measurements:{id:string,source:Box,rendered:Box}[],samples:number}}
 */
function measureTextInkGeometry(input) {
  if (!record(input) || !Array.isArray(input.textBoxes) || input.textBoxes.length > 2000 || !record(input.slideSize)
    || !finite(input.slideSize.widthPt) || !finite(input.slideSize.heightPt) || input.slideSize.widthPt <= 0 || input.slideSize.heightPt <= 0
    || input.slideSize.widthPt > 100000 || input.slideSize.heightPt > 100000) throw new TypeError("text ink request is invalid");
  const size = { widthPt: input.slideSize.widthPt, heightPt: input.slideSize.heightPt };
  const source = raster(input.sourceImage), rendered = raster(input.renderedImage);
  if (Math.abs((source.width / source.height) / (rendered.width / rendered.height) - 1) > 0.01) throw new TypeError("text ink rasters have incompatible aspect ratios");
  const ids = new Set();
  const windows = [];
  let samples = 0;
  for (const text of input.textBoxes) {
    if (!record(text) || typeof text.id !== "string" || !text.id || text.id.length > 256 || !box(text.box)
      || text.box.x + text.box.w > size.widthPt || text.box.y + text.box.h > size.heightPt || !record(text.font)
      || typeof text.font.color !== "string" || !/^#[0-9a-f]{6}$/iu.test(text.font.color)) continue;
    if (ids.has(text.id)) throw new TypeError("text ink ids are ambiguous");
    ids.add(text.id);
    const hexColor = text.font.color;
    const color = [1, 3, 5].map(offset => parseInt(hexColor.slice(offset, offset + 2), 16));
    const measurementBox = record(text.source) ? boundedBox(text.source.componentQualityBox, size) || boundedBox(text.source.evidenceBox, size) || text.box : text.box;
    const a = windowFor(source, measurementBox, size), b = windowFor(rendered, measurementBox, size);
    samples += (a.right - a.left) * (a.bottom - a.top) + (b.right - b.left) * (b.bottom - b.top);
    if (samples > 20_000_000) throw new RangeError("text ink sampling exceeds the processing boundary");
    windows.push({ id: text.id, color, a, b });
  }
  const measurements = [];
  const jointSource=createJointTextInkEvidence(source,input.textBoxes,size),jointRendered=createJointTextInkEvidence(rendered,input.textBoxes,size);
  /** @param {Raster} image @param {ReturnType<typeof windowFor>} window @param {number[]} color
   * @param {ReturnType<typeof createJointTextInkEvidence>} joint @param {string} id @param {boolean} light */
  function observed(image,window,color,joint,id,light){
    const state={clipped:false,allowDenseLightInk:light};let result=measure(image,window,color,state);
    if(result||!state.clipped)return result;
    const proof=joint.observe(id,20000000-samples);samples+=proof.samples;
    if(!proof.accept)return null;
    samples+=(window.right-window.left)*(window.bottom-window.top);
    if(samples>20000000)throw new RangeError('text ink sampling exceeds the processing boundary');
    result=measure(image,window,color,{allowDenseLightInk:light,accept:proof.accept});return result;
  }
  for (const item of windows) {
    const a = observed(source,item.a,item.color,jointSource,item.id,false), b = observed(rendered,item.b,item.color,jointRendered,item.id,true);
    if (a && b) measurements.push({ id: item.id, source: a, rendered: b });
  }
  return { measurements, samples };
}

/** Source-only OCR ownership measurement. Retry censored ink once, never across another text seed.
 * @param {unknown} input
 * @returns {{measurements:{id:string,source:Box}[],samples:number}}
 */
function measureSourceTextInkGeometry(input) {
  if (!record(input) || !Array.isArray(input.textBoxes) || input.textBoxes.length > 2000 || !record(input.slideSize)
    || !finite(input.slideSize.widthPt) || !finite(input.slideSize.heightPt) || input.slideSize.widthPt <= 0 || input.slideSize.heightPt <= 0
    || input.slideSize.widthPt > 100000 || input.slideSize.heightPt > 100000) throw new TypeError("source text ink request is invalid");
  const size = { widthPt: input.slideSize.widthPt, heightPt: input.slideSize.heightPt }, source = raster(input.sourceImage);
  const ids = new Set();
  /** @type {{id:string,region:Box,seed:Box|null,color:number[]|null,window:ReturnType<typeof windowFor>}[]} */
  const entries = [];
  for (const text of input.textBoxes) {
    if (!record(text) || typeof text.id !== "string" || !text.id || text.id.length > 256 || !boundedBox(text.box, size)) continue;
    if (ids.has(text.id)) throw new TypeError("source text ink ids are ambiguous");
    ids.add(text.id);
    const seed = record(text.source) ? boundedBox(text.source.componentQualityBox, size) || boundedBox(text.source.evidenceBox, size) : null;
    const region = seed || /** @type {Box} */ (text.box);
    const hexColor = record(text.font) ? text.font.color : null;
    const color = typeof hexColor === "string" && /^#[0-9a-f]{6}$/iu.test(hexColor)
      ? [1, 3, 5].map(offset => parseInt(hexColor.slice(offset, offset + 2), 16)) : null;
    entries.push({ id: text.id, region, seed, color, window: windowFor(source, region, size) });
  }
  separateSourceWindows(entries);
  const separatorSamples=partitionSourceTextOverlaps(source,entries,measure);
  let reservedSamples = separatorSamples;
  const plans = entries.filter(entry => entry.color !== null).map(entry => {
    const expanded = windowFor(source, entry.region, size, 8);
    const conflict = entries.some(other => other !== entry && entry.window.left < other.window.right && entry.window.right > other.window.left
      && entry.window.top < other.window.bottom && entry.window.bottom > other.window.top);
    // Only OCR evidence may expand; a layout frame is not evidence of pixel ownership.
    const retry = entry.seed ? expanded : null;
    reservedSamples += (entry.window.right - entry.window.left) * (entry.window.bottom - entry.window.top)
      + (retry ? (retry.right - retry.left) * (retry.bottom - retry.top) : 0);
    if (reservedSamples > 20_000_000) throw new RangeError("source text ink sampling exceeds the processing boundary");
    return { ...entry, retry, conflict };
  });
  const measurements = [];
  let samples = separatorSamples;
  const jointSource=createJointTextInkEvidence(source,input.textBoxes,size);
  for (const plan of plans) {
    const state = { clipped: false, left: false, right: false, top: false, bottom: false };
    const color = /** @type {number[]} */ (plan.color);
    const area=(plan.window.right-plan.window.left)*(plan.window.bottom-plan.window.top);
    /** @type {((x:number,y:number)=>boolean)|null} */let accept=null;
    if(plan.conflict){
      const proof=jointSource.observe(plan.id,20000000-reservedSamples);
      samples+=proof.samples;reservedSamples+=proof.samples;accept=proof.accept;
      if(!accept)continue;
    }
    samples += (plan.window.right - plan.window.left) * (plan.window.bottom - plan.window.top);
    const options={...state,...(accept?{accept}:{})};
    let ink = measure(source, plan.window, color,options);
    Object.assign(state,options);
    if(!ink&&state.clipped&&!accept){
      const proof=jointSource.observe(plan.id,Math.max(0,20000000-reservedSamples-area));
      samples+=proof.samples;reservedSamples+=proof.samples;
      if(proof.accept){reservedSamples+=area;samples+=area;
        if(reservedSamples>20000000)throw new RangeError('source text ink sampling exceeds the processing boundary');
        ink=measure(source,plan.window,color,{accept:proof.accept});}
    }
    if (!ink && state.clipped && plan.retry) {
      const retry = { ...plan.window, left: state.left ? plan.retry.left : plan.window.left,
        right: state.right ? plan.retry.right : plan.window.right, top: state.top ? plan.retry.top : plan.window.top,
        bottom: state.bottom ? plan.retry.bottom : plan.window.bottom };
      const conflict = entries.some(other => other.id !== plan.id && retry.left < other.window.right && retry.right > other.window.left
        && retry.top < other.window.bottom && retry.bottom > other.window.top);
      if (conflict) continue;
      samples += (retry.right - retry.left) * (retry.bottom - retry.top);
      ink = measure(source, retry, color);
    }
    if (ink) measurements.push({ id: plan.id, source: ink });
  }
  return { measurements, samples };
}

module.exports = { measureTextInkGeometry, measureSourceTextInkGeometry };
