// @ts-check
'use strict';
const {readSceneExecutionControls}=require('./scene-execution-controls');
const {sceneVisionFromEnvironment}=require('./source-scene-client');
const {createSourceScenePlanner}=require('../slideclone-core/source-scene-planner');
const {compileSourceScene,preflightSourceScene}=require('../slideclone-core/source-scene-compiler');
/** Assemble the source-scene stage as one unit: planning and preflight share
 * the same compiler contract and the explicitly authorized job call ledger.
 * No source proof or completed-member receipt is granted by this assembly.
 * @param {{environment?:NodeJS.ProcessEnv|undefined,sceneReviewBatches?:number|undefined,
 * sceneVision?:((request:import('../slideclone-core/source-scene-planner').VisionRequest)=>Promise<unknown>)|null|undefined}} [options] */
function createSourceSceneRuntime({environment=process.env,sceneReviewBatches,sceneVision}={}){
 const controls=readSceneExecutionControls(environment),batches=sceneReviewBatches??controls.reviewBatches;
 if(sceneReviewBatches!==undefined&&(!Number.isSafeInteger(sceneReviewBatches)||sceneReviewBatches<1||sceneReviewBatches>16))
  throw new TypeError('Scene review batch budget is invalid');
 const vision=sceneVision===undefined?sceneVisionFromEnvironment(environment):sceneVision;
 if(vision!==null&&vision!==undefined&&typeof vision!=='function')throw new TypeError('Scene recognizer is invalid');
 return Object.freeze({reviewSourceScene:vision?createSourceScenePlanner({recognize:vision,maxReviewBatches:batches}):undefined,
  compileSourceScene,preflightSourceScene});
}
module.exports={createSourceSceneRuntime};
