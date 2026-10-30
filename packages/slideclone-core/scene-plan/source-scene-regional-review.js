// @ts-check
'use strict';
const inventory=require('./source-scene-regional-inventory');
const {retainedSceneDiscoveryTargets}=require('./source-scene-retained-discovery');
const {sceneLocalRelationCapacity,sceneLocalObjectCapacity}=require('./source-scene-review-targets');
/** Prepend trusted observation nominations to the existing bounded discovery
 * queue. Overlapping references are deferred intact, never silently truncated.
 * @param {Parameters<typeof inventory.selectRegionalInventoryTargets>} args
 * @param {unknown} retainedReview */
function selectReviewedRegionalTargets(args,retainedReview){
 const [plan,capacity]=args,ordinary=inventory.selectRegionalInventoryTargets(...args);
 if(!plan||!capacity||retainedReview===undefined||!sceneLocalRelationCapacity(plan))return ordinary;
 const retained=retainedSceneDiscoveryTargets(plan,retainedReview),refs=new Set();
 /** @type {typeof ordinary} */const result=[];let reserved=0;
 for(const target of [...retained,...ordinary]){
  if(result.length>=capacity)break;
  const programMembers=plan.objects.filter(o=>target.programTask?.objects.includes(o.id));
  const ids=[...new Set([...(target.endpoints??[]),...(target.boundaryMembers??[]),...programMembers].map(e=>e.id))];
  const reserve=Math.max(reserved,target.addObjects?Math.max(0,sceneLocalObjectCapacity(plan)-(args[5]??0)):0);
  if(ids.some(id=>refs.has(id))||refs.size+ids.length+reserve>64)continue;
  result.push(target);reserved=reserve;ids.forEach(id=>refs.add(id));
 }
 return result;
}
module.exports={...inventory,selectReviewedRegionalTargets};
