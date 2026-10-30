// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {hasSharedSourceRoute}=require('./source-shared-route-measurement');
const {sharedOutputWork,chargeSharedOutput,sharedRouteOutputSnapshot}=require('./source-shared-route-output-snapshot');
const {sealMeasuredSceneGroups}=require('../scene-plan/source-scene-group-retention');
const {paintOrder}=require('../scene-plan/source-scene-group-paint');
const {paintConflict}=require('../scene-plan/source-scene-physical-groups');
const {sourceRaster}=require('../typography/residual-text-mask');
/** @typedef {import('./source-shared-route-output-paint').Item} Item */
/** A compiler-local registry binds the complete emitted network, including its
 * invisible junction controls. Serialized graph/group IDs grant no receipt.
 * This capability retains grouping only; it adds no paint or erasure rights.
 */
function createSharedRouteOutputGroupRegistry(){
 /** @typedef {{fit:NonNullable<ReturnType<typeof import('./source-shared-route-measurement').measureSharedSourceRoute>['fit']>,
  * id:string,parts:Item[],snapshots:(string|null)[],slideSize:{widthPt:number,heightPt:number}}} Group */
 /** @type {WeakMap<object,Group>} */const outputs=new WeakMap();
 /** Called by the actual compiler after its complete topology/paint binding.
  * Reuse the exact bounded paint-producer snapshots; serializing the same
  * network twice can exhaust its original shared geometry allowance.
  * @param {{fit:Group['fit'],image:import('../png').PngImage,parts:Item[],snapshots:Map<Item,string>,slideSize:Group['slideSize'],work:import('./source-shared-route-output-snapshot').Work}} input */
 function capture({fit,image,parts,snapshots:paintSnapshots,slideSize,work}){
  if(!sharedOutputWork(work)||!hasSharedSourceRoute(fit,image)||!list(parts)||!parts.length
   ||parts.length>Math.max(32,fit.cuts.length*20))throw new TypeError('Scene shared group output is invalid');
  const id=parts[0]?.source?.nativeComponentGroupId;
  if(typeof id!=='string'||!/^scene-network-[A-Za-z][A-Za-z0-9_-]{0,39}$/u.test(id)
   ||parts.some(p=>p.source?.nativeComponentGroupId!==id))throw new TypeError('Scene shared group identity is invalid');
  if(!chargeSharedOutput(work,parts.length))throw new TypeError('Scene shared path budget is invalid');
  const snapshots=parts.map(p=>paintSnapshots.get(p)??null);
  if(snapshots.some(s=>s===null))throw new TypeError('Scene shared group snapshot is invalid');
  const group={fit,id,parts:parts.slice(),snapshots,slideSize:{...slideSize}};
  for(const part of parts)outputs.set(part,group);
 }
 /** Final source binding checks the full roster and unchanged external ports.
  * The common retention stage still verifies actual writer paint order after
  * all other rejected hybrid groups have been removed.
  * @param {unknown} image @param {unknown} page @param {unknown} checks */
 function seal(image,page,checks){
  const work={checks};
  if(!sharedOutputWork(work)||!record(image)||!record(page)||![page.shapes,page.images,page.textBoxes].every(a=>list(a)&&a.length<=10000&&a.every(record)))
   throw new TypeError('Scene shared group controls are invalid');
  sourceRaster(image);
  const actual=/** @type {{shapes:Item[],images:Item[],textBoxes:Item[]}} */(page);
  const all=[...actual.shapes,...actual.images,...actual.textBoxes];
  if(all.length>10000||!chargeSharedOutput(work,all.length*3))return sealMeasuredSceneGroups(actual,[],4000000);
  if(all.some(p=>!record(p.box)||![p.box.x,p.box.y,p.box.w,p.box.h].every(n=>typeof n==='number'&&Number.isFinite(n))
   ||p.source!==undefined&&!record(p.source)||p.style!==undefined&&!record(p.style)))throw new TypeError('Scene shared group members are invalid');
  const counts=new Map(),identities=new Map();
  for(const item of all){counts.set(item.id,(counts.get(item.id)??0)+1);identities.set(item,(identities.get(item)??0)+1);}
  /** @type {{id:string,members:Item[]}[]} */const groups=[];
  const seen=new Set();
  for(const item of actual.shapes){
   const group=outputs.get(item);if(!group||seen.has(group))continue;seen.add(group);
   if(!hasSharedSourceRoute(group.fit,/** @type {import('../png').PngImage} */(image)))continue;
   if(!chargeSharedOutput(work,all.length+group.parts.length+group.fit.nodes.length*all.length))break;
   if(group.parts.some((p,i)=>identities.get(p)!==1||counts.get(p.id)!==1||!actual.shapes.includes(p)
    ||sharedRouteOutputSnapshot(p,work)!==group.snapshots[i])
    ||all.some(p=>p.source?.nativeComponentGroupId===group.id&&!group.parts.includes(p)))continue;
   if(actual.shapes.filter(p=>group.parts.includes(p)).some((p,i)=>p!==group.parts[i]))continue;
   const sx=group.slideSize.widthPt/ /** @type {number} */(image.width),sy=group.slideSize.heightPt/ /** @type {number} */(image.height);
   if(group.fit.nodes.some(node=>{
    const target=all.find(p=>p.id===node.id);
    return counts.get(node.id)!==1||!target||!record(target.box)||!['x','y','w','h'].every(key=>{
     const field=/** @type {'x'|'y'|'w'|'h'} */(key),scale=field==='x'||field==='w'?sx:sy;
     return typeof target.box[field]==='number'&&Math.abs(target.box[field]-node.box[field]*scale)<=1e-6;
    });
   }))continue;
   const before=paintOrder(actual.shapes,actual.images,actual.textBoxes,new Map(group.parts.map(p=>[p,'']))),
    after=paintOrder(actual.shapes,actual.images,actual.textBoxes),geometry={used:work.checks,exhausted:false};
   const conflict=group.parts.some(moved=>all.some(other=>{
    if(++geometry.used>4000000){geometry.exhausted=true;return true;}
    return Math.sign((before.get(moved)??-1)-(before.get(other)??-1))!==Math.sign((after.get(moved)??-1)-(after.get(other)??-1))
     &&paintConflict(moved,other,geometry);
   }));
   work.checks=geometry.used;
   if(conflict||geometry.exhausted)continue;
   groups.push({id:group.id,members:group.parts});
  }
  return sealMeasuredSceneGroups(actual,work.checks>4000000?[]:groups,Math.min(work.checks,4000000));
 }
 return {capture,seal};
}
module.exports={createSharedRouteOutputGroupRegistry};
