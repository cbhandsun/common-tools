// @ts-check
'use strict';
/** @param {import('./source-scene-plan').Box} outer @param {import('./source-scene-plan').Box} inner */
function containsSceneBox(outer,inner){
 return inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.w<=outer.x+outer.w+1e-6
  &&inner.y+inner.h<=outer.y+outer.h+1e-6;
}
/** Both geometry and the declared region tree must authorize an endpoint.
 * A relation in a common ancestor can connect different child regions.
 * @param {import('./source-scene-plan').ScenePlan} plan @param {string} regionId @param {string} endpointId */
function sceneEndpointWithinScope(plan,regionId,endpointId){
 const regions=new Map(plan.regions.map(r=>[r.id,r])),scope=regions.get(regionId);
 const label=plan.textEndpoints?.find(t=>t.id===endpointId);
 const object=plan.objects.find(o=>o.id===endpointId),region=regions.get(endpointId),endpoint=object??region??label;
 if(!scope||!endpoint||object&&(!['container','icon'].includes(object.kind)||object.kind==='icon'&&object.parentObjectId!==undefined)||region&&!['card','container'].includes(region.kind)
  ||!containsSceneBox(scope.box,endpoint.box))return false;
 let owner=regions.get(object?object.regionId:label?label.regionId:endpointId);const seen=new Set();
 while(owner){
  if(seen.has(owner.id)||!containsSceneBox(owner.box,endpoint.box))return false;
  if(owner.id===regionId)return true;
  seen.add(owner.id);const parent=owner.parentId?regions.get(owner.parentId):undefined;
  if(!parent||!containsSceneBox(parent.box,owner.box))return false;owner=parent;
 }
 return false;
}
module.exports={sceneEndpointWithinScope,containsSceneBox};
