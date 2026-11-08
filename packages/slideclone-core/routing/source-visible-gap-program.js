// @ts-check
'use strict';
const {record,box}=require('../scene-plan/source-scene-group-containment');
const {parseScenePathProgram}=require('../scene-plan/source-scene-path-program');
/** A two-vertex model path nominates a straight source unit; its coordinates
 * are not pixel ground truth. Refinement requires the SAME observed component
 * and immutable node pair. This helper grants no paint/port authority: the
 * caller must prove the complete shaft, heads, uniqueness and empty corridors.
 * The original 1.5px bound measures observed centerline vs emitted geometry,
 * and the entire source component must fit the original shaft window (+2px).
 * @param {unknown} input */
function sourceVisibleGapProgramEvidence(input){
 if(!record(input)||!record(input.observed)||!box(input.window)||!box(input.shaftBox)
  ||typeof input.horizontal!=='boolean'||typeof input.increasing!=='boolean'
  ||![input.widthPx,input.heightPx].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384))
  throw new TypeError('Visible gap program evidence is invalid');
 const width=Number(input.widthPx),height=Number(input.heightPx),window=input.window,shaft=input.shaftBox,observed=input.observed;
 if(width*height>40000000||window.w*window.h>262144
  ||[window,shaft].some(b=>b.x+b.w>width||b.y+b.h>height)
  ||!['lo','hi','minAcross','maxAcross'].every(k=>typeof observed[k]==='number'&&Number.isSafeInteger(observed[k])&&Number(observed[k])>=0)
  ||typeof observed.maxCenterlineErrorPx!=='number'||!Number.isFinite(observed.maxCenterlineErrorPx)||observed.maxCenterlineErrorPx<0)
  throw new TypeError('Visible gap program frame is invalid');
 const program=parseScenePathProgram(input.program,{widthPx:width,heightPx:height,coordinateSpace:'compiled-source-pixels',
  owner:{x:0,y:0,w:width,h:height},shaftBox:shaft});
 if(!program||program.vertices.length!==2)return null;
 const a=program.vertices[0],b=program.vertices[1];if(!a||!b)return null;
 const dx=b.x-a.x,dy=b.y-a.y,along=input.horizontal?dx:dy,across=input.horizontal?dy:dx;
 if(along*(input.increasing?1:-1)<=0||Math.abs(across)>=Math.abs(along))return null;
 const lo=Number(observed.lo),hi=Number(observed.hi),near=Number(observed.minAcross),far=Number(observed.maxAcross);
 if(lo>hi||near>far||hi>=(input.horizontal?window.w:window.h)||far>=(input.horizontal?window.h:window.w))
  throw new TypeError('Visible gap program observed frame is invalid');
 const x0=window.x+(input.horizontal?lo:near),x1=window.x+(input.horizontal?hi:far);
 const y0=window.y+(input.horizontal?near:lo),y1=window.y+(input.horizontal?far:hi);
 if(x0<Math.max(0,Math.floor(shaft.x)-2)||y0<Math.max(0,Math.floor(shaft.y)-2)
  ||x1>=Math.min(width,Math.ceil(shaft.x+shaft.w)+2)||y1>=Math.min(height,Math.ceil(shaft.y+shaft.h)+2)
  ||observed.maxCenterlineErrorPx>1.5)return null;
 return {proposal:JSON.stringify(program),maxCenterlineErrorPx:observed.maxCenterlineErrorPx};
}
/** A two-point location proposal must not disable an independently certified
 * complete filled arrow. Refine its terminal guesses, retaining its original
 * shaft envelope, orientation and perpendicular 1.5px identity bound. This
 * grants no cells: observation, head, blank corridors and private endpoints
 * have already been proved by the source consumer.
 * @param {{program:import('../scene-plan/source-scene-path-program').PathProgram,shaft:import('../scene-plan/source-scene-plan').Box,
 * fit:import('../scene-plan/source-scene-visible-gap').Fit,cells:number[],width:number,work:{checks:number}}} input */
function sourceFilledGapProgramEvidence({program,shaft,fit,cells,width,work}){
 if(program.vertices.length!==2)return null;const [a,b]=program.vertices;if(!a||!b)return null;
 const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)return null;
 if((fit.end.x-fit.start.x)*dx+(fit.end.y-fit.start.y)*dy<=0)return null;
 const error=Math.max(...[fit.start,fit.end].map(p=>Math.abs((p.x-a.x)*dy-(p.y-a.y)*dx)/length));
 if(error>1.5)return null;
 for(const n of cells){
  if(++work.checks>4000000)return null;const x=n%width,y=Math.floor(n/width);
  if(x<Math.floor(shaft.x)-2||x>=Math.ceil(shaft.x+shaft.w)+2||y<Math.floor(shaft.y)-2||y>=Math.ceil(shaft.y+shaft.h)+2)return null;
 }
 return {proposal:JSON.stringify(program),maxCenterlineErrorPx:error};
}
module.exports={sourceVisibleGapProgramEvidence,sourceFilledGapProgramEvidence};
