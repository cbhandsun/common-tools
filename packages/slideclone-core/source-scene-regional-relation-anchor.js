// @ts-check
'use strict';
const {readSceneRegionalUnit}=require('./source-scene-regional-unit');
/** A local relation must retain its observed shaft location through the SAME
 * atlas/source mapping as its nodes. Geometry is still only a proposal; no
 * shaft, direction, endpoint, pixel or additional relation slot is granted.
 * @param {unknown} value
 * @param {Parameters<typeof readSceneRegionalUnit>[1]} target
 * @param {Parameters<typeof readSceneRegionalUnit>[2]} frame */
function readRegionalRelationAnchor(value,target,frame){
 if(value===undefined||value===null)return {};
 const parsed=readSceneRegionalUnit({kind:'container',confidence:1,box_2d:value},target,frame);
 return parsed.box&&!parsed.rejection?{shaftBox:parsed.box}:{rejection:'relation-anchor-window'};
}
/** Two independently mapped observations must agree about the SAME shaft.
 * The existing regional geometry consensus uses the same .85 intersection.
 * Missing hints retain legacy behavior; asymmetric or conflicting hints fail.
 * @param {{shaftBox?:import('./source-scene-plan').Box,rejection?:string}} a
 * @param {{shaftBox?:import('./source-scene-plan').Box,rejection?:string}} b */
function regionalRelationAnchorsAgree(a,b){
 if(a.rejection||b.rejection)return false;
 const x=a.shaftBox,y=b.shaftBox;if(!x||!y)return !x&&!y;
 const area=Math.max(0,Math.min(x.x+x.w,y.x+y.w)-Math.max(x.x,y.x))*Math.max(0,Math.min(x.y+x.h,y.y+y.h)-Math.max(x.y,y.y));
 return area/(x.w*x.h+y.w*y.h-area)>=.85;
}
module.exports={readRegionalRelationAnchor,regionalRelationAnchorsAgree};
