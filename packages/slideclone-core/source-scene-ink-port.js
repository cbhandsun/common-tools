// @ts-check
'use strict';
const {record,box:validBox}=require('./source-scene-group-containment');
const {types}=require('node:util');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{pixels:Uint8Array,width:number,height:number,box:Box,cells:Set<number>}} Frame */
/** Source-isolated native compilation is the only issuer. A provider cannot
 * serialize this capability. Ink grants neither a filled body nor grouping.
 * @type {WeakMap<object,Frame>} */const frames=new WeakMap();
/** A real native member can exclude its independently isolated unit's ink
 * during background observation, while attachment still uses the member.
 * @type {WeakMap<object,object>} */const units=new WeakMap();
/** Called with the actual isolated raster after complete native compilation.
 * Pixel mapping is integral; padding and holes acquire no ownership.
 * @param {import('./png').PngImage} source @param {import('./png').PngImage} isolated
 * @param {Box} window @param {Box} box */
function createSceneInkPort(source,isolated,window,box){
 if(!record(source)||!record(isolated)||!validBox(window)||!validBox(box)
  ||![source.width,source.height,isolated.width,isolated.height,window.x,window.y,window.w,window.h].every(Number.isSafeInteger)
  ||![source.width,source.height,isolated.width,isolated.height].every(n=>n>0&&n<=16384)||source.width*source.height>40000000
  ||types.isProxy(source.rgba)||types.isProxy(isolated.rgba)||!Buffer.isBuffer(source.rgba)||!Buffer.isBuffer(isolated.rgba)
  ||Object.getPrototypeOf(source.rgba)!==Buffer.prototype||Object.getPrototypeOf(isolated.rgba)!==Buffer.prototype
  ||Object.hasOwn(source.rgba,'length')||Object.hasOwn(isolated.rgba,'length')||source.rgba.length!==source.width*source.height*4
  ||isolated.rgba.length!==isolated.width*isolated.height*4||window.w!==isolated.width||window.h!==isolated.height
  ||window.w*window.h>262144||window.x+window.w>source.width||window.y+window.h>source.height
  ||box.x+box.w>source.width||box.y+box.h>source.height)throw new TypeError('Scene ink port measurement is invalid');
 /** @type {Set<number>} */const cells=new Set();
 for(let y=0;y<isolated.height;y++)for(let x=0;x<isolated.width;x++){
  const i=(y*isolated.width+x)*4;if((isolated.rgba[i+3]??0)<64)continue;
  const sx=x+window.x,sy=y+window.y,j=(sy*source.width+sx)*4;
  if(sx<box.x||sx+1>box.x+box.w||sy<box.y||sy+1>box.y+box.h
   ||(source.rgba[j+3]??0)<64||[0,1,2].some(c=>isolated.rgba[i+c]!==source.rgba[j+c]))return null;
  cells.add(sy*source.width+sx);
 }
 if(!cells.size)return null;
 const token=Object.freeze({});frames.set(token,{pixels:source.rgba,width:source.width,height:source.height,box:{...box},cells});return token;
}
/** @param {import('./png').PngImage} image @param {unknown} token @param {Box} box */
function sceneInkPortFrame(image,token,box){
 const frame=token!==null&&typeof token==='object'?frames.get(token):undefined;
 return frame&&record(image)&&validBox(box)&&frame.pixels===image.rgba&&frame.width===image.width&&frame.height===image.height
  &&['x','y','w','h'].every(k=>frame.box[/** @type {keyof Box} */(k)]===box[/** @type {keyof Box} */(k)])?frame:null;
}
/** Intersect the actual source row/column, never its rectangular envelope.
 * The empty space between detached details stays empty in body masks.
 * @param {Frame} frame @param {number} axis @param {string} side @param {{checks:number}} [work] */
