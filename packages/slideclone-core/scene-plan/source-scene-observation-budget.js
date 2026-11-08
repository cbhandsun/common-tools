// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
/** One job owns one global observation and an explicitly bounded set of local pairs. Failed
 * calls spend their slot too; concurrent local calls reserve before dispatch.
 * Reconciliation and source compilation cannot reset this job ledger.
 * @param {(request:import('./source-scene-planner').VisionRequest)=>Promise<unknown>} recognize
 * @param {number} [maxReviewBatches] Explicit job-local authorization; default remains one pair. */
function createSceneObservationBudget(recognize,maxReviewBatches=1){
 if(typeof recognize!=='function')throw new TypeError('Scene recognizer is invalid');
 if(!Number.isSafeInteger(maxReviewBatches)||maxReviewBatches<1||maxReviewBatches>16)throw new TypeError('Scene review batch budget is invalid');
 let globalCalls=0,localCalls=0,globalComplete=false;
 /** @param {import('./source-scene-planner').VisionRequest} request */
 return async request=>{
  if(!record(request))throw new TypeError('Scene observation request is invalid');
  if(request.task==='structure'){
   if(globalCalls!==0||localCalls!==0)throw new RangeError('Scene global observation budget exhausted');
   globalCalls++;
   const response=await recognize(request);globalComplete=true;return response;
  }
  if(request.task!=='classify-ocr')throw new TypeError('Scene observation task is invalid');
  if(!globalComplete||localCalls>=2*maxReviewBatches)throw new RangeError('Scene local observation budget exhausted');
  localCalls++;return recognize(request);
 };
}
module.exports={createSceneObservationBudget};
