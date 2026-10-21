// @ts-check
"use strict";
const {types}=require("node:util");
const {sourceRaster,compileBoundedResidualTextMask,compileBoundedObservedTextMask}=require("./residual-text-mask");
const {sourceTextEraseMask}=require("./residual-source-text-evidence");
const {readSceneFillRaster}=require("./source-scene-fill-raster-cache");
const {squaredSourceStrokeDistances}=require("./source-stroke-distance");
const {createSceneGlyphChoiceLedger,acquireSceneGlyphChoiceCells,stageSceneGlyphChoice,commitSceneGlyphChoice,
 stageSceneGlyphPortfolio,sceneGlyphChoiceCost}=require('./source-scene-glyph-choice');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {ReturnType<typeof sourceTextEraseMask>} Mask */
/** @typedef {ReturnType<typeof import('./residual-text-mask').compileResidualTextMask>} TextPlan */
/** @typedef {{mask:Mask,plan:TextPlan,strokeWitness:boolean,observed?:boolean}} Proof */
/** @typedef {{byColor:Map<string,Proof>,owned:Uint8Array,count:number}} GlyphProofs */
/** @typedef {{glyphMeasurements:number,glyphOwnedPixels:number}} Evidence */
/** @typedef {{glyphBudgetRejections:number,scanBudgetRejections:number,lastRequestedGlyphs:number,lastRemainingGlyphs:number}} Rejections */
/** Private, immutable source controls. Provider rectangles and serialized
 * masks can never stand in for a measured glyph or acquire occlusion rights.
 * @type {WeakMap<object,{source:ReturnType<typeof sourceRaster>,budget:{used:number},masks:Mask[],proofs:Map<number,GlyphProofs>,rasters:Map<string,ReturnType<typeof readSceneFillRaster>>,rejected:Map<number,Set<string>>,evidence:Evidence,choiceLedger:object,rejections:Rejections}>} */
const registries=new WeakMap();
/** @param {Mask} mask */
const rasterKey=mask=>`${mask.x},${mask.y},${mask.w},${mask.h}`;
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** @param {unknown} v @param {number} [maximum] @returns {unknown[]} */
function texts(v,maximum=10000){if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>maximum
 ||Reflect.ownKeys(v).length!==v.length+1||Object.values(Object.getOwnPropertyDescriptors(v)).some(p=>!('value' in p)))throw new TypeError('Scene glyph controls are invalid');return v;}
/** Capture only validated source quadrilaterals and ink colors, never text
 * content. Measurements are lazy, synchronous and debited to the existing
 * compiler budget through its source-window cache.
 * @param {unknown} image @param {unknown} textBoxes @param {unknown} size @param {unknown} budget */
function createSceneGlyphOcclusion(image,textBoxes,size,budget){
 const source=sourceRaster(image);
 if(!record(size)||typeof size.widthPt!=='number'||typeof size.heightPt!=='number'
  ||![size.widthPt,size.heightPt].every(n=>Number.isFinite(n)&&n>0&&n<=100000)
  ||!record(budget)||!Number.isSafeInteger(budget.used)||Number(budget.used)<0)throw new TypeError('Scene glyph frame is invalid');
 const slideSize={widthPt:size.widthPt,heightPt:size.heightPt};
 /** @type {Mask[]} */const masks=[];
 for(const item of texts(textBoxes)){
  if(!record(item))throw new TypeError('Scene glyph item is invalid');
  // Legacy callers without source ink provide no occlusion evidence.
  if(!Object.hasOwn(item,'font'))continue;
  if(!record(item.font)||typeof item.text!=='string'||item.text.length>16000)throw new TypeError('Scene glyph item is invalid');
  if(!item.text.trim())continue;
  masks.push(sourceTextEraseMask(item,source,slideSize));
 }
 const token=Object.freeze({});
 const evidence={glyphMeasurements:0,glyphOwnedPixels:0};
 registries.set(token,{source,budget:/** @type {{used:number}} */(budget),masks,proofs:new Map(),rasters:new Map(),rejected:new Map(),evidence,choiceLedger:createSceneGlyphChoiceLedger(evidence),
  rejections:{glyphBudgetRejections:0,scanBudgetRejections:0,lastRequestedGlyphs:0,lastRemainingGlyphs:100000}});
 return token;
}
/** @param {unknown} token */
function sceneGlyphOcclusionEvidence(token){
 const state=token!==null&&typeof token==='object'?registries.get(token):undefined;
 return {...(state?.evidence??{glyphMeasurements:0,glyphOwnedPixels:0})};
}
/** Check an optional capability before entering a measurement transaction.
 * This grants no glyph cells and never reads properties of the token.
 * @param {unknown} token @param {import('./png').PngImage} image @param {{used:number}} budget */
