// @ts-check
"use strict";
const {types}=require("node:util");
const {planSceneCropAtlas}=require("./source-scene-crop-atlas");
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{index:number,box:Box,contextBox?:Box|undefined,role:'review'|'missing'|'structure'|'inventory'|'probe'|'region-inventory'|'relation',optional:boolean,textKnown:boolean,labelCandidate?:true}} Target */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} v @returns {v is Box} */
function box(v){return record(v)&&[v.x,v.y,v.w,v.h].every(n=>typeof n==="number"&&Number.isFinite(n))
 &&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0;}
/** @param {Box} box @param {number} padding @param {number} width @param {number} height */
function window(box,padding,width,height){
 const x=Math.max(0,Math.floor(box.x-padding)),y=Math.max(0,Math.floor(box.y-padding));
 return {x,y,w:Math.min(width,Math.ceil(box.x+box.w+padding))-x,h:Math.min(height,Math.ceil(box.y+box.h+padding))-y};
}
/** @param {Target} target @param {number} ratio @param {number} width @param {number} height */
function crop(target,ratio,width,height){
 // Unknown glyphs need their surrounding surface in both independent views.
 // This only changes presentation: candidate identity and downstream source
 // authority stay fixed, and estimate/reserve charge these exact windows.
 const structural=target.role==='structure'||target.role==='inventory'||target.role==='probe'||target.role==='missing'&&!target.textKnown;
 const padding=target.role==='region-inventory'||target.role==='relation'?(ratio===0?0:.07):structural?Math.max(.35,ratio):ratio;
 const context=target.contextBox??target.box;
 // Context already includes the complete physical object/endpoints. Grow the
 // second observation by the target's scale, not by the much larger semantic
 // envelope; recursive context growth wastes the unchanged shared allowance.
 return window(context,Math.ceil(Math.max(target.box.w,target.box.h)*padding),width,height);
}
/** An oversized context must not cancel a legal complete candidate view.
 * Preserve legal context; otherwise show the entire candidate at original
 * resolution. Never trim a candidate, resize pixels or raise the unit cap.
 * The allocator and image preparation charge this same immutable window.
 * @param {unknown} input @returns {Box|null} */
