// @ts-check
'use strict';
const {record}=require('../scene-plan/source-scene-group-containment');
const {wholeRouteCurves}=require('./source-whole-route-geometry');
const {createNativeRouteGeometry}=require('./source-route-native-elbow');
const {sharedOutputWork,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
/** @typedef {{x:number,y:number}} Point */
/** Fit ONE existing complete drawing to ONE standard Office connector.
 * This is an explicit geometric approximation, not source ownership, erasure,
 * shared-network topology certification or an Office interaction receipt.
 * The caller must validate semantic endpoints and the complete network before
 * adopting it. Reads actual drawing commands, never nativeRoutePoints metadata.
 * Reuses the caller's ledger; failure cannot return an approximate prefix.
 * @param {unknown} input */
function fitWholeRouteNativeConnector(input){
 if(!record(input)||!record(input.part)||!sharedOutputWork(input.work))throw new TypeError('Whole native connector controls are invalid');
 const {part,work}=input;
 const invalid=()=>new TypeError('Whole native connector drawing is invalid');
 if(!record(part.style)||typeof part.style.strokeWidthPt!=='number'||!Number.isFinite(part.style.strokeWidthPt)
  ||part.style.strokeWidthPt<=0||part.style.strokeWidthPt>100)throw invalid();
 /** @param {number} count */const charge=count=>{
  if(!chargeSharedOutput(work,count))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');
 };
 const encoded=part.style.freeformPath;
 if(encoded!==undefined&&(typeof encoded!=='string'||encoded.length>262144))throw invalid();
 charge((typeof encoded==='string'?encoded.length:120*16)+32);
 const curves=wholeRouteCurves(/** @type {import('./source-shared-route-output-paint').Item} */(part));
 /** @type {Point[]} */const samples=[];
 for(const curve of curves){
  charge(curve.length*8);
  const first=curve[0],last=curve.at(-1);if(!first||!last)throw invalid();
  const length=curve.slice(1).reduce((sum,p,i)=>{const a=curve[i];if(!a)throw invalid();return sum+Math.hypot(p.x-a.x,p.y-a.y);},0);
  const steps=Math.max(1,Math.ceil(length*2));
  if(samples.length+steps+(samples.length?0:1)>4096)return null;
  charge((steps+1)*16);
  for(let i=samples.length?1:0;i<=steps;i++){
   const t=i/steps,u=1-t;
   if(curve.length===2)samples.push({x:u*first.x+t*last.x,y:u*first.y+t*last.y});
   else{
    const b=curve[1],c=curve[2];if(!b||!c)throw invalid();
    samples.push({x:u*u*u*first.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*last.x,
     y:u*u*u*first.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*last.y});
   }
  }
 }
 const geometry=createNativeRouteGeometry(work),points=geometry.orthogonalSourceRoute(samples,{widthPx:part.style.strokeWidthPt});
 if(!points)return null;
 const connector=geometry.nativeElbowConnector(points);if(!connector)return null;
 const actual=geometry.nativeElbowVertices(connector),first=actual[0],last=actual.at(-1),originalFirst=samples[0],originalLast=samples.at(-1);
 if(!first||!last||!originalFirst||!originalLast||Math.hypot(first.x-originalFirst.x,first.y-originalFirst.y)>1e-6
  ||Math.hypot(last.x-originalLast.x,last.y-originalLast.y)>1e-6)return null;
 return {box:{x:first.x,y:first.y,w:last.x-first.x,h:last.y-first.y},connector,points:actual,
  approximation:'standard-office-connector',sourceFootprintVerified:false,sharedTopologyVerified:false,nodeFollowingVerified:false};
}
module.exports={fitWholeRouteNativeConnector};
