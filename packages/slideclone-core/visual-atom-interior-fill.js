// @ts-check
"use strict";
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {{width:number,height:number,rgba:Uint8Array}} image @param {Box} box @param {Box[]} masks */
function validInteriorSample(image, box, masks) {
  return Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height) && image.width >= 1 && image.height >= 1
    && image.width * image.height <= 40000000 && image.rgba instanceof Uint8Array && image.rgba.length === image.width * image.height * 4
    && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.x >= 0 && box.y >= 0 && box.w >= 8 && box.h >= 8
    && box.x + box.w <= image.width && box.y + box.h <= image.height && Array.isArray(masks) && masks.length <= 10000;
}
/** A connected component's color can be its dark outline, not its interior.
 * Measure the interior separately, excluding source OCR footprints.
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {Box} box @param {Box[]} masks */
function sampleAtomInteriorFill(image, box, masks = []) {
  return sampleInteriorFill(image,box,masks);
}
/** Optional tiles reuse the same 24x24 reads. Tile colors only propose seeds;
 * OCR rectangles cannot hide a background color from its independent source
 * connectivity/closure/ownership measurement.
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {Box} box @param {Box[]} masks
 * @param {number[][][]} [tiles] @param {boolean} [includeMaskedTiles] */
function sampleInteriorFill(image,box,masks,tiles,includeMaskedTiles=false){
  if (!validInteriorSample(image, box, masks)) return null;
  /** @type {number[][]} */ const colors = [];
  for (let row = 0; row < 24; row++) for (let col = 0; col < 24; col++) {
    const x = Math.floor(box.x + box.w * (0.18 + 0.64 * (col + 0.5) / 24));
    const y = Math.floor(box.y + box.h * (0.18 + 0.64 * (row + 0.5) / 24));
    const offset = (y * image.width + x) * 4;
    if ((image.rgba[offset + 3] ?? 0) < 250) continue;
    const color = [image.rgba[offset] ?? 0, image.rgba[offset + 1] ?? 0, image.rgba[offset + 2] ?? 0];
    const masked=masks.some(mask => x >= mask.x && y >= mask.y && x < mask.x + mask.w && y < mask.y + mask.h);
    if(tiles&&(!masked||includeMaskedTiles)){const index=Math.floor(row/6)*4+Math.floor(col/6);(tiles[index]??=[]).push(color);}
    if (masked) continue;
    colors.push(color);
  }
  return summarizeInteriorColors(colors);
}
/** @param {number[][]} colors */
function summarizeInteriorColors(colors){
  /** @type {Map<string,number[][]>} */ const bins = new Map();
  for(const color of colors){
    const key = color.map(c => Math.floor(c / 32)).join(":");
    const bin = bins.get(key) || []; bin.push(color); bins.set(key, bin);
  }
  if (colors.length < 12) return null;
  const dominant = [...bins.values()].sort((a, b) => b.length - a.length)[0];
  if (!dominant) return null;
  let rgb = [0, 1, 2].map(channel => dominant.map(color => color[channel] ?? 0).sort((a, b) => a - b)[Math.floor(dominant.length / 2)] ?? 0);
  const supported = () => colors.filter(color => color.every((v, channel) => Math.abs(v - (rgb[channel] ?? 0)) <= 18)).length;
  let support = supported();
  if (support / colors.length < 0.82) {
    // Fixed 32-channel bins can split a single admissible color cluster at an
    // arbitrary quantization boundary. Reuse the same sampled source pixels;
    // the full population median must pass the unchanged 82% / 18 gate too.
    rgb = [0, 1, 2].map(channel => colors.map(color => color[channel] ?? 0).sort((a, b) => a - b)[Math.floor(colors.length / 2)] ?? 0);
    support = supported();
    if (support / colors.length < 0.82) return null;
  }
  return { color: `#${rgb.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`, samples: colors.length, support };
}
/** Uniform subregions provide seed colors only, never authorize a body or fill.
 * The caller must independently prove source connectivity and closed geometry.
 * @param {{width:number,height:number,rgba:Uint8Array}} image @param {Box} box @param {Box[]} masks @param {boolean} [includeMaskedTiles] */
function sampleAtomInteriorFillSeeds(image, box, masks = [],includeMaskedTiles=false) {
  if(typeof includeMaskedTiles!=="boolean")throw new TypeError("Interior seed mode is invalid");
  if (!validInteriorSample(image, box, masks)) return [];
  /** @type {{color:string,samples:number,support:number,maskedTileSeed?:boolean}[]} */const seeds = [];
  /** @type {number[][][][]} */const quadrants=[];
  for (const x of [0, 0.5]) for (const y of [0, 0.5]) {
    /** @type {number[][][]} */const tiles=[];quadrants.push(tiles);
    const sample = sampleInteriorFill(image, { x: box.x + box.w * x, y: box.y + box.h * y,
      w: box.w / 2, h: box.h / 2 }, masks,tiles,includeMaskedTiles);
    if (sample && !seeds.some(seed => seed.color === sample.color)) seeds.push(sample);
  }
  if(seeds.length)return seeds;
  /** @type {Map<string,{color:string,samples:number,support:number,tiles:number}>} */const local=new Map();
  for(const quadrant of quadrants)for(const colors of quadrant){
    if(!colors)continue;
    const sample=summarizeInteriorColors(colors);if(!sample)continue;
    const prior=local.get(sample.color);if(prior)prior.tiles++;else local.set(sample.color,{...sample,tiles:1});
  }
  return [...local.values()].sort((a,b)=>b.tiles-a.tiles||b.support/b.samples-a.support/a.samples).slice(0,4)
    .map(({color,samples,support})=>({color,samples,support,...(includeMaskedTiles?{maskedTileSeed:true}:{})}));
}
module.exports = { sampleAtomInteriorFill, sampleAtomInteriorFillSeeds, summarizeInteriorColors };
