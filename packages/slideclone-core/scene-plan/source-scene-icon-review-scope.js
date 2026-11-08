// @ts-check
'use strict';
const {box}=require('./source-scene-group-containment');
/** An independently counted single icon can be mislocated onto its caption.
 * Show the exact union of its declared owner and overlapping seed, preserving the inventory
 * obligation and both source observations. This is a search scope only;
 * the compiler must still isolate the revised complete source component.
 * @param {import('./source-scene-plan').ScenePlan} plan
 * @param {import('./source-scene-plan').SceneObject} object */
function sceneIconReviewScope(plan,object){
 if(object.kind!=='icon')return null;
 const owner=plan.regions.find(r=>r.id===object.regionId);
 const census=plan.observedInventory?.find(r=>r.regionId===object.regionId);
 if(!owner||!box(owner.box)||!box(object.box)||census?.icons!==1
  ||plan.objects.filter(o=>o.regionId===object.regionId&&o.kind==='icon').length!==1)return null;
 const a=owner.box,b=object.box;
 if(Math.min(a.x+a.w,b.x+b.w)<=Math.max(a.x,b.x)||Math.min(a.y+a.h,b.y+b.h)<=Math.max(a.y,b.y))return null;
 const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
 const scope={x,y,w:Math.max(a.x+a.w,b.x+b.w)-x,h:Math.max(a.y+a.h,b.y+b.h)-y};
 if(scope.w*scope.h>262144||scope.x+scope.w>plan.widthPx||scope.y+scope.h>plan.heightPx)return null;
 return scope;
}
module.exports={sceneIconReviewScope};
