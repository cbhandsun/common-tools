// @ts-check
"use strict";
const {types}=require("node:util");
const {traceNativeMaskContours}=require("./native-mask-contours");
const {sampleAtomInteriorFill,sampleAtomInteriorFillSeeds}=require("./visual-atom-interior-fill");
const {isolateClosedSourceRing,hasClosedRingTopology,ringTouchesUnobservedCore}=require("./source-closed-ring");
const {readSceneFillRaster,sceneFillRasterReadCost}=require("./source-scene-fill-raster-cache");
const {measureSourceOutlineColor}=require("./source-outline-color");
const {measureSourceOutlinePaint}=require('./source-outline-paint');
const {sourceRingTextOwned}=require('../typography/source-ring-text-ownership');
const {measureSourceRingInteriorWitness}=require('./source-ring-interior-witness');
const {measureSpatialOutlineExterior}=require('./source-outline-spatial-exterior');
const {captureSourceOutlineAppearance,registerSourceMeasuredOutlineStyle}=require('./source-measured-outline-compatibility');
const {visualAxisOwnedBySourceOutline}=require('./source-outline-axis-retirement');
/** @typedef {import("./source-scene-plan").Box} Box */
/** @typedef {import("./source-scene-fill-raster-cache").Raster} Raster */
/** Observe a complete small window within the original unit ceiling; inward
 * rounded corners can cross a narrow strip's unknown core. Large windows keep
 * the bounded strips. Both strategies debit the original total pixel budget.
 * Compute the work before optional semantic-region
 * probes, so they cannot consume the object compiler's remaining allowance.
 * @param {{width:number,height:number}} image @param {Box} hint @param {number} [expansion] */
function sceneOutlineWindow(image,hint,expansion=1){
 if(expansion!==1&&expansion!==2)throw new TypeError('Scene outline observation expansion is invalid');
 let margin=Math.min(28,Math.min(28,Math.max(8,Math.ceil(Math.min(hint.w,hint.h)*.05)))*expansion);while(expansion===1&&margin>18&&(Math.min(image.width,Math.ceil(hint.x+hint.w+margin))-Math.max(0,Math.floor(hint.x-margin)))*(Math.min(image.height,Math.ceil(hint.y+hint.h+margin))-Math.max(0,Math.floor(hint.y-margin)))-Math.max(0,Math.min(image.width,Math.ceil(hint.x+hint.w+margin))-Math.max(0,Math.floor(hint.x-margin))-4*margin)*Math.max(0,Math.min(image.height,Math.ceil(hint.y+hint.h+margin))-Math.max(0,Math.floor(hint.y-margin))-4*margin)>262144)margin--;
 const x0=Math.max(0,Math.floor(hint.x-margin)),y0=Math.max(0,Math.floor(hint.y-margin));
 const x1=Math.min(image.width,Math.ceil(hint.x+hint.w+margin)),y1=Math.min(image.height,Math.ceil(hint.y+hint.h+margin));
 const dense=(x1-x0)*(y1-y0)<=262144;
 return {margin,x0,y0,x1,y1,dense,area:dense?(x1-x0)*(y1-y0):(x1-x0)*(y1-y0)-Math.max(0,x1-x0-4*margin)*Math.max(0,y1-y0-4*margin)};
}
/** Disjoint observed windows; the omitted core never supplies source ink.
 * @param {ReturnType<typeof sceneOutlineWindow>} win */
