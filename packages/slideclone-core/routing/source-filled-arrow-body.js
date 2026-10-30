// @ts-check
'use strict';
const {sourceFilledArrowSlices}=require('./source-filled-arrow-slices');
/** A source principal axis is a proposal, never an arrow certificate. Unlike
 * raster columns, its normal slabs do not mix the projections of two heads.
 * The caller still verifies both complete terminals, holes and attachments.
 * @param {{cells:number[],width:number,horizontal:boolean,work:{checks:number}}} input */
function sourceFilledArrowBody({cells,width,horizontal,work}){
 if(cells.length<16||cells.length>32768)return null;
 work.checks+=cells.length*8;if(work.checks>4000000)return null;
 let meanA=0,meanC=0;
 for(const n of cells){meanA+=horizontal?n%width:Math.floor(n/width);meanC+=horizontal?Math.floor(n/width):n%width;}
 meanA/=cells.length;meanC/=cells.length;let aa=0,ac=0,cc=0;
 for(const n of cells){const a=(horizontal?n%width:Math.floor(n/width))-meanA,c=(horizontal?Math.floor(n/width):n%width)-meanC;aa+=a*a;ac+=a*c;cc+=c*c;}
 const eigen=(aa+cc+Math.hypot(aa-cc,2*ac))/2,slope=ac/(eigen-cc),intercept=meanC-slope*meanA;
 if(!Number.isFinite(slope)||Math.abs(slope)>1)return null;
 const scale=Math.hypot(1,slope),slices=sourceFilledArrowSlices({cells,width,horizontal,slope,intercept,work});
 if(!slices||slices.length<8||slices.length>513)return null;
 /** @type {{first:number,last:number}[]} */const runs=[];
 for(let first=0;first<slices.length;first++){
  let last=first,min=Infinity,max=0;
  while(last<slices.length){
   if(++work.checks>4000000)return null;const slice=slices[last];if(!slice)break;
   const w=slice.hi-slice.lo,nextMin=Math.min(min,w),nextMax=Math.max(max,w);
   if(slice.gaps>1e-8||nextMax-nextMin>2||last>first&&slice.t!==(slices[last-1]?.t??0)+1)break;
   min=nextMin;max=nextMax;last++;
  }
  if(last-first>=Math.max(8,2*max))runs.push({first,last});
 }
 runs.sort((a,b)=>(b.last-b.first)-(a.last-a.first));const body=runs[0];
 if(!body||runs[1]&&runs[1].last-runs[1].first===body.last-body.first)return null;
 const firstBody=slices[body.first]?.t,lastBody=slices[body.last-1]?.t;
 if(firstBody===undefined||lastBody===undefined)return null;
 const widths=slices.slice(body.first,body.last).map(s=>s.hi-s.lo).sort((a,b)=>a-b),normalWidth=widths[Math.floor(widths.length/2)]??0;
 if(normalWidth<1||normalWidth>25||lastBody-firstBody+1<2*normalWidth)return null;
 return {slope,intercept,scale,slices,firstBody,lastBody,shaft:normalWidth*scale};
}
module.exports={sourceFilledArrowBody};
