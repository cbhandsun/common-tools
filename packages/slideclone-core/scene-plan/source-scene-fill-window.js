// @ts-check
"use strict";
const {types}=require("node:util");
const {readSceneFillRaster}=require("./source-scene-fill-raster-cache");
const {countSceneGlyphOcclusion,sceneFillGlyphBridge}=require("./source-scene-glyph-occlusion");
const {sourceRingEnclosesFill}=require("./source-ring-fill-containment");
const {fitPreparedSceneFillGeometry}=require("./source-scene-fill-geometry");
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
const {fitAdmittedFillGradient,sourceSurfaceGradientMasks}=require('./source-fill-gradient');
const {measureSourceGradientEllipse}=require('./source-gradient-ellipse');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {NonNullable<ReturnType<typeof import('./native-mask-contours').traceNativeMaskContours>>} Segments */
/** @typedef {{box:Box,fill:string,support:number,segments?:Segments,parts?:{box:Box,segments:Segments}[],paintSupport?:number,glyphOcclusionPixels?:number,gradient?:ReturnType<typeof fitAdmittedFillGradient>}} Fit */
/** @typedef {{fit:Fit|null,tolerance:number|null,canExpand:boolean}} WindowResult */
/** @typedef {{box:Box,pixels:{x:number,y:number}[]}} Fragment */
/** A disconnected paint layer does not prove a single physical node. Keep its
 * observed gaps and return only native background parts. Each fragment has
 * already passed closure and source-frame checks in the same charged scan.
 * @param {Fragment[]} fragments @param {Box} hint @param {string} color */
function fragmentedPaint(fragments,hint,color){
 if(fragments.length<2||fragments.length>32)return null;
 const x=Math.min(...fragments.map(p=>p.box.x)),y=Math.min(...fragments.map(p=>p.box.y));
 const bounds={x,y,w:Math.max(...fragments.map(p=>p.box.x+p.box.w))-x,h:Math.max(...fragments.map(p=>p.box.y+p.box.h))-y};
 if(bounds.w<hint.w*.7||bounds.w>hint.w*1.35||bounds.h<hint.h*.55||bounds.h>hint.h*1.6)return null;
 const count=fragments.reduce((sum,p)=>sum+p.pixels.length,0),support=count/(bounds.w*bounds.h);
 if(support<.58)return null;
 return {box:bounds,fill:color,support,pixels:fragments.flatMap(p=>p.pixels),score:1,compound:true};
}
/** Source ownership is private, transient evidence, never serialized into IR.
 * Only an independently admitted window measurement can register a handle.
 * @type {WeakMap<object,{rgba:Uint8Array,width:number,height:number,pixels:Set<number>,connected:boolean,paint:Fit,snapshot:string|null}>} */
const components=new WeakMap();
/** Different uniform seed colors can measure the same physical body with a
 * one-cell boundary difference. Bounds alone cannot prove that identity.
 * Require mutual 90% source-cell ownership on the exact same physical raster.
 * Unknown handles, including proxies/accessors, are never inspected.
 * @param {unknown} a @param {unknown} b */
function sameSceneFillComponent(a,b){
 if(a===null||b===null||typeof a!=="object"||typeof b!=="object")return false;
 const first=components.get(a),second=components.get(b);
 if(!first||!second||first.rgba!==second.rgba||first.width!==second.width||first.height!==second.height)return false;
 const small=first.pixels.size<=second.pixels.size?first.pixels:second.pixels;
 const large=small===first.pixels?second.pixels:first.pixels;let shared=0;
 for(const cell of small)if(large.has(cell))shared++;
 return shared/first.pixels.size>=.9&&shared/second.pixels.size>=.9;
}
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @returns {value is Box} */
function box(value){return record(value)&&[value.x,value.y,value.w,value.h].every(v=>typeof v==="number"&&Number.isFinite(v))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0;}
/** Snapshot the small control boundary without invoking provider accessors.
 * Pixel bytes stay in the already admitted source raster.
 * @param {unknown} input */