function sceneGlyphOcclusionMatches(token,image,budget){
 const state=token!==null&&typeof token==='object'?registries.get(token):undefined;
 return !!state&&state.budget===budget&&state.source.width===image.width&&state.source.height===image.height
  &&state.source.rgba.buffer===image.rgba.buffer&&state.source.rgba.byteOffset===image.rgba.byteOffset;
}
/** Read-only numeric diagnostics grant no source or ownership authority.
 * Retain legacy evidence shape and never include text, colors or coordinates.
 * @param {unknown} token @returns {Rejections} */
function sceneGlyphOcclusionRejections(token){
 const state=token!==null&&typeof token==='object'?registries.get(token):undefined;
 return {...(state?.rejections??{glyphBudgetRejections:0,scanBudgetRejections:0,lastRequestedGlyphs:0,lastRemainingGlyphs:100000})};
}
/** @param {Rejections} counters @param {number} requested @param {number} used */
function rejectGlyphBudget(counters,requested,used){
 counters.glyphBudgetRejections++;counters.lastRequestedGlyphs=requested;counters.lastRemainingGlyphs=100000-used;
}
/** Reserve only unmeasured glyph windows that an optional source probe might
 * encounter. Tokens remain bound to the original source and budget. This reads
 * controls only and grants neither paint nor glyph ownership.
 * @param {unknown} token @param {Box} box @returns {number} */
function sceneGlyphOcclusionScanReserve(token,box){
 if(!record(box)||![box.x,box.y,box.w,box.h].every(n=>typeof n==='number'&&Number.isFinite(n))
  ||box.x<0||box.y<0||box.w<=0||box.h<=0)throw new TypeError('Scene glyph reserve is invalid');
 const state=token!==null&&typeof token==='object'?registries.get(token):undefined;if(!state)return 0;
 let reserve=0;
 for(const [index,mask]of state.masks.entries())if(!state.proofs.has(index)&&!state.rasters.has(rasterKey(mask))&&mask.x<box.x+box.w&&mask.y<box.y+box.h
  &&mask.x+mask.w>box.x&&mask.y+mask.h>box.y){reserve+=mask.w*mask.h;if(reserve>4000000)return 4000001;}
 return reserve;
}
/** A uniform blank hole also matches a proposed white ink color. Require a
 * thin source stroke rather than treating that solid background as a glyph.
 * This is a conservative authority check, not a change to the fill gate.
 * Use only the already measured core; no extra source pixels are read.
 * @param {TextPlan} plan */
function glyphStrokeWitness(plan){
 const {w,h}=plan.bounds,mask=Uint8Array.from(plan.core,(v,i)=>v&&plan.owned[i]?1:0);
 if(!mask.some(v=>v)||mask.every(v=>v)||!plan.ink)return false;
 const shortSide=Math.min(...plan.ink.polygon.map((p,i)=>{const q=plan.ink?.polygon[(i+1)%4];return q?Math.hypot(p[0]-q[0],p[1]-q[1]):0;}));
 // A glyph's solid stroke cannot occupy more than half its evidence height
 // or width. Broad empty holes have no independent stroke witness.
 const radius=shortSide/4;
 const distances=squaredSourceStrokeDistances({width:w,height:h,mask});
 return distances.every((value,i)=>!mask[i]||value<=radius*radius);
}
/** Body geometry and component cells are internal outputs of the admitted
 * source fill scanner. Count only independently measured glyph cells inside
 * enclosed holes, with a witnessed background matching this exact fill.
 * The original bounding-box denominator and .58 coverage gate stay intact.
 * @param {unknown} token @param {{width:number,height:number,rgba:Uint8Array}} image @param {{used:number}} budget
 * @param {Box} box @param {number[]} fill */
