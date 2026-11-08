// @ts-check
"use strict";
const {types}=require('node:util');
/** Evaluate at most two independent candidates with the caller's existing
 * cancellation/deadline predicate. Join both before returning or throwing;
 * completion order never becomes candidate selection order.
 * @template T
 * @param {((cancelled:()=>Promise<boolean>)=>Promise<T>)[]} tasks
 * @param {()=>boolean|Promise<boolean>} isCancellationRequested
 * @returns {Promise<T[]>} */
async function runCandidatePair(tasks,isCancellationRequested){
 if(!Array.isArray(tasks)||types.isProxy(tasks)||Object.getPrototypeOf(tasks)!==Array.prototype||tasks.length>2
  ||Reflect.ownKeys(tasks).length!==tasks.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(tasks)).some(p=>!('value' in p))
  ||tasks.some(task=>typeof task!=='function')||typeof isCancellationRequested!=='function')
  throw new TypeError('Candidate pair is invalid');
 const snapshot=tasks.slice();let stopped=false,failed=false;
 /** @type {unknown} */let failure;
 const cancelled=async()=>{
  if(stopped)return true;
  const value=await isCancellationRequested();
  if(value!==false)stopped=true;
  return stopped;
 };
 const outcomes=await Promise.allSettled(snapshot.map(async task=>{
  try{
   if(await cancelled())throw new Error('editable job was cancelled');
   const result=await task(cancelled);
   if(await cancelled())throw new Error('editable job was cancelled');
   return result;
  }catch(error){if(!failed){failed=true;failure=error;}stopped=true;throw error;}
 }));
 if(failed)throw failure;
 return outcomes.map(result=>{
  if(result.status!=='fulfilled')throw new Error('Candidate pair did not complete');
  return result.value;
 });
}
module.exports={runCandidatePair};
