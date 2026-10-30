// @ts-check
"use strict";
const {types}=require('node:util');
/** Execute the two already-budgeted independent observations. Prepare and charge
 * both inputs before calling this boundary; ordered reduction stays with the
 * caller. Drain both requests after failure so no provider work escapes the job.
 * @template T
 * @param {{work:((cancel:()=>Promise<boolean>)=>Promise<T>)[],isCancellationRequested:()=>Promise<boolean>,verifySource:()=>void}} input
 * @returns {Promise<[T,T]>} */
async function runPairedSceneReview(input){
 if(!input||typeof input!=='object'||types.isProxy(input)
  ||![Object.prototype,null].includes(Object.getPrototypeOf(input))
  ||Object.values(Object.getOwnPropertyDescriptors(input)).some(p=>!('value' in p)))throw new TypeError('Scene review pair is invalid');
 const {work,isCancellationRequested,verifySource}=input;
 if(!Array.isArray(work)||types.isProxy(work)||Object.getPrototypeOf(work)!==Array.prototype
  ||work.length!==2||Reflect.ownKeys(work).length!==3
  ||Object.values(Object.getOwnPropertyDescriptors(work)).some(p=>!('value' in p))
  ||work.some(task=>typeof task!=='function')||typeof isCancellationRequested!=='function'||typeof verifySource!=='function')
  throw new TypeError('Scene review pair is invalid');
 const tasks=work.slice();
 let failed=false;
 /** @type {unknown} */let failure;
 const cancelled=async()=>{
  if(failed)return true;
  const result=await isCancellationRequested();
  if(typeof result!=='boolean')throw new TypeError('Scene review cancellation is invalid');
  return failed||result;
 };
 if(await cancelled())throw new Error('editable job was cancelled');
 verifySource();
 const settled=await Promise.allSettled(tasks.map(async task=>{
  try{
   if(await cancelled())throw new Error('editable job was cancelled');
   verifySource();
   const result=await task(cancelled);
   if(await cancelled())throw new Error('editable job was cancelled');
   verifySource();return result;
  }catch(error){if(!failed){failed=true;failure=error;}throw error;}
 }));
 if(failed)throw failure;
 const [first,second]=settled;
 if(first?.status!=='fulfilled'||second?.status!=='fulfilled')throw new Error('Scene review pair did not finish');
 if(await cancelled())throw new Error('editable job was cancelled');
 verifySource();return [first.value,second.value];
}
module.exports={runPairedSceneReview};
