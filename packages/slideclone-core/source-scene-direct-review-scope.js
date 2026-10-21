// @ts-check
'use strict';
const {types}=require('node:util');
const {containsSceneBox}=require('./source-scene-plan');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** @param {unknown} value @param {number} width @param {number} height @returns {value is Box} */
function box(value,width,height){return record(value)&&[value.x,value.y,value.w,value.h].every(v=>typeof v==='number'&&Number.isFinite(v))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0
 &&Number(value.x)+Number(value.w)<=width&&Number(value.y)+Number(value.h)<=height;}
/** Nominate a bounded view of a semantic page owner's direct content, using
 * source OCR frames and admitted objects. Descendant labels remain with their
 * own regions. The owner and its whole census are unchanged: this scope grants
 * no objects, erasure, source paint, completion or extra proposal/scan budget.
 * A root with unknown direct relations must retain its full endpoint context.
 * @param {import('./source-scene-plan').ScenePlan} plan @param {string} regionId
 * @param {unknown} labels @returns {Box|null} */
function sourceSceneDirectReviewScope(plan,regionId,labels){
 if(labels===undefined)return null;
 if(!Array.isArray(labels)||types.isProxy(labels)||Object.getPrototypeOf(labels)!==Array.prototype||labels.length>512
  ||Reflect.ownKeys(labels).length!==labels.length+1||Object.values(Object.getOwnPropertyDescriptors(labels)).some(p=>!('value' in p)))
  throw new TypeError('Scene direct review labels are invalid');
 const frames=labels.map(value=>{if(!record(value)||!box(value.box,plan.widthPx,plan.heightPx))throw new TypeError('Scene direct review frame is invalid');return {...value.box};});
 const region=plan.regions.find(r=>r.id===regionId),census=plan.observedInventory?.find(r=>r.regionId===regionId);
 if(!region||region.parentId!==null||region.kind!=='section'||region.box.x!==0||region.box.y!==0
  ||region.box.w!==plan.widthPx||region.box.h!==plan.heightPx||census?.relations!==0)return null;
 const descendants=plan.regions.filter(r=>r.id!==region.id);
 if(!descendants.length)return null;
 const direct=frames.filter(frame=>!descendants.some(child=>containsSceneBox(child.box,frame)));
 // Existing direct objects are included in full; a label window cannot hide
 // an already proposed member or silently change its original source binding.
 const members=[...direct,...plan.objects.filter(o=>o.regionId===region.id).map(o=>o.box)];
 if(!direct.length||!members.length)return null;
 const heights=direct.map(b=>b.h).sort((a,b)=>a-b),margin=Math.ceil(Math.min(64,(heights[Math.floor(heights.length/2)]??0)*.3));
 const x=Math.max(0,Math.floor(Math.min(...members.map(b=>b.x))-margin)),y=Math.max(0,Math.floor(Math.min(...members.map(b=>b.y))-margin));
 const right=Math.min(plan.widthPx,Math.ceil(Math.max(...members.map(b=>b.x+b.w))+margin));
 const bottom=Math.min(plan.heightPx,Math.ceil(Math.max(...members.map(b=>b.y+b.h))+margin));
 const scope={x,y,w:right-x,h:bottom-y};
 return scope.w*scope.h<region.box.w*region.box.h?scope:null;
}
module.exports={sourceSceneDirectReviewScope};
