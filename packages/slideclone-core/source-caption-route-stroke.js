// @ts-check
'use strict';
const {simplifySourceRoute}=require('./source-route-centerline');
const {sourceRouteIndexedCoverage}=require('./source-route-indexed-coverage');
const {sourceRouteInkColor}=require('./source-scene-route');
/** Complete independently observed fragment: retain the continuous route's
 * 1..5px shaft, .9 support, 12px terminal witness, complete branch coverage,
 * .75px simplification and shared 4M geometry allowance.
 * @param {{path:{x:number,y:number}[],mask:Uint8Array,rgba:Uint8Array,width:number,height:number,arrow:boolean,work:{checks:number}}} input */
function sourceCaptionRouteStroke({path,mask,rgba,width,height,arrow,work}){
 const widths=path.map((p,i)=>{
  const q=path[i+2]??path[i-2]??p,dx=q.x-p.x,dy=q.y-p.y,length=Math.hypot(dx,dy);if(!length)return 0;
  const ink=(/** @type {number} */d)=>{if(++work.checks>4000000)return false;
   const x=Math.round(p.x-dy/length*d),y=Math.round(p.y+dx/length*d);
   return x>=0&&y>=0&&x<width&&y<height&&!!mask[y*width+x];};
  if(!ink(0))return 0;let low=0,high=0;
  while(low>-12&&ink(low-1))low--;while(high<12&&ink(high+1))high++;
  return low===-12||high===12?0:high-low+1;
 });
 if(work.checks>4000000)return null;
 const middle=widths.slice(Math.floor(widths.length*.3),Math.ceil(widths.length*.7)).sort((a,b)=>a-b),shaft=middle[Math.floor(middle.length/2)]??0;
 const support=widths.filter(w=>w>0).length/widths.length;
 if(shaft<1||shaft>5||support<.9)return null;
 const head=(/** @type {number[]} */ws)=>{
  const section=ws.slice(0,Math.min(12,Math.floor(ws.length/2))),peak=Math.max(...section),base=section.indexOf(peak);
  if(peak<shaft*2+2||base<2||base>9||(section[0]??0)>shaft+2)return false;
  for(let i=1;i<=base;i++)if((section[i]??0)+1<(section[i-1]??0))return false;return true;
 };
 if(head(widths)!==arrow||head([...widths].reverse()))return null;
 // Thinning retracts a flat thick cap. Retain only a straight continuation
 // through observed ink, within the measured half-width and original path cap.
 const last=path.at(-1),previous=path.at(-2);
 if(last&&previous){
  const dx=last.x-previous.x,dy=last.y-previous.y;
  if(Math.abs(dx)+Math.abs(dy)===1)for(let step=1;step<=Math.ceil(shaft/2);step++){
   if(++work.checks>4000000)return null;
   const x=last.x+dx*step,y=last.y+dy*step;
   if(x<0||y<0||x>=width||y>=height||!mask[y*width+x])break;
   if(path.length>=512)return null;path.push({x,y});
  }
 }
 if(!sourceRouteIndexedCoverage(mask,width,height,path,shaft,arrow,false,work))return null;
 const color=sourceRouteInkColor(path,rgba,width,work),terminalColor=sourceRouteInkColor(arrow?path.slice(1,2):path.slice(0,12),rgba,width,work),points=simplifySourceRoute(path,work);
 return color&&terminalColor&&points?{color,terminalColor,widthPx:shaft,support,points}:null;
}
module.exports={sourceCaptionRouteStroke};
