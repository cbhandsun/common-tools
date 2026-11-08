// @ts-check
"use strict";
const {parseBandBackground}=require('./source-scene-band-geometry');
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {fitSourceTextBand,fitObservedSourceTextBand}=require('../typography/source-text-band-evidence');
const {sampleAtomInteriorFill}=require('./visual-atom-interior-fill');
const {fitObservedSurfaceGradient}=require('./source-surface-gradient');
const {traceNativeMaskContours}=require('./native-mask-contours');
const {measureSourceOutlineColor}=require('./source-outline-color');
const {backdropMatteFrame,matteMeasuredBackdrop}=require('./source-scene-backdrop-matte');
const {measureSceneOutlineMatte}=require('./source-scene-outline-matte');
const {sourceRaster}=require('../typography/residual-text-mask');
/** @type {WeakMap<object,{rgba:Uint8Array,width:number,height:number,budget:{used:number},box:import('./source-scene-plan').Box,fill:string,gradient:ReturnType<typeof fitObservedSurfaceGradient>,segments?:NonNullable<ReturnType<typeof traceNativeMaskContours>>,matteOnly?:boolean,perchedPerimeter?:number[]}>} */
const backdropProofs=new WeakMap();
/** @typedef {NonNullable<ReturnType<typeof import('./source-scene-container').measureSceneContainer>> & {
 * perimeterPixels:number[],paint:{box:import('./source-scene-plan').Box,segments:NonNullable<ReturnType<typeof traceNativeMaskContours>>,color:string}|null,
 * gradient:ReturnType<typeof fitObservedSurfaceGradient>}} ParametricSurface */
/** A complete parametric body and its observed paint share one charged window.
 * Require four independently measured edges, interior color and unchanged
 * geometric/support bounds. Model boxes and text masks grant no ownership.
 * @param {unknown} imageInput @param {unknown} hintInput
 * @param {unknown} masksInput @param {unknown} budgetInput @returns {ParametricSurface|null} */
function measureSceneParametricSurface(imageInput,hintInput,masksInput,budgetInput){
 return measureParametricBackdrop(imageInput,hintInput,masksInput,budgetInput,false);
}
/** Icon separation may reuse an established four-edge source measurement.
 * This does not replace the container consumer's already successful geometry.
 * @param {unknown} imageInput @param {unknown} hintInput
 * @param {unknown} masksInput @param {unknown} budgetInput @param {unknown} [glyphOcclusion] @param {boolean} [perched] */
function measureSceneIconBackdrop(imageInput,hintInput,masksInput,budgetInput,glyphOcclusion,perched=false){
 const fitted=measureParametricBackdrop(imageInput,hintInput,masksInput,budgetInput,true);
 if(fitted)return fitted;
 const {image,hint,textMasks,budget}=parseBandBackground({image:imageInput,hint:hintInput,textMasks:masksInput,budget:budgetInput,owners:[]});
 const measured=measureSceneOutlineMatte(image,hint,textMasks,budget,glyphOcclusion);
 if(!measured)return null;
 const {outline,color,matteOnly}=measured;
 /** @type {ParametricSurface} */const fit={box:outline.box,fill:color,support:1,perimeterPixels:outline.sourcePixels,paint:null,gradient:null};
 // Only the unchanged complete source-ring measurement can supply this body.
 // Serialized outlines, a color sample or an open perimeter grant no handle.
 backdropProofs.set(fit,{rgba:image.rgba,width:image.width,height:image.height,budget,box:{...outline.box},fill:color,gradient:null,matteOnly:matteOnly||perched,...(perched?{perchedPerimeter:outline.sourcePixels}:{}),...(outline.bodySegments?{segments:structuredClone(outline.bodySegments)}:{})});
 return fit;
}
/** @param {unknown} imageInput @param {unknown} hintInput
 * @param {unknown} masksInput @param {unknown} budgetInput @param {boolean} established
 * @returns {ParametricSurface|null} */
