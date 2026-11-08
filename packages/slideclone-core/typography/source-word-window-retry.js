// @ts-check
"use strict";
const {types}=require("node:util");
/** A censored seed is not a glyph boundary. One larger observation can close
 * it, but must use the caller's remaining source budget and unchanged unit cap.
 * This policy proposes a search window only; source ink and neighbor ownership
 * still have to pass the ordinary measurement gates.
 * @param {unknown} input
 * @returns {{margin:number,remainingPixels:number}|null} */
function sourceWordWindowRetry(input) {
  if(!input||typeof input!=="object"||types.isProxy(input)||Array.isArray(input)
    ||![null,Object.prototype].includes(Object.getPrototypeOf(input)))
    throw new TypeError("source word retry budget is invalid");
  const entries=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(entries);
  if(keys.length!==3||keys.some(key=>typeof key!=="string"||!["height","maximumPixels","scannedPixels"].includes(key))
    ||Object.values(entries).some(entry=>!("value"in entry)))
    throw new TypeError("source word retry budget is invalid");
  const height=/** @type {unknown} */(entries.height?.value),maximumPixels=/** @type {unknown} */(entries.maximumPixels?.value),
    scannedPixels=/** @type {unknown} */(entries.scannedPixels?.value);
  if (typeof height!=="number"||typeof maximumPixels!=="number"||typeof scannedPixels!=="number"
    ||!Number.isFinite(height)||height<=0||height>16384
    ||!Number.isSafeInteger(maximumPixels)||maximumPixels<0||maximumPixels>4_000_000
    ||!Number.isSafeInteger(scannedPixels)||scannedPixels<0||scannedPixels>maximumPixels)
    throw new TypeError("source word retry budget is invalid");
  const margin=Math.ceil(Math.min(64,height*.25)),remainingPixels=maximumPixels-scannedPixels;
  return margin>2&&remainingPixels>0?{margin,remainingPixels}:null;
}
module.exports={sourceWordWindowRetry};