function parse(input){
 if(!record(input)||!record(input.image)||!box(input.hint)||!record(input.budget)
  ||!Number.isSafeInteger(input.budget.used)||Number(input.budget.used)<0)throw new TypeError("Scene fill window input is invalid");
 const image=input.image,{width,height,rgba}=image;
 if(typeof width!=="number"||typeof height!=="number"||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)
  ||width<1||height<1||width>16384||height>16384||width*height>40000000||types.isProxy(rgba)||!types.isUint8Array(rgba))throw new TypeError("Scene fill raster is invalid");
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,"buffer",rgba),length=Reflect.get(proto,"length",rgba);
 if(!types.isArrayBuffer(buffer)||length!==width*height*4)throw new TypeError("Scene fill raster is invalid");
 const fill=input.fill;
 if(!Array.isArray(fill)||types.isProxy(fill)||Object.getPrototypeOf(fill)!==Array.prototype||fill.length!==3
  ||Reflect.ownKeys(fill).length!==4||Object.values(Object.getOwnPropertyDescriptors(fill)).some(p=>!("value" in p))
  ||!fill.every(v=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=255)
  ||typeof input.color!=="string"||!/^#[a-f0-9]{6}$/iu.test(input.color)
  ||fill.some((v,i)=>v!==Number.parseInt(String(input.color).slice(1+i*2,3+i*2),16)))throw new TypeError("Scene fill color is invalid");
 if(![input.marginX,input.marginY].every(v=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=64)
  ||input.hint.x+input.hint.w>width||input.hint.y+input.hint.h>height)throw new TypeError("Scene fill frame is invalid");
 const textMasks=sourceSurfaceGradientMasks(input.textMasks);
 return {image:{width,height,rgba},hint:{...input.hint},fill:/** @type {number[]} */(fill.slice()),color:input.color,glyphOcclusion:input.glyphOcclusion,textMasks,
  budget:/** @type {{used:number}} */(input.budget),marginX:Number(input.marginX),marginY:Number(input.marginY)};
}
/** @param {{width:number,height:number}} image @param {Box} hint @param {number} marginX @param {number} marginY */
function frame(image,hint,marginX,marginY){
 const x=Math.max(0,Math.floor(hint.x-marginX)),y=Math.max(0,Math.floor(hint.y-marginY));
 return {x,y,w:Math.min(image.width,Math.ceil(hint.x+hint.w+marginX))-x,h:Math.min(image.height,Math.ceil(hint.y+hint.h+marginY))-y};
}
/** @param {{width:number,rgba:Uint8Array}} image @param {number[]} fill @param {Box} window */
function toleranceFor(image,fill,window){
 const {x,y,w,h}=window;
 const distance=(/** @type {number} */cx,/** @type {number} */cy)=>Math.max(...fill.map((v,c)=>Math.abs(v-(image.rgba[(cy*image.width+cx)*4+c]??0))));
 const exterior=[distance(x,y),distance(x+w-1,y),distance(x,y+h-1),distance(x+w-1,y+h-1)].sort((a,b)=>a-b);
 const separation=exterior[1]??0;return separation>=6?Math.min(16,separation/3):16;
}
/** Four newly read source pixels share the original compiler allowance.
 * A null result means the proposed scan itself exceeds the original unit cap.
 * @param {unknown} input @returns {number|null} */
function probeSceneFillTolerance(input){
 const {image,hint,fill,budget,marginX,marginY}=parse(input),window=frame(image,hint,marginX,marginY);
 if(window.w*window.h>262144)return null;
 if(budget.used+4>4000000)throw new RangeError("Scene container scan exceeds the pixel budget");budget.used+=4;
 return toleranceFor(image,fill,window);
}
/** A complete component cannot change in a larger window under the identical
 * color predicate. Only a source-owned clipped prefix within the original
 * upper geometry bounds can grow into an admissible larger component.
 * @param {unknown} input @returns {WindowResult} */
