// @ts-check
"use strict";
/** @typedef {import('./source-scene-complete-groups').Item} Item */
/** @param {Item} item */
function groupId(item){const id=item.source?.nativeComponentGroupId;return typeof id==='string'?id:undefined;}
/** @param {Item} item */
function textGroupId(item){const id=groupId(item)??item.style?.nativeComponentGroupId;return typeof id==='string'?id:undefined;}
/** Match native builder emission; empty overrides explicitly remove a group.
 * @param {Item[]} shapes @param {Item[]} images @param {Item[]} texts @param {Map<Item,string>} [overrides] */
function paintOrder(shapes,images,texts,overrides=new Map()){
 const all=[...shapes,...images,...texts],groups=new Map(),emitted=new Set(),labels=new Set(texts);
 /** @param {Item} item */const id=item=>overrides.get(item)??(labels.has(item)?textGroupId(item):groupId(item));
 for(const item of all){const key=id(item);if(key){const members=groups.get(key)??[];members.push(item);groups.set(key,members);}}
 /** @type {Item[]} */const result=[];
 for(const item of all){const key=id(item),members=key?groups.get(key):undefined;
  if(!members||members.length<2){result.push(item);continue;}
  if(!emitted.has(key)){emitted.add(key);result.push(...members);}
 }
 return new Map(result.map((item,index)=>[item,index]));
}
module.exports={paintOrder,groupId,textGroupId};
