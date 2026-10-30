// @ts-check
"use strict";
const {sceneObjectLimit}=require('./source-scene-object-batches');
const {containsSceneBox}=require('./source-scene-plan');
const {sceneInteriorRowTargets}=require('./source-scene-interior-row-targets');
const {list}=require('./source-scene-group-containment');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{parent:import('./source-scene-plan').SceneObject,seed:Box,area:number}} Target */
/** Geometry proposes a seed, never a mask or permission to remove source text.
 * Keep the complete enclosing object for the subsequent isolation check.
 * @param {import('./source-scene-plan').ScenePlan} plan @param {readonly Box[]} texts
 * @param {number} capacity @param {string[]} [representedParents] @param {boolean} [sourceDriven] */
function selectSceneInteriorTargets(plan,texts,capacity,representedParents=[],sourceDriven=false){
 if(typeof sourceDriven!=='boolean')throw new TypeError('Scene interior discovery mode is invalid');
 if(!Number.isSafeInteger(capacity)||capacity<0||capacity>32||plan.objects.length>(plan.objectBatches===undefined?64:sceneObjectLimit(plan)))throw new RangeError('Scene interior target capacity is invalid');
 if(!list(representedParents)||representedParents.length>96||representedParents.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,96}$/u.test(id))
  ||new Set(representedParents).size!==representedParents.length)throw new TypeError('Scene interior represented parents are invalid');
 const endpoints=new Set(plan.relations.flatMap(r=>[r.fromId,r.toId]));
 const regions=new Map(plan.regions.map(r=>[r.id,r]));
 /** @type {Target[]} */const targets=[];
 /** @type {Target[]} */const rowTargets=[];
 for(const parent of plan.objects){
  const region=regions.get(parent.regionId),b=parent.box;
  if(parent.kind!=='container'||parent.pictorialContent==='absent'||!endpoints.has(parent.id)&&!(sourceDriven&&parent.pictorialContent==='present')||!region||!containsSceneBox(region.box,b)
   ||representedParents.includes(parent.id))continue;
  // A declared child is an obligation of the parent, independent of whether
  // its edges were proposed. Charge one source-driven target for that complete
  // parent; its text gaps do not each consume another discovery slot.
  if(sourceDriven&&parent.pictorialContent==='present'){
   if(b.w>4&&b.h>4)targets.push({parent,seed:{x:b.x+2,y:b.y+2,w:b.w-4,h:b.h-4},area:b.w*b.h});
   continue;
  }
  if(capacity&&parent.pictorialContent==='present')for(const target of sceneInteriorRowTargets(b,texts))rowTargets.push({parent,...target});
  const intervals=texts.filter(t=>t.x<b.x+b.w&&t.x+t.w>b.x&&t.y<b.y+b.h&&t.y+t.h>b.y)
   .map(t=>({start:Math.max(b.y,t.y-2),end:Math.min(b.y+b.h,t.y+t.h+2)})).sort((a,b)=>a.start-b.start);
  let y=b.y+2;
  /** @type {{start:number,end:number}[]} */const bands=[];
  for(const interval of intervals){if(interval.start>y)bands.push({start:y,end:interval.start});y=Math.max(y,interval.end);}
  if(y<b.y+b.h-2)bands.push({start:y,end:b.y+b.h-2});
  bands.sort((a,b)=>(b.end-b.start)-(a.end-a.start));const band=bands[0];
  if(!band||band.end-band.start<6)continue;
  const height=band.end-band.start;
  targets.push({parent,seed:{x:b.x+b.w*.25,y:band.start+height*.25,w:b.w*.5,h:height*.5},area:b.w*height});
 }
 // Spend the remaining target slots on the largest unobserved interiors;
 // provider enumeration order cannot starve a complete later diagram.
 const order=(/** @type {Target} */a,/** @type {Target} */b)=>b.area-a.area
  ||a.parent.box.y-b.parent.box.y||a.parent.box.x-b.parent.box.x||a.parent.id.localeCompare(b.parent.id)||a.seed.y-b.seed.y;
 // Known pictorial rows use the SAME remaining targets, not an extra allowance.
 // The legacy vertical-gap path and its ordering remain available afterward.
 return [...rowTargets.sort(order),...targets.sort(order)].slice(0,capacity);
}
module.exports={selectSceneInteriorTargets};
