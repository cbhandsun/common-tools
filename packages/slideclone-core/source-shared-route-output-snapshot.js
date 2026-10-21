// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('./source-scene-group-containment');
/** @typedef {{checks:number}} Work */
/** @param {unknown} value @returns {value is Work} */
function sharedOutputWork(value){return record(value)&&typeof value.checks==='number'&&Number.isSafeInteger(value.checks)
 &&value.checks>=0&&value.checks<=4000000&&Object.getOwnPropertyDescriptor(value,'checks')?.writable===true;}
/** Reserve before traversal or allocation. Exhaustion never grants a prefix.
 * @param {Work} work @param {number} count */
function chargeSharedOutput(work,count){
 if(work.checks+count>4000000){work.checks=4000001;return false;}work.checks+=count;return true;
}
/** Proxy checks precede reflection; descriptor inspection never calls getters.
 * @param {unknown} value @param {Work} work @returns {value is Record<string,unknown>} */
function sharedOutputRecord(value,work){
 if(value===null||typeof value!=='object'||types.isProxy(value)||Array.isArray(value))return false;
 if(!chargeSharedOutput(work,Reflect.ownKeys(value).length*3+1))return false;
 return record(value);
}
/** @param {unknown} value @param {Work} work @returns {value is unknown[]} */
function sharedOutputList(value,work){
 if(!Array.isArray(value)||types.isProxy(value))return false;
 if(!chargeSharedOutput(work,Reflect.ownKeys(value).length*3+1))return false;
 return list(value);
}
/** Bounded rendering AND provenance snapshot. Unlike a post-stringify length
 * check, all strings, keys and nested entries are reserved before JSON creates
 * a second copy. Existing 30K tree/depth limits remain, in the SAME ledger.
 * @param {unknown} item @param {Work} work @returns {string|null} */
function sharedRouteOutputSnapshot(item,work){
 if(!sharedOutputRecord(item,work)||!sharedOutputRecord(item.source,work))return null;
 const value=Object.fromEntries(['id','type','box','rotation','style','font','text','runs','positionedRuns','source'].map(key=>[key,item[key]]));
 let nodes=30000,characters=0;const active=new Set();
 /** Upper bound includes worst-case JSON escaping without allocating it.
  * @param {number} length */
 const string=length=>{
  if(!chargeSharedOutput(work,length+1))return false;
  characters+=length*6+2;return characters<=262144;
 };
 /** @param {unknown} entry @param {number} depth @returns {boolean} */
 const safe=(entry,depth)=>{
  if(!chargeSharedOutput(work,1)||--nodes<0||depth>16)return false;
  if(typeof entry==='string')return string(entry.length);
  if(entry===null||entry===undefined||typeof entry==='boolean'){characters+=9;return characters<=262144;}
  if(typeof entry==='number'){characters+=32;return Number.isFinite(entry)&&characters<=262144;}
  const array=Array.isArray(entry);
  if(!(array?sharedOutputList(entry,work):sharedOutputRecord(entry,work))||active.has(entry))return false;
  const keys=Reflect.ownKeys(/** @type {object} */(entry));
  if(keys.length>nodes+1||keys.some(key=>typeof key!=='string'))return false;
  characters+=keys.length+2;if(characters>262144)return false;
  active.add(entry);
  for(const key of keys){
   if(array&&key==='length')continue;
   if(!string(/** @type {string} */(key).length))return false;
   const descriptor=Object.getOwnPropertyDescriptor(entry,key);
   if(!descriptor||!('value'in descriptor)||!safe(/** @type {unknown} */(descriptor.value),depth+1))return false;
  }
  active.delete(entry);return true;
 };
 if(!safe(value,0)||!chargeSharedOutput(work,characters))return null;
 return JSON.stringify(value);
}
module.exports={sharedOutputWork,chargeSharedOutput,sharedOutputRecord,sharedOutputList,sharedRouteOutputSnapshot};
