// @ts-check
"use strict";
/** Retry only the original five possible source rows within the existing 2px
 * node alignment allowance, using the existing maximum window radius 12.
 * Multiple rows must measure the same physical shaft and direction.
 * @param {(offset:number)=>ReturnType<typeof import('./source-scene-relation').measureSceneRelationDetailed>} measure
 * @returns {{fit:import('./source-scene-relation').RelationFit,reason:null}|null} */
function recoverSourceRelationAxis(measure){
 const fits=[];
 for(const offset of [0,-1,1,-2,2]){const result=measure(offset);if(result.fit)fits.push(result.fit);}
 const first=fits[0];if(!first)return null;
 for(const fit of fits.slice(1)){
  if(Math.hypot(fit.start.x-first.start.x,fit.start.y-first.start.y)>.75
   ||Math.hypot(fit.end.x-first.end.x,fit.end.y-first.end.y)>.75||fit.widthPx!==first.widthPx
   ||[1,3,5].some(i=>Math.abs(Number.parseInt(fit.color.slice(i,i+2),16)-Number.parseInt(first.color.slice(i,i+2),16))>18))return null;
 }
 return {fit:first,reason:null};
}
/** Report the deepest stage actually reached by the unchanged row probes.
 * It cannot promote a failed measurement or change shaft/port predicates.
 * @param {string|null} previous @param {string|null} observed */
function deeperSourceRelationFailure(previous,observed){
 const order=['source-window-alpha','shaft-window-boundary','shaft-support','shaft-discontinuity','shaft-width','arrow-direction','node-axis-alignment','relation-anchor'];
 return order.indexOf(observed??'')>order.indexOf(previous??'')?observed:previous;
}
module.exports={recoverSourceRelationAxis,deeperSourceRelationFailure};
