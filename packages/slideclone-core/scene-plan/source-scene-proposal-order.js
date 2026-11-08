// @ts-check
"use strict";
const {types}=require("node:util");
const {sceneRelationBatches}=require('./source-scene-relation-batches');
const {sceneObjectLimit}=require('./source-scene-object-batches');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(property=>"value" in property);}
/** @param {unknown} value @param {number} maximum */
function list(value,maximum){return Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype
 &&value.length<=maximum&&Reflect.ownKeys(value).length===value.length+1
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(property=>"value" in property);}
/** @param {unknown} value */
function validBox(value){return record(value)&&[value.x,value.y,value.w,value.h].every(v=>typeof v==="number"&&Number.isFinite(v))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0
 &&Number(value.x)+Number(value.w)<=16384&&Number(value.y)+Number(value.h)<=16384;}
/** Give text-covered wide backgrounds a chance before small decorative units
 * consume the shared glyph allowance. Footprint overlap is a scheduling hint,
 * never ownership or admission evidence. Connector endpoints keep their
 * original ordering, and every proposal still uses the original source gates.
 * @template {{id:string,kind:string,box:Box}} T
 * @param {T[]} proposals @param {Box[]} textMasks
 * @param {{fromId:string,toId:string}[]} relations
 * @param {import('./source-scene-plan').ScenePlan} [plan] @returns {T[]} */
function orderSourceSceneProposals(proposals,textMasks,relations,plan){
 if(plan!==undefined){
  if(!record(plan)||plan.relations!==relations)throw new TypeError('Scene proposal relation binding is invalid');
  sceneRelationBatches(plan);
 }
 if(!list(proposals,plan?24+sceneObjectLimit(plan):88)||!list(textMasks,10000)||!list(relations,plan?.relationBatches?48:24)
  ||proposals.some(proposal=>!record(proposal)||typeof proposal.id!=="string"||!proposal.id||proposal.id.length>128
    ||typeof proposal.kind!=="string"||!validBox(proposal.box))
  ||textMasks.some(text=>!validBox(text))
  ||relations.some(relation=>!record(relation)||typeof relation.fromId!=="string"||typeof relation.toId!=="string"))
  throw new TypeError("Scene proposal ordering input is invalid");
 const endpoints=new Set(relations.flatMap(relation=>[relation.fromId,relation.toId]));
 /** @param {T} proposal */const priority=proposal=>{
  if(proposal.kind!=="container"||proposal.box.w/proposal.box.h<4||endpoints.has(proposal.id))return 1;
  const box=proposal.box,area=box.w*box.h;
  const overlap=textMasks.reduce((sum,text)=>sum+Math.max(0,Math.min(box.x+box.w,text.x+text.w)-Math.max(box.x,text.x))
   *Math.max(0,Math.min(box.y+box.h,text.y+text.h)-Math.max(box.y,text.y)),0);
  return overlap>=area*.58?0:1;
 };
 return proposals.map((proposal,index)=>({proposal,index,priority:priority(proposal)}))
  .sort((a,b)=>a.priority-b.priority||a.proposal.box.w*a.proposal.box.h-b.proposal.box.w*b.proposal.box.h||a.index-b.index)
  .map(item=>item.proposal);
}
module.exports={orderSourceSceneProposals};
