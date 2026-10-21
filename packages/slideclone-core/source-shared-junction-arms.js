// @ts-check
'use strict';
/** Three-arm joint witness for a measured shared shaft tree.
 *
 * A joint is admitted only when EVERY incident arm carries its own source ink
 * beyond the anti-aliased joint core. Raw core pixels are deliberately not
 * compared across arms: rendered diagrams commonly blend the joint core and
 * change paint per branch (e.g. per-target colours), so near-equal core
 * colours are neither necessary nor sufficient for a joint. Each complete edge
 * still receives its own paint witness in measureSharedRouteEdges.
 * @param {{edges:{from:number,to:number,cells:number[]}[],joint:number,
 *  raster:{rgba:Uint8Array},backgroundAt:(index:number)=>number[],work:{checks:number}}} input
 * @returns {boolean} */
function sharedJunctionArmsInked({edges,joint,raster,backgroundAt,work}){
 const core=3,samples=4;
 const incident=edges.filter(e=>e.from===joint||e.to===joint);
 for(const edge of incident){
  const cells=edge.from===joint?edge.cells:edge.cells.slice().reverse();
  const arm=cells.slice(core,core+samples);
  if(arm.length!==samples)return false;
  for(const n of arm){
   work.checks+=12;if(work.checks>4000000)return false;
   const observed=backgroundAt(n);
   if((raster.rgba[n*4+3]??0)<240)return false;
   if(Math.max(...observed.map((v,c)=>Math.abs(v-(raster.rgba[n*4+c]??0))))<42)return false;
  }
 }
 return true;
}
module.exports={sharedJunctionArmsInked};
