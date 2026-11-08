// @ts-check
'use strict';
const {types}=require('node:util');
/** @param {unknown} value @param {string} key @returns {unknown} */
function own(value,key){
 if(value===null||typeof value!=='object'||types.isProxy(value))return undefined;
 const d=Object.getOwnPropertyDescriptor(value,key);return d&&'value'in d?d.value:undefined;
}
/** @param {unknown} event */
function fileKey(event){
 const raw=own(own(event,'data'),'file');
 return typeof raw==='string'&&raw.length>0&&raw.length<=32768?raw.replaceAll('\\','/'):null;
}
/** Bounded stderr signatures are observations of text, never a crash cause.
 * No message, stack, source line, environment or arbitrary content is emitted.
 * Store only a short in-memory tail so a split signature can be recognized. */
function createStderrSummary(){
 /** @type {Map<string,{events:number,bytes:number,truncated:boolean,tail:string,patterns:Set<string>}>} */const files=new Map();
 const patterns=[['fatal-error-text',/FATAL ERROR:/u],['heap-exhaustion-text',/heap out of memory|Reached heap limit|Allocation failed/u],
  ['native-stack-text',/Native stack trace|C stack trace/u],['fatal-report-text',/Writing Node\.js report|Node\.js report completed/u],
  ['unsupported-option-text',/bad option:|is not allowed in NODE_OPTIONS/u]];
 return {
  /** @param {unknown} event */
  observe(event){
   if(own(event,'type')!=='test:stderr')return;
   const key=fileKey(event),message=own(own(event,'data'),'message');
   if(key===null||typeof message!=='string')return;
   if(!files.has(key)&&files.size>=128)return;
   const state=files.get(key)??{events:0,bytes:0,truncated:false,tail:'',patterns:new Set()};files.set(key,state);
   state.events=Math.min(1000000,state.events+1);
   const bounded=message.slice(0,65536),sample=state.tail+bounded;
   state.bytes=Math.min(16*1024*1024,state.bytes+Buffer.byteLength(bounded));
   state.truncated||=message.length>bounded.length||state.bytes===16*1024*1024||state.events===1000000;
   for(const [label,pattern]of patterns)if(/** @type {RegExp} */(pattern).test(sample))state.patterns.add(/** @type {string} */(label));
   state.tail=bounded.slice(-128);
  },
  /** @param {unknown} event */
  take(event){
   const key=fileKey(event);if(key===null)return null;
   const state=files.get(key);files.delete(key);if(!state)return null;
   return {stderrEvents:state.events,stderrSampleBytes:state.bytes,stderrTruncated:state.truncated,stderrTextSignatures:[...state.patterns].sort()};
  }
 };
}
module.exports={createStderrSummary};