function measureParametricBackdrop(imageInput,hintInput,masksInput,budgetInput,established){
 const {image,hint,textMasks,budget,frame:bandFrame}=parseBandBackground({image:imageInput,hint:hintInput,textMasks:masksInput,budget:budgetInput,owners:[]});
 // The layered-band halo is not the edge fitter's observation domain. If it
 // exceeds one source unit, retain the complete bounded search domain instead:
 // axis search radius, local +/-1 probes, 9px flanks and the 2px recheck.
 // Never shrink that domain to fit the budget or scan a partial body.
 const rx=Math.min(192,Math.max(6,hint.w*.16))+12,ry=Math.min(96,Math.max(6,hint.h*.3))+12;
 const x=Math.max(0,Math.floor(hint.x-rx)),y=Math.max(0,Math.floor(hint.y-ry));
 const frame=bandFrame.w*bandFrame.h<=262144?bandFrame:{x,y,
  w:Math.min(image.width,Math.ceil(hint.x+hint.w+rx))-x,
  h:Math.min(image.height,Math.ceil(hint.y+hint.h+ry))-y};
 if(frame.w*frame.h>262144||budget.used+sceneFillRasterReadCost(image,frame,budget)>4000000)return null;
 const raster=readSceneFillRaster(image,frame,budget),localHint={...hint,x:hint.x-frame.x,y:hint.y-frame.y};
 const query={image:raster,slideSize:{widthPt:raster.width,heightPt:raster.height},box:localHint};
 // The former legacy path already has source evidence and keeps its output.
 if(!established&&fitSourceTextBand(query))return null;
 const fitted=fitObservedSourceTextBand(query);
 if(!fitted)return null;
 const localBox=fitted.box,masks=textMasks.map(m=>({...m,x:m.x-frame.x,y:m.y-frame.y}));
 // An OCR rectangle intersecting a fitted boundary is unresolved ownership.
 // Interior label evidence is allowed; masked perimeter ink cannot mint a node.
 const edges=[{x:localBox.x-1.5,y:localBox.y,w:3,h:localBox.h},
  {x:localBox.x+localBox.w-1.5,y:localBox.y,w:3,h:localBox.h},
  {x:localBox.x,y:localBox.y-1.5,w:localBox.w,h:3},
  {x:localBox.x,y:localBox.y+localBox.h-1.5,w:localBox.w,h:3}];
 if(masks.some(m=>edges.some(e=>m.x<e.x+e.w&&m.x+m.w>e.x&&m.y<e.y+e.h&&m.y+m.h>e.y)))return null;
 const sample=sampleAtomInteriorFill(raster,localBox,masks);if(!sample)return null;
 const box={...localBox,x:localBox.x+frame.x,y:localBox.y+frame.y};
 const fill=[1,3,5].map(i=>Number.parseInt(sample.color.slice(i,i+2),16));
 /** @type {{x:number,y:number}[]} */const points=[];
 /** @type {Map<number,number[]>} */const colors=new Map();
 for(let y=Math.floor(localBox.y);y<Math.ceil(localBox.y+localBox.h);y++)for(let x=Math.floor(localBox.x);x<Math.ceil(localBox.x+localBox.w);x++){
  if(x<0||y<0||x>=raster.width||y>=raster.height
   ||Math.min(Math.abs(x-localBox.x),Math.abs(x-localBox.x-localBox.w),Math.abs(y-localBox.y),Math.abs(y-localBox.y-localBox.h))>1.5
   ||masks.some(m=>x>=m.x&&x<m.x+m.w&&y>=m.y&&y<m.y+m.h))continue;
  const at=(y*raster.width+x)*4,color=[0,1,2].map(c=>raster.rgba[at+c]??0);
  if((raster.rgba[at+3]??0)<240||Math.max(...fill.map((v,c)=>Math.abs(v-(color[c]??0))))<18)continue;
  const p={x:x+frame.x,y:y+frame.y};points.push(p);colors.set(p.y*image.width+p.x,color);
 }
 const perimeterPixels=points.map(p=>p.y*image.width+p.x),work={checks:0,exhausted:false};
 let paint=null;
 if(points.length){
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  const paintBox={x,y,w:Math.max(...points.map(p=>p.x))+1-x,h:Math.max(...points.map(p=>p.y))+1-y};
  const segments=traceNativeMaskContours(points,paintBox,{tolerancePx:1.5,workState:work,fastFail:true});
  if(segments)paint={box:paintBox,segments,color:measureSourceOutlineColor({points,colors,width:image.width})};
 }
 const gradient=fitObservedSurfaceGradient(raster,localBox,masks);
 const fit={box,fill:sample.color,support:fitted.support,perimeterPixels,paint,gradient};
 backdropProofs.set(fit,{rgba:image.rgba,width:image.width,height:image.height,budget,box:{...box},fill:sample.color,gradient:structuredClone(gradient)});
 return fit;
}
/** Private measurements alone may supply background separation. Copies and
 * provider rectangles are opaque. No source pixels are read or budgets refunded.
 * @param {unknown} handle @param {unknown} image @param {unknown} budget @param {unknown} window @param {unknown} raster */
