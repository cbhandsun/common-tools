// @ts-check
"use strict";
const { types } = require("node:util");
/** @typedef {readonly [number,number,number]} Fill */
/** @param {unknown} value @returns {Fill|undefined} */
function parseResidualFill(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || types.isProxy(value) || value.length !== 3
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(item=>!("value" in item))) throw new TypeError("residual background fill is invalid");
  const channels=[];
  for(let index=0;index<3;index++) {
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index)),channel=descriptor?.value;
    if(typeof channel!=="number" || !Number.isSafeInteger(channel) || channel<0 || channel>255) throw new TypeError("residual background fill is invalid");
    channels.push(channel);
  }
  return [/** @type {number} */(channels[0]),/** @type {number} */(channels[1]),/** @type {number} */(channels[2])];
}
/** Use the original page for every ownership decision, including overlapping
 * masks. Backgrounds own only their measured fill, never internal foreground.
 * @param {Uint8Array} rgba @param {number} offset @param {Fill|undefined} fill */
function sourcePixelMatchesResidualFill(rgba,offset,fill) {
  return fill===undefined || (rgba[offset+3]??0)>=64
    && fill.every((channel,index)=>Math.abs((rgba[offset+index]??0)-channel)<=16);
}
module.exports={parseResidualFill,sourcePixelMatchesResidualFill};