function measureSceneFillWindow(input){
 const {image,hint,fill,color,budget,marginX,marginY,glyphOcclusion,textMasks}=parse(input),{x,y,w,h}=frame(image,hint,marginX,marginY);
 const area=w*h;if(area>262144)return {fit:null,tolerance:null,canExpand:false};
 const raster=readSceneFillRaster(image,{x,y,w,h},budget);
 const tolerance=toleranceFor(raster,fill,{x:0,y:0,w,h});let canExpand=false,bridgeCanHelp=false;
 const matches=(/** @type {number} */index)=>{
  const offset=index*4;
  return (raster.rgba[offset+3]??0)>=240&&fill.every((v,c)=>Math.abs(v-(raster.rgba[offset+c]??0))<=tolerance);
 };
 const seen=new Uint8Array(area),queue=new Int32Array(area);
 /** @type {(Fit&{score:number,pixels:{x:number,y:number}[],compound?:boolean})[]} */const candidates=[];
 /** @type {Fragment[]} */const fragments=[];
 /** @type {Set<number>} */let bridge=new Set();
 // Successful original measurements retain their exact source geometry.
 // Only a failed component admission may try independently owned glyph cells;
 // all colors, physical bounds, density, path and scan limits remain unchanged.
 for(const connectGlyphs of [false,true]){
 if(connectGlyphs){
  if(candidates.length||!bridgeCanHelp)break;
  bridge=sceneFillGlyphBridge(glyphOcclusion,image,budget,{x,y,w,h},fill);
  if(!bridge.size)break;seen.fill(0);
 }
 /** @param {number} index */const linked=index=>bridge.has((y+Math.floor(index/w))*image.width+x+index%w);
 for(let seed=0;seed<area;seed++){
  if(seen[seed])continue;
  if(!matches(seed)){if(!linked(seed))seen[seed]=1;continue;}seen[seed]=1;
  let head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0,touchesBoundary=false,insideHint=false,paintCells=0;queue[0]=seed;
  while(head<tail){
   const i=queue[head++]??0,cx=i%w,cy=Math.floor(i/w);
   if(matches(i))paintCells++;
   // A local search edge hides unobserved pixels. The physical source frame
   // instead closes the visible layer, but only when this same proposal reaches
   // that exact image edge. No nearby hint can borrow viewport ownership.
   touchesBoundary ||=cx===0&&(x!==0||hint.x!==0)||cy===0&&(y!==0||hint.y!==0)
    ||cx===w-1&&(x+w!==image.width||hint.x+hint.w!==image.width)
    ||cy===h-1&&(y+h!==image.height||hint.y+hint.h!==image.height);
   insideHint ||=x+cx>=hint.x&&x+cx<hint.x+hint.w&&y+cy>=hint.y&&y+cy<hint.y+hint.h;
   minX=Math.min(minX,cx);minY=Math.min(minY,cy);maxX=Math.max(maxX,cx);maxY=Math.max(maxY,cy);
   for(const n of [cx?i-1:-1,cx<w-1?i+1:-1,cy?i-w:-1,cy<h-1?i+w:-1]){
    if(n<0||seen[n])continue;seen[n]=1;if(matches(n)||linked(n))queue[tail++]=n;
   }
  }
  const bounds={x:x+minX,y:y+minY,w:maxX-minX+1,h:maxY-minY+1};
  // The page background has no independently observed transition enclosing a
  // node. A visible edge panel must retain at least one observed interior side.
  if(bounds.x===0&&bounds.y===0&&bounds.w===image.width&&bounds.h===image.height)continue;
  if(touchesBoundary){canExpand ||=insideHint&&bounds.w<=hint.w*1.35&&bounds.h<=hint.h*1.6;continue;}
  if(!insideHint||bounds.w>hint.w*1.35||bounds.h>hint.h*1.6)continue;
  // Adding glyph cells cannot unclip an already censored component or shrink
  // an oversized one. Only closed in-frame paint pieces can gain connectivity.
  // Do not consume the shared glyph allowance on impossible background probes.
  bridgeCanHelp=true;
  // Save only actually observed paint; glyph bridges never become independent
  // fragments. A 33rd closed piece marks overflow without retaining more cells.
  if(!connectGlyphs&&paintCells>=4&&fragments.length<=32)fragments.push({box:bounds,
   pixels:fragments.length===32?[]:Array.from(queue.subarray(0,tail),i=>({x:x+i%w,y:y+Math.floor(i/w)}))});
  if(bounds.w<hint.w*.7||bounds.h<hint.h*.55)continue;
  const paintSupport=paintCells/(bounds.w*bounds.h);
  const glyphOcclusionPixels=tail-paintCells+(paintSupport<.58?countSceneGlyphOcclusion(glyphOcclusion,image,budget,bounds,queue,tail,{x,y,w},fill):0);
  const support=(paintCells+glyphOcclusionPixels)/(bounds.w*bounds.h);
  if(support<.58)continue;
  const intersection=Math.max(0,Math.min(bounds.x+bounds.w,hint.x+hint.w)-Math.max(bounds.x,hint.x))
   *Math.max(0,Math.min(bounds.y+bounds.h,hint.y+hint.h)-Math.max(bounds.y,hint.y));
  candidates.push({box:bounds,fill:color,support,...(glyphOcclusionPixels?{paintSupport,glyphOcclusionPixels}:{}),score:intersection/(bounds.w*bounds.h+hint.w*hint.h-intersection),
   pixels:Array.from(queue.subarray(0,tail),i=>({x:x+i%w,y:y+Math.floor(i/w)}))});
 }
 }
 // Preserve every successful or ambiguous original component measurement.
 // This fallback changes representation, not colors, density or observation.
 if(!candidates.length){const compound=fragmentedPaint(fragments,hint,color);if(compound)candidates.push(compound);}
 candidates.sort((a,b)=>b.score-a.score);const best=candidates[0];
 if(!best||candidates[1]&&candidates[1].score>=best.score*.9)return {fit:null,tolerance,canExpand};
 // Source admission above proves the paint independently of aspect ratio.
 // A square or tall surface needs the same bounded representation as a banner.
 // Preserve the existing single-path search before fallback. Both stages share
 // contour work and the identical geometric tolerance.
 const geometry=fitPreparedSceneFillGeometry({points:best.pixels,box:best.box,wide:hint.w/hint.h>=4,bridged:bridge.size>0,compound:best.compound===true});
 if(!geometry)return {fit:null,tolerance,canExpand};
 /** @type {Fit} */
 const fit={box:best.box,fill:best.fill,support:best.support,...(best.glyphOcclusionPixels?{paintSupport:best.paintSupport,glyphOcclusionPixels:best.glyphOcclusionPixels}:{}),
  ...geometry};
 if(!fit.parts&&best.compound!==true){
  const gradient=fitAdmittedFillGradient({raster,window:{x,y,w,h},box:best.box,pixels:best.pixels,masks:textMasks,fill,tolerance});
  if(gradient)fit.gradient=gradient;
 }
 components.set(fit,{rgba:image.rgba,width:image.width,height:image.height,pixels:new Set(best.pixels.map(p=>p.y*image.width+p.x)),connected:best.compound!==true,
  paint:structuredClone(fit),snapshot:sceneGroupSnapshot({source:{},style:fit})});
 return {fit,tolerance,canExpand};
}
/** Independent contrast/ellipse source admission, after uniform color failed.
 * Keep the same private component registry and exact observed paint cells.
 * @param {unknown} input @returns {Fit|null} */
