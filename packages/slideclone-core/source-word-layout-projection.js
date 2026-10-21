// @ts-check
"use strict";
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** Map already validated source pixels inside the parent's actual point frame.
 * Clamp representational endpoints only after the strict pixel containment proof.
 * Subtract one representational unit when addition rounds outside the parent;
 * this tightens containment and never widens a source or admission tolerance.
 * @param {readonly {text:string,box:Box}[]} runs @param {Box} pixels @param {Box} points */
function projectSourceWordRuns(runs,pixels,points){
  const sx=points.w/pixels.w,sy=points.h/pixels.h;
  if(![pixels.x,pixels.y,pixels.w,pixels.h,points.x,points.y,points.w,points.h,sx,sy].every(Number.isFinite)
    || pixels.w<=0 || pixels.h<=0 || points.w<=0 || points.h<=0 || pixels.x<0 || pixels.y<0 || points.x<0 || points.y<0)
    throw new TypeError("source word projection frame is invalid");
  /** @param {number} start @param {number} end @param {number} maximum */
  function span(start,end,maximum){
    let width=end-start;
    if(start+width>maximum)width-=Number.EPSILON*Math.max(1,Math.abs(maximum));
    if(width<=0 || start+width>maximum)throw new TypeError("source word projection span is invalid");
    return width;
  }
  return runs.map(run=>{
    const b=run.box;
    if(![b.x,b.y,b.w,b.h].every(Number.isFinite) || b.w<=0 || b.h<=0 || b.x<pixels.x || b.y<pixels.y
      || b.x+b.w>pixels.x+pixels.w || b.y+b.h>pixels.y+pixels.h)throw new TypeError("source word projection is outside the source frame");
    const x=Math.max(points.x,points.x+(b.x-pixels.x)*sx),y=Math.max(points.y,points.y+(b.y-pixels.y)*sy);
    const right=Math.min(points.x+points.w,points.x+(b.x+b.w-pixels.x)*sx);
    const bottom=Math.min(points.y+points.h,points.y+(b.y+b.h-pixels.y)*sy);
    return {text:run.text,box:{x,y,w:span(x,right,points.x+points.w),h:span(y,bottom,points.y+points.h)}};
  });
}
module.exports={projectSourceWordRuns};
