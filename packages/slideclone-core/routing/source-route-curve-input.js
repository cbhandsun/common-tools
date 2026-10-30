// @ts-check
'use strict';
const {types}=require('node:util');
const {record}=require('../scene-plan/source-scene-group-containment');
const {sharedOutputWork,sharedOutputRecord,sharedOutputList,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {import('./source-shared-route-output-snapshot').Work} Work */
/** @param {Work} work @param {number} count */
function reserveCurveWork(work,count){if(!chargeSharedOutput(work,count))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');}
/** @param {unknown} value @returns {value is number} */
function curveCoordinate(value){return typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=100000;}
/** @param {unknown} value @param {Work} work @returns {Record<string,unknown>} */
function curveRecord(value,work){if(!sharedOutputRecord(value,work)){reserveCurveWork(work,0);throw new TypeError('Source curve record is invalid');}return value;}
/** @param {unknown} value @param {Work} work @param {number} low @param {number} high @returns {unknown[]} */
function curveList(value,work,low,high){
 if(types.isProxy(value)||!Array.isArray(value)||value.length<low||value.length>high||!sharedOutputList(value,work)){
  reserveCurveWork(work,0);throw new TypeError('Source curve list is invalid');
 }return value;
}
/** Snapshot only numeric coordinates; never invoke accessors/proxies.
 * @param {unknown} value @param {Work} work @param {number} low @param {number} high @returns {Point[]} */
function curvePoints(value,work,low,high){
 const rows=curveList(value,work,low,high);reserveCurveWork(work,rows.length*2);
 return rows.map(raw=>{const p=curveRecord(raw,work);if(!curveCoordinate(p.x)||!curveCoordinate(p.y))throw new TypeError('Source curve point is invalid');return {x:p.x,y:p.y};});
}
/** @param {unknown} input */
function curveControls(input){
 if(!record(input)||!sharedOutputWork(input.work))throw new TypeError('Source curve controls are invalid');
 curveRecord(input,input.work);return {row:input,work:input.work};
}
module.exports={curveControls,curveCoordinate,curveRecord,curveList,curvePoints,reserveCurveWork};
