// @ts-check
"use strict";
const {measuredSceneContainsGroup,measuredSceneGroupBounds}=require('./source-scene-port-evidence');
/** A unique innermost source body owns the complete polygon. Equal or crossing
 * bodies remain ambiguous, independent of provider order or proposed boxes.
 * @template {{proposalId:string,node:{portFrame:object|null}}} T
 * @param {import('./png').PngImage} image @param {T[]} nodes
 * @param {{x:number,y:number}[]} polygon @param {{used:number,exhausted:boolean}} work */
function measuredSceneGroupOwner(image,nodes,polygon,work){
 const matches=nodes.flatMap(owner=>{const bounds=measuredSceneGroupBounds(image,owner.node.portFrame);
  return bounds&&measuredSceneContainsGroup(image,owner.node.portFrame,bounds,polygon,work)?[{owner,bounds}]:[];
 }).sort((a,b)=>a.bounds.w*a.bounds.h-b.bounds.w*b.bounds.h);
 const first=matches[0];if(!first||work.exhausted)return null;
 const b=first.bounds,body=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}];
 if(matches.slice(1).some(other=>other.bounds.w*other.bounds.h<=b.w*b.h
  ||!measuredSceneContainsGroup(image,other.owner.node.portFrame,other.bounds,body,work))||work.exhausted)return null;
 return first.owner;
}
module.exports={measuredSceneGroupOwner};
