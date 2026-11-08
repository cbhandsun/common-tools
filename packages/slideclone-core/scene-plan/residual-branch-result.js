// @ts-check
"use strict";
const {types}=require('node:util');
/** @typedef {{passed:false,scannedPixels:number,ownedPixels:number,ownedForegroundPixels:number,
 * remainingOwnedForegroundPixels:number,remainingOwnedBackgroundPixels:number,unownedChangedPixels:number,
 * remainingTextCorePixels:number,incorrectTextBackgroundPixels:number,unresolvedTextMasks:number,incorrectRouteBackgroundPixels?:number}} Ownership */
/** @type {WeakMap<object,Ownership>} */const rejections=new WeakMap();
const counters=['scannedPixels','ownedPixels','ownedForegroundPixels','remainingOwnedForegroundPixels',
 'remainingOwnedBackgroundPixels','unownedChangedPixels','remainingTextCorePixels','incorrectTextBackgroundPixels','unresolvedTextMasks'];
/** Only the real pixel audit can produce a recoverable representation failure.
 * Other I/O, geometry, resource and cancellation errors must still propagate.
 * Numeric evidence is safe to retain; source pixels and user text never enter it.
 * @param {unknown} report */
function residualOwnershipRejection(report){
 if(report===null||typeof report!=='object'||types.isProxy(report)||Array.isArray(report)
  ||![Object.prototype,null].includes(Object.getPrototypeOf(report))
  ||Object.values(Object.getOwnPropertyDescriptors(report)).some(p=>!('value' in p)))
  throw new TypeError('Residual ownership rejection evidence is invalid');
 const value=/** @type {Record<string,unknown>} */(report);
 const fields=Object.hasOwn(value,'incorrectRouteBackgroundPixels')?[...counters,'incorrectRouteBackgroundPixels']:counters;
 if(Reflect.ownKeys(value).length!==fields.length+1||value.passed!==false
  ||fields.some(key=>typeof value[key]!=='number'||!Number.isSafeInteger(value[key])||Number(value[key])<0||Number(value[key])>40000000)
  ||['remainingOwnedForegroundPixels','remainingOwnedBackgroundPixels','unownedChangedPixels','remainingTextCorePixels',
   'incorrectTextBackgroundPixels','unresolvedTextMasks','incorrectRouteBackgroundPixels'].every(key=>(value[key]??0)===0))
  throw new TypeError('Residual ownership rejection evidence is invalid');
 const evidence=Object.freeze(/** @type {Ownership} */({...value}));
 const error=new Error('full-slide residual retains owned foreground or changes unowned pixels');
 rejections.set(error,evidence);
 return error;
}
/** Name/message/code matches and serialized/copied errors grant no authority.
 * @param {unknown} error */
function readResidualOwnershipRejection(error){
 return error!==null&&typeof error==='object'?rejections.get(error):undefined;
}
/** A rejected optional raster is an explicit failed branch. The caller may
 * continue native composition for measurement, while keeping the final gate red.
 * @template T @param {()=>Promise<T>} build
 * @returns {Promise<{kind:'accepted',residual:T}|{kind:'rejected',pixelOwnership:Ownership}>} */
async function attemptSourceResidual(build){
 if(typeof build!=='function')throw new TypeError('Residual branch builder is invalid');
 try{return {kind:'accepted',residual:await build()};}
 catch(error){const pixelOwnership=readResidualOwnershipRejection(error);if(!pixelOwnership)throw error;
  return {kind:'rejected',pixelOwnership};}
}
module.exports={residualOwnershipRejection,readResidualOwnershipRejection,attemptSourceResidual};
