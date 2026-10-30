// @ts-check
'use strict';
/** @typedef {import('./source-route-core-backdrop').Field} Field */
const LIMIT=4000000;
/** Exact complete-window observations are reusable only inside one observer.
 * A different center or either radius needs a full new source proof. Neither
 * a failed budget nor a thrown source reader may populate this private cache.
 * The caller owns the immutable raster/masks and the returned observations;
 * this helper grants no source-paint or erasure authority.
 * @param {{work:{checks:number},measure:(cx:number,cy:number,radius:number,verticalRadius:number)=>Field|null}} input */
function createCoreBackgroundFields({work,measure}){
 if(typeof measure!=='function')throw new TypeError('Background field reader is invalid');
 /** @type {Map<string,Field|null>} */const fields=new Map();
 /** @param {number} cx @param {number} cy @param {number} radius @param {number} [verticalRadius] @returns {Field|null} */
 return function read(cx,cy,radius,verticalRadius=radius){
  if(![cx,cy,radius,verticalRadius].every(Number.isSafeInteger)||radius<3||verticalRadius<3
   ||!Number.isSafeInteger(work.checks)||work.checks<0)throw new RangeError('Background field query is invalid');
  if(++work.checks>LIMIT)return null;
  const key=cx+','+cy+','+radius+','+verticalRadius;
  if(fields.has(key))return fields.get(key)??null;
  const field=measure(cx,cy,radius,verticalRadius);
  if(!Number.isSafeInteger(work.checks)||work.checks<0)throw new RangeError('Background field work is invalid');
  if(work.checks>LIMIT)return null;
  fields.set(key,field);return field;
 };
}
module.exports={createCoreBackgroundFields};