function sceneOutlineReadWindows(win){
 const {x0,y0,x1,y1,margin,dense}=win,width=x1-x0,height=y1-y0,band=2*margin;
 return dense||width<=2*band||height<=2*band?[{x:x0,y:y0,w:width,h:height}]:[
  {x:x0,y:y0,w:width,h:band},{x:x0,y:y1-band,w:width,h:band},
  {x:x0,y:y0+band,w:band,h:height-2*band},{x:x1-band,y:y0+band,w:band,h:height-2*band}];
}
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==="object"&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>"value" in p);}
/** Validate four small corner patches instead of single pixels that may be
 * source noise. All four medians must satisfy the original exterior tolerance.
 * Cache reads within the existing scan band; never authorize an interior fill.
 * @param {Raster} image
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @param {(x:number,y:number)=>number[]} readPixel */
function exteriorEvidence(image,x0,y0,x1,y1,readPixel){
 /** @type {Map<number,number[]>} */const cache=new Map();
 /** @type {number[][][]} */const patches=[[],[],[],[]];
 /** @param {number} x @param {number} y @param {number} side */
 const add=(x,y,side)=>{const n=y*image.width+x;let p=cache.get(n);
  if(!p){p=readPixel(x,y);cache.set(n,p);}
  patches[side]?.push(p);
 };
 const width=Math.min(9,x1-x0),height=Math.min(9,y1-y0);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  add(x0+x,y0+y,0);add(x1-1-x,y0+y,1);add(x0+x,y1-1-y,2);add(x1-1-x,y1-1-y,3);
 }
 const colors=patches.map(patch=>[0,1,2,3].map(c=>patch.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(patch.length/2)]??0));
 // Preserve point measurements only when the surrounding patches corroborate
 // them. Four consistent isolated corner marks are still source artifacts.
 const original=[cache.get(y0*image.width+x0),cache.get(y0*image.width+x1-1),
  cache.get((y1-1)*image.width+x0),cache.get((y1-1)*image.width+x1-1)].map(p=>p??[]);
 const originalFill=[0,1,2].map(c=>original.map(p=>p[c]??0).sort((a,b)=>a-b)[1]??0);
 if([...original,...colors].every(p=>(p[3]??0)>=240&&originalFill.every((v,c)=>Math.abs(v-(p[c]??0))<=6)))return {cache,fill:originalFill,stable:true};
 const fill=[0,1,2].map(c=>colors.map(p=>p[c]??0).sort((a,b)=>a-b)[1]??0);
 if(colors.every(p=>(p[3]??0)>=240&&fill.every((v,c)=>Math.abs(v-(p[c]??0))<=6)))return {cache,fill,stable:true};
 // An attached card can border different independently uniform backgrounds.
 // Preserve the single-background path above. A palette can supply contrast
 // only when every observed patch is opaque and passes the unchanged 6-channel
 // tolerance with the source sampler's 82% support. No palette authorizes fill.
 const stable=patches.every((patch,index)=>{
  const color=colors[index];return color&&patch.every(p=>(p[3]??0)>=240)
   &&patch.filter(p=>color.slice(0,3).every((v,c)=>Math.abs(v-(p[c]??0))<=6)).length/patch.length>=.82;
 });
 return {cache,fill,stable,...(stable?{colors}: {})};
}
/** Follow a source outline in four narrow strips instead of assuming four
 * straight axes or scanning its entire interior. Only a complete isolated
 * ring with opposite inner/outer contours can become a native perimeter.
 * @param {Raster} image @param {Box} hint
 * @param {Box[]} textMasks @param {{used:number}} budget */
function measureOutlinedSceneContainer(image,hint,textMasks,budget){
 return measureOutline(image,hint,textMasks,budget);
}
/** Report the actual rejection stage from the same charged measurement.
 * Controls and source bytes are never copied into diagnostics. Successful
 * outlines retain the geometry-only API's exact result and budget.
 * @param {Raster} image @param {Box} hint
 * @param {Box[]} textMasks @param {{used:number}} budget @param {unknown} [glyphOcclusion] */
