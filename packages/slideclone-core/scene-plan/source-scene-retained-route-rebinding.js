// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
const {parseSourceRouteCatalog,parseSourceRouteChoice}=require('../routing/source-shared-route-choice');
/** Rebind names only, with complete fingerprint-validated source descriptions.
 * Every ordered source vertex and both source cuts must be exactly identical.
 * This nominates no new path and grants no source measurement or paint rights.
 * @param {unknown} steps @param {unknown} previous @param {unknown} current
 * @param {{checks:number}} work */
function rebindRetainedSceneRouteSteps(steps,previous,current,work){
 if(!record(work)||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000)
  throw new TypeError('Retained scene route work is invalid');
 const before=parseSourceRouteCatalog(previous),after=parseSourceRouteCatalog(current);
 if(before.sourceHash!==after.sourceHash||before.widthPx!==after.widthPx||before.heightPx!==after.heightPx)
  throw new TypeError('Retained scene route source is unavailable');
 const choice=parseSourceRouteChoice({kind:'source-edges-v1',sourceHash:before.sourceHash,networkHash:before.networkHash,steps});
 return choice.steps.map(step=>{
  const original=before.edges.find(e=>e.id===step.id);
  if(!original)throw new TypeError('Retained scene route edge is unavailable');
  /** @param {typeof after.edges} edges */
  const matchesIn=edges=>{const matches=[];
  for(const edge of edges){
   work.checks+=original.points.length+edge.points.length+2;
   if(work.checks>4000000)throw new TypeError('Retained scene route work is exhausted');
   const same=edge.from===original.from&&edge.to===original.to;
   const reversed=edge.from===original.to&&edge.to===original.from;
   if(!same&&!reversed||edge.points.length!==original.points.length)continue;
   if(original.points.every((p,i)=>{
    const q=edge.points[reversed?edge.points.length-1-i:i];return q?.x===p.x&&q.y===p.y;
   }))matches.push({id:edge.id,reversed:step.reversed!==reversed});
  }return matches;};
  if(matchesIn(before.edges).length!==1)throw new TypeError('Retained scene route geometry is ambiguous');
  const matches=matchesIn(after.edges);
  if(matches.length!==1)throw new TypeError('Retained scene route geometry is unavailable');
  return /** @type {{id:string,reversed:boolean}} */(matches[0]);
 });
}
module.exports={rebindRetainedSceneRouteSteps};