function sourceGlyphProofs(token,image,budget,box,fill){
 const state=token!==null&&typeof token==='object'?registries.get(token):undefined;
 if(!state||state.budget!==budget||state.source.width!==image.width||state.source.height!==image.height
  ||state.source.rgba.buffer!==image.rgba.buffer||state.source.rgba.byteOffset!==image.rgba.byteOffset)return [];
 /** @type {Proof[]} */const proofs=[];
 for(const [index,mask]of state.masks.entries()){
  if(mask.x>=box.x+box.w||mask.y>=box.y+box.h||mask.x+mask.w<=box.x||mask.y+mask.h<=box.y
   ||Math.max(...mask.textInk.color.map((v,c)=>Math.abs(v-(fill[c]??0))))<64)continue;
  const colorKey=fill.join(',');let captured=state.proofs.get(index),proof=captured?.byColor.get(colorKey);
  if(!proof){
   if(state.rejected.get(index)?.has(colorKey))continue;
   // Reserve scan work independently. The bounded planner reserves all potential
   // ink before assigning ownership under the unchanged 100000 numeric ceiling.
   const key=rasterKey(mask);let raster=state.rasters.get(key);
   if(mask.w*mask.h>262144)continue;
   if(!raster&&budget.used+mask.w*mask.h>4000000){state.rejections.scanBudgetRejections++;continue;}
   // Exact source windows remain private to this synchronous compile. Failed
   // color hypotheses reuse their measured bytes; only real source reads debit
   // the scan counter, and this cache grants no glyph or background ownership.
   if(!raster){raster=readSceneFillRaster(image,mask,budget);state.rasters.set(key,raster);}
   const ink={color:mask.textInk.color,polygon:mask.textInk.polygon.map(p=>[p[0]-mask.x,p[1]-mask.y])};
   // Validate complete source context within the unchanged per-window bound.
   // Context pixels are not ownership of pixels outside this paint query.
   const plan=compileBoundedResidualTextMask(raster,{x:0,y:0,w:mask.w,h:mask.h},ink,
    {remainingOwned:100000,backgroundColor:fill});
   if(!plan){const rejected=state.rejected.get(index)??new Set();rejected.add(colorKey);state.rejected.set(index,rejected);continue;}
   // Source snapshots are color-independent; glyph ownership is not. A prior
   // background hypothesis cannot suppress a different witnessed background.
   // Count each acquired cell once per glyph window across hypotheses, and
   // admit the entire new proof only under the unchanged shared allowance.
   // A padded OCR window may overlap this query while every admitted stroke
   // lies outside it. Do not acquire that unrelated population. This is not a
   // color rejection: a later query can still use the same measured source.
   // Keep complete source context for the independent stroke predicate.
   // Ownership of the requested paint footprint is committed below.
   // A rejected broad hole is not a glyph proof and cannot spend another
   // object's ownership allowance. Validate the stroke before committing the
   // shared population; source scan work remains charged and cached.
   const strokeWitness=glyphStrokeWitness(plan);
   if(plan.ownedPixels&&!strokeWitness){const rejected=state.rejected.get(index)??new Set();rejected.add(colorKey);state.rejected.set(index,rejected);continue;}
   if(!captured){captured={byColor:new Map(),owned:new Uint8Array(plan.owned.length),count:0};state.proofs.set(index,captured);}
   proof={mask,plan,strokeWitness,observed:false};captured.byColor.set(colorKey,proof);
   if(!plan.ownedPixels){proof.observed=true;state.evidence.glyphMeasurements++;}
  }
  if(!proof.plan.ownedPixels||!proof.strokeWitness||!captured)continue;
  const owned=new Uint8Array(proof.plan.owned.length);let count=0,added=0;
  for(let i=0;i<owned.length;i++){
   const x=mask.x+i%mask.w,y=mask.y+Math.floor(i/mask.w);
   if(proof.plan.owned[i]&&x>=box.x&&y>=box.y&&x<box.x+box.w&&y<box.y+box.h){owned[i]=1;count++;if(!captured.owned[i])added++;}
  }
  // Admission is atomic for this complete requested footprint. A larger later
  // query must acquire its additional cells; cached context grants no rights.
  if(!count)continue;
  if(state.evidence.glyphOwnedPixels+added>100000){rejectGlyphBudget(state.rejections,added,state.evidence.glyphOwnedPixels);continue;}
  if(!acquireSceneGlyphChoiceCells(state.choiceLedger,captured,owned))continue;
  if(!proof.observed){proof.observed=true;state.evidence.glyphMeasurements++;}
  proofs.push({...proof,plan:{...proof.plan,owned,ownedPixels:count}});
 }
 return proofs;
}
/** Connect source paint only through independently measured thin glyph strokes
 * whose witnessed background is this exact paint. An OCR rectangle, a cloned
 * token, an unobserved background or an exhausted optional scan grants nothing.
 * No source boundary is extended and no source pixels are changed.
 * @param {unknown} token @param {{width:number,height:number,rgba:Uint8Array}} image
 * @param {{used:number}} budget @param {Box} box @param {number[]} fill */
