// @ts-check
"use strict";
const {record,list}=require('./source-scene-group-containment');
const {sceneRegionLabelOrigin}=require('./source-scene-region-program');
const {paintOrder,groupId,textGroupId}=require('./source-scene-group-paint');
const {paintConflict}=require('./source-scene-physical-groups');
const {sceneGroupSnapshot:snapshot}=require('./source-scene-group-snapshot');
/** @typedef {import('./source-scene-complete-groups').Item} Item */
/** @typedef {{shapes:Item[],images:Item[],textBoxes:Item[]}} Page */
/** @typedef {{id:string,members:Item[],snapshots:(string|null)[]}} Group */
/** @typedef {{groups:Group[],checks:number}} Receipt */
/** @type {WeakMap<object,Receipt>} */
const receipts=new WeakMap();
/** Only complete assembly passes its actual members here. A serialized page
 * never issues a receipt. Final typography must follow the private label lineage.
 * @param {Page} page @param {{id:string,members:Item[]}[]} groups @param {number} checks */
function sealMeasuredSceneGroups(page,groups,checks){
 const token=Object.freeze({});
 if(!record(page)||![page.shapes,page.images,page.textBoxes].every(a=>list(a)&&a.every(record)))return token;
 const all=[...page.shapes,...page.images,...page.textBoxes],texts=new Set(page.textBoxes);
 const bound=groups.flatMap(group=>{
  const members=group.members.map(previous=>all.filter(p=>p===previous||texts.has(p)&&sceneRegionLabelOrigin(p)===previous));
  if(members.some(bucket=>bucket.length!==1))return [];
  const actual=members.flat();
  if(all.some(p=>(texts.has(p)?textGroupId(p):groupId(p))===group.id&&!actual.includes(p)))return [];
  const snapshots=actual.map(snapshot);
  return snapshots.some(s=>s===null)?[]:[{id:group.id,members:actual,snapshots}];
 });
 receipts.set(token,{groups:bound,checks});return token;
}
/** Combine only transient measured receipts. A copied or serialized token
 * grants nothing. Both stages share the geometry ledger, so retain its terminal
 * counter rather than adding its earlier snapshot twice.
 * @param {unknown[]} tokens */
function combineMeasuredSceneGroupReceipts(tokens){
 const token=Object.freeze({});
 if(!list(tokens)||tokens.length>2)return token;
 /** @type {Receipt[]} */const found=[];
 for(const value of tokens){const receipt=value!==null&&typeof value==='object'?receipts.get(value):undefined;if(receipt)found.push(receipt);}
 /** @type {Map<string,Group>} */const groups=new Map();const ambiguous=new Set();let checks=0;
 for(const receipt of found){checks=Math.max(checks,receipt.checks);
  for(const group of receipt.groups){
   const previous=groups.get(group.id);
   if(previous){
    if(previous.members.length!==group.members.length||previous.members.some((p,i)=>p!==group.members[i]
     ||previous.snapshots[i]!==group.snapshots[i]))ambiguous.add(group.id);
   }else groups.set(group.id,group);
  }
 }
 receipts.set(token,{groups:[...groups.values()].filter(g=>!ambiguous.has(g.id)),checks});return token;
}
/** Retain only the exact, unchanged members of this transient receipt. Check
 * the real order after removing all other hybrid groups, before the mutation.
 * @param {unknown} pageInput @param {unknown} token */
function retainedSceneGroupMembers(pageInput,token){
 const receipt=token!==null&&typeof token==='object'?receipts.get(token):undefined;
 const kept=new Set();
 if(!receipt||!record(pageInput)||![pageInput.shapes,pageInput.images,pageInput.textBoxes].every(a=>list(a)&&a.every(record)))return kept;
 const page=/** @type {Page} */(pageInput),all=[...page.shapes,...page.images,...page.textBoxes],texts=new Set(page.textBoxes);
 if(new Set(all).size!==all.length||all.some(p=>p.source!==undefined&&!record(p.source)||p.style!==undefined&&!record(p.style)))return kept;
 const valid=receipt.groups.filter(group=>group.members.every((p,i)=>all.includes(p)&&snapshot(p)===group.snapshots[i]
  &&(texts.has(p)?textGroupId(p):groupId(p))===group.id)
  &&!all.some(p=>(texts.has(p)?textGroupId(p):groupId(p))===group.id&&!group.members.includes(p)));
 const work={used:receipt.checks,exhausted:false},before=paintOrder(page.shapes,page.images,page.textBoxes);
 // Rejections can expose further order changes. Recheck until no group loses
 // membership, charging every comparison to the original shared work budget.
 let pending=valid;
 while(pending.length){
  const protectedMembers=new Set(pending.flatMap(g=>g.members));
  const overrides=new Map(all.filter(p=>!protectedMembers.has(p)).map(p=>[p,'']));
  const after=paintOrder(page.shapes,page.images,page.textBoxes,overrides);
  const accepted=pending.filter(group=>!group.members.some(moved=>all.some(other=>{
   if(work.used>=4000000){work.exhausted=true;return true;}work.used++;
   const old=(before.get(moved)??-1)-(before.get(other)??-1),next=(after.get(moved)??-1)-(after.get(other)??-1);
   return Math.sign(old)!==Math.sign(next)&&paintConflict(moved,other,work);
  })));
  if(work.exhausted)return kept;
  if(accepted.length===pending.length){for(const group of accepted)for(const p of group.members)kept.add(p);return kept;}
  pending=accepted;
 }
 return kept;
}
module.exports={sealMeasuredSceneGroups,combineMeasuredSceneGroupReceipts,retainedSceneGroupMembers};
