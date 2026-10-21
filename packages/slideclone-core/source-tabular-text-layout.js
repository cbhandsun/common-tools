// @ts-check
"use strict";
/** @typedef {import('./source-scene-plan').Box} Box */
/** Source OCR alignment can establish a tabular proposal despite a generic
 * model region kind. Require two further disjoint rows with one unambiguous
 * cell per header column. Wide paragraphs, overlapping cells and missing
 * columns provide no table evidence. This never authorizes a drawable fill.
 * @param {Box[]} headers @param {Box[]} candidates @param {Box} region */
function hasTabularTextLayout(headers,candidates,region){
 if(headers.length<2||headers.length>64)return false;
 const bottom=Math.max(...headers.map(b=>b.y+b.h));
 const columns=headers.map((b,i)=>{
  const center=b.x+b.w/2,previous=headers[i-1],next=headers[i+1];
  return {left:Math.max(region.x,previous?(previous.x+previous.w/2+center)/2:next?center-(next.x+next.w/2-center)/2:center),
   right:Math.min(region.x+region.w,next?(center+next.x+next.w/2)/2:previous?center+(center-previous.x-previous.w/2)/2:center)};
 });
 const rows=candidates.filter(b=>b.y>=bottom).map(b=>({box:b,column:columns.findIndex(c=>b.x>=c.left&&b.x+b.w<=c.right)}))
  .filter(row=>row.column>=0).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
 let aligned=0,end=bottom;
 for(let i=0;i<rows.length;){
  const anchor=rows[i];if(!anchor)break;
  if(anchor.box.y<end){i++;continue;}
  const counts=new Uint32Array(columns.length),bandEnd=anchor.box.y+anchor.box.h;
  while(i<rows.length){
   const row=rows[i];if(!row||row.box.y>=bandEnd)break;
   counts[row.column]=(counts[row.column]??0)+1;end=Math.max(end,row.box.y+row.box.h);i++;
  }
  if(counts.every(n=>n===1)&&++aligned>=2)return true;
 }
 return false;
}
module.exports={hasTabularTextLayout};
