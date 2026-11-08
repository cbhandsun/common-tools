// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {sceneProgramTasks}=require('./source-scene-program-tasks');
const {pendingSceneProgramObligations}=require('./source-scene-program-obligations');
const {sceneRejectedRelationCandidates,sceneRelationLocalizations}=require('./source-scene-rejected-relations');
const {sceneObjectBatches}=require('./source-scene-object-batches');
const {sceneRelationBatches}=require('./source-scene-relation-batches');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {{regionId:string,mode:'program-generation'|'restore-template'|'review-retained-relations'|'reobserve-relation-location'|'source-revision-required',missingObjects:string[],missingRelations:string[]}} RecoveryOwner */
/** Describe the next legitimate recovery route without inventing a relation,
 * changing a pending template, clearing a rejection, or inserting model calls.
 * Missing trusted geometry requires a new source observation; it cannot be
 * recovered by retrying a template whose absent dependency has no safe core.
 * @param {Plan|undefined} plan */
function sourceSceneRecoveryState(plan){
 /** @type {RecoveryOwner[]} */const owners=[];
 if(plan===undefined)return {requiresNewRevision:false,owners};
 // Reuse the bounded plain-data/source/owner validation before reading any
 // persisted controls. Empty labels here inspect control flow, not coverage.
 const generation=sceneProgramTasks(plan,[]),pending=pendingSceneProgramObligations(plan);
 const aliases=sceneObjectBatches(plan)?.aliases??[],retained=sceneRejectedRelationCandidates(plan),localizations=sceneRelationLocalizations(plan);
 sceneRelationBatches(plan);
 for(const region of plan.regions){
  const tasks=pending.filter(row=>row.program.regionId===region.id);
  for(const task of tasks){
   const missingObjects=task.program.objects.filter(id=>!plan.objects.some(o=>o.id===(aliases.find(a=>a.id===id)?.canonicalId??id)));
   const missingRelations=task.program.relations.filter(id=>!plan.relations.some(r=>r.id===id));
   const unsafe=missingObjects.length>0||missingRelations.some(id=>!retained.some(row=>row.relation.id===id)&&!localizations.some(row=>row.core.id===id));
   owners.push({regionId:region.id,mode:unsafe?'source-revision-required':missingRelations.some(id=>localizations.some(row=>row.core.id===id))?'reobserve-relation-location':missingRelations.length?'review-retained-relations':'restore-template',missingObjects,missingRelations});
  }
  if(!tasks.length&&generation.some(row=>row.regionId===region.id))
   owners.push({regionId:region.id,mode:'program-generation',missingObjects:[],missingRelations:[]});
 }
 return {requiresNewRevision:owners.some(row=>row.mode==='source-revision-required'),owners};
}
/** Only arities and fixed transport codes leave this diagnostic boundary.
 * Provider strings, coordinates, content, keys and exception messages are not
 * copied. This does not retain a proposal core or grant any recovery authority.
 * @param {unknown} proposal @param {Plan|undefined} plan */
function sourceSceneRejectedTupleShapes(proposal,plan){
 /** @type {{index:number,format:string,tupleLength:number|null,arrays:{index:number,length:number,children:{index:number,length:number}[]}[]}[]} */const rows=[];
 if(proposal===undefined||plan===undefined)return rows;
 sourceSceneRecoveryState(plan);
 if(!record(proposal)||!list(proposal.relations)||proposal.relations.length>24)throw new TypeError('Scene recovery diagnostic input is invalid');
 const formats=['packed-v1','compact-v1','compact-v2','compact-v3','compact-v4','compact-v5','compact-v6','compact-v7','compact-v8'];
 const format=typeof proposal.format==='string'&&formats.includes(proposal.format)?proposal.format:'object';
 for(const rejection of plan.admission?.rejections??[]){
  if(rejection.collection!=='relation'||rejection.detailCode!=='tuple')continue;
  const raw=proposal.relations[rejection.index];
  /** @type {{index:number,length:number,children:{index:number,length:number}[]}[]} */const arrays=[];
  if(list(raw)&&raw.length<=8)for(const [index,value]of raw.entries()){
   if(!list(value)||value.length>16)continue;
   const children=value.flatMap((child,at)=>list(child)&&child.length<=16?[{index:at,length:child.length}]:[]);
   arrays.push({index,length:value.length,children});
  }
  rows.push({index:rejection.index,format,tupleLength:list(raw)?raw.length:null,arrays});
 }
 return rows;
}
module.exports={sourceSceneRecoveryState,sourceSceneRejectedTupleShapes};
