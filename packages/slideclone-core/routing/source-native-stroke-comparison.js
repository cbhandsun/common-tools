// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('../scene-plan/source-scene-group-containment');
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** Fixed measurement constants. They are NOT caller-adjustable. RADIUS is the
 * positional tolerance that absorbs anti-aliasing phase and sub-pixel
 * placement; CORE_TOLERANCE compares stroke-core colours, not edge blends. */
const RADIUS=1,CORE_TOLERANCE=30,CONTRAST=42,SUPPORT=.9,COST_PER_CELL=48;
/** @param {unknown} value @param {number} size @returns {value is Uint8Array} */
function bytes(value,size){
 if(!types.isUint8Array(value)||types.isProxy(value))return false;
 const proto=Object.getPrototypeOf(Uint8Array.prototype);
 const buffer=Reflect.get(proto,'buffer',value),length=Reflect.get(proto,'length',value);
 return types.isArrayBuffer(buffer)&&length===size;
}
const failed=(/** @type {string} */status)=>({status,sourceInk:0,renderedInk:0,matchingSource:0,matchingRendered:0,
 sourceSupport:0,renderedSupport:0,hasSourceInk:false,paintMatched:false});
/** Compare a COMPLETE source stroke component with the writer's actual render.
 *
 * Unlike a per-pixel RGB equality test, which a pixel-identical copy of the
 * source shifted by half a pixel already fails, this compares GEOMETRY within
 * a fixed 1px tolerance and COLOUR at the stroke core (the most contrasted
 * pixel of each 3x3 neighbourhood), so anti-aliased edge blends are not
 * mistaken for paint errors. Missing branches, extra paint, displaced routes
 * (>1px) and wrong colours still fail. Measurement only: a green result grants
 * no source, erasure, topology or editability authority by itself.
 * @param {unknown} input */
function compareNativeStrokeRender(input){
 if(!record(input)||!record(input.source)||!record(input.rendered)||!record(input.work)
  ||!list(input.background)||input.background.length!==3
  ||!input.background.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=255)
  ||typeof input.work.checks!=='number'||!Number.isSafeInteger(input.work.checks)
  ||input.work.checks<0||input.work.checks>4000000
  ||Object.getOwnPropertyDescriptor(input.work,'checks')?.writable!==true)
  throw new TypeError('Native stroke comparison controls are invalid');
 const {width,height}=input.source;
 if(typeof width!=='number'||!Number.isSafeInteger(width)||width<1||width>16384
  ||typeof height!=='number'||!Number.isSafeInteger(height)||height<1||height>16384
  ||width*height>262144||input.rendered.width!==width||input.rendered.height!==height
  ||!bytes(input.source.rgba,width*height*4)||!bytes(input.rendered.rgba,width*height*4)
  ||!bytes(input.sourceMask,width*height))throw new TypeError('Native stroke comparison rasters are invalid');
 const source=/** @type {Raster} */(input.source),rendered=/** @type {Raster} */(input.rendered);
 const sourceMask=input.sourceMask,background=/** @type {number[]} */(input.background);
 const work=/** @type {{checks:number}} */(input.work),area=width*height;
 const cost=area*COST_PER_CELL;
 if(cost>4000000-work.checks){work.checks=4000001;return failed('budget-exhausted');}
 work.checks+=cost;
 for(let n=0;n<area;n++){
  const mask=sourceMask[n];if(mask!==0&&mask!==1)throw new TypeError('Native stroke comparison mask is invalid');
  if((source.rgba[n*4+3]??0)<240||(rendered.rgba[n*4+3]??0)<240)return failed('alpha-rejected');
 }
 /** @param {Uint8Array} rgba @param {number} n */
 const contrast=(rgba,n)=>Math.max(...[0,1,2].map(c=>Math.abs((background[c]??0)-(rgba[n*4+c]??0))));
 /** @param {Uint8Array} rgba @param {(n:number)=>boolean} inside */
 const cores=(rgba,inside)=>{const out=new Int32Array(area).fill(-1);
  for(let n=0;n<area;n++){if(!inside(n))continue;const x=n%width,y=(n-x)/width;let best=n,score=contrast(rgba,n);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const u=x+dx,v=y+dy;if(u<0||v<0||u>=width||v>=height)continue;
    const m=v*width+u;if(!inside(m))continue;const s=contrast(rgba,m);if(s>score){score=s;best=m;}}
   out[n]=best;}
  return out;};
 const renderedInkAt=(/** @type {number} */n)=>contrast(rendered.rgba,n)>=CONTRAST;
 const sourceInkAt=(/** @type {number} */n)=>sourceMask[n]===1;
 const sourceCore=cores(source.rgba,sourceInkAt),renderedCore=cores(rendered.rgba,renderedInkAt);
 /** @param {Uint8Array} a @param {number} i @param {Uint8Array} b @param {number} j */
 const same=(a,i,b,j)=>[0,1,2].every(c=>Math.abs((a[i*4+c]??0)-(b[j*4+c]??0))<=CORE_TOLERANCE);
 /** @param {number} n @param {(m:number)=>boolean} inside @param {(m:number)=>boolean} matches */
 const near=(n,inside,matches)=>{const x=n%width,y=(n-x)/width;
  for(let dy=-RADIUS;dy<=RADIUS;dy++)for(let dx=-RADIUS;dx<=RADIUS;dx++){const u=x+dx,v=y+dy;
   if(u<0||v<0||u>=width||v>=height)continue;const m=v*width+u;if(inside(m)&&matches(m))return true;}
  return false;};
 let sourceInk=0,renderedInk=0,matchingSource=0,matchingRendered=0;
 for(let n=0;n<area;n++){
  if(sourceInkAt(n)){sourceInk++;const core=sourceCore[n]??n;
   if(near(n,renderedInkAt,m=>same(source.rgba,core,rendered.rgba,renderedCore[m]??m)))matchingSource++;}
  // Rendered foreground outside the (1px-tolerant) source component is an
  // error even if it copies nearby page content.
  if(renderedInkAt(n)){renderedInk++;const core=renderedCore[n]??n;
   if(near(n,sourceInkAt,m=>same(rendered.rgba,core,source.rgba,sourceCore[m]??m)))matchingRendered++;}
 }
 const sourceSupport=sourceInk?matchingSource/sourceInk:0,renderedSupport=renderedInk?matchingRendered/renderedInk:0;
 return {status:'compared',sourceInk,renderedInk,matchingSource,matchingRendered,sourceSupport,renderedSupport,
  hasSourceInk:sourceInk>0,paintMatched:sourceInk>0&&renderedInk>0&&sourceSupport>=SUPPORT&&renderedSupport>=SUPPORT};
}
module.exports={compareNativeStrokeRender,STROKE_COMPARISON:Object.freeze({RADIUS,CORE_TOLERANCE,CONTRAST,SUPPORT})};
