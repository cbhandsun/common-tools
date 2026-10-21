// @ts-check
'use strict';
const {containsSceneBox}=require('./source-scene-plan');
/** An independently counted single icon can be mislocated onto its caption.
 * Show its complete declared owner for correction, preserving the inventory
 * obligation and both source observations. This is a search scope only;
 * the compiler must still isolate the revised complete source component.
 * @param {import('./source-scene-plan').ScenePlan} plan
 * @param {import('./source-scene-plan').SceneObject} object */
function sceneIconReviewScope(plan,object){
 if(object.kind!=='icon')return null;
 const owner=plan.regions.find(r=>r.id===object.regionId);
 const census=plan.observedInventory?.find(r=>r.regionId===object.regionId);
 if(!owner||!containsSceneBox(owner.box,object.box)||owner.box.w*owner.box.h>262144||census?.icons!==1
  ||plan.objects.filter(o=>o.regionId===object.regionId&&o.kind==='icon').length!==1)return null;
 return {...owner.box};
}
module.exports={sceneIconReviewScope};
