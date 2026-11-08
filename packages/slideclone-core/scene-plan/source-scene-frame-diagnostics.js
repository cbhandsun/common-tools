// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
/** @typedef {{kind:'rail-gap',stage:'rail'|'corner-join',side:number,startPx:number,endPx:number,trackPx:number,thicknessPx:number,allowedGapPx:number}} RailGap */
/** @typedef {{kind:'corner-unproven',xPx:number,yPx:number,farX:boolean,farY:boolean,searchLimitPx:number}} Corner */
/** @typedef {RailGap|Corner} FrameFailureWitness */
/** Bounded numeric source locations explain a rejection, without granting
 * paint, erasure, enclosure membership or acceptance. Never copy free text,
 * accessors, unknown keys or serialized provider claims into diagnostics.
 * @param {unknown} value @returns {FrameFailureWitness|undefined} */
function parseFrameFailureWitness(value){
 if(value===undefined)return undefined;
 const invalid=()=>{throw new TypeError('Scene frame diagnostic is invalid');};
 if(!record(value))return invalid();
 const keys=value.kind==='rail-gap'
  ?['kind','stage','side','startPx','endPx','trackPx','thicknessPx','allowedGapPx']
  :value.kind==='corner-unproven'?['kind','xPx','yPx','farX','farY','searchLimitPx']:null;
 if(!keys||Reflect.ownKeys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k)))return invalid();
 /** @param {unknown} n @returns {n is number} */
 const coordinate=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=32768;
 if(value.kind==='rail-gap'){
  const {stage,side,startPx,endPx,trackPx,thicknessPx,allowedGapPx}=value;
  if(stage!=='rail'&&stage!=='corner-join'||!coordinate(side)||!Number.isInteger(side)||side>3
   ||!coordinate(startPx)||!coordinate(endPx)||endPx<=startPx||!coordinate(trackPx)
   ||!coordinate(thicknessPx)||thicknessPx<=0||thicknessPx>12||!coordinate(allowedGapPx)
   ||!Number.isInteger(allowedGapPx)||endPx-startPx<=allowedGapPx)return invalid();
  return {kind:'rail-gap',stage,side,startPx,endPx,trackPx,thicknessPx,allowedGapPx};
 }
 const {xPx,yPx,farX,farY,searchLimitPx}=value;
 if(!coordinate(xPx)||!coordinate(yPx)||typeof farX!=='boolean'||typeof farY!=='boolean'
  ||!coordinate(searchLimitPx)||searchLimitPx<=0)return invalid();
 return {kind:'corner-unproven',xPx,yPx,farX,farY,searchLimitPx};
}
module.exports={parseFrameFailureWitness};
