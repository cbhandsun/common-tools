// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
/** @typedef {{id?:string,source?:Record<string,unknown>,style?:Record<string,unknown>}} Surface */
/** Set composition order only for actual measured output members of completed
 * regional transactions. A source census and every descendant transaction must
 * survive. Serialized completion flags, a matching box, or a successful local
 * background fit alone do not authorize hiding the residual interior.
 *
 * No source mask, geometry, ownership, member or completion verdict is changed.
 * The exporter draws these already source-proven opaque surfaces after the
 * residual, followed by their native foreground and editable labels.
 * @param {Surface[]} shapes
 * @param {import('./source-scene-plan').ScenePlan} plan
 * @param {Set<string>} completed
 * @param {Map<string,string[]>} nativeObjects
 * @param {Set<string>} [completeMembers] */
function composeCompletedSceneSurfaces(shapes,plan,completed,nativeObjects,completeMembers=completed){
 const frequencies=new Map();
 for(const shape of shapes)if(shape.id)frequencies.set(shape.id,(frequencies.get(shape.id)??0)+1);
 const eligible=new Set();
 for(const region of plan.regions){
  if(!completeMembers.has(region.id)||!plan.observedInventory?.some(o=>o.regionId===region.id))continue;
  const program=plan.regionPrograms?.find(p=>p.regionId===region.id);
  if(!program)continue;
  // A missing enclosing surface cannot revoke an independently complete child
  // unit. Its own source-bound output, pictorial children, labels, dependencies
  // and regional census have already survived the same completion checks.
  // This never promotes the missing parent or changes its failure verdict.
  for(const owner of program.objects)for(const id of nativeObjects.get(owner)??[])if(frequencies.get(id)===1)eligible.add(id);
  if(!completed.has(region.id))continue;
  const descendants=[region.id],seen=new Set(descendants);let valid=true;
  for(let at=0;at<descendants.length;at++)for(const child of plan.regions.filter(r=>r.parentId===descendants[at])){
   if(seen.has(child.id)||!completed.has(child.id)){valid=false;break;}
   seen.add(child.id);descendants.push(child.id);
  }
  if(!valid)continue;
  for(const id of nativeObjects.get(region.id)??[])if(frequencies.get(id)===1)eligible.add(id);
 }
 const promoted=[];
 for(const shape of shapes){
  if(!shape.id||!eligible.has(shape.id)||!record(shape.source)||!record(shape.style)
   ||shape.source.residualBackgroundFill!==true||shape.source.preserveResidualInterior!==true
   ||typeof shape.style.fill!=='string'||!/^#[a-f0-9]{6}$/iu.test(shape.style.fill)
   ||shape.style.opacity!==undefined&&shape.style.opacity!==1
   ||shape.style.fillOpacity!==undefined&&shape.style.fillOpacity!==1
   ||shape.style.fillTransparency!==undefined&&shape.style.fillTransparency!==0)continue;
  // Retain the exact measured object identity for private group receipts.
  shape.source={...shape.source,preserveResidualInterior:false};promoted.push(shape.id);
 }
 return {promoted};
}
module.exports={composeCompletedSceneSurfaces};
