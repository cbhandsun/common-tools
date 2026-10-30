// @ts-check
"use strict";
const {prepareRegionProgramLabels,currentSceneAdmissionRejections}=require('./source-scene-region-program');
const {composeCompletedSceneSurfaces}=require('./source-scene-complete-surface-layers');
const {sceneRegionCompletionDiagnostics}=require('./source-scene-completion-diagnostics');
const {resolveSceneGlyphRecoveries,sceneGlyphRecoveryIcon}=require('./source-glyph-recovery');
const {sceneProgramRelationObservation}=require('./source-scene-program-obligations');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {{id?:string,source?:Record<string,unknown>,style?:Record<string,unknown>}} Output */
/** Commit proposed label drawing styles only after THIS compiler invocation
 * emitted the declared native members and their dependencies. The maps below
 * are local compilation results, never reconstructed from serialized source
 * flags, provider claims, object counts or a prior invocation's metadata.
 * This is a completion check, not new source-pixel or occlusion authority.
 * @template {{textBoxes:Parameters<typeof prepareRegionProgramLabels>[0]['textBoxes'],shapes:Output[],images:Output[]}} P
 * @param {{page:P,plan:Plan,slideSize:{widthPt:number,heightPt:number},preflight:boolean,
 * objects:Map<string,string[]>,relations:Map<string,string[]>,interiorParents:Set<string>,recoveries:import('./source-scene-inventory-materialization').Recovery[],
 * unresolved:{id:string,reason:string}[],labelEvidence:ReturnType<typeof prepareRegionProgramLabels>['evidence']}} input */
function completeRegionPrograms({page,plan,slideSize,preflight,objects,relations,interiorParents,recoveries,unresolved,labelEvidence}){
 const evidence={completed:0,staged:0,rejected:/** @type {{regionId:string,reason:string,missing:string[]}[]} */([])};
 const programs=plan.regionPrograms??[],regions=new Map(plan.regions.map(r=>[r.id,r]));
 // An explicit program scene promises coverage of every declared owner.
 // Missing/rejected programs must not disappear from the completion gate.
 // Legacy plans with no program contract retain their existing semantics.
 if(plan.regionPrograms!==undefined||plan.pendingRegionPrograms!==undefined)
  for(const region of plan.regions)if(!programs.some(p=>p.regionId===region.id))
   evidence.rejected.push({regionId:region.id,reason:'region-program-missing',missing:['region-program']});
 const frequencies=new Map();for(const shape of [...page.shapes,...page.textBoxes,...page.images])if(shape.id)frequencies.set(shape.id,(frequencies.get(shape.id)??0)+1);
 /** @param {Map<string,string[]>} receipts @param {string} id */
 const survives=(receipts,id)=>{const members=receipts.get(id);return !!members?.length&&members.every(member=>frequencies.get(member)===1);};
 /** Counts are derived from the same current-output receipts as completion. */
 const report=(/** @type {Set<string>} */completed)=>sceneRegionCompletionDiagnostics(plan,{
  objects:new Set([...objects.keys()].filter(id=>survives(objects,id))),
  relations:new Set([...relations.keys()].filter(id=>survives(relations,id))),completed},evidence.rejected,unresolved);
 const accepted=[],completeMembers=new Set();
 for(const program of programs){
  const missing=[];const owner=regions.get(program.regionId);
  if(labelEvidence.rejected.some(r=>r.regionId===program.regionId))missing.push('source-label-binding');
  if(owner&&['card','container'].includes(owner.kind)&&!survives(objects,owner.id))missing.push(owner.id);
  for(const id of program.objects){
   if(!survives(objects,id)||unresolved.some(r=>r.id===id))missing.push(id);
   const object=plan.objects.find(o=>o.id===id);
   if(object?.pictorialContent==='present'&&!interiorParents.has(id)&&!plan.objects.some(o=>o.parentObjectId===id&&o.kind==='icon'&&survives(objects,o.id)))
    missing.push(id+':pictorial');
  }
  for(const id of program.relations){
   const relation=plan.relations.find(r=>r.id===id);
   if(!survives(relations,id)||!relation||!survives(objects,relation.fromId)||!survives(objects,relation.toId)||unresolved.some(r=>r.id===id))missing.push(id);
  }
  // An independent census prevents a capped program list from declaring a
  // region complete by merely listing every *proposed* member. Null stays
  // unknown; missing members and rejected source evidence stay failures.
  const observed=plan.observedInventory?.find(o=>o.regionId===program.regionId);
  if(observed){
   const recovered=recoveries.filter(r=>r.regionId===program.regionId);
   for(const unit of recovered)if(unit.members.some(m=>m.type!=='shape'||frequencies.get(m.id)!==1))missing.push(unit.id);
   const containers=plan.objects.filter(o=>o.regionId===program.regionId&&o.kind==='container').length+recovered.filter(r=>r.kind==='container').length;
   const icons=plan.objects.filter(o=>o.regionId===program.regionId&&o.kind==='icon').length+recovered.filter(r=>r.kind==='icon').length;
   if(observed.containers===null||observed.containers!==containers)missing.push('observed-containers');
   if(observed.icons===null||observed.icons!==icons)missing.push('observed-icons');
   const relationCount=sceneProgramRelationObservation(plan,program.regionId);
   if(relationCount===null||relationCount!==program.relations.length)missing.push('observed-relations');
  }
  // A failed outer perimeter remains failed. Its independently completed
  // direct units can still compose their own source-proven opaque surfaces.
  if(!preflight&&missing.every(id=>id===owner?.id))completeMembers.add(program.regionId);
  if(missing.length){evidence.rejected.push({regionId:program.regionId,reason:'region-members-incomplete',missing:[...new Set(missing)]});continue;}
  if(preflight){evidence.staged++;continue;}
  accepted.push(program);evidence.completed++;
 }
 if(!accepted.length){
  const surfaceLayers=!preflight?composeCompletedSceneSurfaces(page.shapes,plan,new Set(),objects,completeMembers):{promoted:[]};
  return {page,evidence:{...evidence,surfaceLayers,...report(new Set())}};
 }
 const committed=prepareRegionProgramLabels(page,{...plan,regionPrograms:accepted},slideSize);
 // Grouping may split native text. Rebinding at the final boundary must
 // succeed as well; no stale prepared count is used as an output receipt.
 for(const rejected of committed.evidence.rejected){evidence.completed--;evidence.rejected.push({...rejected,missing:['final-label-binding']});}
 const completed=new Set(accepted.filter(p=>!committed.evidence.rejected.some(r=>r.regionId===p.regionId)).map(p=>p.regionId));
 for(const rejected of committed.evidence.rejected)completeMembers.delete(rejected.regionId);
 const surfaceLayers=composeCompletedSceneSurfaces(committed.page.shapes,plan,completed,objects,completeMembers);
 return {page:committed.page,evidence:{...evidence,surfaceLayers,...report(completed)}};
}
module.exports={completeRegionPrograms,prepareRegionProgramLabels,currentSceneAdmissionRejections,resolveSceneGlyphRecoveries,sceneGlyphRecoveryIcon};
