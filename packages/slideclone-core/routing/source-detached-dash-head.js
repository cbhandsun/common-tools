// @ts-check
'use strict';
/** A small, COMPLETE detached triangle has no body of its own. Its axis and
 * 1..5px width must already be established by at least two ordinary dashes.
 * Audit every original cell, the direction, taper and the real blank interval.
 * A censored outer base row may be incomplete; internal rows must be filled.
 * This internal geometry observer grants neither paint nor gap ownership.
 * @param {{cells:number[],width:number,horizontal:boolean,rgba:Uint8Array,direction:string,increasing:boolean,
 * axis:number,widthPx:number,runs:{lo:number,hi:number}[],work:{checks:number}}} input */
function sourceDetachedDashHead({cells,width,horizontal,rgba,direction,increasing,axis,widthPx,runs,work}){
 if(!['forward','backward'].includes(direction)||runs.length<2||runs.length>23||widthPx<1||widthPx>5
  ||!Number.isFinite(axis)||!Number.isSafeInteger(width)||width<1||rgba.length%(width*4)!==0
  ||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000||!cells.length||cells.length>300)return null;
 work.checks+=cells.length*64+512;if(work.checks>4000000)return null;
 /** @type {Map<number,number[]>} */const columns=new Map();
 const seen=new Set();
 for(const n of cells){
  if(!Number.isSafeInteger(n)||n<0||n>=rgba.length/4||seen.has(n)||(rgba[n*4+3]??0)<240)return null;seen.add(n);
  const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width,list=columns.get(a)??[];
  list.push(c);columns.set(a,list);
 }
 const along=[...columns.keys()].sort((a,b)=>a-b),lo=along[0],hi=along.at(-1);
 if(lo===undefined||hi===undefined||along.length!==hi-lo+1||along.length<3||along.length>12)return null;
 const atHigh=(direction==='forward')===increasing;
 const near=atHigh?Math.max(...runs.map(r=>r.hi)):Math.min(...runs.map(r=>r.lo));
 const gap=atHigh?lo-near-1:near-hi-1;if(gap<1||gap>12)return null;
 const sections=along.map(a=>{const values=columns.get(a)??[];values.sort((a,b)=>a-b);
  const first=values[0]??NaN,last=values.at(-1)??NaN;return {values,span:last-first+1,center:(first+last)/2};});
 const ordered=atHigh?[...sections].reverse():sections,widths=ordered.map(s=>s.span),peak=Math.max(...widths),base=widths.lastIndexOf(peak);
 // Same twelve-column terminal window and original broad-head threshold.
 // A rectangle, reverse head or long neck cannot supply a detached proof.
 if(peak<widthPx*2+2||peak>25||base<2||base>9||widths.length-1-base>1||(widths[0]??0)>widthPx+2)return null;
 for(let i=0;i<ordered.length;i++){
  const row=ordered[i];if(!row||Math.abs(row.center-axis)>2)return null;
  if(i<=base){
   if(i&&row.span+1<(widths[i-1]??0))return null;
   const predicted=(widths[0]??0)+(peak-(widths[0]??0))*i/base;
   if(Math.abs(row.span-predicted)>1.5)return null;
  }
  // Only the single outer base row may be threshold-censored. Every other
  // row is a contiguous filled cross-section, including the actual tip.
  if(i!==ordered.length-1&&row.values.length!==row.span)return null;
  if(row.values.some(c=>Math.abs(c-axis)>(i<=base?((widths[0]??0)-1+(peak-(widths[0]??0))*i/base)/2:(peak-1)/2)+1.25))return null;
 }
 const colors=along.map(a=>{const values=columns.get(a)??[],c=values[Math.floor(values.length/2)]??NaN;
  const n=horizontal?c*width+a:a*width+c;return [rgba[n*4]??0,rgba[n*4+1]??0,rgba[n*4+2]??0];});
 return {lo,hi,axis,widthPx,support:1,along,columns,colors,
  minAcross:Math.min(...sections.map(s=>s.center-(s.span-1)/2)),maxAcross:Math.max(...sections.map(s=>s.center+(s.span-1)/2)),
  maxCenterlineErrorPx:Math.max(...sections.map(s=>Math.abs(s.center-axis)))};
}
module.exports={sourceDetachedDashHead};
