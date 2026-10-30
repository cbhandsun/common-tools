// @ts-check
"use strict";
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {import('./source-scene-plan').SceneObject} SceneObject */
/** @param {Box[]} boxes */
function envelope(boxes){
 const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
 return {x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y};
}
/** A gap proposes observation context, never a connector or deletion. The OCR
 * center must lie between two disjoint physical proposals, inside both of
 * their transverse spans. No reading order, token or object name is used.
 * @param {Box} target @param {Box} a @param {Box} b */
function inGap(target,a,b){
 const x=target.x+target.w/2,y=target.y+target.h/2;
 const horizontal=a.x+a.w<=b.x&&x>=a.x+a.w&&x<=b.x&&y>=Math.max(a.y,b.y)&&y<=Math.min(a.y+a.h,b.y+b.h);
 const vertical=a.y+a.h<=b.y&&y>=a.y+a.h&&y<=b.y&&x>=Math.max(a.x,b.x)&&x<=Math.min(a.x+a.w,b.x+b.w);
 return horizontal||vertical;
}
/** The planner has already admitted source bounds, object counts and IDs.
 * Show complete endpoints around a suspected OCR mark. Even when the global
 * inventory omitted a relation, nearby objects can supply observation context.
 * Selection is bounded by the existing 64 objects; source costs remain in the
 * common crop allocator. A returned rectangle grants no pixel ownership.
 * @param {Box} target
 * @param {Pick<import('./source-scene-plan').ScenePlan,'objects'>} plan
 * @returns {Box|undefined} */
function sourceSceneGapReviewContext(target,plan){
 /** @type {{box:Box,key:string}[]} */const choices=[];
 const objects=plan.objects.filter(o=>o.kind==='container'||o.kind==='icon');
 const cx=target.x+target.w/2,cy=target.y+target.h/2;
 if(objects.some(o=>o.kind==='container'&&cx>o.box.x&&cx<o.box.x+o.box.w&&cy>o.box.y&&cy<o.box.y+o.box.h))return undefined;
 for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++){
  const a=objects[i],b=objects[j];if(!a||!b||a.regionId!==b.regionId)continue;
  if(!inGap(target,a.box,b.box)&&!inGap(target,b.box,a.box))continue;
  const box=envelope([target,a.box,b.box]);
  // A semantic overview larger than a scanner's unit window is not a local
  // physical context. Retain the old context instead of trimming endpoints.
  if(Math.ceil(box.w)*Math.ceil(box.h)>262144)continue;
  choices.push({box,key:[a.id,b.id].sort().join(':')});
 }
 choices.sort((a,b)=>a.box.w*a.box.h-b.box.w*b.box.h||a.key.localeCompare(b.key));
 return choices[0]?.box;
}
module.exports={sourceSceneGapReviewContext};
