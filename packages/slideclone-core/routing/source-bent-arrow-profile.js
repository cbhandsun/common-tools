// @ts-check
'use strict';
const {sourceFilledArrowProfile}=require('./source-filled-arrow-profile');
const {measureSourceRoutePaint}=require('./source-route-paint');
/** Certify a complete horizontal-then-vertical source arrow. The proposal
 * supplies orientation only. Both arm axes, width, cap and head come from
 * original cells. Every cell is audited in an arm, including their overlap;
 * splitting cannot discard a branch, hole, disconnected dash or broad head.
 * @param {{cells:number[],width:number,rgba:Uint8Array,increasingX:boolean,increasingY:boolean,work:{checks:number}}} input */
function sourceBentArrowProfile({cells,width,rgba,increasingX,increasingY,work}){
 if(cells.length<32||cells.length>32768)return null;
 work.checks+=cells.length*64;if(work.checks>4000000)return null;
 const xs=cells.map(n=>n%width),ys=cells.map(n=>Math.floor(n/width));
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 if(maxX-minX<16||maxY-minY<16||maxX-minX+maxY-minY>512)return null;
 // Stable central sections of each arm avoid both the corner and terminal.
 // These nominate axes; the FULL arms below still have to certify them.
 const horizontal=cells.filter(n=>{
  const t=(n%width-minX)/(maxX-minX);return increasingX?t>.2&&t<.6:t>.4&&t<.8;
 });
 const vertical=cells.filter(n=>{
  const t=(Math.floor(n/width)-minY)/(maxY-minY);return increasingY?t>.2&&t<.6:t>.4&&t<.8;
 });
 if(!horizontal.length||!vertical.length)return null;
 const median=(/** @type {number[]} */v)=>v.sort((a,b)=>a-b)[Math.floor(v.length/2)]??NaN;
 const cy=median(horizontal.map(n=>Math.floor(n/width))),cx=median(vertical.map(n=>n%width));
 const horizontalRows=horizontal.map(n=>Math.floor(n/width));
 const hWidth=Math.max(...horizontalRows)-Math.min(...horizontalRows)+1;
 if(hWidth<1||hWidth>24)return null;
 const radius=hWidth/2;
 // Original source cells near the corner participate in BOTH complete arm
 // certificates. No arbitrary head crop or erased corner is permitted.
 const hCells=cells.filter(n=>Math.abs(Math.floor(n/width)-cy)<=radius);
 const vCells=cells.filter(n=>Math.abs(n%width-cx)<=radius||
  (increasingY?Math.floor(n/width)>cy+radius:Math.floor(n/width)<cy-radius));
 const union=new Set([...hCells,...vCells]);if(union.size!==cells.length)return null;
 /** A native solid shaft cannot paint over holes inside a source arm.
  * @param {number[]} arm @param {boolean} horizontal */
 const contiguous=(arm,horizontal)=>{
  const slices=new Map();for(const n of arm){const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;
   const s=slices.get(a)??[];s.push(c);slices.set(a,s);}
  for(const values of slices.values()){
   work.checks+=values.length;const span=Math.max(...values)-Math.min(...values)+1;
   if(work.checks>4000000||(horizontal||span<=hWidth+2)&&span!==values.length)return false;
  }
  return true;
 };
 if(!contiguous(hCells,true)||!contiguous(vCells,false))return null;
 // A concave head may have exterior notches between its wings and shaft.
 // Certify that those gaps connect to the exterior, rather than silently
 // painting over a real enclosed hole anywhere in either source arm.
 const bw=maxX-minX+3,bh=maxY-minY+3,solid=new Uint8Array(bw*bh),seen=new Uint8Array(bw*bh);
 for(const n of cells)solid[(Math.floor(n/width)-minY+1)*bw+n%width-minX+1]=1;
 const pending=[0];seen[0]=1;
 for(let i=0;i<pending.length;i++){
  const n=pending[i];if(n===undefined)return null;const x=n%bw,y=Math.floor(n/bw);
  for(const [dx,dy] of /** @type {[number,number][]} */([[-1,0],[1,0],[0,-1],[0,1]])){
   if(++work.checks>4000000)return null;const xx=x+dx,yy=y+dy,k=yy*bw+xx;
   if(xx>=0&&xx<bw&&yy>=0&&yy<bh&&!solid[k]&&!seen[k]){seen[k]=1;pending.push(k);}
  }
 }
 work.checks+=solid.length;if(work.checks>4000000)return null;
 for(let i=0;i<solid.length;i++)if(!solid[i]&&!seen[i])return null;
 const h=sourceFilledArrowProfile({cells:hCells,geometryCells:hCells,width,rgba,horizontal:true,direction:'undirected',increasing:increasingX,work});
 const v=sourceFilledArrowProfile({cells:vCells,geometryCells:vCells,width,rgba,horizontal:false,direction:'forward',increasing:increasingY,work});
 if(!h||!v||Math.abs(h.widthPx-v.widthPx)>1||Math.abs(h.intercept-cy)>.75||Math.abs(v.intercept-cx)>.75
  ||Math.max(Math.abs(h.slope*h.lo),Math.abs(h.slope*h.hi),Math.abs(v.slope*v.lo),Math.abs(v.slope*v.hi))>.75)return null;
 const corner={x:v.intercept,y:h.intercept};
 const start={x:increasingX?h.lo:h.hi,y:corner.y},end={x:corner.x,y:increasingY?v.hi:v.lo};
 // Both profile axes must really meet at the source corner; an unrelated
 // orthogonal stroke cannot supply an inferred bend through empty pixels.
 if(corner.x<h.lo||corner.x>h.hi||corner.y<v.lo||corner.y>v.hi)return null;
 // Two separately fitted arm colors need not be byte-identical. Audit ONE
 // original centerline with the existing 18/.9 paint fitter. Unsupported
 // gradients fail; matching separate medians alone never proves shared paint.
 const path=[];
 for(let x=start.x;increasingX?x<=Math.round(corner.x):x>=Math.round(corner.x);x+=increasingX?1:-1)path.push({x,y:Math.round(corner.y)});
 for(let y=Math.round(corner.y)+(increasingY?1:-1);increasingY?y<=end.y:y>=end.y;y+=increasingY?1:-1)path.push({x:Math.round(corner.x),y});
 work.checks+=path.length;if(work.checks>4000000||path.some(p=>!union.has(p.y*width+p.x)))return null;
 const paint=measureSourceRoutePaint(path,rgba,width,work);if(!paint||paint.stops)return null;
 const maxCenterlineErrorPx=Math.max(Math.abs(h.slope*h.lo),Math.abs(h.slope*h.hi),Math.abs(v.slope*v.lo),Math.abs(v.slope*v.hi));
 return {start,corner,end,color:paint.color,widthPx:(h.widthPx+v.widthPx)/2,support:Math.min(h.support,v.support,paint.support),maxCenterlineErrorPx};
}
module.exports={sourceBentArrowProfile};
