// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('../scene-plan/source-scene-group-containment');
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
 if(types.isProxy(value)||!Array.isArray(value))return false;
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
 /** Scan once for the exact JSON string length before allocating any copy.
  * This preserves the 262144-character output limit, including controls,
  * quotes, slashes and lone UTF-16 surrogates, without reserving six output
  * characters for every ordinary ASCII coordinate or field name.
  * @param {string} value */
 const string=value=>{
  if(!chargeSharedOutput(work,value.length+1))return false;characters+=2;
  for(let i=0;i<value.length;i++){
   const c=value.charCodeAt(i);
   if(c===34||c===92||c===8||c===9||c===10||c===12||c===13)characters+=2;
   else if(c<32)characters+=6;
   else if(c>=0xD800&&c<=0xDBFF){const next=value.charCodeAt(i+1);if(next>=0xDC00&&next<=0xDFFF){characters+=2;i++;}else characters+=6;}
   else characters+=c>=0xDC00&&c<=0xDFFF?6:1;
   if(characters>262144)return false;
  }return characters<=262144;
 };
 /** @param {unknown} entry @param {number} depth @returns {boolean} */
 const safe=(entry,depth)=>{
  if(!chargeSharedOutput(work,1)||--nodes<0||depth>16)return false;
  if(typeof entry==='string')return string(entry);
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
   if(!string(/** @type {string} */(key)))return false;
   const descriptor=Object.getOwnPropertyDescriptor(entry,key);
   if(!descriptor||!('value'in descriptor)||!safe(/** @type {unknown} */(descriptor.value),depth+1))return false;
  }
  active.delete(entry);return true;
 };
 if(!safe(value,0)||!chargeSharedOutput(work,characters))return null;
 return JSON.stringify(value);
}
module.exports={sharedOutputWork,chargeSharedOutput,sharedOutputRecord,sharedOutputList,sharedRouteOutputSnapshot};