function measureOutlinedSceneContainerDetailed(image,hint,textMasks,budget,glyphOcclusion){
 /** @type {Record<string,number>} */const rejections={};
 const outline=measureOutline(image,hint,textMasks,budget,rejections,glyphOcclusion);
 return {outline,rejections,detailCode:outline?null:Object.keys(rejections).length===1?Object.keys(rejections)[0]??'outline-no-closed-component':'outline-no-closed-component'};
}
/** Opt-in alternative measurement; original successful corner proofs remain
 * exact. All later ring, paint, ownership and ambiguity gates are unchanged.
 * @param {Raster} image @param {Box} hint @param {Box[]} textMasks
 * @param {{used:number}} budget @param {unknown} [glyphOcclusion] */
function measureOutlinedSceneContainerSpatial(image,hint,textMasks,budget,glyphOcclusion){
 /** @type {Record<string,number>} */const rejections={};
 let outline=measureOutline(image,hint,textMasks,budget,rejections,glyphOcclusion,true);
 // Expand the observation, not the proposed body. A failed corner/background
 // may be a neighbouring border within the narrow halo. Every additional
 // source cell is preflighted and charged; successful paths never retry.
 if(!outline&&rejections['outline-exterior-unstable'])outline=measureOutline(image,hint,textMasks,budget,rejections,glyphOcclusion,true,2);
 return {outline,rejections,detailCode:outline?null:Object.keys(rejections).length===1?Object.keys(rejections)[0]??'outline-no-closed-component':'outline-no-closed-component'};
}
/** @param {Raster} image @param {Box} hint
 * @param {Box[]} textMasks @param {{used:number}} budget
 * @param {Record<string,number>|undefined} [rejections] @param {unknown} [glyphOcclusion] @param {boolean} [spatialExterior] @param {number} [expansion] */
