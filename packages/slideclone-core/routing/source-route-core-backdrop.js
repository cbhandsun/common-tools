// @ts-check
'use strict';
const {sourceCoreHalo}=require('./source-route-core-halo');
const {createCorePendingIndex}=require('./source-route-core-pending');
const {createCoreBackgroundPatches}=require('./source-route-background-patches');
const {createCoreBackgroundRanges}=require('./source-route-background-ranges');
const {searchAdditionalCoreBackground}=require('./source-route-background-search');
const {createCoreBackgroundConflicts}=require('./source-route-background-conflicts');
const {searchCoreBackgroundCorners}=require('./source-route-background-corners');
const {createMeasuredShaftContinuity}=require('./source-route-shaft-continuity');
const {createCoreBackgroundFields}=require('./source-route-background-fields');
/** Background observations for already measured core cells only. No fringe,
 * foreground ownership, node/port or erasure authority is created here.
 * @typedef {import('./source-route-antialias-background').Raster} Raster
 * @typedef {import('./source-route-antialias-background').Box} Box
 * @typedef {import('./source-route-antialias-background').Sample} Sample
 * @typedef {{corners:number[][],cx:number,cy:number,flank:number,verticalFlank:number}} Field
 */
const LIMIT=4000000;
/** A curved core has no repeated axis-aligned transverse profile. Observe
 * four independent 3x3 background patches around a bounded tile, then verify
 * the field against the entire visible exterior. Source samples within six
 * cells of measured ink are excluded, matching the existing outer-flank
 * sampling distance. Only original core cells may receive observations.
 * All dimensions, source bytes and masks come from the caller's private proof.
 * @param {{image:Raster,window:Box,component:Uint8Array,blocked:Uint8Array,
 * work:{checks:number},covered:ReadonlySet<number>}} input
 * @param {{shaft:Uint8Array,edges:unknown}} [measuredShaft] Private complete
 * source frame, supplied only after live source proof validation.
 * @returns {Sample[]|null} */