function sceneFillGlyphBridge(token,image,budget,box,fill){
 /** @type {Set<number>} */const cells=new Set();
 sourceRaster(image);
 if(!record(budget)||!Number.isSafeInteger(budget.used)||budget.used<0)throw new TypeError('Scene glyph bridge budget is invalid');
 if(!record(box)||![box.x,box.y,box.w,box.h].every(Number.isSafeInteger)||box.x<0||box.y<0||box.w<1||box.h<1
  ||box.w*box.h>262144||box.x+box.w>image.width||box.y+box.h>image.height
  ||!Array.isArray(fill)||types.isProxy(fill)||Object.getPrototypeOf(fill)!==Array.prototype||fill.length!==3
  ||Reflect.ownKeys(fill).length!==4||Object.values(Object.getOwnPropertyDescriptors(fill)).some(p=>!('value' in p))
  ||!fill.every(v=>Number.isSafeInteger(v)&&v>=0&&v<=255))throw new TypeError('Scene glyph bridge frame is invalid');
 if(budget.used+sceneGlyphOcclusionScanReserve(token,box)>4000000){
  const state=token!==null&&typeof token==='object'?registries.get(token):undefined;
  if(state)state.rejections.scanBudgetRejections++;return cells;
 }
 const proofs=sourceGlyphProofs(token,image,budget,box,fill);
 for(const {mask,plan}of proofs)for(let y=Math.max(box.y,mask.y);y<Math.min(box.y+box.h,mask.y+mask.h);y++)
  for(let x=Math.max(box.x,mask.x);x<Math.min(box.x+box.w,mask.x+mask.w);x++){
   const i=(y-mask.y)*mask.w+x-mask.x;
   if(plan.owned[i]===1&&fill.every((v,c)=>Math.abs(v-(plan.background[i*3+c]??0))<=18))cells.add(y*image.width+x);
  }
 return cells;
}
/** @param {unknown} token @param {{width:number,height:number,rgba:Uint8Array}} image @param {{used:number}} budget
 * @param {Box} box @param {Int32Array} component @param {number} count @param {{x:number,y:number,w:number}} window @param {number[]} fill */
