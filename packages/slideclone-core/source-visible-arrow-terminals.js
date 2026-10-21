// @ts-check
"use strict";
/** Complete paint can have hollow/open heads or a broad base. Direction is
 * witnessed in the SAME original 12 terminal columns; the rest must form one
 * represented head and an independently stable contiguous 1..5px body.
 * @param {{widths:number[],counts:number[],rightArrow:boolean,leftArrow:boolean,work?:{checks:number}}} input */
function sourceVisibleArrowTerminals({widths,counts,rightArrow,leftArrow,work}){
 if(!widths.length||widths.length>513||counts.length!==widths.length)return null;
 /** @type {{widthPx:number,firstBody:number,lastBody:number}[]} */const candidates=[];
 for(let shaft=1;shaft<=5;shaft++){
  const runs=[];let first=-1;
  for(let i=0;i<=widths.length;i++){
   const w=widths[i],valid=w!==undefined&&w>=1&&w<=5&&Math.abs(w-shaft)<=1&&counts[i]===w;
   if(valid&&first<0)first=i;
   if(!valid&&first>=0){if(i-first>=3)runs.push({first,last:i-1});first=-1;}
  }
  // A real tapered tip can itself contain three narrow columns. It is not
  // an alternative shaft: independently test each complete run against BOTH
  // terminal witnesses, and retain the original unique-admission rule.
  for(const run of runs){
  if(work){work.checks+=widths.length*2;if(work.checks>4000000)return null;}
  const values=widths.slice(run.first,run.last+1).sort((a,b)=>a-b);if(values[Math.floor(values.length/2)]!==shaft)continue;
  /** @param {number[]} ws @param {number[]} ns @param {number} body @param {boolean} arrow */
  const terminal=(ws,ns,body,arrow)=>{
   if(!arrow)return body===0;
   // Tip and taper witnesses remain inside the unchanged head observation.
   const proof=ws.slice(0,Math.min(12,body)),peak=Math.max(...proof);
   if(body<3||proof.length<3||peak<shaft*2+2||(ws[0]??0)>shaft+2)return false;
   // The head widens to its peak, then can taper into the separately proven
   // shaft before this twelve-column witness ends. The full terminal check
   // below still rejects any second widening or unrepresented side branch.
   const peakAt=proof.indexOf(peak);
   for(let i=1;i<=peakAt;i++)if((proof[i]??0)+1<(proof[i-1]??0))return false;
   const all=ws.slice(0,body),highest=Math.max(...all),at=all.lastIndexOf(highest);
   // A connected side branch cannot disappear into the head classification.
   for(let i=1;i<=at;i++)if((all[i]??0)+1<(all[i-1]??0))return false;
   for(let i=at+1;i<all.length;i++)if((all[i]??0)>(all[i-1]??0)+1)return false;
   return all.every((w,i)=>w>=1&&w<=25&&(ns[i]??0)>=1&&(ns[i]??0)<=w);
  };
  if(!terminal(widths,counts,run.first,leftArrow)||!terminal([...widths].reverse(),[...counts].reverse(),widths.length-1-run.last,rightArrow))continue;
  candidates.push({widthPx:shaft,firstBody:run.first,lastBody:run.last});
  }
 }
 return candidates.length===1?candidates[0]??null:null;
}
module.exports={sourceVisibleArrowTerminals};
