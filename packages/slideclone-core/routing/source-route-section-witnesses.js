// @ts-check
'use strict';
/** @typedef {{left:number[],right:number[],profile:number[]}} Witness
 * @typedef {{background:number[],step:number[],profile:number[],first:number,last:number}} Section */

/** Successful bilateral evidence belongs to one immutable observer invocation.
 * Queries still revalidate their exterior cell and the entire opaque core.
 * Only the identical physical run and oriented transverse axis may reuse its
 * four exterior flank samples and both already validated edge profiles.
 */
function createRouteSectionWitnesses(){
 /** @type {Map<string,Witness>} */const witnesses=new Map();
 /** @param {number} cell @param {number} dx @param {number} dy */
 const key=(cell,dx,dy)=>cell+','+dx+','+dy;
 return {
  /** @param {number} cell @param {number} dx @param {number} dy
   * @param {number} first @param {number} last @returns {Section|null} */
  read(cell,dx,dy,first,last){
   const prior=witnesses.get(key(cell,dx,dy));if(!prior)return null;
   const span=first-last+11;
   // Preserve the original interpolation order: multiplying a precomputed
   // step instead can change floating-point rounding at color boundaries.
   return {background:prior.left.map((v,c)=>v+((prior.right[c]??0)-v)*(5-last)/span),
    step:prior.left.map((v,c)=>((prior.right[c]??0)-v)/span),profile:prior.profile,first,last};
  },
  /** Called only after all four flanks and both complete profiles pass.
   * @param {number} cell @param {number} dx @param {number} dy
   * @param {number[]} left @param {number[]} right @param {number[]} profile */
  remember(cell,dx,dy,left,right,profile){witnesses.set(key(cell,dx,dy),{left,right,profile});}
 };
}
module.exports={createRouteSectionWitnesses};
