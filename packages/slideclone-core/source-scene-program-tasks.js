// @ts-check
'use strict';
const crypto=require('node:crypto');
const {record,list,box}=require('./source-scene-group-containment');
const {sourceLabelIdentity}=require('./source-label-identity');
const {pendingSceneProgramObligations}=require('./source-scene-program-obligations');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{sourceHash:string,widthPx:number,heightPx:number,regionId:string,revision:string,objects:string[],relations:string[],labels:{index:number,ref:string,box:Box}[],labelsComplete:boolean}} ProgramTask */
/** Bound plain-data traversal before hashing, never invoking provider accessors.
 * @param {unknown} value @param {{remaining:number}} work @returns {boolean} */
function plain(value,work){
 /** @type {{value:unknown,leave?:boolean}[]} */const pending=[{value}],active=new Set();
 while(pending.length){const item=pending.pop();if(!item)return false;const row=item.value;
  if(item.leave){active.delete(row);continue;}if(--work.remaining<0)return false;
  if(row===undefined||row===null||typeof row==='boolean'||typeof row==='string')continue;
  if(typeof row==='number'){if(!Number.isFinite(row))return false;continue;}
  if(active.has(row))return false;
  const children=list(row)?row:record(row)?Object.values(row):null;if(!children||children.length>work.remaining)return false;
  active.add(row);pending.push({value:row,leave:true});for(const child of children)pending.push({value:child});
 }
 return true;
}
/** @param {Plan} plan */
function validateFrame(plan){
 if(!record(plan)||!plain(plan,{remaining:100000})||plan.version!==1||typeof plan.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(plan.sourceHash)
  ||![plan.widthPx,plan.heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||plan.widthPx*plan.heightPx>40000000
  ||!list(plan.regions)||plan.regions.length>24||plan.regions.some(r=>!record(r)||typeof r.id!=='string'||!box(r.box)||r.parentId!==null&&typeof r.parentId!=='string')
  ||!list(plan.objects)||plan.objects.length>96||plan.objects.some(o=>!record(o)||typeof o.id!=='string'||typeof o.regionId!=='string'||!box(o.box))
  ||!list(plan.relations)||plan.relations.length>48||plan.relations.some(r=>!record(r)||typeof r.id!=='string'||typeof r.regionId!=='string'))throw new TypeError('Scene program task frame is invalid');
 const ids=new Set(plan.regions.map(r=>r.id));
 if(ids.size!==plan.regions.length||new Set(plan.objects.map(o=>o.id)).size!==plan.objects.length||new Set(plan.relations.map(r=>r.id)).size!==plan.relations.length
  ||plan.regions.some(r=>r.parentId!==null&&!ids.has(r.parentId))||[...plan.objects,...plan.relations].some(row=>!ids.has(row.regionId)))throw new TypeError('Scene program task inventory is invalid');
 for(const region of plan.regions){const seen=new Set([region.id]);let at=region.parentId;
  while(at!==null){if(seen.has(at))throw new TypeError('Scene program task ancestry is invalid');seen.add(at);at=plan.regions.find(r=>r.id===at)?.parentId??null;}
 }
}
/** The revision covers the immutable owner tree, direct members and endpoint
 * bodies. Local additions are mapped separately; source snapshots are never
 * completion, drawing, or erasure receipts.
 * @param {Plan} plan @param {string} regionId */
function sceneProgramTaskRevision(plan,regionId){
 validateFrame(plan);if(!plan.regions.some(r=>r.id===regionId))throw new TypeError('Scene program task owner is invalid');
 const objects=plan.objects.filter(o=>o.regionId===regionId),relations=plan.relations.filter(r=>r.regionId===regionId);
 const endpoints=new Set(relations.flatMap(r=>[r.fromId,r.toId]));
 return crypto.createHash('sha256').update(JSON.stringify({sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,regions:plan.regions,
  objects,relations,endpoints:[...plan.objects,...(plan.textEndpoints??[])].filter(o=>endpoints.has(o.id))})).digest('hex');
}
/** @param {Box} outer @param {Box} inner */
function contains(outer,inner){return inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.w<=outer.x+outer.w+1e-6&&inner.y+inner.h<=outer.y+outer.h+1e-6;}
/** Select only explicit program obligations; legacy scenes which never proposed
 * programs retain their original contract. Retained templates continue through
 * restore, not a second generator that could erase their failed dependencies.
 * @param {Plan|undefined} plan @param {unknown} sourceLabels @returns {ProgramTask[]} */
function sceneProgramTasks(plan,sourceLabels){
 if(plan===undefined)return [];
 validateFrame(plan);if(plan.regionPrograms===undefined)return [];
 if(!list(plan.regionPrograms)||plan.regionPrograms.length>24||plan.regionPrograms.some(p=>!record(p)||typeof p.regionId!=='string')
  ||new Set(plan.regionPrograms.map(p=>p.regionId)).size!==plan.regionPrograms.length||plan.regionPrograms.some(p=>!plan.regions.some(r=>r.id===p.regionId)))throw new TypeError('Scene program task programs are invalid');
 if(!list(sourceLabels)||sourceLabels.length>512||sourceLabels.some(line=>!record(line)||!box(line.box)||line.box.x+line.box.w>plan.widthPx||line.box.y+line.box.h>plan.heightPx))throw new TypeError('Scene program task labels are invalid');
 const labels=sourceLabels.map((line,index)=>{
  if(!record(line)||!box(line.box))throw new TypeError('Scene program task labels are invalid');
  return {index,ref:sourceLabelIdentity(line.box,{widthPx:plan.widthPx,heightPx:plan.heightPx}),box:{...line.box}};
 });
 if(new Set(labels.map(label=>label.ref)).size!==labels.length)throw new TypeError('Scene program task labels are ambiguous');
 /** @param {string} parent @param {string} child */
 const ancestor=(parent,child)=>{let at=plan.regions.find(r=>r.id===child)?.parentId;
  while(at!==null&&at!==undefined){if(at===parent)return true;at=plan.regions.find(r=>r.id===at)?.parentId;}return false;};
 const owners=labels.map(label=>{
  const containing=plan.regions.filter(r=>contains(r.box,label.box));
  const inner=containing.filter(r=>!containing.some(child=>ancestor(r.id,child.id)));
  const owner=inner.length===1?inner[0]:undefined;
  const straddles=owner&&plan.regions.some(r=>ancestor(owner.id,r.id)&&label.box.x<r.box.x+r.box.w&&label.box.y<r.box.y+r.box.h&&label.box.x+label.box.w>r.box.x&&label.box.y+label.box.h>r.box.y);
  return straddles?undefined:owner;
 });
 const pending=new Set(pendingSceneProgramObligations(plan).map(row=>row.program.regionId));
 return plan.regions.filter(r=>!plan.regionPrograms?.some(p=>p.regionId===r.id)&&!pending.has(r.id)).map(region=>({sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,regionId:region.id,
  revision:sceneProgramTaskRevision(plan,region.id),objects:plan.objects.filter(o=>o.regionId===region.id).map(o=>o.id),relations:plan.relations.filter(r=>r.regionId===region.id).map(r=>r.id),
  labels:labels.filter((_,index)=>owners[index]?.id===region.id),labelsComplete:labels.every((label,index)=>owners[index]!==undefined||!(label.box.x<region.box.x+region.box.w&&label.box.y<region.box.y+region.box.h&&label.box.x+label.box.w>region.box.x&&label.box.y+label.box.h>region.box.y))}));
}
/** @param {{index:number,programTask?:ProgramTask,programOnly?:boolean}[]} targets */
function sceneRegionalProgramBindings(targets){
 const rows=targets.filter(t=>t.programTask).map(t=>{const task=t.programTask;if(!task)throw new TypeError('Scene program task is invalid');
  return [String(t.index),{objects:[...task.objects],relations:[...task.relations],labels:task.labels.map(label=>label.index),allowNewMembers:t.programOnly!==true}];});
 return rows.length?{regionProgramBindings:Object.fromEntries(rows)}:{};
}
module.exports={sceneProgramTasks,sceneProgramTaskRevision,sceneRegionalProgramBindings};
