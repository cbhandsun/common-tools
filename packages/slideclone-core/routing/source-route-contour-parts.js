// @ts-check
'use strict';
const {traceNativeMaskContours}=require('../scene-plan/native-mask-contours');
/** Express ALL original route cells as bounded filled native contours.
 * This supplies geometry only, never relation or port authority. Failed
 * contours split along a source-cell boundary; no pixel, hole or branch is
 * dropped. The caller still certifies semantics and jointly renders the
 * complete composition. Two of the existing 32 parts remain for connectors.
 * @param {{cells:number[],width:number,height:number,work:{checks:number}}} input */
function sourceRouteContourParts({cells,width,height,work}){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>262144
  ||!Array.isArray(cells)||!cells.length||cells.length>32768
  ||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>=4000000)return null;
 const seen=new Set();
 for(const n of cells){
  if(++work.checks>4000000)return null;
  if(!Number.isSafeInteger(n)||n<0||n>=width*height||seen.has(n))return null;seen.add(n);
 }
 const pending=[cells],parts=[];
 while(pending.length){
  const original=pending.pop();if(!original)return null;
  let x=width,y=height,right=0,bottom=0;
  const points=[];
  for(const n of original){
   if(++work.checks>4000000)return null;
   const px=n%width,py=Math.floor(n/width);points.push({x:px,y:py});
   x=Math.min(x,px);y=Math.min(y,py);right=Math.max(right,px+1);bottom=Math.max(bottom,py+1);
  }
  const box={x,y,w:right-x,h:bottom-y},state={checks:work.checks,exhausted:false};
  // Keep the .75 source contour error and 120 commands per physical part.
  // Splitting is a representation choice, not repeated tolerance searches.
  const segments=traceNativeMaskContours(points,box,{tolerancePx:.75,workState:state,fastFail:true});
  work.checks=state.checks;if(state.exhausted||work.checks>4000000)return null;
  if(segments){parts.push({box,segments,cells:original});continue;}
  if(parts.length+pending.length+2>30||original.length<2)return null;
  const horizontal=box.w>=box.h,cut=horizontal?x+Math.floor(box.w/2):y+Math.floor(box.h/2);
  /** @type {number[]} */const first=[];
  /** @type {number[]} */const second=[];
  for(const n of original){
   if(++work.checks>4000000)return null;
   ((horizontal?n%width:Math.floor(n/width))<cut?first:second).push(n);
  }
  if(!first.length||!second.length)return null;
  pending.push(second,first);
 }
 return parts;
}
module.exports={sourceRouteContourParts};
