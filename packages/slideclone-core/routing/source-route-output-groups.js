// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {measuredSourceRouteGroupContext}=require('../scene-plan/source-scene-route');
const {sourceRaster}=require('../typography/residual-text-mask');
const {sharedOutputWork,chargeSharedOutput,sharedRouteOutputSnapshot}=require('./source-shared-route-output-snapshot');
const {sealMeasuredSceneGroups}=require('../scene-plan/source-scene-group-retention');
const {paintOrder}=require('../scene-plan/source-scene-group-paint');
const {paintConflict}=require('../scene-plan/source-scene-physical-groups');
/** @typedef {import('./source-shared-route-output-paint').Item} Item */
/** Compiler-local capability for ONE complete filled relation. It preserves
 * grouping only; it grants no paint, source reassignment, erasure or rerouting.
 */
function createSourceRouteOutputGroupRegistry(){
 /** @typedef {{fit:object,id:string,parts:Item[],snapshots:string[],checks:number,
  * slideSize:{widthPt:number,heightPt:number}}} Group */
 /** @type {WeakMap<object,Group>} */const outputs=new WeakMap();
 /** Only the actual compiler owns this closure. Every emitted part, including
  * the two physical attachment links, is captured together in its exact order.
  * @param {{fit:object,parts:Item[],slideSize:{widthPt:number,heightPt:number}}} input */
 function capture({fit,parts,slideSize}){
  const context=measuredSourceRouteGroupContext(fit);
  if(!context||!list(parts)||parts.length<2||parts.length>32||!record(slideSize)
   ||![slideSize.widthPt,slideSize.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000))return false;
  const work={checks:context.checks};
  const id=parts[0]?.source?.nativeComponentGroupId;
  if(typeof id!=='string'||!/^scene-route-[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(id)
   ||parts.some(p=>p.source?.nativeComponentGroupId!==id)||!chargeSharedOutput(work,parts.length))return false;
  const snapshots=parts.map(p=>sharedRouteOutputSnapshot(p,work));
  if(snapshots.some(s=>s===null))return false;
  const group={fit,id,parts:parts.slice(),snapshots:/** @type {string[]} */(snapshots),checks:work.checks,slideSize:{...slideSize}};
  for(const part of parts)outputs.set(part,group);
  return true;
 }
 /** Return the terminal counter so the subsequent shared-network stage uses
  * the SAME remaining group ledger, rather than restarting at its old value.
  * @param {unknown} image @param {unknown} page @param {unknown} checks */
 function seal(image,page,checks){
  const work={checks};
  if(!sharedOutputWork(work)||!record(page)||![page.shapes,page.images,page.textBoxes].every(a=>list(a)&&a.length<=10000&&a.every(record)))
   throw new TypeError('Scene route group controls are invalid');
  sourceRaster(image);
  const actual=/** @type {{shapes:Item[],images:Item[],textBoxes:Item[]}} */(page);
  const all=[...actual.shapes,...actual.images,...actual.textBoxes];
  const finish=/** @param {{id:string,members:Item[]}[]} groups */groups=>({
   token:sealMeasuredSceneGroups(actual,work.checks>4000000?[]:groups,Math.min(work.checks,4000000)),checks:Math.min(work.checks,4000000)});
  if(all.length>10000||!chargeSharedOutput(work,all.length*3))return finish([]);
  if(all.some(p=>!record(p.box)||![p.box.x,p.box.y,p.box.w,p.box.h].every(n=>typeof n==='number'&&Number.isFinite(n))
   ||p.source!==undefined&&!record(p.source)||p.style!==undefined&&!record(p.style)))throw new TypeError('Scene route group members are invalid');
  const counts=new Map(),identities=new Map();
  for(const item of all){counts.set(item.id,(counts.get(item.id)??0)+1);identities.set(item,(identities.get(item)??0)+1);}
  /** @type {{id:string,members:Item[]}[]} */const groups=[];
  const seen=new Set();
  for(const item of actual.shapes){
   const group=outputs.get(item);if(!group||seen.has(group))continue;seen.add(group);
   const context=measuredSourceRouteGroupContext(group.fit,image);if(!context)continue;
   work.checks=Math.max(work.checks,group.checks);
   if(!chargeSharedOutput(work,all.length+group.parts.length+context.nodes.length*all.length))break;
   if(group.parts.some((p,i)=>identities.get(p)!==1||counts.get(p.id)!==1||!actual.shapes.includes(p)
    ||sharedRouteOutputSnapshot(p,work)!==group.snapshots[i])
    ||all.some(p=>p.source?.nativeComponentGroupId===group.id&&!group.parts.includes(p)))continue;
   if(actual.shapes.filter(p=>group.parts.includes(p)).some((p,i)=>p!==group.parts[i]))continue;
   const sx=group.slideSize.widthPt/context.widthPx,sy=group.slideSize.heightPt/context.heightPx;
   if(context.nodes.some(node=>{
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
  return finish(groups);
 }
 return {capture,seal};
}
module.exports={createSourceRouteOutputGroupRegistry};
