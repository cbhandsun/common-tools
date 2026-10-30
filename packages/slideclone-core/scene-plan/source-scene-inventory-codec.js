// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
/** Lossless transport of the original member identities and types. The normal
 * inventory validator STILL checks every expanded unit, batch, census and final
 * output. This changes neither inventory capacity nor source authority.
 * @param {NonNullable<ReturnType<typeof import('./source-scene-observed-inventory').buildSceneInventoryEvidence>>} evidence */
function packSceneInventoryMembers(evidence){
 return {format:'scene-inventory-members-v1',evidence:{...evidence,units:evidence.units.map(unit=>({
  identity:[unit.id,unit.regionId,unit.kind,unit.origin??'proposal'].join(':'),
  ...(unit.key!==undefined?{key:unit.key}:{}),...(unit.parentObjectId!==undefined?{parentObjectId:unit.parentObjectId}:{}),
  ...(unit.fromId!==undefined?{fromId:unit.fromId}:{}),...(unit.toId!==undefined?{toId:unit.toId}:{}),...(unit.direction!==undefined?{direction:unit.direction}:{}),
  ...(unit.members?{members:unit.members.map(member=>(member.type==='shape'?'s:':'i:')+member.id)}:{})}))}};
}
/** Decode only the bounded transport wrapper; invalid encodings return null
 * and cannot become legacy absence. Do not execute getters or proxy traps.
 * @param {unknown} value @returns {unknown} */
function unpackSceneInventoryMembers(value){
 if(!record(value)||value.format!=='scene-inventory-members-v1')return value;
 if(Reflect.ownKeys(value).some(k=>k!=='format'&&k!=='evidence')||!record(value.evidence)
  ||!list(value.evidence.units)||value.evidence.units.length>176)return null;
 const units=[];
 for(const unit of value.evidence.units){
  if(!record(unit)||Reflect.ownKeys(unit).some(k=>typeof k!=='string'||!['identity','members','key','parentObjectId','fromId','toId','direction'].includes(k))
   ||typeof unit.identity!=='string'||!list(unit.members)||unit.members.length>10000)return null;
  const identity=/^([A-Za-z][A-Za-z0-9_-]{0,63}):([A-Za-z][A-Za-z0-9_-]{0,63}):(container|icon|relation):(proposal|table-header|interior)$/u.exec(unit.identity);
  if(!identity)return null;
  const relation=identity[3]==='relation',v5=value.evidence.version===5||value.evidence.version===6;
  if(v5&&relation?typeof unit.fromId!=='string'||!/^([A-Za-z][A-Za-z0-9_-]{0,63})$/u.test(unit.fromId)
   ||typeof unit.toId!=='string'||!/^([A-Za-z][A-Za-z0-9_-]{0,63})$/u.test(unit.toId)||unit.fromId===unit.toId
   ||typeof unit.direction!=='string'||!['forward','backward','both','undirected'].includes(unit.direction)
   :unit.fromId!==undefined||unit.toId!==undefined||unit.direction!==undefined)return null;
  const members=[];
  for(const entry of unit.members){
   if(typeof entry!=='string')return null;
   const match=/^(s|i):([A-Za-z][A-Za-z0-9_-]{0,255})$/u.exec(entry);
   if(!match)return null;members.push({type:match[1]==='s'?'shape':'image',id:match[2]});
  }
  units.push({id:identity[1],regionId:identity[2],kind:identity[3],origin:identity[4],
   ...(unit.key!==undefined?{key:unit.key}:{}),...(unit.parentObjectId!==undefined?{parentObjectId:unit.parentObjectId}:{}),
   ...(v5&&relation?{fromId:unit.fromId,toId:unit.toId,direction:unit.direction}:{}),members});
 }
 return {...value.evidence,units};
}
module.exports={packSceneInventoryMembers,unpackSceneInventoryMembers};
