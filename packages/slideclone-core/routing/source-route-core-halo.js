// @ts-check
'use strict';
const LIMIT=4000000;
/** Exact radius-six dilation for a caller's privately measured local mask.
 * Merge overlapping intervals before writing; each resulting cell is filled
 * once. This changes neither the excluded source cells nor paint authority.
 * @param {Uint8Array} component @param {number} width @param {number} height
 * @param {{checks:number}} work @returns {Uint8Array|null} */
function sourceCoreHalo(component,width,height,work){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height!==component.length)
  throw new RangeError('Core halo dimensions are invalid');
 if(!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>LIMIT)return null;
 /** @param {number} count */const charge=count=>{work.checks+=count;return work.checks<=LIMIT;};
 const halo=new Uint8Array(component.length);
 const intervals=Array.from({length:height},()=>/** @type {{left:number,right:number}[]} */([]));
 for(let n=0;n<component.length;n++)if(component[n]){
  const x=n%width,y=Math.floor(n/width),rowEnd=(y+1)*width;
  let end=n+1;while(end<rowEnd&&component[end])end++;
  const left=Math.max(0,x-6),right=Math.min(width,end-y*width+6);
  for(let row=Math.max(0,y-6);row<=Math.min(height-1,y+6);row++){
   if(!charge(1))return null;intervals[row]?.push({left,right});
  }
  n=end-1;
 }
 for(let y=0;y<height;y++){
  const runs=intervals[y]??[];runs.sort((a,b)=>{charge(1);return a.left-b.left;});if(work.checks>LIMIT)return null;
  let left=-1,right=-1;
  for(const run of runs){
   if(!charge(1))return null;
   if(left<0){left=run.left;right=run.right;continue;}
   if(run.left<=right){right=Math.max(right,run.right);continue;}
   if(!charge(right-left))return null;halo.fill(1,y*width+left,y*width+right);
   left=run.left;right=run.right;
  }
  if(left>=0){if(!charge(right-left))return null;halo.fill(1,y*width+left,y*width+right);}
 }
 return halo;
}
module.exports={sourceCoreHalo};