function measureOutline(image,hint,textMasks,budget,rejections,glyphOcclusion,spatialExterior=false,expansion=1){
 /** @param {string} code @returns {null} */const reject=code=>{if(rejections)rejections[code]=(rejections[code]??0)+1;return null;};
 if(!record(image)||!record(hint)||!record(budget)||types.isProxy(image.rgba)||!types.isUint8Array(image.rgba)
  ||![image.width,image.height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=16384)
  ||image.width*image.height>40000000
  ||![hint.x,hint.y,hint.w,hint.h].every(Number.isFinite)||hint.x<0||hint.y<0||hint.w<12||hint.h<12
  ||hint.x+hint.w>image.width||hint.y+hint.h>image.height||!Number.isSafeInteger(budget.used)||budget.used<0)
  throw new TypeError("Scene outline input is invalid");
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,"buffer",image.rgba),offset=Reflect.get(proto,"byteOffset",image.rgba),length=Reflect.get(proto,"length",image.rgba);
 if(!types.isArrayBuffer(buffer)||length!==image.width*image.height*4||!Array.isArray(textMasks)||types.isProxy(textMasks)
  ||textMasks.length>10000||Reflect.ownKeys(textMasks).length!==textMasks.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(textMasks)).some(p=>!("value" in p))
  ||textMasks.some(m=>!record(m)||![m.x,m.y,m.w,m.h].every(Number.isFinite)||m.x<0||m.y<0||m.w<=0||m.h<=0))throw new TypeError("Scene outline input is invalid");
 image={width:image.width,height:image.height,rgba:image.rgba};
 const sample=sampleAtomInteriorFill({...image,rgba:Buffer.from(buffer,offset,length)},hint,textMasks);
 const {margin,x0,y0,x1,y1,area,dense}=sceneOutlineWindow(image,hint,expansion);
 if(area>262144)return reject('outline-window-budget');
 const windows=sceneOutlineReadWindows({margin,x0,y0,x1,y1,area,dense});
 // These strips are disjoint. Preflight all newly read cells before charging
 // any strip; reuse of this source and budget never increases the 4M ceiling.
 const readCost=windows.reduce((sum,window)=>sum+sceneFillRasterReadCost(image,window,budget),0);
 if(budget.used+readCost>4000000){if(expansion>1)return reject('outline-retry-scan-budget');throw new RangeError("Scene outline scan exceeds the pixel budget");}
 const strips=windows.map(window=>({window,raster:readSceneFillRaster(image,window,budget)}));
 /** @param {number} x @param {number} y */
 const readPixel=(x,y)=>{const strip=strips.find(s=>x>=s.window.x&&y>=s.window.y&&x<s.window.x+s.window.w&&y<s.window.y+s.window.h);
  if(!strip)throw new TypeError("Scene outline read reached an unobserved cell");
  const i=((y-strip.window.y)*strip.window.w+x-strip.window.x)*4;
  return [strip.raster.rgba[i]??0,strip.raster.rgba[i+1]??0,strip.raster.rgba[i+2]??0,strip.raster.rgba[i+3]??0];
 };
 // Without a uniform interior, the ring can still be native. A measured
 // exterior supplies contrast only and NEVER authorizes an interior fill.
 const exterior=exteriorEvidence(image,x0,y0,x1,y1,readPixel);
 if(!exterior.stable&&spatialExterior){
  const spatial=measureSpatialOutlineExterior({x0,y0,x1,y1,textMasks},readPixel);
  if(spatial.fill){exterior.stable=true;exterior.fill=spatial.fill;delete exterior.colors;}
 }
 const fill=exterior.fill;
 const interior=sample?[1,3,5].map(i=>Number.parseInt(sample.color.slice(i,i+2),16)):null;
 if(!exterior.stable)return reject('outline-exterior-unstable');
 // Mixed content can prevent a whole-body sample while four independently
 // uniform subregions still identify its background. These colors exclude
 // background from ink only; they never authorize a body or a solid fill.
 // Dense windows reuse their already charged immutable source snapshot.
 const raster=dense?strips[0]?.raster:null;
 const seedColors=raster&&(!interior||sample&&sample.support<sample.samples*.92)?sampleAtomInteriorFillSeeds(raster,
  {...hint,x:hint.x-x0,y:hint.y-y0},textMasks.map(m=>({...m,x:m.x-x0,y:m.y-y0})),glyphOcclusion!==undefined)
  .map(seed=>[1,3,5].map(i=>Number.parseInt(seed.color.slice(i,i+2),16))):[];
 const interiorColors=interior?[interior,...seedColors.filter(s=>Math.max(...s.map((v,c)=>Math.abs(v-(interior[c]??0))))>18)]:seedColors;
 const ink=new Set();
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  if(!dense&&x>=x0+2*margin&&x<x1-2*margin&&y>=y0+2*margin&&y<y1-2*margin)continue;
  const n=y*image.width+x,p=exterior.cache.get(n)??readPixel(x,y);exterior.cache.set(n,p);
  /** @param {number[]} colors */
  const contrast=colors=>Math.max(...colors.map((v,c)=>Math.abs(v-(p[c]??0))));
  // The two sides of a colored node have different backgrounds. Neither its
  // interior fill nor its exterior may join the perimeter's ink component.
  const exteriorContrast=exterior.colors?Math.min(...exterior.colors.map(contrast)):contrast(fill);
  if((p[3]??0)>=240&&exteriorContrast>=18&&interiorColors.every(color=>contrast(color)>=18))ink.add(n);
 }
 const candidates=[];
 while(ink.size){const seed=/** @type {number} */(ink.values().next().value),queue=[seed];ink.delete(seed);
  let points=[];const colors=new Map();let minX=image.width,minY=image.height,maxX=0,maxY=0,touches=false,owned=false;
  for(let at=0;at<queue.length;at++){
   const n=queue[at]??0,x=n%image.width,y=Math.floor(n/image.width),p=exterior.cache.get(n);points.push({x,y});
   touches ||= x===x0||x===x1-1||y===y0||y===y1-1;
   owned ||= textMasks.some(m=>x>=m.x&&y>=m.y&&x<m.x+m.w&&y<m.y+m.h);
   minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   colors.set(n,[p?.[0]??0,p?.[1]??0,p?.[2]??0]);
   for(const next of [x?n-1:-1,x<image.width-1?n+1:-1,y?n-image.width:-1,y<image.height-1?n+image.width:-1])if(ink.delete(next))queue.push(next);
  }
  let box={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
  const isolated=touches||owned?isolateClosedSourceRing({points,bounds:box,hint}):null;
  if(isolated){points=isolated.points;box=isolated.box;touches=points.some(p=>p.x===x0||p.x===x1-1||p.y===y0||p.y===y1-1);
   owned=points.some(p=>textMasks.some(m=>p.x>=m.x&&p.y>=m.y&&p.x<m.x+m.w&&p.y<m.y+m.h));
  }
  if(touches){reject('outline-window-boundary');continue;}
  if(owned&&glyphOcclusion===undefined){reject('outline-text-ownership');continue;}
  if(!sample&&!dense&&ringTouchesUnobservedCore({points,window:{x0,y0,x1,y1,margin}})){reject('outline-unobserved-core');continue;}
  if(box.w<hint.w*.7||box.w>hint.w*1.35||box.h<hint.h*.55||box.h>hint.h*1.6||box.w*box.h>2000000){reject('outline-geometry');continue;}
  // The general line-art error distorts small rings. Bound it by one percent
  // of the smaller source dimension, with a half-pixel raster floor. Large
  // frames retain the existing 1.5px tolerance and work/120-segment ceilings.
  const workState={checks:0,exhausted:false};
  const tolerancePx=Math.min(1.5,Math.max(.5,Math.min(box.w,box.h)/100));
  /** @param {boolean} connectDiagonal */const trace=connectDiagonal=>traceNativeMaskContours(points,box,{tolerancePx,workState,connectDiagonal})??(tolerancePx<.75?traceNativeMaskContours(points,box,{tolerancePx:.75,workState,connectDiagonal}):null)??(tolerancePx<1.25?traceNativeMaskContours(points,box,{tolerancePx:1.25,workState,connectDiagonal}):null);
  let segments=trace(false);
  if(!segments){reject('outline-path-budget');continue;}
  // A smaller enclosed face needs independent source-cell proof. Keep every
  // traced hole and the single-exterior requirement; no diameter relaxation.
  let topology=hasClosedRingTopology(segments);
  if(!topology&&isolated){const alt=trace(true);if(alt&&hasClosedRingTopology(alt)){segments=alt;topology=true;}}
  const exteriorLoops=segments.filter(s=>s.type==='close').length;
  const witness=!topology&&raster&&interiorColors.length>0&&exteriorLoops>=2&&singleExterior(segments)
    ?measureSourceRingInteriorWitness({raster,window:{x:x0,y:y0},box,points,colors:interiorColors,textMasks}):null;
  const witnessed=witness!==null;
  if(!topology&&!witnessed){reject('outline-open-topology');continue;}
  // Resolve OCR whitespace only after the complete actual ring is proven.
  // A missing/exhausted/copied glyph capability retains the original failure.
  if(owned&&sourceRingTextOwned({image,budget,points,textMasks,glyphOcclusion})){reject('outline-text-ownership');continue;}
  // A proven interior color does not make the perimeter's bounding box a
  // filled rectangle. Reuse observed ring cells for its exterior silhouette;
  // source holes and cut corners remain outside the body geometry.
  const bodySegments=sample?traceNativeMaskContours(points,box,{tolerancePx:1.5,outerOnly:true,workState}):null;
  const paint=measureSourceOutlinePaint({points,colors,width:image.width},workState,true);
  // A closed physical perimeter remains a node when its heterogeneous
  // interior cannot prove a fill. Its outer silhouette grants ports only;
  // it must never become a guessed solid drawing or paint owner.
  const portSegments=!sample?traceNativeMaskContours(points,box,{tolerancePx:1.5,outerOnly:true,workState}):null;
  const face=witness?.face,faceSegments=face?traceNativeMaskContours(face.points,face.box,{tolerancePx:1.5,workState}):null;
  const candidate={box,fill:bodySegments?sample?.color??"none":"none",segments,...(bodySegments?{bodySegments}:{}),color:measureSourceOutlineColor({points,colors,width:image.width}),scanPixels:area,interiorWitness:witnessed===true,
   ...(face&&faceSegments?{interiorPaint:{box:face.box,color:face.color,segments:faceSegments}}:{}),
   ...(portSegments?{portSegments}:{}),
   paint,
   sourcePixels:points.map(p=>p.y*image.width+p.x)};
  captureSourceOutlineAppearance(image,candidate,workState,{points,colors,width:image.width});candidates.push(candidate);
 }
 if(candidates.length===1)return candidates[0];
 if(candidates.length>1)return reject('outline-ambiguous');
 if(rejections&&!Object.keys(rejections).length)reject('outline-no-ink');
 return null;
}
/** @param {NonNullable<ReturnType<typeof traceNativeMaskContours>>} segments */
function singleExterior(segments){
 let count=0;/** @type {{x:number,y:number}[]} */let loop=[];
 for(const s of segments){if(s.type==='close'){let area=0;for(let i=0;i<loop.length;i++){
  const a=loop[i],b=loop[(i+1)%loop.length];if(a&&b)area+=a.x*b.y-b.x*a.y;
 }if(area>0)count++;loop=[];}else if(s.points[0])loop.push(s.points[0]);}
 return count===1;
}
/** A measured closed source ring supersedes an earlier axis-line fragment
 * only when the fragment's entire shaft is overwhelmingly supported by that
 * same source component. Merely crossing/touching its box proves nothing.
 * @param {{type?:string,box:Box,source?:Record<string,unknown>,style?:Record<string,unknown>}} line
 * @param {{sourcePixels:number[]}} outline @param {number} width
 * @param {{x:number,y:number}} scale @param {unknown} [context] */
