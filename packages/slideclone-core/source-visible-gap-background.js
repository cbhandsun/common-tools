// @ts-check
'use strict';
/** Keep four distinct observed backdrop samples and the original 18-channel
 * agreement. A private endpoint's admitted paint/perimeter can occlude a
 * corner; move only that sample along the SAME already charged exterior row
 * to its first unowned cell. This grants no node or corridor ownership and
 * never expands the source window or infers a missing backdrop.
 * @param {{width:number,height:number,rgba:Uint8Array,foreign:Uint8Array,horizontal:boolean,work:{checks:number}}} input
 * @returns {number[]|null} */
function sourceVisibleGapBackground({width,height,rgba,foreign,horizontal,work}){
 const original=[0,width-1,width*(height-1),width*height-1];
 if(new Set(original).size!==4||work.checks+4>4000000)return null;work.checks+=4;
 const originalColors=original.map(i=>[rgba[i*4]??0,rgba[i*4+1]??0,rgba[i*4+2]??0]);
 const originalBackground=[0,1,2].map(c=>originalColors.map(p=>p[c]??0).sort((a,b)=>a-b)[1]??0);
 // Preserve every background that already satisfies the original four-corner
 // contract, including its exact source color and resulting component mask.
 if(originalColors.every(p=>p.every((v,c)=>Math.abs(v-(originalBackground[c]??0))<=18)))return originalBackground;
 const end0=[originalColors[0],originalColors[horizontal?2:1]],end1=[originalColors[horizontal?1:2],originalColors[3]];
 if(end0[0]&&end0[1]&&end1[0]&&end1[1]
  &&[0,1,2].every(c=>Math.abs((end0[0]?.[c]??0)-(end0[1]?.[c]??0))<=18)
  &&[0,1,2].every(c=>Math.abs((end1[0]?.[c]??0)-(end1[1]?.[c]??0))<=18)){
  const diff=[0,1,2].map(c=>Math.abs(((end0[0]?.[c]??0)+(end0[1]?.[c]??0))/2-((end1[0]?.[c]??0)+(end1[1]?.[c]??0))/2));
  if(Math.max(...diff)<=38){
   const avg=[0,1,2].map(c=>Math.round(((end0[0]?.[c]??0)+(end0[1]?.[c]??0)+(end1[0]?.[c]??0)+(end1[1]?.[c]??0))/4));
   avg.end0=[0,1,2].map(c=>Math.round(((end0[0]?.[c]??0)+(end0[1]?.[c]??0))/2));
   avg.end1=[0,1,2].map(c=>Math.round(((end1[0]?.[c]??0)+(end1[1]?.[c]??0))/2));
   return avg;
  }
 }
 const across=horizontal?height:width,along=horizontal?width:height;
 /** @type {number[]} */const indices=[];
 for(const c of [0,across-1])for(const direction of [1,-1]){
  let found=-1;
  for(let step=0;step<Math.min(8,along);step++){
   if(++work.checks>4000000)return null;
   const a=direction===1?step:along-1-step,n=horizontal?c*width+a:a*width+c;
   if(foreign[n])continue;
   found=n;
   // If the perimeter pixel is anti-aliased against the endpoint, check inward neighbor
   if(step<along-2){
    const nextA=direction===1?step+1:along-2-step,nextN=horizontal?c*width+nextA:nextA*width+c;
    const p=[rgba[n*4]??0,rgba[n*4+1]??0,rgba[n*4+2]??0];
    const pNext=[rgba[nextN*4]??0,rgba[nextN*4+1]??0,rgba[nextN*4+2]??0];
    if(p.some((v,k)=>Math.abs(v-(pNext[k]??0))>18)&&!foreign[nextN]){found=nextN;continue;}
   }
   break;
  }
  if(found<0||indices.includes(found))return null;indices.push(found);
 }
 const colors=indices.map(i=>[rgba[i*4]??0,rgba[i*4+1]??0,rgba[i*4+2]??0]);
 const background=[0,1,2].map(c=>colors.map(p=>p[c]??0).sort((a,b)=>a-b)[1]??0);
 if(!colors.some(p=>p.some((v,c)=>Math.abs(v-(background[c]??0))>18)))return background;
 const s0=colors[0],s1=colors[2],t0=colors[1],t1=colors[3];
 if(s0&&s1&&t0&&t1
  &&[0,1,2].every(c=>Math.abs((s0[c]??0)-(s1[c]??0))<=18)
  &&[0,1,2].every(c=>Math.abs((t0[c]??0)-(t1[c]??0))<=18)){
  const diff=[0,1,2].map(c=>Math.abs(((s0[c]??0)+(s1[c]??0))/2-((t0[c]??0)+(t1[c]??0))/2));
  if(Math.max(...diff)<=38){
   const avg=[0,1,2].map(c=>Math.round(((s0[c]??0)+(s1[c]??0)+(t0[c]??0)+(t1[c]??0))/4));
   avg.end0=[0,1,2].map(c=>Math.round(((s0[c]??0)+(s1[c]??0))/2));
   avg.end1=[0,1,2].map(c=>Math.round(((t0[c]??0)+(t1[c]??0))/2));
   return avg;
  }
 }
 return null;
}
module.exports={sourceVisibleGapBackground};
