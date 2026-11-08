// @ts-check
'use strict';
const {thinSourceRoute}=require('./source-route-centerline');
const {partitionSharedRouteHeads}=require('./source-shared-route-heads');
/** Consolidate contacts only after a COMPLETE filled head independently owns
 * every suppressed contact of that same physical endpoint. Proximity, color
 * and a shared node alone confer no authority. All component ink is retained;
 * the final partition, shaft tree, directions and coverage are checked again.
 * @param {{mask:Uint8Array,width:number,height:number,rgba:Uint8Array,background:number[],
 * backgroundAt?:(index:number)=>number[],terminals:{index:number,owner:number}[],work:{checks:number}}} input
 * @returns {number[]|null} */
function consolidateSharedHeadContacts({mask,width,height,rgba,background,backgroundAt,terminals,work}){
 const retained=new Set(terminals.map((_,i)=>i));
 for(const owner of new Set(terminals.map(t=>t.owner))){
  const group=terminals.map((t,i)=>({ ...t,ordinal:i})).filter(t=>t.owner===owner);
  if(group.length<2)continue;
  for(const candidate of group.slice().sort((a,b)=>a.index-b.index)){
   const others=terminals.filter(t=>t.owner!==owner);
   if(others.length<2)continue;
   const proposed=[...others,candidate].map(t=>({index:t.index,arrow:false}));
   const protectedCells=new Uint8Array(mask.length);
   work.checks+=mask.length+terminals.length;
   if(work.checks>4000000)return null;
   for(const t of proposed)protectedCells[t.index]=1;
   const skeleton=thinSourceRoute(mask,width,height,work,protectedCells);if(!skeleton)return null;
   const result=partitionSharedRouteHeads({mask,skeleton,width,height,rgba,background,
    ...(backgroundAt?{backgroundAt}:{}),terminals:proposed,work,inferArrows:true});
   if(work.checks>4000000)return null;
   const head=result.partition?.heads.find(h=>h.index===candidate.index);
   work.checks+=group.length;if(work.checks>4000000)return null;
   if(!head||!group.every(t=>head.contactCells.has(t.index)))continue;
   for(const t of group)if(t.ordinal!==candidate.ordinal)retained.delete(t.ordinal);
   break;
  }
 }
 return [...retained];
}
module.exports={consolidateSharedHeadContacts};
