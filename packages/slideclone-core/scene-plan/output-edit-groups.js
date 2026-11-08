// @ts-check
'use strict';
const {snapshot,record,list}=require('./approved-frame-application-input');
/** @typedef {{id:string,members:string[]}} OutputEditGroup */
/** Presentation-only assembly, never source membership or erasure authority.
 * Validate before a writer can reorder objects. Existing measured groups and
 * external relation paths cannot be overridden by this public output plan.
 * @param {unknown} input @returns {OutputEditGroup[]} */
function validateOutputEditGroups(input){
 try{
  snapshot(input);const page=record(input);
  if(page.outputEditGroups===undefined)return [];
  const rows=list(page.outputEditGroups,96),all=['shapes','images','textBoxes'].flatMap(key=>list(page[key]??[],10000).map(record));
  if(all.length>10000)throw Error();
  const byId=new Map(),existing=new Set();
  for(const item of all){
   if(typeof item.id!=='string'||byId.has(item.id))throw Error();byId.set(item.id,item);
   const source=item.source===undefined?{}:record(item.source),style=item.style===undefined?{}:record(item.style);
   for(const group of [source.nativeComponentGroupId,style.nativeComponentGroupId])if(group!==undefined)existing.add(group);
  }
  const ids=new Set(),claimed=new Set();
  return rows.map(value=>{
   const row=record(value);
   if(Object.keys(row).some(key=>!['id','members'].includes(key))||typeof row.id!=='string'
    ||!/^[-A-Za-z0-9_]{1,128}$/u.test(row.id)||ids.has(row.id)||existing.has(row.id))throw Error();ids.add(row.id);
   const members=list(row.members,128);
   if(members.length<2)throw Error();
   return {id:row.id,members:members.map(id=>{
    if(typeof id!=='string'||!/^[-A-Za-z0-9_]{1,128}$/u.test(id)||claimed.has(id))throw Error();
    const item=byId.get(id);if(!item)throw Error();
    const source=item.source===undefined?{}:record(item.source),style=item.style===undefined?{}:record(item.style);
    if(source.nativeComponentGroupId!==undefined||style.nativeComponentGroupId!==undefined
     ||source.sceneRelationId!==undefined||source.nativeConnectorRoute===true||style.startAnchor!==undefined||style.endAnchor!==undefined)throw Error();
    claimed.add(id);return id;
   })};
  });
 }catch{throw new TypeError('Output edit grouping is invalid');}
}
module.exports={validateOutputEditGroups};
