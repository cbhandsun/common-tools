// @ts-check
'use strict';
const {record,box}=require('../scene-plan/source-scene-group-containment');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** A provider's shaft hint cannot cut off both already measured node contacts.
 * Expand observation toward the nearest boundary midpoints only; these are
 * hypotheses, never ports or pixel ownership. The route consumer must still
 * prove its complete component, actual private contacts and original budgets.
 * Explicit path programs keep their declared observation envelope unchanged.
 * @param {unknown} input @returns {Box} */
function sourceRouteObservationWindow(input){
 if(!record(input)||!box(input.hint)||!box(input.from)||!box(input.to)
  ||typeof input.anchored!=='boolean'||typeof input.programmed!=='boolean'
  ||typeof input.width!=='number'||typeof input.height!=='number'
  ||![input.width,input.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||input.width*input.height>40000000
  ||[input.hint,input.from,input.to].some(b=>b.x+b.w>Number(input.width)||b.y+b.h>Number(input.height)))
  throw new TypeError('Source route observation window is invalid');
 const hint=input.hint;
 let left=hint.x,top=hint.y,right=hint.x+hint.w,bottom=hint.y+hint.h,expanded=false;
 if(input.anchored&&!input.programmed)for(const node of [input.from,input.to]){
  const sites=[{x:node.x,y:node.y+node.h/2},{x:node.x+node.w,y:node.y+node.h/2},
   {x:node.x+node.w/2,y:node.y},{x:node.x+node.w/2,y:node.y+node.h}];
  const distances=sites.map(p=>Math.hypot(Math.max(hint.x-p.x,0,p.x-hint.x-hint.w),Math.max(hint.y-p.y,0,p.y-hint.y-hint.h)));
  const minimum=Math.min(...distances);
  for(const [i,p] of sites.entries())if(distances[i]===minimum){
   // Test actual containment, not a reconstructed floating-point box. A
   // subtraction round trip must not silently enlarge a successful window.
   if(p.x<hint.x||p.x>hint.x+hint.w||p.y<hint.y||p.y>hint.y+hint.h)expanded=true;
   left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);
  }
 }
 const margin=input.anchored&&!expanded?2:12;
 const x=Math.max(0,Math.floor(left)-margin),y=Math.max(0,Math.floor(top)-margin);
 return {x,y,w:Math.min(input.width,Math.ceil(right)+margin)-x,h:Math.min(input.height,Math.ceil(bottom)+margin)-y};
}
module.exports={sourceRouteObservationWindow};
