// @ts-check
'use strict';
const {partitionSourceCompoundRoute}=require('./source-compound-route-partition');
const {sourceRouteFootprintPolyline}=require('./source-route-footprint-polyline');
const {sourceCompoundRouteAxis}=require('./source-compound-route-axis');
const {sourceFilledRouteGeometry}=require('./source-filled-route-geometry');
/** @typedef {{x:number,y:number}} Point */
/** Independently certify broad filled terminals and the COMPLETE remaining
 * thin shaft. A cut is a composition boundary through observed ink, never a
 * crop erasing inconvenient branches. Head and shaft certificates must cover
 * the original connected component exactly; all work shares the route ledger.
 * The thin observer's 1..5 width and 12-cell head rules remain unchanged.
 * @param {{mask:Uint8Array,width:number,height:number,rgba:Uint8Array,path:Point[],direction:string,
 * background:number[],work:{checks:number},headContacts?:import('./source-compound-route-axis').HeadContacts}} input */
function sourceCompoundRouteGeometry(input){
 const partition=partitionSourceCompoundRoute(input);if(!partition)return null;
 // Prefer the already certified connector representation. A fixed footprint
 // can reproduce the source while its arrow stays behind when a node moves;
 // it must not shadow a complete native shaft that satisfies the same bounds.
 const geometry=proveSourceCompoundPolyline(input,partition)??sourceFilledRouteGeometry(input,partition);
 if(!geometry||!('filledBody' in geometry))return geometry;
 // This transient geometry comes from the complete component proof above.
 // These original taper cells are never serialized as provider authority.
 return {...geometry,terminalContacts:{...(partition.startHead?{start:partition.startHead.profile.contactCells}:{}),
  ...(partition.endHead?{end:partition.endHead.profile.contactCells}:{})}};
}
/** @param {Parameters<typeof partitionSourceCompoundRoute>[0]&{headContacts?:import('./source-compound-route-axis').HeadContacts}} input
 * @param {NonNullable<ReturnType<typeof partitionSourceCompoundRoute>>} partition */
function proveSourceCompoundPolyline(input,partition){
 const {path,work,width,height,rgba,background}=input;
 const {queue,trimmed,startHead,endHead,shaft}=partition;
 // Certify the actual continuous native segments, rather than distances to
 // integer lattice samples of that same line. Use the unchanged .75px path
 // error, 1..5px width, 32 physical parts, and shared geometry allowance.
 let nativePoints=sourceRouteFootprintPolyline({points:path,cells:queue,width,height,shaft,work});
 const fixedHeadCuts=!nativePoints;
 nativePoints??=sourceCompoundRouteAxis(input,partition);if(!nativePoints)return null;
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
 return {shaft,support:matching/observed,filledTerminals:true,nativePoints,...(fixedHeadCuts?{fixedHeadCuts:true}:{})};
}
module.exports={sourceCompoundRouteGeometry,proveSourceCompoundPolyline};
