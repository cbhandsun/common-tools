// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
/** @typedef {import('./source-scene-complete-groups').Item} Item */
/** Reject a connector's physical group when an endpoint is outside it.
 * A root connector may reference a real child in a verified card group:
 * Office transforms that port when the complete card moves or scales.
 * Flatten the incompatible connector owner, then let retention recheck paint
 * order and remaining groups. Never retarget an anchor to a group ID.
 * Metadata grants no
 * retention: the caller has already verified every private group snapshot.
 * This is an additional incompatibility check for producers promising native
 * node following, never a source, paint, grouping or editability receipt.
 * @template {{id:string,members:Item[]}} T
 * @param {Item[]} all @param {T[]} pending @param {{used:number,exhausted:boolean}} work
 * @returns {T[]} */
function connectorCompatibleGroups(all,pending,work){
 /** @param {number} count */const charge=count=>{if(work.used+count>4000000){work.used=4000001;work.exhausted=true;return false;}work.used+=count;return true;};
 if(!charge(all.length+pending.reduce((n,g)=>n+g.members.length,0)))return [];
 const owners=new Map(),byId=new Map(),counts=new Map();
 for(const group of pending)for(const member of group.members)owners.set(member,group.id);
 for(const item of all){byId.set(item.id,item);counts.set(item.id,(counts.get(item.id)??0)+1);}
 const rejected=new Set();
 for(const line of all){
  if(line.type!=='line'||line.source?.nativeConnectorRoute!==true)continue;
  const owner=owners.get(line);
  for(const field of ['startAnchor','endAnchor']){
   if(!charge(1))return [];
   const anchor=line.style?.[field],id=record(anchor)?anchor.elementId??anchor.id:undefined;
   const target=typeof id==='string'&&counts.get(id)===1?byId.get(id):undefined,targetOwner=target?owners.get(target):undefined;
   if(owner&&(!target||owner!==targetOwner))rejected.add(owner);
  }
 }
 return pending.filter(g=>!rejected.has(g.id));
}
module.exports={connectorCompatibleGroups};