function observeSourceCoreBackdrop({image,window,component,blocked,work,covered},measuredShaft){
 /** @param {number} count */const charge=count=>{work.checks+=count;return work.checks<=LIMIT;};
 if(!charge(component.length))return null;
 if(!component.some((value,n)=>value&&!covered.has(n)&&!blocked[n]))return [];
 const measuredContinuation=measuredShaft?createMeasuredShaftContinuity({width:window.w,height:window.h,
  shaft:measuredShaft.shaft,edges:measuredShaft.edges,work}):null;
 if(measuredShaft&&!measuredContinuation)return null;
 /** @param {number} x @param {number} y */
 const index=(x,y)=>x<0||y<0||x>=window.w||y>=window.h?-1:y*window.w+x;
 /** @param {number} n */const globalCell=n=>(window.y+Math.floor(n/window.w))*image.width+window.x+n%window.w;
 const measuredHalo=sourceCoreHalo(component,window.w,window.h,work);if(!measuredHalo)return null;
 const halo=measuredHalo;
 const patchAt=createCoreBackgroundPatches({image,window,halo,blocked,work});
 /** @param {Field} field @param {number} x @param {number} y */
 const colorAt=(field,x,y)=>{
  const {cx,cy,flank,verticalFlank,corners}=field,u=(x-cx+flank)/(2*flank),v=(y-cy+verticalFlank)/(2*verticalFlank);
  return [0,1,2].map(c=>(corners[0]?.[c]??0)*(1-u)*(1-v)+(corners[1]?.[c]??0)*u*(1-v)
   +(corners[2]?.[c]??0)*(1-u)*v+(corners[3]?.[c]??0)*u*v);
 };
 const conflicts=createCoreBackgroundConflicts({image,window,component,blocked,halo,work,colorAt});
 const rangeAt=createCoreBackgroundRanges({image,window,component,blocked,halo,work,onConflict:conflicts.remember});
 /** @type {Map<string,Field|null>} */const fields=new Map();
 /** @type {ReturnType<typeof createCorePendingIndex>} */let pendingIndex=null;
 /** A different window must not hide contradictory source evidence already
  * observed for this tile. Missing or noisy samples and an insufficient fit
  * are unavailable; bodies, transparency and conflicting ink are refusals.
  * @type {Set<string>} */const refused=new Set();
 /** @param {number} cx @param {number} cy @returns {null} */
 const refuse=(cx,cy)=>{refused.add(cx+','+cy);return null;};
 const measureField=createCoreBackgroundFields({work,measure:measureUncachedField});
 /** @param {number} cx @param {number} cy @param {number} radius @param {number} verticalRadius @returns {Field|null} */
 function measureUncachedField(cx,cy,radius,verticalRadius){
  if(index(cx-radius,cy-verticalRadius)<0||index(cx+radius,cy+verticalRadius)<0)return null;
  const flank=radius-2,verticalFlank=verticalRadius-2;
  /** @type {number[][]} */const corners=[];
  for(const [dx=0,dy=0]of [[-flank,-verticalFlank],[flank,-verticalFlank],[-flank,verticalFlank],[flank,verticalFlank]]){
   const patch=patchAt(cx+dx,cy+dy);if(work.checks>LIMIT)return null;
   if(patch==='refused')return refuse(cx,cy);if(!patch)return null;corners.push(patch);
  }
  const field={corners,cx,cy,flank,verticalFlank};
  if(conflicts.rejects({field,radius,verticalRadius}))return refuse(cx,cy);if(work.checks>LIMIT)return null;
  let total=0,supported=0;
  for(let y=cy-verticalRadius;y<=cy+verticalRadius;y++){
   if(!charge(64))return null;
   const left=colorAt(field,cx-radius,y),right=colorAt(field,cx+radius,y);
   const step=right.map((value,c)=>(value-(left[c]??0))/(2*radius));
   for(let x=cx-radius;x<=cx+radius;){
    const end=Math.min(cx+radius,Math.floor(x/8)*8+7);
    const part=rangeAt({y,start:x,end,left,step,origin:cx-radius});
    if(work.checks>LIMIT||!part)return null;if(part==='refused')return refuse(cx,cy);
    total+=part.total;supported+=part.supported;x=end+1;
   }
  }
  if(total<200)return null;
  // Failure to establish this field does not contradict a neighboring field.
  // Every reused field must still pass its own complete exterior, 90% support
  // at tolerance three per channel, and the hard tolerance-eighteen checks.
  return supported/total>=.9?field:null;
 }
 /** @param {number} cx @param {number} cy @param {boolean} [shifted]
  * @param {boolean} [axialOnly] @returns {Field|null} */
 function fieldAt(cx,cy,shifted=false,axialOnly=false){
  const key=cx+','+cy;
  if(fields.has(key))return fields.get(key)??null;
  for(const [radius=0,verticalRadius=0]of axialOnly?(pendingIndex?.rectanglesAt(cx,cy)??[]):shifted?[[24,24],[20,20],...(pendingIndex?.rectanglesAt(cx,cy)??[])]:[[12,12],[20,20],[24,24]]){
   const field=measureField(cx,cy,radius,verticalRadius);
   if(work.checks>LIMIT)return null;
   if(field){fields.set(key,field);return field;}
  }
  fields.set(key,null);return null;
 }
 /** Retain the endpoint exclusion: a core must continue on both sides in
  * a local source frame. A short tip or disconnected pale patch cannot seed it.
  * @param {number} x @param {number} y */
 function continues(x,y){
  /** @param {number} dx @param {number} dy @param {number} sign */
  const arm=(dx,dy,sign)=>{
   for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){
    if(!charge(1))return false;
    const n=index(x+sign*dx*4+xx,y+sign*dy*4+yy);
    if(n>=0&&component[n])return true;
   }
   return false;
  };
  return [[1,0],[0,1],[1,1],[1,-1]].some(([dx=0,dy=0])=>arm(dx,dy,-1)&&arm(dx,dy,1));
 }
 /** A curved stroke's own measured path supplies its local source frame.
  * This supplements only continuity; every background field still needs the
  * same complete exterior proof. Heads and ordinary tips get no new witness.
  * @param {number} x @param {number} y @param {number} n */
 const supportedCore=(x,y,n)=>continues(x,y)||!!measuredContinuation?.(n);
 /** @type {Sample[]} */const rows=[];
 /** Cells whose own tile has no field can still be inside a neighboring
  * field already verified against its complete exterior. Defer them until
  * every measured tile has been observed; iteration order grants no paint.
  * @type {Set<number>} */const pending=new Set();
 for(let n=0;n<component.length;n++)if(component[n]&&!covered.has(n)&&!blocked[n]){
  if(!charge(1))return null;
  const x=n%window.w,y=Math.floor(n/window.w),field=fieldAt(Math.floor(x/8)*8+4,Math.floor(y/8)*8+4);
  if(work.checks>LIMIT)return null;
  if(!field){if(!refused.has(Math.floor(x/8)*8+4+','+(Math.floor(y/8)*8+4)))pending.add(n);continue;}
  if(!supportedCore(x,y,n)){if(work.checks>LIMIT)return null;continue;}
  rows.push({cell:globalCell(n),color:colorAt(field,x,y).map(Math.round)});
 }
 if(!pending.size)return rows;
 pendingIndex=createCorePendingIndex(pending,window.w,work);if(!pendingIndex)return null;
 /** Keep at least eight cells of verified context on every side, matching the
  * smallest original radius (12) minus a tile's maximum offset (4).
  * Conflicting independent fields permanently reject the pending cell.
  * @type {Map<number,number[]|null>} */const overlap=new Map();
 /** @param {Field} field @param {ReadonlySet<number>} [eligible] @returns {boolean} */
 function includeField(field,eligible=pending){
  const reach=field.flank-6,verticalReach=field.verticalFlank-6;
  for(const n of pendingIndex?.within(field.cx-reach,field.cy-verticalReach,field.cx+reach,field.cy+verticalReach)??[]){
   if(!eligible.has(n)||overlap.get(n)===null)continue;
   if(!charge(32))return false;
   const x=n%window.w,y=Math.floor(n/window.w);
   const color=colorAt(field,x,y).map(Math.round),prior=overlap.get(n);
   overlap.set(n,prior&&prior.some((value,c)=>Math.abs(value-(color[c]??0))>3)?null:prior??color);
  }
  return work.checks<=LIMIT;
 }
 for(const field of fields.values())if(field&&!includeField(field))return null;
 /** The regular tile's corners can all be unavailable on measured ink or
  * low background noise. Try the same complete field proof at the four
  * vertices of a second half-tile-shifted grid, only for still-unobserved
  * pending tiles. Neighboring original tiles share the same cached vertices.
  * A refused original tile or conflicting overlap never enters this search.
  * Prefer the largest existing complete window for reusable context. If it
  * cannot establish a field, the nested radius-20 window must independently
  * pass every corner and exterior check; no obstructed cell is interpolated
  * across. If both squares are unavailable, select a 24-by-12 or 12-by-24
  * field using only the number of pending cores within its context margin.
  * Its corners and full exterior must pass independently. Original-tile
  * refusals never enter this supplementary search.
  * Only after that grid, the two mixed phases try independently verified
  * narrow fields for remaining tiles. Stop a tile's supplementary search
  * once every pending cell in it is covered or permanently conflicted.
  * Every source sample and reused cell remains inside the original budget.
  * @param {boolean} [axialOnly] */
 function sampleShiftedTiles(axialOnly=false){
  const tried=new Set();
  for(const n of pending){
   if(!charge(1))return false;
   if(overlap.has(n))continue;
   const cx=Math.floor(n%window.w/8)*8+4,cy=Math.floor(Math.floor(n/window.w)/8)*8+4,key=cx+','+cy;
   if(tried.has(key))continue;tried.add(key);
   for(const [dx=0,dy=0]of axialOnly?[[0,-4],[0,4],[-4,0],[4,0]]:[[-4,-4],[-4,4],[4,-4],[4,4]]){
    if(!charge(1))return false;
    if(fields.has((cx+dx)+','+(cy+dy)))continue;
    const field=fieldAt(cx+dx,cy+dy,true,axialOnly);
    if(work.checks>LIMIT||field&&!includeField(field))return false;
    if(axialOnly&&field){
     let complete=true;
     for(const cell of pendingIndex?.within(cx-4,cy-4,cx+3,cy+3)??[]){
      if(!charge(1))return false;if(!overlap.has(cell)){complete=false;break;}
     }
     if(work.checks>LIMIT)return false;if(complete)break;
    }
   }
  }
  return true;
 }
 if(!sampleShiftedTiles()||!sampleShiftedTiles(true))return null;
 if(!searchAdditionalCoreBackground({pending,width:window.w,height:window.h,work,covered:overlap,measure:measureField,include:includeField}))return null;
 // New neighboring frames cannot hide hard refusals recorded by any older
 // grid for the target's own tile. Freeze eligibility before this search;
 // failed new frames must not make its result depend on traversal order.
 const supplementary=new Set();
 for(const n of pending){
  if(!charge(1))return null;
  const x=n%window.w,y=Math.floor(n/window.w);
  if(!refused.has(Math.floor(x/8)*8+4+','+(Math.floor(y/8)*8+4)))supplementary.add(n);
 }
 if(!searchCoreBackgroundCorners({pending:supplementary,width:window.w,height:window.h,work,covered:overlap,patch:patchAt,measure:measureField,
  include:field=>includeField(field,supplementary)}))return null;
 for(const [n,color]of overlap)if(color){
  if(!charge(1))return null;
  const x=n%window.w,y=Math.floor(n/window.w);
  if(supportedCore(x,y,n))rows.push({cell:globalCell(n),color});
  if(work.checks>LIMIT)return null;
 }
 return rows;
}
module.exports={observeSourceCoreBackdrop};
