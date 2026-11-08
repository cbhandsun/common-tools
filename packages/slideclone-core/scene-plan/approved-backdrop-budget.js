// @ts-check
'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const MAXIMUM=4000000;
/** @type {AsyncLocalStorage<{sourceChecks:number,applicationChecks:number}>} */
const storage=new AsyncLocalStorage();
/** Keep costs private to one reconstruction, including concurrent jobs. A
 * serialized quality report cannot reset or supply the source cost.
 * @template T @param {()=>T} callback @returns {T} */
function withApprovedBackdropBudget(callback){return storage.run({sourceChecks:0,applicationChecks:0},callback);}
/** Record the actual shared residual proof work, including failed attempts.
 * Existing reconstruction without an approved pixel service keeps its policy.
 * @param {number} checks */
function recordSharedResidualChecks(checks){
 const state=storage.getStore();if(!state)return;
 if(!Number.isSafeInteger(checks)||checks<0)throw new TypeError('approved-backdrop-source-budget-invalid');
 state.sourceChecks+=checks;
}
/** @param {number} checks */
function chargeApprovedBackdropChecks(checks){
 const state=storage.getStore();
 if(!state||!Number.isSafeInteger(checks)||checks<0)throw new TypeError('approved-backdrop-budget-context-required');
 if(state.sourceChecks+state.applicationChecks+checks>MAXIMUM)throw new RangeError('approved-backdrop-budget-exceeded');
 state.applicationChecks+=checks;
}
function approvedBackdropBudget(){
 const state=storage.getStore();if(!state)throw new TypeError('approved-backdrop-budget-context-required');
 return {...state,totalChecks:state.sourceChecks+state.applicationChecks,maximum:MAXIMUM};
}
module.exports={withApprovedBackdropBudget,recordSharedResidualChecks,chargeApprovedBackdropChecks,approvedBackdropBudget};