function countSceneGlyphOcclusion(token,image,budget,box,component,count,window,fill){
 const proofs=sourceGlyphProofs(token,image,budget,box,fill);if(!proofs.length)return 0;
 const area=box.w*box.h,solid=new Uint8Array(area),outside=new Uint8Array(area),queue=new Int32Array(area);
 for(let q=0;q<count;q++){const n=component[q];if(n===undefined)throw new TypeError('Scene source component is invalid');
  const x=window.x+n%window.w-box.x,y=window.y+Math.floor(n/window.w)-box.y;solid[y*box.w+x]=1;}
 let head=0,tail=0;
 /** @param {number} n */
 const add=n=>{if(solid[n]||outside[n])return;outside[n]=1;queue[tail++]=n;};
 for(let x=0;x<box.w;x++){add(x);add((box.h-1)*box.w+x);}
 for(let y=1;y<box.h-1;y++){add(y*box.w);add(y*box.w+box.w-1);}
 while(head<tail){const n=queue[head++];if(n===undefined)throw new TypeError('Scene source component is invalid');
  const x=n%box.w,y=Math.floor(n/box.w);if(x)add(n-1);if(x<box.w-1)add(n+1);if(y)add(n-box.w);if(y<box.h-1)add(n+box.w);}
 let owned=0;
 for(let n=0;n<area;n++){
  if(solid[n]||outside[n])continue;
  const x=box.x+n%box.w,y=box.y+Math.floor(n/box.w);
  if(proofs.some(({mask,plan})=>{
   if(x<mask.x||y<mask.y||x>=mask.x+mask.w||y>=mask.y+mask.h)return false;
   const i=(y-mask.y)*mask.w+x-mask.x;
   return plan.owned[i]===1&&fill.every((v,c)=>Math.abs(v-(plan.background[i*3+c]??0))<=18);
  }))owned++;
 }
 return owned;
}
/** Return a private complete glyph predicate in the exact admitted OCR frame.
 * Missing, ambiguous, weak or exhausted evidence retains rectangle protection.
 * The all-background proof cannot supply a color-specific paint bridge.
 * @param {unknown} token @param {unknown} imageInput @param {unknown} budgetInput
 * @param {unknown} boxInput @returns {((x:number,y:number)=>boolean)|null} */
