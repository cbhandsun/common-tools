// @ts-check
"use strict";
const {Worker}=require('node:worker_threads');
const {types}=require('node:util');
const path=require('node:path');
const {parseSceneFillGeometry}=require('./source-scene-fill-geometry');
const {encodeNativeFreeformPath,decodeNativeFreeformPath}=require('./native-freeform-path');
/** @typedef {import('./source-scene-fill-geometry').Geometry} Geometry */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** @param {unknown} value @param {number} max @returns {unknown[]} */
function list(value,max){if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype
 ||value.length>max||Reflect.ownKeys(value).length!==value.length+1
 ||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!('value' in p)))throw new TypeError('Scene geometry batch is invalid');return value;}
/** Geometry is revalidated on return from the fixed local worker. A path
 * cannot escape its observed frame or create source/semantic ownership.
 * @param {unknown} value @param {{x:number,y:number,w:number,h:number}} frame @returns {Geometry|null} */
function parseGeometry(value,frame){
 if(value===null)return null;
 if(!record(value)||Object.keys(value).some(k=>!['segments','parts'].includes(k))
  ||value.segments!==undefined&&value.parts!==undefined)throw new TypeError('Scene geometry result is invalid');
 if(value.segments!==undefined)return {segments:decodeNativeFreeformPath(encodeNativeFreeformPath(value.segments))};
 if(value.parts===undefined)return {};
 const parts=list(value.parts,32).map(part=>{
  if(!record(part)||!record(part.box))throw new TypeError('Scene geometry part is invalid');
  const {x,y,w,h}=part.box;
  if(![x,y,w,h].every(v=>typeof v==='number'&&Number.isSafeInteger(v))||Number(w)<=0||Number(h)<=0
   ||Number(x)<frame.x||Number(y)<frame.y||Number(x)+Number(w)>frame.x+frame.w||Number(y)+Number(h)>frame.y+frame.h)
   throw new TypeError('Scene geometry part frame is invalid');
  return {box:{x:Number(x),y:Number(y),w:Number(w),h:Number(h)},segments:decodeNativeFreeformPath(encodeNativeFreeformPath(part.segments))};
 });
 if(!parts.length)throw new TypeError('Scene geometry parts are empty');
 return {parts};
}
/** Execute only independent, already observed geometry. Source acquisition
 * and dependent retries must stay with the caller. Each solver retains its
 * original 4M work cap; the batch cannot create additional targets or scans.
 * The caller supplies the existing job's absolute deadline, never a fresh
 * per-region timeout. All threads are joined on success, abort and failure.
 * @param {unknown} inputs @param {{deadlineMs:number,signal?:AbortSignal}} options */
async function fitSceneFillGeometryBatch(inputs,options){
 if(!record(options)||typeof options.deadlineMs!=='number'||!Number.isFinite(options.deadlineMs)
  ||options.deadlineMs>Date.now()+540000||options.signal!==undefined&&!(options.signal instanceof AbortSignal))
  throw new TypeError('Scene geometry deadline is invalid');
 const source=list(inputs,32);let points=0;
 for(const input of source){
  if(!record(input)||!Array.isArray(input.points)||types.isProxy(input.points)||input.points.length>262144)
   throw new TypeError('Scene geometry input is invalid');
  // Array length is an own data property. Inspect only capacity here; the
  // parser below validates and snapshots every cell exactly once.
  points+=input.points.length;if(points>4000000)throw new RangeError('Scene geometry batch exceeds its point ceiling');
 }
 const jobs=source.map(parseSceneFillGeometry);
 const deadlineMs=options.deadlineMs,signal=options.signal;
 if(signal?.aborted)throw new Error('Scene geometry batch cancelled');
 if(deadlineMs<=Date.now())throw new Error('Scene geometry deadline exceeded');
 if(!jobs.length)return {results:[],execution:[]};
 /** @type {Worker[]} */const workers=[];
 /** @type {(Geometry|null)[]} */const results=new Array(jobs.length);
 /** @type {{index:number,threadId:number,startedAt:number,finishedAt:number}[]} */const execution=[];
 /** @type {NodeJS.Timeout|undefined} */let timer;
 let cancel=()=>{};
 try{
  await new Promise((resolve,reject)=>{
   let next=0,completed=0,settled=false;
   /** @param {string} reason */const fail=reason=>{if(!settled){settled=true;reject(new Error(reason));}};
   cancel=()=>fail('Scene geometry batch cancelled');
   signal?.addEventListener('abort',cancel,{once:true});
   timer=setTimeout(()=>fail('Scene geometry deadline exceeded'),Math.max(1,deadlineMs-Date.now()));
   for(let slot=0;slot<Math.min(2,jobs.length);slot++){
    const worker=new Worker(path.join(__dirname,'source-scene-fill-geometry-worker.js'));workers.push(worker);
    let active=-1;
    const dispatch=()=>{if(settled||next>=jobs.length)return;active=next++;worker.postMessage({index:active,input:jobs[active]});};
    worker.on('error',()=>fail('Scene geometry worker failed'));
    worker.on('exit',()=>{if(!settled)fail('Scene geometry worker exited early');});
    worker.on('message',(/** @type {unknown} */message)=>{
     if(settled)return;
     if(Date.now()>=deadlineMs){fail('Scene geometry deadline exceeded');return;}
     try{
      const job=jobs[active];
      if(!job||!record(message)||message.ok!==true||message.index!==active||typeof message.threadId!=='number'
       ||!Number.isSafeInteger(message.threadId)||message.threadId<=0||typeof message.startedAt!=='number'||typeof message.finishedAt!=='number'
       ||!Number.isFinite(message.startedAt)||!Number.isFinite(message.finishedAt)||message.finishedAt<message.startedAt)
       throw new TypeError('Scene geometry worker protocol failed');
      results[active]=parseGeometry(message.geometry,job.box);
      execution.push({index:active,threadId:message.threadId,startedAt:message.startedAt,finishedAt:message.finishedAt});
      completed++;active=-1;
      if(completed===jobs.length){settled=true;resolve(undefined);}else dispatch();
     }catch{fail('Scene geometry worker result rejected');}
    });
    dispatch();
   }
  });
  return {results,execution:execution.sort((a,b)=>a.index-b.index)};
 }finally{
  if(timer)clearTimeout(timer);signal?.removeEventListener('abort',cancel);
  await Promise.all(workers.map(worker=>worker.terminate()));
 }
}
module.exports={fitSceneFillGeometryBatch};
