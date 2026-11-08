// @ts-check
"use strict";
const {types}=require("node:util");
const {maskBounds,pointInMask}=require("../scene-plan/raster-native-detection");
const {parseResidualFill}=require("../scene-plan/residual-background-mask");
const {parseResidualTextInk,compileResidualTextMask,sourceRaster,insideTextPolygon}=require("./residual-text-mask");
const {restoreResidualNativeFillBackground}=require("../scene-plan/residual-native-fill-background");
/** @typedef {import("./residual-text-mask").Raster} Raster */
/** @typedef {import("../scene-plan/raster-native-detection").Mask & {sourceFill?:unknown,textInk?:unknown,sourceRouteInk?:unknown}} Mask */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
  &&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @returns {Mask[]} */
function admitMasks(value){
  if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>30000
    ||Reflect.ownKeys(value).length!==value.length+1||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!("value" in p)))throw new TypeError("residual text masks are invalid");
  /** @type {Mask[]} */const masks=[];
  for(let i=0;i<value.length;i++){
    const mask=/** @type {unknown} */(value[i]);
    if(!record(mask)||![undefined,"rect","line"].includes(/** @type {string|undefined} */(mask.kind)))throw new TypeError("residual text mask is invalid");
    const fields=mask.kind==="line"?["x1","y1","x2","y2","width"]:["x","y","w","h"];
    if(fields.some(key=>typeof mask[key]!=="number"||!Number.isFinite(mask[key])||Math.abs(/** @type {number} */(mask[key]))>100000)
      ||(mask.kind==="line"?/** @type {number} */(mask.width)<=0:/** @type {number} */(mask.w)<=0||/** @type {number} */(mask.h)<=0))throw new TypeError("residual text mask geometry is invalid");
    masks.push(/** @type {Mask} */(mask));
  }
  return masks;
}
/** Resolve overlapping proposals from source evidence before any pixel is
 * written. Prefer a measured core, then the closest background witness; an
 * evidence key breaks exact ties without depending on caller ordering.
 * @param {Raster} source @param {ReturnType<typeof compileResidualTextMask>[]} plans */
function resolveTextPlanOverlaps(source,plans) {
  if(plans.length<2)return;
  const owners=new Uint32Array(source.width*source.height);
  const keys=plans.map(plan=>JSON.stringify([plan.ink.polygon,plan.ink.color,plan.bounds]));
  for(let p=0;p<plans.length;p++){
    const plan=plans[p];if(!plan)continue;
    for(let i=0;i<plan.owned.length;i++){
      if(!plan.owned[i])continue;
      const x=plan.bounds.x+i%plan.bounds.w,y=plan.bounds.y+Math.floor(i/plan.bounds.w),pixel=y*source.width+x;
      const previous=(owners[pixel]??0)-1,other=plans[previous];
      if(!other){owners[pixel]=p+1;continue;}
      const j=(y-other.bounds.y)*other.bounds.w+x-other.bounds.x;
      const core=(plan.core[i]??0)-(other.core[j]??0);
      const distance=(other.backgroundDistance[j]??0xffffffff)-(plan.backgroundDistance[i]??0xffffffff);
      const preferred=core>0||(core===0&&(distance>0||(distance===0&&(keys[p]??"")<(keys[previous]??""))));
      if(preferred){other.owned[j]=0;other.ownedPixels--;owners[pixel]=p+1;}
      else {plan.owned[i]=0;plan.ownedPixels--;}
    }
  }
}
/** Only truncated seeded components request one additional local scan. Its
 * context derives from measured glyph height, not page resolution or content.
 * Component isolation is still required, and both scans consume the same
 * fixed page budget. Never grow repeatedly along an attached connector.
 * @param {ReturnType<typeof compileResidualTextMask>} plan @param {Raster} source
 * @param {{x:number,y:number,w:number,h:number}[]} contexts */
