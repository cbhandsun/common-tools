// @ts-check
"use strict";
const {measureSourceArrowBody}=require('./source-arrow-body');
const {sourceVisibleArrowTerminals}=require('./source-visible-arrow-terminals');
const {sourceArrowCoveragePaint}=require('./source-arrow-coverage-paint');
/** Fit a COMPLETE observed component, including all its branches. Blank space
 * outside the visible stroke is audited separately, never counted as shaft.
 * Preserve .9 visible-path support, 1..5px shaft and the original 12px heads.
 * @param {{cells:number[],width:number,horizontal:boolean,rgba:Uint8Array,direction:string,increasing:boolean,work:{checks:number},background?:number[]}} input */
function sourceVisibleGapProfile({cells,width,horizontal,rgba,direction,increasing,work,background}){
 /** @type {Map<number,number[]>} */const columns=new Map();
 for(const n of cells){const x=n%width,y=Math.floor(n/width),along=horizontal?x:y,across=horizontal?y:x;
  const list=columns.get(along)||[];list.push(across);columns.set(along,list);}
 const along=[...columns.keys()].sort((a,b)=>a-b),lo=along[0],hi=along.at(-1);
 if(lo===undefined||hi===undefined||hi-lo<8||hi-lo>512||along.length/(hi-lo+1)<.9)return null;
 // Reserve a conservative bound for column sorting, profiles and all five
 // existing body/head hypotheses before computing them. No per-component cap.
 work.checks+=cells.length*8+(hi-lo+1)*256;if(work.checks>4000000)return null;
 /** @type {number[]} */const widths=[];
 /** @type {number[]} */const centers=[];
 /** @type {number[]} */const counts=[];
 /** @type {number[][]} */const colors=[];
 let minAcross=Infinity,maxAcross=0;
 for(let a=lo;a<=hi;a++){
  const values=columns.get(a);if(!values)return null;values.sort((a,b)=>a-b);
  const first=values[0],last=values.at(-1);if(first===undefined||last===undefined)return null;
  minAcross=Math.min(minAcross,first);maxAcross=Math.max(maxAcross,last);
  const center=(first+last)/2;centers.push(center);widths.push(last-first+1);counts.push(values.length);
  // Hollow/open terminal heads can leave their geometric center empty.
  // Geometry still uses the complete extent; color must use an actual cell
  // in this admitted component, preserving the unchanged uniformity gate.
  const inkAcross=values[Math.floor(values.length/2)];if(inkAcross===undefined)return null;
  const x=horizontal?a:inkAcross,y=horizontal?inkAcross:a,i=(y*width+x)*4;
  colors.push([rgba[i]??0,rgba[i+1]??0,rgba[i+2]??0]);
 }
 const ordered=widths.slice(Math.floor(widths.length*.3),Math.ceil(widths.length*.7)).sort((a,b)=>a-b);
 let shaft=ordered[Math.floor(ordered.length/2)]??0;
 const rightArrow=increasing?direction==='forward'||direction==='both':direction==='backward'||direction==='both';
 const leftArrow=increasing?direction==='backward'||direction==='both':direction==='forward'||direction==='both';
 const complete=sourceVisibleArrowTerminals({widths,counts,rightArrow,leftArrow,work});
 const body=shaft>5?measureSourceArrowBody({widths,rightArrow,leftArrow}):null;if(body)shaft=body.widthPx;
 if(complete)shaft=complete.widthPx;
 if(shaft<1||shaft>5)return null;
 /** @param {boolean} right */
 const arrow=right=>{const ws=right?[...widths].reverse():widths,tip=ws.findIndex(w=>w>0);
  if(tip<0||tip>2)return false;const section=ws.slice(tip,tip+Math.min(12,Math.floor(ws.length/2))),peak=Math.max(...section),base=section.indexOf(peak);
  if(peak<shaft*2+2||base<2||base>9||(section[0]??0)>shaft+2)return false;
  for(let i=1;i<=base;i++)if((section[i]??0)+1<(section[i-1]??0))return false;return true;};
 if(!complete&&(counts.some((n,i)=>n!==widths[i])||arrow(true)!==rightArrow||arrow(false)!==leftArrow))return null;
 const axis=[...centers].sort((a,b)=>a-b)[Math.floor(centers.length/2)];
 if(axis===undefined||centers.some(c=>Math.abs(c-axis)>2))return null;
 let rgb=[0,1,2].map(c=>colors.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(colors.length/2)]??0);
 if(colors.filter(p=>p.every((v,c)=>Math.abs(v-(rgb[c]??0))<=18)).length/colors.length<.9){
  if(!complete||!background)return null;
  const pixelColumns=along.map(a=>(columns.get(a)??[]).map(c=>{
   const i=(horizontal?c*width+a:a*width+c)*4;return [rgba[i]??0,rgba[i+1]??0,rgba[i+2]??0];
  }));
  // A valid four-corner backdrop can still differ within the original 18
  // channel tolerance along a JPEG corridor. Reuse both actually observed
  // exterior rows at each column; neither endpoint paint nor a single edge
  // may nominate a new backdrop. This changes no mask or component geometry.
  work.checks+=along.length*32;if(work.checks>4000000)return null;
  const height=rgba.length/(width*4);
  const backdrops=along.map(a=>{
   const sites=horizontal?[a,(height-1)*width+a]:[a*width,a*width+width-1];
   const samples=sites.map(n=>[rgba[n*4]??0,rgba[n*4+1]??0,rgba[n*4+2]??0]);
   if(sites.some(n=>(rgba[n*4+3]??0)<240)||samples.some(p=>p.some((v,k)=>Math.abs(v-(background[k]??0))>18))
    ||samples[0]?.some((v,k)=>Math.abs(v-(samples[1]?.[k]??0))>18))return background;
   return [0,1,2].map(k=>Math.round(((samples[0]?.[k]??0)+(samples[1]?.[k]??0))/2));
  });
  const paint=sourceArrowCoveragePaint({columns:pixelColumns,background,firstBody:complete.firstBody,lastBody:complete.lastBody,work,backdrops});
  if(!paint)return null;rgb=paint;
 }
 const emittedAxis=Math.round(axis),maxCenterlineErrorPx=Math.max(...centers.map(c=>Math.abs(c-emittedAxis)));
 return {lo,hi,axis:emittedAxis,widthPx:shaft,color:'#'+rgb.map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase(),support:along.length/(hi-lo+1),
  minAcross,maxAcross,maxCenterlineErrorPx};
}
module.exports={sourceVisibleGapProfile};

