// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {parseSourceRouteChoice}=require('../routing/source-shared-route-choice');
/** @typedef {{sourceHash:string,networkHash:string,edgeIds:string[]}} EdgeBinding */
/** @param {unknown} value @param {number[]} relations @param {number[]} excluded @returns {Record<string,EdgeBinding>} */
function parseSceneEdgeBindings(value,relations,excluded){
 if(!record(value)||Object.keys(value).length>24)throw new TypeError('Scene source edge bindings are invalid');
 return Object.fromEntries(Object.entries(value).map(([key,row])=>{
  if(!relations.some(n=>String(n)===key)||excluded.some(n=>String(n)===key)||!record(row)||Object.keys(row).length!==3
   ||typeof row.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(row.sourceHash)||typeof row.networkHash!=='string'||!/^[a-f0-9]{64}$/u.test(row.networkHash)
   ||!list(row.edgeIds)||row.edgeIds.length<1||row.edgeIds.length>128||row.edgeIds.some(id=>typeof id!=='string'||!/^ink-[a-f0-9]{24}$/u.test(id))
   ||new Set(row.edgeIds).size!==row.edgeIds.length)throw new TypeError('Scene source edge binding is invalid');
  return [key,{sourceHash:row.sourceHash,networkHash:row.networkHash,edgeIds:row.edgeIds.map(String)}];
 }));
}
/** @param {EdgeBinding} binding */
function sceneEdgeChoiceSchema(binding){return {anyOf:[{type:'null'},{type:'array',minItems:1,maxItems:15,items:{type:'object',additionalProperties:false,
 properties:{id:{type:'string',enum:binding.edgeIds},reversed:{type:'boolean'}},required:['id','reversed']}}]};}
/** @param {unknown} value @param {EdgeBinding} binding */
function decodeSceneEdgeChoice(value,binding){
 if(value===null)return null;
 const parsed=parseSourceRouteChoice({kind:'source-edges-v1',sourceHash:binding.sourceHash,networkHash:binding.networkHash,steps:value});
 if(parsed.steps.some(s=>!binding.edgeIds.includes(s.id)))throw new TypeError('Scene source edge response binding is invalid');
 return parsed.steps;
}
module.exports={parseSceneEdgeBindings,sceneEdgeChoiceSchema,decodeSceneEdgeChoice};