function sceneIconTextFootprint(token,imageInput,budgetInput,boxInput){
 const image=sourceRaster(imageInput);
 if(!record(budgetInput)||!Number.isSafeInteger(budgetInput.used)||Number(budgetInput.used)<0
  ||!record(boxInput)||![boxInput.x,boxInput.y,boxInput.w,boxInput.h].every(v=>typeof v==='number'&&Number.isFinite(v))
  ||Number(boxInput.x)<0||Number(boxInput.y)<0||Number(boxInput.w)<=0||Number(boxInput.h)<=0
  ||Number(boxInput.x)+Number(boxInput.w)>image.width||Number(boxInput.y)+Number(boxInput.h)>image.height)
  throw new TypeError('Scene icon glyph frame is invalid');
 const budget=/** @type {{used:number}} */(budgetInput),box=/** @type {Box} */(boxInput);
 const state=token!==null&&typeof token==='object'?registries.get(token):undefined;
 if(!state||state.budget!==budget||state.source.width!==image.width||state.source.height!==image.height
  ||state.source.rgba.buffer!==image.rgba.buffer||state.source.rgba.byteOffset!==image.rgba.byteOffset)return null;
 const matches=state.masks.map((mask,index)=>{const xs=mask.textInk.polygon.map(p=>p[0]),ys=mask.textInk.polygon.map(p=>p[1]);
  const bounds={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  return ['x','y','w','h'].every(k=>Math.abs(bounds[/** @type {keyof Box} */(k)]-box[/** @type {keyof Box} */(k)])<=1e-6)?{mask,index}:null;
 }).filter(v=>v!==null);
 if(matches.length!==1)return null;
 const selected=matches[0];if(!selected)return null;const {mask,index}=selected,colorKey='icon-observed-backgrounds';
 let captured=state.proofs.get(index),proof=captured?.byColor.get(colorKey);
 if(!proof){
  if(state.rejected.get(index)?.has(colorKey))return null;
  const key=rasterKey(mask);let raster=state.rasters.get(key);
  if(mask.w*mask.h>262144||!raster&&budget.used+mask.w*mask.h>4000000)return null;
  if(!raster){raster=readSceneFillRaster(image,mask,budget);state.rasters.set(key,raster);}
  const ink={color:mask.textInk.color,polygon:mask.textInk.polygon.map(p=>[p[0]-mask.x,p[1]-mask.y])};
  const plan=compileBoundedObservedTextMask(raster,{x:0,y:0,w:mask.w,h:mask.h},ink,
   100000-state.evidence.glyphOwnedPixels+(captured?.count??0));
  if(!plan||!plan.ownedPixels||!glyphStrokeWitness(plan)){
   const rejected=state.rejected.get(index)??new Set();rejected.add(colorKey);state.rejected.set(index,rejected);return null;
  }
  let added=0;for(let i=0;i<plan.owned.length;i++)if(plan.owned[i]&&!captured?.owned[i])added++;
  if(state.evidence.glyphOwnedPixels+added>100000)return null;
  if(!captured){captured={byColor:new Map(),owned:new Uint8Array(plan.owned.length),count:0};state.proofs.set(index,captured);}
  if(!acquireSceneGlyphChoiceCells(state.choiceLedger,captured,plan.owned))return null;
  proof={mask,plan,strokeWitness:true};captured.byColor.set(colorKey,proof);
  state.evidence.glyphMeasurements++;
 }
 // A cached predicate is source observation, not persistent ownership. A
 // discarded candidate must reacquire this complete population atomically.
 if(!captured||!acquireSceneGlyphChoiceCells(state.choiceLedger,captured,proof.plan.owned))return null;
 const owned=proof.plan.owned;
 return (x,y)=>!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<mask.x||y<mask.y||x>=mask.x+mask.w||y>=mask.y+mask.h
  ||owned[(y-mask.y)*mask.w+x-mask.x]===1;
}
/** Observe a complete glyph context but authorize only the exact source cells
 * queried by a measured ring. Whitespace proof is not glyph erasure authority.
 * Unknown or insufficient evidence remains null, so callers protect the text.
 * @param {unknown} token @param {unknown} imageInput @param {unknown} budgetInput
 * @param {unknown} boxInput @param {unknown} pointsInput @returns {boolean|null} */
function sceneSourceTextPointsOwned(token,imageInput,budgetInput,boxInput,pointsInput){
 const image=sourceRaster(imageInput);
 if(!record(budgetInput)||!Number.isSafeInteger(budgetInput.used)||Number(budgetInput.used)<0
  ||!record(boxInput)||![boxInput.x,boxInput.y,boxInput.w,boxInput.h].every(v=>typeof v==='number'&&Number.isFinite(v))
  ||Number(boxInput.x)<0||Number(boxInput.y)<0||Number(boxInput.w)<=0||Number(boxInput.h)<=0
  ||Number(boxInput.x)+Number(boxInput.w)>image.width||Number(boxInput.y)+Number(boxInput.h)>image.height)
  throw new TypeError('Scene glyph point frame is invalid');
 const box=/** @type {Box} */(boxInput),points=texts(pointsInput,262144);
 if(points.length>262144||points.some(p=>!record(p)||typeof p.x!=='number'||typeof p.y!=='number'
  ||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)||p.x<0||p.y<0||p.x>=image.width||p.y>=image.height))
  throw new TypeError('Scene glyph point query is invalid');
 if(!points.length)return false;
 const budget=/** @type {{used:number}} */(budgetInput),state=token!==null&&typeof token==='object'?registries.get(token):undefined;
 if(!state||state.budget!==budget||state.source.width!==image.width||state.source.height!==image.height
  ||state.source.rgba.buffer!==image.rgba.buffer||state.source.rgba.byteOffset!==image.rgba.byteOffset)return null;
 const matches=state.masks.map((mask,index)=>{const xs=mask.textInk.polygon.map(p=>p[0]),ys=mask.textInk.polygon.map(p=>p[1]);
  const bounds={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  return ['x','y','w','h'].every(k=>Math.abs(bounds[/** @type {keyof Box} */(k)]-box[/** @type {keyof Box} */(k)])<=1e-6)?{mask,index}:null;
 }).filter(v=>v!==null);
 if(matches.length!==1)return null;const selected=matches[0];if(!selected)return null;
 const {mask,index}=selected,colorKey='ring-point-observed-backgrounds';
 let captured=state.proofs.get(index),proof=captured?.byColor.get(colorKey);
 if(!proof){
  if(state.rejected.get(index)?.has(colorKey))return null;
  const key=rasterKey(mask);let raster=state.rasters.get(key);
  if(mask.w*mask.h>262144||!raster&&budget.used+mask.w*mask.h>4000000)return null;
  if(!raster){raster=readSceneFillRaster(image,mask,budget);state.rasters.set(key,raster);}
  const ink={color:mask.textInk.color,polygon:mask.textInk.polygon.map(p=>[p[0]-mask.x,p[1]-mask.y])};
  // The existing bounded observer proves full context without granting it.
  // Actual queried ownership is checked against the shared ceiling below.
  const plan=compileBoundedObservedTextMask(raster,{x:0,y:0,w:mask.w,h:mask.h},ink,100000);
  if(!plan||!plan.ownedPixels||!glyphStrokeWitness(plan)){
   const rejected=state.rejected.get(index)??new Set();rejected.add(colorKey);state.rejected.set(index,rejected);return null;
  }
  if(!captured){captured={byColor:new Map(),owned:new Uint8Array(plan.owned.length),count:0};state.proofs.set(index,captured);}
  proof={mask,plan,strokeWitness:true};captured.byColor.set(colorKey,proof);state.evidence.glyphMeasurements++;
 }
 if(!captured)return null;
 const requested=new Uint8Array(proof.plan.owned.length);let owned=false;
 for(const point of points){const p=/** @type {{x:number,y:number}} */(point),i=(p.y-mask.y)*mask.w+p.x-mask.x;
  // Crop-to-slide round trips can include a fringe outside the OCR box. Match
  // the full footprint's conservative predicate outside its measured context.
  if(p.x<mask.x||p.y<mask.y||p.x>=mask.x+mask.w||p.y>=mask.y+mask.h){owned=true;continue;}
  if(proof.plan.owned[i]){requested[i]=1;owned=true;}
 }
 if(!acquireSceneGlyphChoiceCells(state.choiceLedger,captured,requested))return null;
 return owned;
}
/** Source candidates use this token's private ledger; preflight has no glyph
 * rights and retains its original synchronous behavior. @template T
 * @param {unknown} token @param {()=>T} measure */
function stageSceneGlyphOwnership(token,measure){
 const state=token!==null&&typeof token==='object'?registries.get(token):undefined;
 if(token===undefined)return {value:measure(),receipt:undefined};
 if(!state)throw new TypeError('Scene glyph ownership token is invalid');
 return stageSceneGlyphChoice(state.choiceLedger,measure);
}
/** @param {unknown} token @param {unknown} receipt */
function commitSceneGlyphOwnership(token,receipt){
 if(token===undefined&&receipt===undefined)return true;
 const state=token!==null&&typeof token==='object'?registries.get(token):undefined;
 if(!state)throw new TypeError('Scene glyph ownership token is invalid');
 return commitSceneGlyphChoice(state.choiceLedger,receipt);
}
/** @template T @param {unknown} token @param {()=>T} measure */
function stageSceneSurfaceOwnership(token,measure){
 const state=token!==null&&typeof token==='object'?registries.get(token):undefined;
 if(token===undefined)return {value:measure(),receipt:undefined};
 if(!state)throw new TypeError('Scene glyph ownership token is invalid');
 return stageSceneGlyphPortfolio(state.choiceLedger,measure);
}
/** @param {unknown} token @param {unknown} receipt */
function sceneSurfaceOwnershipCost(token,receipt){
 if(token===undefined&&receipt===undefined)return 0;
 const state=token!==null&&typeof token==='object'?registries.get(token):undefined;
 if(!state)throw new TypeError('Scene glyph ownership token is invalid');
 return sceneGlyphChoiceCost(state.choiceLedger,receipt);
}
module.exports={createSceneGlyphOcclusion,countSceneGlyphOcclusion,sceneGlyphOcclusionEvidence,sceneGlyphOcclusionMatches,sceneGlyphOcclusionRejections,sceneGlyphOcclusionScanReserve,sceneFillGlyphBridge,sceneIconTextFootprint,sceneSourceTextPointsOwned,
 stageSceneGlyphOwnership,commitSceneGlyphOwnership,stageSceneSurfaceOwnership,sceneSurfaceOwnershipCost};