function focusWindow(input){
 if(!record(input)||Object.keys(input).length!==4||typeof input.width!=='number'||typeof input.height!=='number'
  ||![input.width,input.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||input.width*input.height>40000000
  ||!box(input.candidateBox)||!box(input.cropBox))throw new TypeError('Scene focus window is invalid');
 const candidate=input.candidateBox,context=input.cropBox,width=input.width,height=input.height;
 if(![context.x,context.y,context.w,context.h].every(Number.isSafeInteger)||context.x+context.w>width||context.y+context.h>height
  ||candidate.x<context.x-1e-6||candidate.y<context.y-1e-6||candidate.x+candidate.w>context.x+context.w+1e-6
  ||candidate.y+candidate.h>context.y+context.h+1e-6)throw new TypeError('Scene focus window is invalid');
 if(context.w*context.h<=262144)return {x:context.x,y:context.y,w:context.w,h:context.h};
 const tight=window(candidate,0,width,height);
 return tight.w*tight.h<=262144?tight:null;
}
/** Use an actually observed context, retaining the existing single-window
 * bound. A larger second observation must not invalidate a legal first one.
 * @param {Target} target @param {number} width @param {number} height */
function graphicCrop(target,width,height){
 if(target.contextBox){const second=crop(target,.7,width,height);
  return second.w*second.h<=262144?second:crop(target,0,width,height);}
 return window(target.box,Math.max(2,Math.ceil(Math.min(target.box.w,target.box.h)*.35)),width,height);
}
/** Reserve the unchanged downstream scanners' worst possible charges. Model
 * responses cannot create more than two ink-color candidates or read outside
 * their transmitted source crops. Nothing here grants pixel ownership.
 * @param {Target[]} rows @param {number} width @param {number} height */
function reserve(rows,width,height){
 let pixels=0;
 for(const target of rows){
  if(target.role==='review'){
   const b=graphicCrop(target,width,height);
   if(b.w>=6&&b.h>=6&&b.w*b.h<=262144)pixels+=b.w*b.h;
  }else if(target.role==='missing'){
   const a=crop(target,0,width,height),b=crop(target,.7,width,height);
   const first=a.w*a.h<=262144?a.w*a.h:0,second=b.w*b.h<=262144?b.w*b.h:0;
   // The source alternatives scan inside the original physical owner, not
   // the larger presentation context. Local strokes and three-dot rows are
   // mutually exclusive; reserve the larger paired cost plus the legacy color
   // fallback before model calls. This is part of the same 4M allowance.
   const owner=window(target.box,0,width,height),area=owner.w*owner.h;
   const alternative=Math.max(8*Math.min(area,65536),6*Math.min(area,16384));
   pixels+=target.textKnown?first:2*(first+second)+alternative;
  }
 }
 return pixels;
}
/** @param {Target[]} rows @param {number} width @param {number} height */
function estimate(rows,width,height,spentPixels=0){
 let sheets=0;
 for(const ratio of [0,.7]){
  if(!rows.length)continue;
  const sizes=rows.map(t=>({index:t.index,...crop(t,ratio,width,height)}));
  try{const layout=planSceneCropAtlas(sizes);sheets+=layout.width*layout.height;}
  catch(error){if(!(error instanceof RangeError))throw error;return null;}
 }
 const reserved=reserve(rows,width,height);
 return sheets+reserved+spentPixels<=4000000?{sheetPixels:sheets,reservedPixels:reserved}:null;
}
/** Required OCR reviews, explicit missing text and selected contradictions
 * retain every slot. Only speculative discovery can be deferred BEFORE either
 * local call, and the unchanged final completion/visual gates remain decisive.
 * @param {unknown} input */
function allocateSourceSceneReview(input){
 if(!record(input)||typeof input.width!=='number'||typeof input.height!=='number'
  ||![input.width,input.height].every(Number.isSafeInteger)||input.width<1||input.height<1
  ||input.width>16384||input.height>16384||input.width*input.height>40000000
  ||!Array.isArray(input.targets)||types.isProxy(input.targets)||Object.getPrototypeOf(input.targets)!==Array.prototype
  ||input.targets.length>32||Reflect.ownKeys(input.targets).length!==input.targets.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(input.targets)).some(p=>!('value' in p)))throw new TypeError('Scene allocation source is invalid');
 const spentPixels=input.spentPixels??0;
 if(typeof spentPixels!=="number"||!Number.isSafeInteger(spentPixels)||spentPixels<0||spentPixels>4000000)throw new TypeError("Scene spent pixel budget is invalid");
 const width=input.width,height=input.height,seen=new Set();
 /** @type {Target[]} */const targets=input.targets.map(raw=>{
  if(!record(raw)||typeof raw.index!=='number'||!Number.isSafeInteger(raw.index)||raw.index<0||raw.index>=512||seen.has(raw.index)
   ||!box(raw.box)||raw.box.x+raw.box.w>width+1e-6||raw.box.y+raw.box.h>height+1e-6
   ||typeof raw.role!=='string'||!['review','missing','structure','inventory','probe','region-inventory','relation'].includes(raw.role)
   ||typeof raw.optional!=='boolean'||typeof raw.textKnown!=='boolean'
   ||raw.labelCandidate!==undefined&&(raw.labelCandidate!==true||raw.role!=='missing'||raw.textKnown)
   ||raw.optional&&(raw.role==='review'||raw.role==='structure'||raw.role==='missing'&&raw.textKnown))throw new TypeError('Scene allocation target is invalid');
  const context=raw.contextBox;
  if(context!==undefined&&(!['review','structure','region-inventory'].includes(raw.role)||!box(context)||context.x+context.w>width||context.y+context.h>height
   ||context.x>raw.box.x||context.y>raw.box.y||context.x+context.w<raw.box.x+raw.box.w||context.y+context.h<raw.box.y+raw.box.h))
   throw new TypeError('Scene allocation target context is invalid');
  seen.add(raw.index);return {index:raw.index,box:{...raw.box},...(context!==undefined?{contextBox:{.../** @type {Box} */(context)}}:{}),
   role:/** @type {Target['role']} */(raw.role),optional:raw.optional,textKnown:raw.textKnown,
   ...(raw.labelCandidate===true?{labelCandidate:/** @type {const} */(true)}:{})};
 });
 const selected=targets.filter(t=>!t.optional);
 if(!estimate(selected,width,height,spentPixels))throw new RangeError('Scene crop pixel budget exceeded by required review stages');
 // Target IDs bind observations to source crops; they are not priorities.
 // The planner numbers structural probes first, so an ID sort silently
 // undid its inventory reservation whenever the shared pixel budget filled.
 // Keep the admitted semantic order within each role (stable sort).
 // Preserve complete-object member observations through this FINAL budget
 // decision. Uncovered text-only units rank before speculative inventories;
 // they are still optional, charged in full and independently corroborated.
 // Unknown/icon glyph discovery keeps its old position after inventories.
 /** @param {Target} target */
 const priority=target=>target.role==='probe'?3:target.role==='missing'?(target.labelCandidate?0:2):1;
 const optional=targets.filter(t=>t.optional).sort((a,b)=>priority(a)-priority(b));
 /** @type {{index:number,role:string,reason:string}[]} */const deferred=[];
 for(const target of optional){
  const proposed=new Set([...selected,target].map(t=>t.index));
  if(estimate(targets.filter(t=>proposed.has(t.index)),width,height,spentPixels))selected.push(target);
  else deferred.push({index:target.index,role:target.role,reason:'optional-complete-stage-budget'});
 }
 const ids=new Set(selected.map(t=>t.index)),retained=targets.filter(t=>ids.has(t.index)),cost=estimate(retained,width,height,spentPixels);
 if(!cost)throw new RangeError('Scene crop pixel budget exceeded by required review stages');
 // Individual OCR views remove the atlas-coordinate attention bottleneck.
 // Add the COMPLETE review set only from remaining capacity; never displace
 // a retained target or reserve, and keep the original 32-image transport cap.
 const reviews=retained.filter(t=>t.role==='review');
 const windows=reviews.flatMap(t=>[0,.7].map(r=>crop(t,r,width,height)));
 const reviewPixels=windows.reduce((sum,b)=>sum+b.w*b.h,0);
 const focused=reviews.length>0&&reviews.length<32&&windows.every(b=>b.w*b.h<=262144)
  &&spentPixels+cost.sheetPixels+cost.reservedPixels+reviewPixels<=4000000;
 let focusPixels=focused?reviewPixels:0;
 /** @type {number[]} */const structureFocusIndices=[];
 // Structural contradictions need the same individual source views as OCR.
 // These are paired presentations of existing targets, never new observations,
 // scans or ownership. Preserve OCR views and all existing downstream reserves.
 const roles=['structure','relation','region-inventory','inventory','probe'];
 const structural=retained.filter(t=>roles.includes(t.role)).sort((a,b)=>roles.indexOf(a.role)-roles.indexOf(b.role));
 for(const target of structural){
  if((focused?reviews.length:0)+structureFocusIndices.length>=31)break;
  const views=[0,.7].map(r=>focusWindow({width,height,candidateBox:target.box,cropBox:crop(target,r,width,height)}));
  const extra=views.reduce((sum,b)=>sum+(b?b.w*b.h:0),0);
  if(views.some(b=>b===null)||spentPixels+cost.sheetPixels+cost.reservedPixels+focusPixels+extra>4000000)continue;
  structureFocusIndices.push(target.index);focusPixels+=extra;
 }
 return {indices:retained.map(t=>t.index),...cost,deferred,
  ...(focused?{focusIndices:reviews.map(t=>t.index)}:{}),
  ...(structureFocusIndices.length?{structureFocusIndices}:{}),
  ...(focused||structureFocusIndices.length?{focusPixels}:{})};
}
module.exports={allocateSourceSceneReview,sourceSceneReviewCrop:crop,sourceSceneReviewedGraphicCrop:graphicCrop,sourceSceneReviewFocusWindow:focusWindow};
