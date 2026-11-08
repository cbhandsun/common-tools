// @ts-check
"use strict";
const {record,list,box:validBox}=require('./source-scene-group-containment');
const {sourceLabelIdentity}=require('./source-label-identity');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Box} Box */
/** Resolve label membership against immutable source geometry after parsing the
 * program. A unique innermost declared region can correct a misplaced wire
 * reference. Moving a reference discards its proposed style: geometry proves
 * membership, not font intent, glyph identity, paint or erasure authority.
 * Ambiguous, absent and straddling labels retain their original failed binding.
 * No reference, census entry, object or relation is removed to claim completion.
 * @param {Plan} plan @param {unknown} refsValue @param {unknown} boxesValue */
function reconcileSceneLabelLayout(plan,refsValue,boxesValue){
 if(!record(plan)||plan.version!==1||typeof plan.sourceHash!=='string'||! /^[a-f0-9]{64}$/u.test(plan.sourceHash)
  ||![plan.widthPx,plan.heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||plan.widthPx*plan.heightPx>40000000
  ||!list(plan.regions)||plan.regions.length>24||plan.regions.some(region=>!record(region)||typeof region.id!=='string'
   ||region.parentId!==null&&typeof region.parentId!=='string'||!validBox(region.box))
  ||!list(plan.regionPrograms)||plan.regionPrograms.length>24||plan.regionPrograms.some(program=>!record(program)||typeof program.regionId!=='string'
   ||!list(program.labels)||program.labels.length>32||program.labels.some(style=>!record(style)||!list(style.refs)||style.refs.length>512
    ||style.refs.some(ref=>typeof ref!=='string')))
  ||!list(refsValue)||!list(boxesValue)||refsValue.length>512||refsValue.length!==boxesValue.length)
  throw new TypeError('Scene label layout binding is invalid');
 const dimensions={widthPx:plan.widthPx,heightPx:plan.heightPx};
 /** @type {Map<string,Box>} */const boxes=new Map();
 for(let i=0;i<refsValue.length;i++){
  const ref=refsValue[i],box=boxesValue[i];
  if(typeof ref!=='string'||boxes.has(ref)||!validBox(box)||sourceLabelIdentity(box,dimensions)!==ref)
   throw new TypeError('Scene label layout source is invalid');
  boxes.set(ref,{...box});
 }
 const regions=new Map(plan.regions.map(region=>[region.id,region]));
 const programs=new Map(plan.regionPrograms.map(program=>[program.regionId,program]));
 if(regions.size!==plan.regions.length||programs.size!==plan.regionPrograms.length
  ||plan.regions.some(region=>region.parentId!==null&&!regions.has(region.parentId))
  ||plan.regionPrograms.some(program=>!regions.has(program.regionId)))throw new TypeError('Scene label layout owner is invalid');
 for(const region of plan.regions){
  const seen=new Set([region.id]);let parent=region.parentId;
  while(parent!==null){
   if(seen.has(parent))throw new TypeError('Scene label layout region cycle is invalid');
   seen.add(parent);const owner=regions.get(parent);if(!owner)throw new TypeError('Scene label layout owner is invalid');parent=owner.parentId;
  }
 }
 const declared=plan.regionPrograms.flatMap(program=>program.labels.flatMap(style=>style.refs));
 if(new Set(declared).size!==declared.length)throw new TypeError('Scene label layout reference is invalid');
 /** @param {string} parent @param {string} child */
 const ancestor=(parent,child)=>{
  const seen=new Set();let current=regions.get(child)?.parentId;
  while(current!==null&&current!==undefined){
   if(seen.has(current))throw new TypeError('Scene label layout region cycle is invalid');
   if(current===parent)return true;seen.add(current);current=regions.get(current)?.parentId;
  }return false;
 };
 /** @type {Map<string,Map<string,string>>} */const destinations=new Map();
 /** @type {Map<string,string[]>} */const arrivals=new Map();
 let reassigned=0,ambiguous=0,uncontained=0;
 for(const program of plan.regionPrograms){
  const moved=new Map();destinations.set(program.regionId,moved);
  for(const style of program.labels)for(const ref of style.refs){
   const box=boxes.get(ref);if(!box)throw new TypeError('Scene label layout reference is invalid');
   const containing=plan.regions.filter(region=>programs.has(region.id)&&box.x>=region.box.x&&box.y>=region.box.y
    &&box.x+box.w<=region.box.x+region.box.w+1e-6&&box.y+box.h<=region.box.y+region.box.h+1e-6);
   const owners=containing.filter(region=>!containing.some(child=>ancestor(region.id,child.id)));
   if(owners.length!==1){if(owners.length)ambiguous++;else uncontained++;continue;}
   const owner=owners[0];if(!owner)continue;
   // A broad ancestor is not a remedy for a label clipped across a child's
   // boundary. Preserve that unresolved binding for layout review instead of
   // relocating it to the page root merely because the root contains everything.
   if(plan.regions.some(region=>programs.has(region.id)&&ancestor(owner.id,region.id)
    &&box.x<region.box.x+region.box.w&&box.y<region.box.y+region.box.h
    &&box.x+box.w>region.box.x&&box.y+box.h>region.box.y)){ambiguous++;continue;}
   if(owner.id===program.regionId)continue;
   moved.set(ref,owner.id);const bucket=arrivals.get(owner.id)??[];bucket.push(ref);arrivals.set(owner.id,bucket);reassigned++;
  }
 }
 const regionPrograms=plan.regionPrograms.map(program=>{
  const moved=destinations.get(program.regionId),arrived=arrivals.get(program.regionId);
  const labels=program.labels.map(style=>({...style,refs:style.refs.filter(ref=>!moved?.has(ref))})).filter(style=>style.refs.length>0);
  if(arrived?.length)labels.push({refs:arrived});
  if(labels.length>32)throw new RangeError('Scene label layout style capacity exceeded');
  return {...program,labels};
 });
 return {...plan,regionPrograms,regionLabelLayout:{reassigned,ambiguous,uncontained}};
}
module.exports={reconcileSceneLabelLayout};