function matteSceneParametricBackdrop(handle,image,budget,window,raster){
 const frame=backdropMatteFrame(image,budget,window,raster);
 const proof=handle!==null&&typeof handle==='object'?backdropProofs.get(handle):undefined;
 if(!proof||!sceneIconBackdropBound(handle,image,budget))return /** @type {import('../png').PngImage} */(raster);
 const out=matteMeasuredBackdrop(frame.raster,frame.window,proof.box,[1,3,5].map(c=>Number.parseInt(proof.fill.slice(c,c+2),16)));
 if(proof.perchedPerimeter)for(const idx of proof.perchedPerimeter)for(const dy of [-1,0,1]){const x=idx%proof.width-frame.window.x,y=Math.floor(idx/proof.width)+dy-frame.window.y;if(x>=0&&y>=0&&x<frame.window.w&&y<frame.window.h)out.rgba[(y*frame.window.w+x)*4+3]=0;}
 return out;
}
/** Check the private source/budget binding without exposing paint authority.
 * Intrinsic raster validation prevents caller-overridden buffer accessors.
 * @param {unknown} handle @param {unknown} image @param {unknown} budget */
function sceneIconBackdropBound(handle,image,budget){
 const proof=handle!==null&&typeof handle==='object'?backdropProofs.get(handle):undefined;
 if(!proof||proof.budget!==budget)return false;
 const source=sourceRaster(image),original=sourceRaster({width:proof.width,height:proof.height,rgba:proof.rgba});
 return original.width===source.width&&original.height===source.height&&original.rgba.buffer===source.rgba.buffer&&original.rgba.byteOffset===source.rgba.byteOffset;
}
/** Snapshot only the private body accepted on this source and budget. The
 * returned drawing is never accepted back as a measurement handle.
 * @param {unknown} handle @param {import('../png').PngImage} image @param {{used:number}} budget */
function sceneParametricBackdropGeometry(handle,image,budget){
 const proof=handle!==null&&typeof handle==='object'?backdropProofs.get(handle):undefined;
 if(!proof||proof.matteOnly||proof.rgba!==image.rgba||proof.width!==image.width||proof.height!==image.height||proof.budget!==budget)return null;
 return {box:{...proof.box},fill:proof.fill,gradient:structuredClone(proof.gradient),...(proof.segments?{segments:structuredClone(proof.segments)}:{})};
}
/** @param {import('../png').PngImage} image @param {{box:import('./source-scene-plan').Box,fill:string,support:number}} fill @param {{used:number}} budget */
function bindSceneIconFillMatte(image,fill,budget){
 /** @type {ParametricSurface} */const fit={box:{...fill.box},fill:fill.fill,support:fill.support,perimeterPixels:[],paint:null,gradient:null};
 backdropProofs.set(fit,{rgba:image.rgba,width:image.width,height:image.height,budget,box:{...fill.box},fill:fill.fill,gradient:null,matteOnly:true});
 return fit;
}
module.exports={measureSceneParametricSurface,measureSceneIconBackdrop,matteSceneParametricBackdrop,sceneParametricBackdropGeometry,sceneIconBackdropBound,bindSceneIconFillMatte};
