// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('./source-scene-group-containment');
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @param {unknown} value @param {number} size @returns {value is Uint8Array} */
function bytes(value,size){
 if(!types.isUint8Array(value)||types.isProxy(value))return false;
 const proto=Object.getPrototypeOf(Uint8Array.prototype);
 const buffer=Reflect.get(proto,'buffer',value),length=Reflect.get(proto,'length',value);
 return types.isArrayBuffer(buffer)&&length===size;
}
/** Compare a COMPLETE source component with the actual writer's rendering.
 * This is measurement only: neither masks supplied by a caller nor a green
 * result issue source, erasure, topology, or editability authority. All source
 * cells and all newly painted cells are checked, including junctions/heads.
 * No nearest-colour search, ignored outliers, adjustable tolerance, per-pixel
 * alpha fit, or blank-area denominator can raise paint support.
 * @param {unknown} input */
function compareNativeSourceRender(input){
 if(!record(input)||!record(input.source)||!record(input.rendered)||!record(input.work)
  ||!list(input.background)||input.background.length!==3
  ||!input.background.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=255)
  ||typeof input.work.checks!=='number'||!Number.isSafeInteger(input.work.checks)
  ||input.work.checks<0||input.work.checks>4000000
  ||Object.getOwnPropertyDescriptor(input.work,'checks')?.writable!==true)
  throw new TypeError('Native render comparison controls are invalid');
 const {width,height}=input.source;
 if(typeof width!=='number'||!Number.isSafeInteger(width)||width<1||width>16384
  ||typeof height!=='number'||!Number.isSafeInteger(height)||height<1||height>16384
  ||width*height>262144||input.rendered.width!==width||input.rendered.height!==height
  ||!bytes(input.source.rgba,width*height*4)||!bytes(input.rendered.rgba,width*height*4)
  ||!bytes(input.sourceMask,width*height))throw new TypeError('Native render comparison rasters are invalid');
 const source=/** @type {Raster} */(input.source),rendered=/** @type {Raster} */(input.rendered);
 const sourceMask=input.sourceMask,background=/** @type {number[]} */(input.background);
 const work=/** @type {{checks:number}} */(input.work);
 // Reserve the complete comparison before reading a pixel. Refused attempts
 // cannot consume a partial prefix and then report that prefix as a success.
 const cost=width*height*12;
 if(cost>4000000-work.checks){work.checks=4000001;return {status:'budget-exhausted',sourceInk:0,renderedInk:0,
  matchingSource:0,matchingRendered:0,sourceSupport:0,renderedSupport:0,hasSourceInk:false,paintMatched:false};}
 work.checks+=cost;
 let sourceInk=0,renderedInk=0,matchingSource=0,matchingRendered=0;
 for(let n=0;n<width*height;n++){
  const mask=sourceMask[n];if(mask!==0&&mask!==1)throw new TypeError('Native render comparison mask is invalid');
  const at=n*4;
  if((source.rgba[at+3]??0)<240||(rendered.rgba[at+3]??0)<240)
   return {status:'alpha-rejected',sourceInk:0,renderedInk:0,matchingSource:0,matchingRendered:0,
    sourceSupport:0,renderedSupport:0,hasSourceInk:false,paintMatched:false};
  const sourceForeground=background.some((v,c)=>Math.abs(v-(source.rgba[at+c]??0))>=42);
  const renderedForeground=background.some((v,c)=>Math.abs(v-(rendered.rgba[at+c]??0))>=42);
  const matches=[0,1,2].every(c=>Math.abs((source.rgba[at+c]??0)-(rendered.rgba[at+c]??0))<=18);
  if(mask){sourceInk++;if(matches)matchingSource++;}
  // Foreground outside the source component is an error, even if it happens
  // to copy a nearby object or source text. A caller needs a separately scoped
  // component-only render; this function never masks the output to its input.
  if(renderedForeground){renderedInk++;if(mask&&sourceForeground&&matches)matchingRendered++;}
 }
 const sourceSupport=sourceInk?matchingSource/sourceInk:0,renderedSupport=renderedInk?matchingRendered/renderedInk:0;
 return {status:'compared',sourceInk,renderedInk,matchingSource,matchingRendered,sourceSupport,renderedSupport,
  hasSourceInk:sourceInk>0,paintMatched:sourceInk>0&&renderedInk>0&&sourceSupport>=.9&&renderedSupport>=.9};
}
module.exports={compareNativeSourceRender};
