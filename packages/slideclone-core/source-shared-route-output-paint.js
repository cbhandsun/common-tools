// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
const {types}=require('node:util');
const {sharedOutputWork,chargeSharedOutput,sharedOutputRecord,sharedOutputList,sharedRouteOutputSnapshot}=require('./source-shared-route-output-snapshot');
const {hasSharedSourceRoute,sharedSourcePaintCells}=require('./source-shared-route-measurement');
/** @typedef {{id?:string,type?:string,box:{x:number,y:number,w:number,h:number},style?:Record<string,unknown>,source?:Record<string,unknown>}} Item */
/** @typedef {{item:Item,cells:Set<number>,heads:{point:{x:number,y:number},vector:{x:number,y:number},kind:string}[]}} SharedPaintProof */
/** Each compiler instance owns its registry. Only its capture closure can
 * associate outputs with a private measured tree; copies and other registry
 * instances cannot manufacture an entry in that compiler's reader.
 */
function createSharedRouteOutputPaintRegistry(){
 /** @typedef {{fit:NonNullable<ReturnType<typeof import('./source-shared-route-measurement').measureSharedSourceRoute>['fit']>,
  * parts:Item[],snapshots:Map<Item,string>,slideSize:{widthPt:number,heightPt:number}}} Group */
 /** @type {WeakMap<object,Group>} */const outputs=new WeakMap();
 /** @param {{fit:Group['fit'],image:import('./png').PngImage,parts:Item[],slideSize:Group['slideSize'],work:import('./source-shared-route-output-snapshot').Work}} input */
 function capture({fit,image,parts,slideSize,work}){

  if(!sharedOutputWork(work)||!hasSharedSourceRoute(fit,image)||!sharedOutputList(parts,work)||parts.length>Math.max(32,fit.cuts.length*20)||!parts.length
   ||!record(slideSize)||![slideSize.widthPt,slideSize.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0))throw new TypeError('Scene shared paint output is invalid');
  const snapshots=new Map();
  for(const [idx,part] of parts.entries()){
    const value=sharedRouteOutputSnapshot(part,work);
    if(value===null){
      
      throw new TypeError(work.checks>4000000?'Scene shared path budget is invalid':'Scene shared paint snapshot is invalid');
    }
    snapshots.set(part,value);
  }
  const group={fit,parts:parts.slice(),snapshots,slideSize:{...slideSize}};
  for(const part of parts)outputs.set(part,group);
 }
 /** All emitted members and unique real endpoints must still be present.
  * Neither one surviving edge nor metadata for a missing tree grants paint.
  * @param {unknown} image @param {unknown} shapes @param {unknown} work
  * @returns {SharedPaintProof[]} */
 function read(image,shapes,work){
  if(!record(image)||![image.width,image.height].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0)
   ||!sharedOutputWork(work)||!Array.isArray(shapes)||types.isProxy(shapes)||shapes.length>10000)
   throw new TypeError('Scene shared paint read controls are invalid');
  if(!sharedOutputList(shapes,work)){if(work.checks>4000000)return [];throw new TypeError('Scene shared paint read members are invalid');}
  const rows=/** @type {Item[]} */(shapes),seen=new Set(),counts=new Map(),identities=new Map(),byId=new Map();
  for(const row of rows){
   if(!sharedOutputRecord(row,work)||!sharedOutputRecord(row.box,work)
    ||![row.box.x,row.box.y,row.box.w,row.box.h].every(value=>typeof value==='number'&&Number.isFinite(value))){
    if(work.checks>4000000)return [];throw new TypeError('Scene shared paint read geometry is invalid');
   }
   if(!chargeSharedOutput(work,3))return [];
   counts.set(row.id,(counts.get(row.id)??0)+1);identities.set(row,(identities.get(row)??0)+1);byId.set(row.id,row);
  }
  /** @type {SharedPaintProof[]} */const proofs=[];
  for(const row of rows){
   if(!chargeSharedOutput(work,1))return [];
   const group=outputs.get(row);if(!group||seen.has(group))continue;seen.add(group);
   if(!chargeSharedOutput(work,group.parts.length+group.fit.nodes.length*5))return [];
   if(!hasSharedSourceRoute(group.fit,/** @type {import('./png').PngImage} */(image))
    ||group.parts.some(part=>identities.get(part)!==1||counts.get(part.id)!==1||sharedRouteOutputSnapshot(part,work)!==group.snapshots.get(part))){
    if(work.checks>4000000)return [];continue;
   }
   const sx=group.slideSize.widthPt/ /** @type {number} */(image.width),sy=group.slideSize.heightPt/ /** @type {number} */(image.height);
   if(group.fit.nodes.some(node=>{
    const actual=byId.get(node.id);
    return counts.get(node.id)!==1||!actual||!['x','y','w','h'].every(key=>{
     const field=/** @type {'x'|'y'|'w'|'h'} */(key),scale=field==='x'||field==='w'?sx:sy;
     return Math.abs(actual.box[field]-node.box[field]*scale)<=1e-6;
    });
   }))continue;
   const cells=sharedSourcePaintCells(group.fit,image,work);if(!cells)return work.checks>4000000?[]:proofs;
   /** @type {SharedPaintProof['heads']} */const heads=[];
   for(const part of group.parts){
    if(!chargeSharedOutput(work,3))return [];
    if(part.type!=='line')continue;
     const b=part.box,vector={x:b.w/sx,y:b.h/sy};
     // A native elbow's heads follow its first/last leg, not the chord.
     const route=Array.isArray(part.source?.nativeRoutePoints)?/** @type {{x:number,y:number}[]} */(part.source.nativeRoutePoints):null;
     const leg=(/** @type {boolean} */end)=>{
      if(!route||route.length<2)return end?vector:{x:-vector.x,y:-vector.y};
      const from=/** @type {{x:number,y:number}} */(route[end?route.length-2:1]),to=/** @type {{x:number,y:number}} */(route[end?route.length-1:0]);
      return {x:(to.x-from.x)/sx,y:(to.y-from.y)/sy};
     };
     for(const key of ['startArrow','endArrow'])if(typeof part.style?.[key]==='string'&&part.style[key]!=='none'){
      const end=key==='endArrow';heads.push({kind:/** @type {string} */(part.style[key]),
       point:{x:(b.x+(end?b.w:0))/sx,y:(b.y+(end?b.h:0))/sy},vector:leg(end)});
    }
   }
   const item=group.parts.find(part=>part.type==='line');if(item)proofs.push({item,cells,heads});
  }
  return proofs;
 }
 return {capture,read};
}
module.exports={createSharedRouteOutputPaintRegistry};
