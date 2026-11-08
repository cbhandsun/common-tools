// @ts-check
"use strict";
const {types}=require("node:util");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{id:string,box:Box}} Region */
/** @typedef {{id:string,ownerRegionId:string,ownerObjectId:string,kind:string,box:Box}} ObjectOwner */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @returns {value is string} */
function id(value){return typeof value==="string"&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);}
/** @param {unknown} value @returns {value is Box} */
function box(value){return record(value)&&[value.x,value.y,value.w,value.h].every(v=>typeof v==="number"&&Number.isFinite(v))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0
 &&Number(value.x)+Number(value.w)<=16384&&Number(value.y)+Number(value.h)<=16384;}
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function list(value,maximum){if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype
 ||value.length>maximum||Reflect.ownKeys(value).length!==value.length+1
 ||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!("value" in p)))throw new TypeError("Scene owner collection is invalid");return value;}
/** @param {Box} outer @param {Box} inner */
function contains(outer,inner){return inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.w<=outer.x+outer.w+1e-6
 &&inner.y+inner.h<=outer.y+outer.h+1e-6;}
/** Recover explicit object nesting, never an inferred nearest region. The
 * strict scene parser supplies canonical identities and source-bound boxes.
 * Every link must have one container parent, containment and a region root.
 * Missing, cyclic, duplicate or non-container owners authorize no conversion.
 * This function observes controls only; it authorizes no source pixels.
 * @param {unknown} regionInput @param {unknown} objectInput */
function resolveSceneObjectOwners(regionInput,objectInput){
 const regions=list(regionInput,24).map(value=>{if(!record(value)||!id(value.id)||!box(value.box))throw new TypeError("Scene owner region is invalid");
  return {id:value.id,box:{...value.box}};});
 const objects=list(objectInput,64).map(value=>{if(!record(value)||!id(value.id)||!id(value.ownerRegionId)||!id(value.ownerObjectId)
  ||typeof value.kind!=="string"||!["container","icon","unknown"].includes(value.kind)||!box(value.box))throw new TypeError("Scene owner object is invalid");
  return {id:value.id,ownerRegionId:value.ownerRegionId,ownerObjectId:value.ownerObjectId,kind:value.kind,box:{...value.box}};});
 const byRegion=new Map(regions.map(r=>[r.id,r]));if(byRegion.size!==regions.length)throw new TypeError("Scene owner region identity conflicts");
 /** @type {Map<string,ObjectOwner[]>} */const byObject=new Map();
 for(const object of objects){const bucket=byObject.get(object.id)||[];bucket.push(object);byObject.set(object.id,bucket);}
 /** @type {{objectId:string,regionId:string,parentObjectId:string}[]} */const resolved=[];
 for(const object of objects){
  if(byRegion.has(object.ownerRegionId)||byObject.get(object.id)?.length!==1)continue;
  let current=object;const seen=new Set([object.id]);let parentObjectId="";
  for(let depth=0;depth<objects.length;depth++){
   const candidates=byObject.get(current.ownerObjectId),parent=candidates?.length===1?candidates[0]:undefined;
   if(!parent||parent.kind!=="container"||seen.has(parent.id)||!contains(parent.box,current.box))break;
   if(!parentObjectId)parentObjectId=parent.id;seen.add(parent.id);
   const region=byRegion.get(parent.ownerRegionId);
   if(region){if(contains(region.box,parent.box))resolved.push({objectId:object.id,regionId:region.id,parentObjectId});break;}
   current=parent;
  }
 }
 return resolved;
}
module.exports={resolveSceneObjectOwners};
