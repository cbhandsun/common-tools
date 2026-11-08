// @ts-check
'use strict';
const {readSceneExecutionControls}=require('./scene-execution-controls');
const {sceneVisionFromEnvironment}=require('./source-scene-client');
const {createSourceScenePlanner}=require('../slideclone-core/scene-plan/source-scene-planner');
const {compileSourceScene,preflightSourceScene}=require('../slideclone-core/scene-plan/source-scene-compiler');
const {applyRetainedSceneReview}=require('../slideclone-core/scene-plan/retained-scene-review');
const {createSourceSceneReviewStore}=require('./source-scene-review-store');
const {record}=require('../slideclone-core/scene-plan/source-scene-group-containment');
const {types}=require('node:util');
/** @param {unknown} environment */
function reviewStoreFromEnvironment(environment){
 if(environment===null||typeof environment!=='object'||types.isProxy(environment))throw new TypeError('Scene review store configuration is invalid');
 const descriptor=Object.getOwnPropertyDescriptor(environment,'COMMON_TOOLS_IMAGE_SCENE_REVIEW_ROOT');
 if(descriptor&&!('value'in descriptor))throw new TypeError('Scene review store configuration is invalid');
 return descriptor?.value===undefined?undefined:createSourceSceneReviewStore(descriptor.value);
}
/** Opt-in graphic location aids for the global planner; strict 'true'|'false'.
 * @param {unknown} environment */
function graphicCandidatesFromEnvironment(environment){
 if(environment===null||typeof environment!=='object'||types.isProxy(environment))throw new TypeError('Scene graphic candidate configuration is invalid');
 const descriptor=Object.getOwnPropertyDescriptor(environment,'COMMON_TOOLS_IMAGE_SCENE_GRAPHIC_CANDIDATES');
 if(descriptor&&!('value'in descriptor))throw new TypeError('Scene graphic candidate configuration is invalid');
 const value=/** @type {unknown} */(descriptor?.value);
 if(value===undefined||value==='false')return false;
 if(value==='true')return true;
 throw new TypeError('Scene graphic candidate configuration is invalid');
}
/** Assemble the source-scene stage as one unit: planning and preflight share
 * the same compiler contract and the explicitly authorized job call ledger.
 * No source proof or completed-member receipt is granted by this assembly.
 * @param {{environment?:NodeJS.ProcessEnv|undefined,sceneReviewBatches?:number|undefined,
 * sceneVision?:((request:import('../slideclone-core/scene-plan/source-scene-planner').VisionRequest)=>Promise<unknown>)|null|undefined}} [options] */
function createSourceSceneRuntime({environment=process.env,sceneReviewBatches,sceneVision}={}){
 const controls=readSceneExecutionControls(environment),batches=sceneReviewBatches??controls.reviewBatches;
 if(sceneReviewBatches!==undefined&&(!Number.isSafeInteger(sceneReviewBatches)||sceneReviewBatches<1||sceneReviewBatches>16))
  throw new TypeError('Scene review batch budget is invalid');
 const vision=sceneVision===undefined?sceneVisionFromEnvironment(environment):sceneVision;
 if(vision!==null&&vision!==undefined&&typeof vision!=='function')throw new TypeError('Scene recognizer is invalid');
 const readReview=reviewStoreFromEnvironment(environment);
 /** @param {import('../slideclone-core/scene-plan/source-scene-compiler').CompileInput} input */
 const compileReviewedScene=input=>{
  if(!record(input)||!record(input.plan)||typeof input.plan.sourceHash!=='string')throw new TypeError('Scene review source is invalid');
  if(input.preflight)return compileSourceScene(input);
  const review=readReview?.(input.plan.sourceHash);
  return compileSourceScene(review===undefined?input:applyRetainedSceneReview(input,review));
 };
 return Object.freeze({reviewSourceScene:vision?createSourceScenePlanner({recognize:vision,maxReviewBatches:batches,graphicCandidates:graphicCandidatesFromEnvironment(environment),...(readReview?{readRetainedReview:readReview}:{})}):undefined,
  compileSourceScene:readReview?compileReviewedScene:compileSourceScene,preflightSourceScene});
}
module.exports={createSourceSceneRuntime};