function outlineOwnsAxisLine(line,outline,width,scale,context){
 if(!record(line)||!record(line.source))return false;
 if(line.source.detector==='visual-atom-native-connector')return visualAxisOwnedBySourceOutline(line,outline,width,scale,context);
 if(line.type!=="line"||line.source?.detector!=="long-axis-line"
  ||![line.box.x,line.box.y,line.box.w,line.box.h,scale.x,scale.y].every(Number.isFinite)
  ||scale.x<=0||scale.y<=0||!Number.isSafeInteger(width)||width<=0
  ||line.box.w!==0&&line.box.h!==0)return false;
 const length=Math.hypot(line.box.w*scale.x,line.box.h*scale.y);
 const stroke=line.style?.strokeWidthPt;
 if(length<12||length>32768||typeof stroke!=="number"||!Number.isFinite(stroke)||stroke<=0)return false;
 const radius=Math.ceil(stroke*Math.max(scale.x,scale.y)/2);
 if(radius>8)return false;
 const pixels=new Set(outline.sourcePixels),steps=Math.ceil(length);let supported=0;
 for(let n=0;n<=steps;n++){
  const x=Math.round((line.box.x+line.box.w*n/steps)*scale.x),y=Math.round((line.box.y+line.box.h*n/steps)*scale.y);
  let hit=false;
  for(let d=-radius;d<=radius;d++)if(pixels.has(line.box.w===0?y*width+x+d:(y+d)*width+x)){hit=true;break;}
  if((n===0||n===steps)&&!hit)return false;
  if(hit)supported++;
 }
 return supported/(steps+1)>=.85;
}
module.exports={measureOutlinedSceneContainer,measureOutlinedSceneContainerDetailed,measureOutlinedSceneContainerSpatial,outlineOwnsAxisLine,sceneOutlineWindow,sceneOutlineReadWindows,sceneOutlineExteriorEvidence:exteriorEvidence,registerSourceMeasuredOutlineStyle};
