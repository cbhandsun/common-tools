// @ts-check
'use strict';
const {types}=require('node:util');
/** Explicit operator/isolated-run controls only. Missing values preserve the
 * original one pair and 60-second deadline. This never changes local limits,
 * model selection, source admission, quality gates or another job's ledger.
 * @param {unknown} environment
 * @returns {Readonly<{reviewBatches:number,globalTimeoutMs:60000|90000}>} */
function readSceneExecutionControls(environment){
 if(environment===null||typeof environment!=='object'||Array.isArray(environment)||types.isProxy(environment)
  ||environment!==process.env&&![null,Object.prototype].includes(Object.getPrototypeOf(environment)))
  throw new TypeError('Scene execution configuration is invalid');
 /** @param {string} key @returns {unknown} */
 const own=key=>{const property=Object.getOwnPropertyDescriptor(environment,key);
  if(property&&!('value'in property))throw new TypeError('Scene execution configuration is invalid');
  return property?.value;};
 const batches=own('COMMON_TOOLS_IMAGE_SCENE_REVIEW_BATCHES'),timeout=own('COMMON_TOOLS_IMAGE_SCENE_GLOBAL_TIMEOUT_MS');
 if(batches!==undefined&&(typeof batches!=='string'||!/^(?:[1-9]|1[0-6])$/u.test(batches))
  ||timeout!==undefined&&timeout!=='60000'&&timeout!=='90000')throw new TypeError('Scene execution configuration is invalid');
 return Object.freeze({reviewBatches:batches===undefined?1:Number(batches),globalTimeoutMs:timeout==='90000'?90000:60000});
}
module.exports={readSceneExecutionControls};
