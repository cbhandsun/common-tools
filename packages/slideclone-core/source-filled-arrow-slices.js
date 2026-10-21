// @ts-check
'use strict';
/** Intersect ORIGINAL unit source cells with unit-width oblique slabs. This
 * is polygon intersection, not raster rotation or interpolation. Every slab
 * interval keeps actual source area; no missing cell can be filled in.
 * @param {{cells:number[],width:number,horizontal:boolean,slope:number,intercept:number,work:{checks:number}}} input */
function sourceFilledArrowSlices({cells,width,horizontal,slope,intercept,work}){
 const scale=Math.hypot(1,slope);
 /** @type {Map<number,{lo:number,hi:number}[]>} */const bins=new Map();
 let sourceLo=Infinity,sourceHi=-Infinity;
 for(const n of cells){
  work.checks+=128;if(work.checks>4000000)return null;
  const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;
  const vertices=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([da=0,dc=0])=>{
   const x=a+da,y=c+dc;return {t:(x+slope*(y-intercept))/scale,v:(y-slope*x-intercept)/scale};
  });
  const low=Math.min(...vertices.map(p=>p.t)),high=Math.max(...vertices.map(p=>p.t));
  sourceLo=Math.min(sourceLo,low);sourceHi=Math.max(sourceHi,high);
  const first=Math.ceil(low-.5),last=Math.floor(high+.5);
  for(let t=first;t<=last;t++){
   /** @type {number[]} */const values=[];
   for(let i=0;i<4;i++){
    const p=vertices[i],q=vertices[(i+1)%4];if(!p||!q)return null;
    if(p.t>=t-.5&&p.t<=t+.5)values.push(p.v);
    for(const boundary of [t-.5,t+.5])if(p.t!==q.t&&boundary>=Math.min(p.t,q.t)&&boundary<=Math.max(p.t,q.t))
     values.push(p.v+(q.v-p.v)*(boundary-p.t)/(q.t-p.t));
   }
   if(!values.length)continue;const lo=Math.min(...values),hi=Math.max(...values);if(hi-lo<1e-8)continue;
   const intervals=bins.get(t)??[];intervals.push({lo,hi});bins.set(t,intervals);
  }
 }
 const result=[];
 for(const [t,intervals]of bins){
  work.checks+=intervals.length*16;if(work.checks>4000000)return null;intervals.sort((a,b)=>a.lo-b.lo);
  const lo=intervals[0]?.lo,hi=Math.max(...intervals.map(p=>p.hi));if(lo===undefined)return null;
  let end=lo,covered=0;
  for(const span of intervals){if(span.lo>end)covered+=span.lo-end;end=Math.max(end,span.hi);}
  result.push({t,lo,hi,gaps:covered,complete:t-.5>=sourceLo&&t+.5<=sourceHi});
 }
 return result.sort((a,b)=>a.t-b.t);
}
module.exports={sourceFilledArrowSlices};
