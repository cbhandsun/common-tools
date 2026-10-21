// @ts-check
'use strict';
const {partitionSourceCompoundRoute}=require('./source-compound-route-partition');
const {simplifySourceRoute}=require('./source-route-centerline');
const {sourceFilledRouteGeometry}=require('./source-filled-route-geometry');
/** @typedef {{x:number,y:number}} Point */
/** Independently certify broad filled terminals and the COMPLETE remaining
 * thin shaft. A cut is a composition boundary through observed ink, never a
 * crop erasing inconvenient branches. Head and shaft certificates must cover
 * the original connected component exactly; all work shares the route ledger.
 * The thin observer's 1..5 width and 12-cell head rules remain unchanged.
 * @param {{mask:Uint8Array,width:number,height:number,rgba:Uint8Array,path:Point[],direction:string,
 * background:number[],work:{checks:number}}} input */
function sourceCompoundRouteGeometry(input){
 const partition=partitionSourceCompoundRoute(input);if(!partition)return null;
 // Prefer the already certified connector representation. A fixed footprint
 // can reproduce the source while its arrow stays behind when a node moves;
 // it must not shadow a complete native shaft that satisfies the same bounds.
 return proveSourceCompoundPolyline(input,partition)??sourceFilledRouteGeometry(input,partition);
}
/** @param {Parameters<typeof partitionSourceCompoundRoute>[0]} input
 * @param {NonNullable<ReturnType<typeof partitionSourceCompoundRoute>>} partition */
function proveSourceCompoundPolyline(input,partition){
 const {path,work,width,height,rgba,background}=input;
 const {queue,trimmed,startHead,endHead}=partition;let {shaft}=partition;
 // Certify the actual continuous native segments, rather than distances to
 // integer lattice samples of that same line. Use the unchanged .75px path
 // error, 1..5px width, 16 vertices / 32 parts, and shared geometry allowance.
 const nativePoints=simplifySourceRoute(path,work);if(!nativePoints)return null;
 for(const n of queue){
  const x=n%width,y=Math.floor(n/width);let distance=Infinity;
  for(let i=1;i<nativePoints.length;i++){
   if(++work.checks>4000000)return null;const a=nativePoints[i-1],b=nativePoints[i];if(!a||!b)return null;
   const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
   const t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length)):0;
   distance=Math.min(distance,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));
  }
  // Fit width to the whole original footprint as well as source coverage.
  // Truly opaque >5px paint already fails coverage calibration; no clipping
  // to 5, extra geometric tolerance or ignored cells can rescue it here.
  shaft=Math.max(shaft,2*(distance-.75));if(shaft>5)return null;
 }
 let matching=0,observed=0;
 for(let i=2;i<trimmed.length-2;i++){
  const p=trimmed[i],a=trimmed[i-2],b=trimmed[i+2];if(!p||!a||!b)return null;
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)return null;
  for(const sign of [-1,1]){
   if(++work.checks>4000000)return null;observed++;
   const x=Math.round(p.x-sign*dy/length*(shaft/2+4)),y=Math.round(p.y+sign*dx/length*(shaft/2+4));
   if(x<0||x>=width||y<0||y>=height)return null;const n=y*width+x;
   // An independently certified head can occupy a flank at the shared cut;
   // it is audited by its whole filled contour, not counted as background.
   if(startHead?.selected.has(n)||endHead?.selected.has(n)){observed--;continue;}
   const at=n*4;if((rgba[at+3]??0)>=240&&background.every((v,k)=>Math.abs(v-(rgba[at+k]??0))<=18))matching++;
  }
 }
 if(!observed||matching/observed<.9)return null;
 return {shaft,support:matching/observed,filledTerminals:true,nativePoints};
}
module.exports={sourceCompoundRouteGeometry,proveSourceCompoundPolyline};