function measureSceneGradientFillWindow(input){
 const measured=measureSourceGradientEllipse(input);if(!measured)return null;
 const {fit,points,image}=measured;
 components.set(fit,{rgba:image.rgba,width:image.width,height:image.height,pixels:new Set(points.map(p=>p.y*image.width+p.x)),connected:true,
  paint:structuredClone(fit),snapshot:sceneGroupSnapshot({source:{},style:fit})});
 return fit;
}
/** Only a private admitted fill measurement on this exact source can couple
 * to an independently observed cached ring. Serialized clones cannot acquire
 * its cell ownership. @param {unknown} fit @param {import('../png').PngImage} image
 * @param {{box:Box,sourcePixels:number[]}} outline */
function sceneFillEnclosedByRing(fit,image,outline){
 if(fit===null||typeof fit!=="object")return false;
 const proof=components.get(fit);
 return Boolean(proof&&proof.rgba===image.rgba&&proof.width===image.width&&proof.height===image.height
  &&sourceRingEnclosesFill({width:image.width,height:image.height,box:outline.box,ringPixels:outline.sourcePixels,fillPixels:proof.pixels}));
}
/** A drawing partition can preserve a single connected source component.
 * A union of independent fragments cannot borrow that body's authority.
 * This query reads only private admission evidence, never source pixels or
 * serialized controls. @param {unknown} fit @param {import('../png').PngImage} image */
function sceneFillHasConnectedBody(fit,image){
 if(fit===null||typeof fit!=='object'||types.isProxy(fit)||!record(image))return false;
 const proof=components.get(fit);
 return Boolean(proof&&proof.connected&&proof.rgba===image.rgba&&proof.width===image.width&&proof.height===image.height);
}
/** A replacement body must retain every already admitted source-paint cell.
 * Four projected edges alone cannot flatten teeth or discard protrusions.
 * This query consumes private evidence and retains the original 1.5px bound.
 * @param {unknown} fit @param {import('../png').PngImage} image @param {unknown} box */
function sceneFillWithinParametricBody(fit,image,box){
 if(!sceneFillHasConnectedBody(fit,image)||!record(box)||![box.x,box.y,box.w,box.h].every(n=>typeof n==='number'&&Number.isFinite(n))
  ||Number(box.x)<0||Number(box.y)<0||Number(box.w)<=0||Number(box.h)<=0
  ||Number(box.x)+Number(box.w)>image.width||Number(box.y)+Number(box.h)>image.height)return false;
 const proof=components.get(/** @type {object} */(fit));if(!proof)return false;
 return [...proof.pixels].every(n=>{const x=n%image.width+.5,y=Math.floor(n/image.width)+.5;
  return x>=Number(box.x)-1.5&&y>=Number(box.y)-1.5&&x<=Number(box.x)+Number(box.w)+1.5&&y<=Number(box.y)+Number(box.h)+1.5;
 });
}
/** Preserve already admitted paint when a separate source boundary supplies
 * grouping. This grants no new fill pixels or enclosing-body authority.
 * @param {unknown} fit @param {import('../png').PngImage} image @returns {Fit|null} */
function sceneFillPaintMeasurement(fit,image){
 const proof=fit!==null&&typeof fit==='object'?components.get(fit):undefined;
 return proof&&proof.rgba===image.rgba&&proof.width===image.width&&proof.height===image.height&&proof.snapshot!==null
  &&sceneGroupSnapshot({source:{},style:fit})===proof.snapshot?structuredClone(proof.paint):null;
}
module.exports={measureSceneFillWindow,measureSceneGradientFillWindow,probeSceneFillTolerance,sameSceneFillComponent,sceneFillEnclosedByRing,sceneFillHasConnectedBody,sceneFillWithinParametricBody,sceneFillPaintMeasurement};
