// @ts-check
'use strict';
/** Keep four distinct observed backdrop samples and the original 18-channel
 * agreement. A private endpoint's admitted paint/perimeter can occlude a
 * corner; move only that sample along the SAME already charged exterior row
 * to its first unowned cell. This grants no node or corridor ownership and
 * never expands the source window or infers a missing backdrop.
 * @param {{width:number,height:number,rgba:Uint8Array,foreign:Uint8Array,horizontal:boolean,work:{checks:number}}} input
 * @returns {(number[]&{end0?:number[],end1?:number[]})|null} */
function sourceVisibleGapBackground({width,height,rgba,foreign,horizontal,work}){
 const original=[0,width-1,width*(height-1),width*height-1];
 if(new Set(original).size!==4||work.checks+4>4000000)return null;work.checks+=4;
 const across=horizontal?height:width,along=horizontal?width:height;
 /** @type {number[]} */const indices=[];
 for(const c of [0,across-1])for(const direction of [1,-1]){
  let found=-1;
  for(let step=0;step<Math.min(8,along);step++){
   if(++work.checks>4000000)return null;
   const a=direction===1?step:along-1-step,n=horizontal?c*width+a:a*width+c;
   if(foreign[n])continue;
   found=n;
   break;
  }
  if(found<0||indices.includes(found))return null;indices.push(found);
 }
 const colors=indices.map(i=>[rgba[i*4]??0,rgba[i*4+1]??0,rgba[i*4+2]??0]);
 const background=[0,1,2].map(c=>colors.map(p=>p[c]??0).sort((a,b)=>a-b)[1]??0);
 if(!colors.some(p=>p.some((v,c)=>Math.abs(v-(background[c]??0))>18)))return background;
 return null;
}
module.exports={sourceVisibleGapBackground};
