// @ts-check
'use strict';
const {sourceRouteLocalBackground,hasRouteLocalBackground}=require('./source-route-local-background');
const {sourceRouteNodeBackground,hasRouteNodeBackground}=require('./source-route-node-background');
/** Existing whole-window/node backdrop composition and memoization. This
 * facade keeps the measurement root from owning backdrop implementation.
 * @param {{raster:{width:number,height:number,rgba:Uint8Array},bodies:Uint8Array,
 * endpointBodies:{box:import('../scene-plan/source-scene-plan').Box,mask:Uint8Array}[],background:number[],work:{checks:number}}} input */
function sharedRouteBackgroundAt({raster,bodies,endpointBodies,background,work}){
 const wholeBackground=sourceRouteLocalBackground({image:raster,body:bodies,background,work});
 if(work.checks>4000000)return null;
 const nodeBackground=sourceRouteNodeBackground({image:raster,bodies:endpointBodies,background,work});
 if(work.checks>4000000)return null;
 const hasLocal=hasRouteLocalBackground(wholeBackground)||hasRouteNodeBackground(nodeBackground);
 /** @type {Map<number,number[]>} */const memo=new Map();
 const raw=hasLocal?(/** @type {number} */n)=>{
  if(work.checks>4000000)return background;
  work.checks+=2;if(work.checks>4000000)return background;
  const a=wholeBackground(n),b=nodeBackground(n),localA=a.some((v,c)=>v!==(background[c]??0)),localB=b.some((v,c)=>v!==(background[c]??0));
  if(work.checks>4000000)return background;
  return localA&&localB&&a.some((v,c)=>Math.abs(v-(b[c]??0))>18)?background:localA?a:b;
 }:(/** @type {number} */_n)=>{work.checks+=1;return background;};
 return (/** @type {number} */n)=>{let value=memo.get(n);if(value===undefined){value=raw(n);memo.set(n,value);}return value;};
}
module.exports={sharedRouteBackgroundAt};
