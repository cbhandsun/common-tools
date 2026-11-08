// @ts-check
'use strict';
/** Normalize only arithmetic roundoff at an integer source-pixel edge. OCR
 * geometry itself is retained; this is solely the floor/ceil observation step.
 * The bound matches the existing glyph-residual pixel/point round-trip rule.
 * Real fractional coordinates outside eight machine epsilons remain fractional.
 * @param {unknown} value @returns {number} */
function sourceWordRasterEdge(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>16384)
  throw new TypeError('source word raster edge is invalid');
 const nearest=Math.round(value);
 return Math.abs(value-nearest)<=8*Number.EPSILON*Math.max(1,Math.abs(value))?nearest:value;
}
/** @param {unknown} value */
function sourceWordPixelFloor(value){return Math.floor(sourceWordRasterEdge(value));}
/** @param {unknown} value */
function sourceWordPixelCeil(value){return Math.ceil(sourceWordRasterEdge(value));}
module.exports={sourceWordRasterEdge,sourceWordPixelFloor,sourceWordPixelCeil};
