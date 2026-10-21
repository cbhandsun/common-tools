// @ts-check
"use strict";
const {parsePositionedTextFontOverride}=require("./positioned-text-font-override");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** Admission follows the envelope's safe immutable JSON traversal. Every run
 * inherits its parent's font/provenance with optional compact formatting.
 * @param {Record<string,unknown>} entry */
function validatePositionedTextLayout(entry) {
  if (entry.positionedRuns === undefined) return;
  const runs=entry.positionedRuns, frame=entry.box, style=entry.style;
  if (!Array.isArray(runs) || runs.length<1 || runs.length>512 || typeof entry.text!=="string" || entry.text.length>512
    || /[\r\n]/u.test(entry.text) || entry.runs!=null
    || (entry.rotation!==undefined && (typeof entry.rotation!=="number" || !Number.isFinite(entry.rotation) || Math.abs(entry.rotation)>180))
    || !frame || typeof frame!=="object" || Array.isArray(frame) || !style || typeof style!=="object" || Array.isArray(style))
    throw new TypeError("editable positioned text layout is invalid");
  const b=/** @type {Record<string,unknown>} */(frame), s=/** @type {Record<string,unknown>} */(style);
  if (entry.wrap!==false || s.wrap!==false || s.fit!=="none" || s.textWarp!=="textPlain")
    throw new TypeError("editable positioned text layout must not wrap or autofit");
  if (![b.x,b.y,b.w,b.h].every(value=>typeof value==="number" && Number.isFinite(value)))
    throw new TypeError("editable positioned text frame is invalid");
  const parent=/** @type {Box} */(b);
  let text="",previous=-Infinity;
  for(const value of runs){
    if(!value || typeof value!=="object" || Array.isArray(value))throw new TypeError("editable positioned text run is invalid");
    const run=/** @type {Record<string,unknown>} */(value);
    if(Object.keys(run).some(key=>!["text","box","fontOverride"].includes(key)) || typeof run.text!=="string" || !run.text.trim()
      || Array.from(run.text).some(character=>character.charCodeAt(0)<32 || character.charCodeAt(0)===127)
      || !run.box || typeof run.box!=="object" || Array.isArray(run.box))throw new TypeError("editable positioned text run is invalid");
    parsePositionedTextFontOverride(run.fontOverride);
    const bounds=/** @type {Record<string,unknown>} */(run.box);
    if(Object.keys(bounds).some(key=>!["x","y","w","h"].includes(key))
      || ![bounds.x,bounds.y,bounds.w,bounds.h].every(value=>typeof value==="number" && Number.isFinite(value)))
      throw new TypeError("editable positioned text run frame is invalid");
    const box=/** @type {Box} */(bounds);
    if(box.w<=0 || box.h<=0 || box.x<parent.x || box.y<parent.y || box.x+box.w>parent.x+parent.w
      || box.y+box.h>parent.y+parent.h || box.x<previous)throw new TypeError("editable positioned text run frame is invalid");
    previous=box.x+box.w;text+=run.text;
  }
  if(text!==entry.text)throw new TypeError("editable positioned text sequence is invalid");
}
module.exports={validatePositionedTextLayout};
