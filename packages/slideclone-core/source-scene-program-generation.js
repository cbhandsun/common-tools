// @ts-check
'use strict';
const {admitGeneratedRegionPrograms}=require('./source-scene-region-program');
const {sceneProgramTaskRevision}=require('./source-scene-program-tasks');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-program-contract').ProgramObservation} Observation */
/** @typedef {{second:number,id:string}} Match */
/** @typedef {{objects:Map<number,Match>,relations:Map<number,Match>}} MemberMatches */
/** Match styles by original OCR identity, independent of row/group order.
 * @param {Observation} program */
function styleSignature(program){return JSON.stringify(program.labels.flatMap(({refs,...style})=>refs.map(ref=>({ref,...style}))).sort((a,b)=>a.ref-b.ref));}
/** @param {(string|number)[]} refs @param {Map<number,Match>} matches @param {boolean} second */
function members(refs,matches,second){
 const result=refs.map(ref=>typeof ref==='string'?ref:second?[...matches.values()].find(row=>row.second===ref)?.id:matches.get(ref)?.id);
 if(result.some(ref=>ref===undefined)||new Set(result).size!==result.length)return null;
 return /** @type {string[]} */(result).slice().sort();
}
/** Generate only complete programs proposed independently in this source-bound
 * pair. This is admission, not compilation or a receipt for completing a region.
 * Kept failures are never cleared, and no recovery marker is manufactured.
 * @param {{previous:Plan,next:Plan,targets:import('./source-scene-regional-inventory').Target[],
 * observations:import('./source-scene-regional-inventory').Observation[][],matches:Map<number,MemberMatches>}} input */
function applySceneGeneratedPrograms({previous,next,targets,observations,matches}){
 const evidence={requested:0,admitted:0,rejected:/** @type {{regionId:string,reason:string}[]} */([])};
 let plan=next;
 for(const target of targets){
  const task=target.programTask;if(!task)continue;evidence.requested++;
  /** @param {string} reason */const decline=reason=>evidence.rejected.push({regionId:task.regionId,reason});
  if(task.sourceHash!==previous.sourceHash||task.widthPx!==previous.widthPx||task.heightPx!==previous.heightPx||task.regionId!==target.regionId
   ||task.sourceHash!==next.sourceHash||task.widthPx!==next.widthPx||task.heightPx!==next.heightPx
   ||task.revision!==sceneProgramTaskRevision(previous,task.regionId)){decline('program-task-changed');continue;}
  if(!task.labelsComplete){decline('program-label-owner-ambiguous');continue;}
  const a=observations[0]?.find(row=>row.index===target.index)?.program,b=observations[1]?.find(row=>row.index===target.index)?.program;
  const match=matches.get(target.index);
  if(!a||!b||!match||styleSignature(a)!==styleSignature(b)){decline('program-observation-consensus');continue;}
  const objects=members(a.objects,match.objects,false),otherObjects=members(b.objects,match.objects,true),relations=members(a.relations,match.relations,false),otherRelations=members(b.relations,match.relations,true);
  if(!objects||!relations||JSON.stringify(objects)!==JSON.stringify(otherObjects)||JSON.stringify(relations)!==JSON.stringify(otherRelations)){decline('program-member-consensus');continue;}
  const labels=a.labels.map(style=>({...style,refs:style.refs.map(index=>task.labels.find(label=>label.index===index)?.ref)}));
  if(labels.some(style=>style.refs.some(ref=>ref===undefined))){decline('program-source-label-binding');continue;}
  try{
   plan=admitGeneratedRegionPrograms(plan,[{regionId:task.regionId,objects,relations,labels:/** @type {import('./source-scene-region-program').LabelStyle[]} */(labels)}]);evidence.admitted++;
  }catch(error){
   if(!(error instanceof TypeError))throw error;
   decline('program-complete-admission');
  }
 }
 return {plan,evidence};
}
module.exports={applySceneGeneratedPrograms};