function extendedTextContext(plan,source,contexts) {
  const {bounds,ink}=plan;
  const margin=Math.ceil(Math.min(...ink.polygon.map((p,i)=>{
    const q=ink.polygon[(i+1)%4];return q?Math.hypot(p[0]-q[0],p[1]-q[1]):0;
  }))/2);
  let x=Math.max(0,bounds.x-margin),y=Math.max(0,bounds.y-margin);
  let right=Math.min(source.width,bounds.x+bounds.w+margin),bottom=Math.min(source.height,bounds.y+bounds.h+margin);
  // One-hop measured text context closes a neighboring glyph truncated by
  // this ROI. Never follow arbitrary ink or recursively grow along a line.
  const neighbors=contexts.filter(other=>other.x<right&&other.x+other.w>x&&other.y<bottom&&other.y+other.h>y);
  if(neighbors.length<=8)for(const other of neighbors){
    x=Math.min(x,other.x);y=Math.min(y,other.y);
    right=Math.max(right,other.x+other.w);bottom=Math.max(bottom,other.y+other.h);
  }
  return {x,y,w:right-x,h:bottom-y};
}
/** @param {Raster} source @param {unknown} masksValue */
function residualTextPlans(source,masksValue) {
  source=sourceRaster(source);
  const masks=admitMasks(masksValue);
  const texts=masks.map(mask=>({mask,ink:parseResidualTextInk(mask.textInk)})).filter(entry=>entry.ink!==undefined);
  if(texts.length===0)return [];
  const exclusion=new Uint8Array(source.width*source.height);
  let contextPixels=0;
  for(const {ink} of texts){
    if(!ink)continue;
    const xs=ink.polygon.map(p=>p[0]),ys=ink.polygon.map(p=>p[1]);
    const left=Math.max(0,Math.floor(Math.min(...xs))),top=Math.max(0,Math.floor(Math.min(...ys)));
    const right=Math.min(source.width,Math.ceil(Math.max(...xs))),bottom=Math.min(source.height,Math.ceil(Math.max(...ys)));
    contextPixels+=(right-left)*(bottom-top);
    if(contextPixels>40000000)throw new RangeError("residual text context exceeds the page pixel budget");
    for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(insideTextPolygon(x+.5,y+.5,ink))exclusion[y*source.width+x]=1;
  }
  const owners=masks.filter(mask=>mask.textInk===undefined&&mask.sourceRouteInk===undefined).map(mask=>({mask,bounds:maskBounds(mask,source),fill:parseResidualFill(mask.sourceFill)}));
  const textContexts=texts.map(({mask})=>maskBounds(mask,source));
  const plans=[];let scannedPixels=contextPixels;
  for(const {mask,ink} of texts) {
    if(!ink)continue;
    if(mask.kind==="line"||mask.sourceFill!==undefined)throw new TypeError("residual text mask geometry is invalid");
    const bounds=maskBounds(mask,source);scannedPixels+=bounds.w*bounds.h;
    if(scannedPixels>40000000)throw new RangeError("residual text scan exceeds the page pixel budget");
    let plan=compileResidualTextMask(source,bounds,ink,exclusion);
    let contextExtension={accepted:false,reason:"not-needed"};
    if(plan.rejectedBoundaryPixels>0){
      const context=extendedTextContext(plan,source,textContexts),area=context.w*context.h;
      if(area>bounds.w*bounds.h){
        // Optional context is not permission to exceed the primitive's
        // unchanged region limit. Retain boundary rejection evidence so OCR
        // review can repair geometry; never trim or erase the clipped ink.
        if(area>262144){contextExtension={accepted:false,reason:"region-budget"};}
        else {
        if(scannedPixels+area>40000000)throw new RangeError("residual text scan exceeds the page pixel budget");
        const expanded=compileResidualTextMask(source,context,ink,exclusion);
        scannedPixels+=area;
        plan={...expanded,scannedPixels:plan.scannedPixels+expanded.scannedPixels};
        contextExtension={accepted:true,reason:"expanded"};
        }
      }
    }
    const finalBounds=plan.bounds;
    const overlaps=owners.filter(owner=>owner.bounds.x<finalBounds.x+finalBounds.w&&owner.bounds.y<finalBounds.y+finalBounds.h
      &&owner.bounds.x+owner.bounds.w>finalBounds.x&&owner.bounds.y+owner.bounds.h>finalBounds.y);
    plans.push({...plan,overlaps,contextExtension});
  }
  resolveTextPlanOverlaps(source,plans);
  restoreResidualNativeFillBackground(source,plans,40000000-scannedPixels);
  // Include context preparation in the same page allowance, not an extra
  // budget that is invisible to the final ownership audit.
  if(plans[0])plans[0].scannedPixels+=contextPixels;
  return plans;
}
/** @typedef {ReturnType<typeof residualTextPlans>[number]} Plan */
/** @param {Plan} plan @param {number} index @param {number} x @param {number} y */
function textBackgroundOwned(plan,index,x,y) {
  const color=plan.background.subarray(index*3,index*3+3);
  return plan.overlaps.some(owner=>pointInMask(x,y,owner.mask)&&(!owner.fill
    ||owner.fill.every((v,c)=>Math.abs(v-(color[c]??0))<=16)));
}
/** Text is restored against its measured background unless an independently
 * reconstructed object owns that background. Plans always read immutable source
 * pixels, so swapping overlapping text/panel masks cannot alter ownership.
 * @param {Raster} source @param {Raster} target @param {Plan[]} plans @param {boolean} transparent */
function eraseResidualTextPlans(source,target,plans,transparent) {
  for(const plan of plans)for(let i=0;i<plan.owned.length;i++) {
    if(!plan.owned[i])continue;
    const x=plan.bounds.x+i%plan.bounds.w,y=plan.bounds.y+Math.floor(i/plan.bounds.w),offset=(y*source.width+x)*4;
    const hole=transparent&&textBackgroundOwned(plan,i,x,y);
    for(let c=0;c<3;c++)target.rgba[offset+c]=hole?255:(plan.background[i*3+c]??0);
    target.rgba[offset+3]=hole?0:(source.rgba[offset+3]??255);
  }
}
module.exports={residualTextPlans,textBackgroundOwned,eraseResidualTextPlans};
