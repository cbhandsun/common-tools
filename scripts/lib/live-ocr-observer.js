// @ts-check
'use strict';
/** Observe actual OCR calls without substituting historical crop results.
 * Inputs and provider errors are forwarded unchanged, never recorded.
 * @param {{recognize:(...args:unknown[])=>Promise<unknown>,record:(event:{call:number,completed:boolean})=>void}} options */
function createLiveOcrObserver({recognize,record}) {
 if(typeof recognize!=='function'||typeof record!=='function')throw new TypeError('Live OCR observer dependencies are invalid');
 let calls=0;
 return async function observeOcr(/** @type {unknown[]} */ ...args) {
  const call=++calls;
  let result;
  try { result=await recognize(...args); }
  catch(error) { record({call,completed:false});throw error; }
  record({call,completed:true});
  return result;
 };
}
module.exports={createLiveOcrObserver};
