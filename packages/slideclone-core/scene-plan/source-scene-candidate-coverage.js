// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
const {parseSceneCandidateCatalog}=require('./source-scene-visual-candidates');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @param {Box} a @param {Box} b */
function sceneCandidateIoU(a,b){
 const area=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
 return area/(a.w*a.h+b.w*b.h-area);
}
/** One-to-one maximum matching measures proposal recall on a SOURCE-BOUND
 * annotated subset. It is not precision, semantic accuracy, full-page recall,
 * native editability or quality acceptance. The IoU threshold is fixed at .5.
 * @param {unknown} catalogInput @param {unknown} annotationInput */
function measureSceneCandidateCoverage(catalogInput,annotationInput){
 const catalog=parseSceneCandidateCatalog(catalogInput),a=annotationInput;
 if(!record(a)||a.sourceHash!==catalog.sourceHash||a.widthPx!==catalog.widthPx||a.heightPx!==catalog.heightPx||!list(a.units)||a.units.length>256)
  throw new TypeError('Scene candidate annotations are invalid');
 const seen=new Set();
 const units=a.units.map(u=>{
  if(!record(u)||typeof u.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(u.id)||seen.has(u.id)||!box(u.box)
   ||u.box.x+u.box.w>catalog.widthPx||u.box.y+u.box.h>catalog.heightPx)throw new TypeError('Scene candidate annotation is invalid');
  seen.add(u.id);return {id:u.id,box:{...u.box}};
 });
 const edges=units.map(u=>catalog.candidates.map((c,i)=>({i,iou:sceneCandidateIoU(u.box,c.box)})).filter(e=>e.iou>=.5).sort((a,b)=>b.iou-a.iou||a.i-b.i));
 /** @type {Map<number,number>} */const assigned=new Map();
 /** @param {number} unit @param {Set<number>} visited @returns {boolean} */
 const augment=(unit,visited)=>{
  for(const edge of edges[unit]??[]){
   if(visited.has(edge.i))continue;visited.add(edge.i);
   const previous=assigned.get(edge.i);
   if(previous===undefined||augment(previous,visited)){assigned.set(edge.i,unit);return true;}
  }
  return false;
 };
 for(let i=0;i<units.length;i++)augment(i,new Set());
 const matches=[...assigned].map(([c,u])=>{
  const candidate=catalog.candidates[c],unit=units[u];if(!candidate||!unit)throw new TypeError('Scene candidate matching is invalid');
  return {unitId:unit.id,candidateId:candidate.id,iou:sceneCandidateIoU(unit.box,candidate.box)};
 }).sort((a,b)=>a.unitId.localeCompare(b.unitId));
 return {annotatedUnits:units.length,proposals:catalog.candidates.length,matched:matches.length,recall:units.length?matches.length/units.length:null,
  iouThreshold:.5,matches,scope:'annotated-subset-proposal-recall',qualityAcceptance:false};
}
module.exports={sceneCandidateIoU,measureSceneCandidateCoverage};
