// @ts-check
'use strict';
/** @param {number[]} a @param {number[]} b */
function routeBackdropDifference(a,b){return Math.max(...a.map((v,c)=>Math.abs(v-(b[c]??0))));}
/** The existing alpha>=.1 and channel-distance<=18 gates are shared by the
 * target and obstructed samples. A palette match never grants source ownership.
 * Callers supply only parsed RGB triples and the existing review work ledger.
 * @param {number[]} observed @param {number[]} background @param {number[][]} colors
 * @param {(count:number)=>void} charge */
function routeBackdropMixture(observed,background,colors,charge){
 return colors.some(paint=>{
  charge(8);
  const delta=paint.map((v,c)=>v-(background[c]??0)),length=delta.reduce((s,n)=>s+n*n,0);
  const alpha=length?Math.max(0,Math.min(1,delta.reduce((s,n,c)=>s+n*((observed[c]??0)-(background[c]??0)),0)/length)):0;
  return alpha>=.1&&routeBackdropDifference(observed,background.map((v,c)=>v+alpha*(delta[c]??0)))<=18;
 });
}
/** First establish an independently agreeing background, then explain EVERY
 * obstructed sample against it. One recognizable stroke cannot hide unrelated
 * foreground on another flank. No field or disagreement grants no proposal.
 * This selects review-only approximation, never a source-erasure capability.
 * @param {{background:number[],samples:number[]}[]} fields @param {number[][]} obstructions
 * @param {number[][]} colors @param {(count:number)=>void} charge */
function selectRouteBackdropField(fields,obstructions,colors,charge){
 const field=fields[0];if(!field)return null;
 if(fields.some(other=>{charge(8);return routeBackdropDifference(field.background,other.background)>18;}))return null;
 for(const observed of obstructions){
  charge(8);
  if(routeBackdropDifference(observed,field.background)>18&&!routeBackdropMixture(observed,field.background,colors,charge))return null;
 }
 return field;
}
module.exports={routeBackdropDifference,routeBackdropMixture,selectRouteBackdropField};
