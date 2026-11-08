// @ts-check
'use strict';
const {record,list,box:validBox}=require('./source-scene-group-containment');
/** One topology identity across admission, correction and regional discovery.
 * Directionless connectors and double-headed arrows are symmetric, but remain
 * distinct from each other and from directed/unknown relations. This key
 * grants no source geometry, attachment, direction or distinct-shaft proof.
 * @param {{fromId:string,toId:string,direction:string}} relation */
function sceneRelationKey(relation){
 return relation.direction==='both'||relation.direction==='undirected'
  ?[relation.fromId,relation.toId].sort().join('|')+'|'+relation.direction
  :relation.direction==='backward'?relation.toId+'|'+relation.fromId+'|forward'
   :relation.fromId+'|'+relation.toId+'|'+relation.direction;
}
/** Endpoints describe topology, not a physical shaft's identity. Disjoint
 * source anchors can nominate distinct parallel shafts; final source fitting
 * still has to lie within each original anchor. Missing/overlapping anchors
 * grant no distinctness, so duplicate rollback remains conservative.
 * @param {Pick<import('./source-scene-plan').Relation,'fromId'|'toId'|'direction'|'shaftBox'>} a
 * @param {Pick<import('./source-scene-plan').Relation,'fromId'|'toId'|'direction'|'shaftBox'>} b */
function sceneRelationsConflict(a,b){
 if(sceneRelationKey(a)!==sceneRelationKey(b))return false;
 const x=a.shaftBox,y=b.shaftBox;
 return !x||!y||!(x.x+x.w<y.x||y.x+y.w<x.x||x.y+x.h<y.y||y.y+y.h<x.y);
}
/** The source anchor constrains a measured fit's identity. It cannot supply a
 * shaft, direction, port or pixel evidence of its own.
 * @param {Pick<import('./source-scene-plan').Relation,'shaftBox'>} relation
 * @param {{start:{x:number,y:number},end:{x:number,y:number}}} fit */
function sceneRelationWithinAnchor(relation,fit){
 if(!relation.shaftBox)return true;
 const box=relation.shaftBox,x=(fit.start.x+fit.end.x)/2,y=(fit.start.y+fit.end.y)/2;
 return x>=box.x&&x<=box.x+box.w&&y>=box.y&&y<=box.y+box.h;
}
/** A routed shaft may turn outside the chord between its external endpoints.
 * Require positive measured path overlap with its own anchor, rather than a
 * chord midpoint or mere proximity of the two endpoint bodies. This is an
 * identity restriction only; it supplies no pixels, ports or route evidence.
 * @param {Pick<import('./source-scene-plan').Relation,'shaftBox'>} relation
 * @param {readonly {x:number,y:number}[]} points */
function sceneRouteWithinAnchor(relation,points){
 if(!record(relation))return false;if(relation.shaftBox===undefined)return true;
 const box=relation.shaftBox;
 if(!validBox(box)||!list(points)||points.length<2||points.length>32
  ||points.some(p=>!record(p)||![p.x,p.y].every(Number.isFinite)))return false;
 return points.some((b,i)=>{
  const a=points[i-1];if(!a||a.x===b.x&&a.y===b.y)return false;
  let low=0,high=1;
  for(const axis of /** @type {const} */(['x','y'])){
   const delta=b[axis]-a[axis],minimum=box[axis],maximum=minimum+(axis==='x'?box.w:box.h);
   if(delta===0){if(a[axis]<minimum||a[axis]>maximum)return false;continue;}
   const first=(minimum-a[axis])/delta,last=(maximum-a[axis])/delta;
   low=Math.max(low,Math.min(first,last));high=Math.min(high,Math.max(first,last));if(high<=low)return false;
  }
  return high>low;
 });
}
module.exports={sceneRelationKey,sceneRelationsConflict,sceneRelationWithinAnchor,sceneRouteWithinAnchor};
