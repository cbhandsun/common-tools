// @ts-check
'use strict';
const {sourceVisibleDiagonalDashProfile}=require('./source-visible-diagonal-dash-profile');
const {sourceObliqueDashProfile}=require('./source-oblique-dash-profile');
const {sourceCrossingDashPartition}=require('./source-crossing-dash-partition');
/** @param {Parameters<typeof sourceVisibleDiagonalDashProfile>[0]} input
 * @param {NonNullable<ReturnType<typeof sourceVisibleDiagonalDashProfile>>} axis
 * @param {{cells:number[],bounded:boolean}[]} parts @param {number[]} junction */
function partitionedProfile(input,axis,parts,junction){
 const {width,horizontal,work,increasing}=input;
 const joint=sourceCrossingDashPartition({cells:junction,width,horizontal,slope:axis.slope,intercept:axis.intercept,widthPx:axis.widthPx,work});
 if(!joint)return null;
 const scale=Math.hypot(1,axis.slope),runs=[...joint,...parts.map(p=>{
  const ts=p.cells.map(n=>{const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;return (a+axis.slope*(c-axis.intercept))/scale;});
  return {lo:Math.min(...ts),hi:Math.max(...ts),cells:p.cells};
 })].sort((a,b)=>a.lo-b.lo);
 const first=runs[0],last=runs.at(-1);if(!first||!last||runs.length>16||last.hi-first.lo>512)return null;
 const ordered=increasing?runs:[...runs].reverse(),pattern=[];
 for(let i=0;i<ordered.length;i++){
  if(++work.checks>4000000)return null;const run=ordered[i],next=ordered[i+1];if(!run)return null;
  const gap=next?(increasing?next.lo-run.hi:run.lo-next.hi):1;if(gap<1)return null;
  pattern.push([(run.hi-run.lo)/axis.widthPx,gap/axis.widthPx]);
 }
 // Reuse independently witnessed ink only if the complete junction also
 // fits that paint's original background-coverage model at the .9/18 gates.
 const rgb=[1,3,5].map(i=>Number.parseInt(axis.color.slice(i,i+2),16)),delta=input.background.map((v,c)=>v-(rgb[c]??0)),norm=delta.reduce((s,v)=>s+v*v,0);
 if(!norm)return null;let matching=0;
 for(const n of junction){
  work.checks+=32;if(work.checks>4000000)return null;
  const p=[input.rgba[n*4]??0,input.rgba[n*4+1]??0,input.rgba[n*4+2]??0];
  const coverage=Math.max(0,Math.min(1,p.reduce((s,v,c)=>s+(v-(rgb[c]??0))*(delta[c]??0),0)/norm));
  if(p.every((v,c)=>Math.abs(v-((rgb[c]??0)+coverage*(delta[c]??0)))<=18))matching++;
 }
 if(matching/junction.length<.9)return null;
 return {...axis,lo:first.lo/scale,hi:last.hi/scale,cells:[...new Set(runs.flatMap(r=>r.cells))],strokeDashPattern:JSON.stringify(pattern)};
}
/** A connected X is not an extra-thick dash or a discardable branch. Two
 * independently observed dashed axes must jointly account for EVERY cell of
 * the crossing component, under the same width and .75px geometry bounds.
 * Removing a component only nominates this hypothesis; the final proof puts
 * its complete source ink back. No pixels are generated or silently dropped.
 * @param {Parameters<typeof sourceVisibleDiagonalDashProfile>[0]} input */
function sourceVisibleCrossingDashProfile(input){
 const {components,width,horizontal,work}=input;
 if(components.length<5||components.length>32)return null;
 const accepted=[];
 for(const joint of components){
  if(!joint.bounded)continue;
  const rest=components.filter(c=>c!==joint);
  const first=sourceVisibleDiagonalDashProfile({...input,components:rest});
  if(!first)continue;
  const second=sourceVisibleDiagonalDashProfile({...input,components:rest,sign:-input.sign});
  if(!second)continue;
  const delta=first.slope-second.slope;
  if(!Number.isFinite(delta)||Math.abs(delta)<.1)continue;
  const crossing=(second.intercept-first.intercept)/delta;
  if(crossing<=Math.max(first.lo,second.lo)||crossing>=Math.min(first.hi,second.hi))continue;
  /** @param {typeof first} profile @param {number} n */
  const owns=(profile,n)=>{
   if(++work.checks>4000000)return false;
   const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;
   return a>=profile.lo&&a<=profile.hi
    &&Math.abs(c-profile.slope*a-profile.intercept)/Math.hypot(1,profile.slope)<=profile.widthPx/2+.75;
  };
  const a=[],b=[];let complete=true,shared=false;
  for(const n of joint.cells){
   const inA=owns(first,n),inB=owns(second,n);
   if(!inA&&!inB){complete=false;break;}
   if(inA)a.push(n);if(inB)b.push(n);shared ||=inA&&inB;
  }
  if(work.checks>4000000)return null;
  if(!complete||!shared||a.length<16||b.length<16)continue;
  const firstCells=new Set(first.cells),secondCells=new Set(second.cells);
  const firstParts=rest.filter(c=>c.cells.every(n=>firstCells.has(n))),secondParts=rest.filter(c=>c.cells.every(n=>secondCells.has(n)));
  // Independent complete dashes on both axes are essential. A fork, text
  // glyph or one attached spur cannot acquire crossing exclusion authority.
  if(firstParts.length<2||secondParts.length<2)continue;
  const result=sourceVisibleDiagonalDashProfile({...input,components:[...firstParts,{cells:a,bounded:true}]})
   ??sourceObliqueDashProfile({...input,components:[...firstParts,{cells:a,bounded:true}]},first)
   ??partitionedProfile(input,first,firstParts,joint.cells);
  const companion=sourceVisibleDiagonalDashProfile({...input,components:[...secondParts,{cells:b,bounded:true}],sign:-input.sign})
   ??sourceObliqueDashProfile({...input,components:[...secondParts,{cells:b,bounded:true}],sign:-input.sign},second)
   ??partitionedProfile(input,second,secondParts,joint.cells);
  if(!result||!companion)continue;
  const stable=[{before:first,after:result},{before:second,after:companion}].every(({before,after})=>
   Math.abs(before.widthPx-after.widthPx)<=1.5&&[after.lo,after.hi].every(a=>
    Math.abs(after.slope*a+after.intercept-before.slope*a-before.intercept)/Math.hypot(1,before.slope)<=.75));
  if(!stable)continue;
  // The newly included crossing cannot change either independently measured
  // source axis, or hide a portion of its original connected component.
  const all=new Set([...result.cells,...companion.cells]);
  if(joint.cells.some(n=>!all.has(n)))continue;
  accepted.push(result);
 }
 return accepted.length===1?accepted[0]:null;
}
module.exports={sourceVisibleCrossingDashProfile};