function inkContour(frame,axis,side,work){
 if(!Number.isFinite(axis)||!['left','right','top','bottom'].includes(side)
  ||work!==undefined&&(!record(work)||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000))return null;
 const horizontal=side==='left'||side==='right',row=Math.floor(axis),b=frame.box;
 if(row<Math.floor(horizontal?b.y:b.x)||row>=Math.ceil(horizontal?b.y+b.h:b.x+b.w))return null;
 let low=Infinity,high=-Infinity;
 for(let n=Math.floor(horizontal?b.x:b.y);n<Math.ceil(horizontal?b.x+b.w:b.y+b.h);n++){
  if(work&&++work.checks>4000000)return null;
  if(frame.cells.has(horizontal?row*frame.width+n:n*frame.width+row)){low=Math.min(low,n);high=Math.max(high,n+1);}
 }
 if(!Number.isFinite(low))return null;
 const along=side==='left'||side==='top'?low:high;
 return horizontal?{x:along,y:axis}:{x:axis,y:along};
}
/** @param {Frame} frame @param {Box} window @param {{checks:number}} work */
function inkMask(frame,window,work){
 const mask=new Uint8Array(window.w*window.h);
 for(let y=0;y<window.h;y++)for(let x=0;x<window.w;x++){
  if(++work.checks>4000000)return null;
  mask[y*window.w+x]=frame.cells.has((y+window.y)*frame.width+x+window.x)?1:0;
 }
 return mask;
}
/** @param {import('./png').PngImage} image @param {unknown} token @param {Box} box */
function hasSceneInkPort(image,token,box){return !!sceneInkPortFrame(image,token,box);}
/** @param {import('./png').PngImage} image @param {unknown} token @param {Box} box @param {number} axis @param {string} side @param {{checks:number}} [work] */
function sceneInkPortContour(image,token,box,axis,side,work){const frame=sceneInkPortFrame(image,token,box);return frame?inkContour(frame,axis,side,work):null;}
/** @param {import('./png').PngImage} image @param {unknown} token @param {Box} box @param {number} cell */
function sceneInkPortOwnsCell(image,token,box,cell){return Number.isSafeInteger(cell)&&cell>=0&&!!sceneInkPortFrame(image,token,box)?.cells.has(cell);}
/** @param {import('./png').PngImage} image @param {unknown} token @param {Box} box @param {Box} window @param {{checks:number}} work */
function sceneInkPortMask(image,token,box,window,work){
 const frame=sceneInkPortFrame(image,token,box);
 if(!frame||!validBox(window)||![window.x,window.y,window.w,window.h].every(Number.isSafeInteger)||window.w*window.h>262144
  ||window.x+window.w>image.width||window.y+window.h>image.height||!record(work)||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000)return null;
 return inkMask(frame,window,work);
}
/** Return a detached set, never the private source ownership ledger.
 * @param {import('./png').PngImage} image @param {unknown} token @param {Box} box @param {Box} window */
function sceneInkPortCells(image,token,box,window){
 const frame=sceneInkPortFrame(image,token,box);/** @type {Set<number>} */const cells=new Set();if(!frame||!validBox(window))return cells;
 for(const n of frame.cells){const x=n%frame.width,y=Math.floor(n/frame.width);
  if(x>=window.x&&x<window.x+window.w&&y>=window.y&&y<window.y+window.h)cells.add((y-window.y)*window.w+x-window.x);}
 return cells;
}
/** Bind actual measured membership once, before exposing the native member.
 * Neither a rectangle nor a serialized group can acquire these exclusions.
 * @param {import('./png').PngImage} image @param {unknown} member @param {Box} memberBox
 * @param {unknown} unit @param {Box} unitBox */
function bindSceneInkPortUnit(image,member,memberBox,unit,unitBox){
 const part=sceneInkPortFrame(image,member,memberBox),whole=sceneInkPortFrame(image,unit,unitBox);
 if(!part||!whole||member===unit||units.has(/** @type {object} */(member)))return false;
 for(const cell of part.cells)if(!whole.cells.has(cell))return false;
 units.set(/** @type {object} */(member),/** @type {object} */(unit));return true;
}
/** This excludes only source ink. It grants no physical attachment or body.
 * @param {import('./png').PngImage} image @param {unknown} token @param {Box} box @param {number} cell */
function sceneInkPortUnitOwnsCell(image,token,box,cell){
 if(!sceneInkPortFrame(image,token,box)||!Number.isSafeInteger(cell)||cell<0||cell>=image.width*image.height)return false;
 const unit=units.get(/** @type {object} */(token)),whole=unit?frames.get(unit):undefined;
 return !!whole&&whole.pixels===image.rgba&&whole.width===image.width&&whole.height===image.height&&whole.cells.has(cell);
}
module.exports={createSceneInkPort,hasSceneInkPort,sceneInkPortContour,sceneInkPortMask,sceneInkPortOwnsCell,sceneInkPortCells,bindSceneInkPortUnit,sceneInkPortUnitOwnsCell};
