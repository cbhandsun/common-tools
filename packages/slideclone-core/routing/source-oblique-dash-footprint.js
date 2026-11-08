// @ts-check
'use strict';
/** Prove a flat native dash against ORIGINAL pixel centers in tangent/normal
 * coordinates. A principal axis only nominates geometry. Every observed cell
 * must lie within .75px of the rectangle, and every absent cell deeper than
 * .75px inside it rejects the rectangle. Thus censored cap columns need no
 * arbitrary trimming, rotation, interpolation or exception for missing ink.
 * @param {{cells:number[],width:number,horizontal:boolean,slope:number,intercept:number,work:{checks:number}}} input */
function sourceObliqueDashFootprint({cells,width,horizontal,slope,intercept,work}){
 if(cells.length<16||cells.length>32768)return null;
 const scale=Math.hypot(1,slope),points=cells.map(n=>({a:horizontal?n%width:Math.floor(n/width),c:horizontal?Math.floor(n/width):n%width}));
 const ts=points.map(p=>(p.a+slope*(p.c-intercept))/scale),vs=points.map(p=>(p.c-slope*p.a-intercept)/scale);
 const lo=Math.min(...ts),hi=Math.max(...ts);
 if(hi-lo<8||hi-lo>512)return null;
 let lower=1,upper=25;
 for(const v of vs){if(++work.checks>4000000)return null;lower=Math.max(lower,2*(Math.abs(v)-.75));}
 const minA=Math.min(...points.map(p=>p.a))-1,maxA=Math.max(...points.map(p=>p.a))+1;
 const minC=Math.min(...points.map(p=>p.c))-1,maxC=Math.max(...points.map(p=>p.c))+1,owned=new Set(cells);
 for(let a=minA;a<=maxA;a++)for(let c=minC;c<=maxC;c++){
  if(++work.checks>4000000)return null;
  if(owned.has(horizontal?c*width+a:a*width+c))continue;
  const t=(a+slope*(c-intercept))/scale,v=(c-slope*a-intercept)/scale;
  if(t>lo+.75&&t<hi-.75)upper=Math.min(upper,2*(Math.abs(v)+.75));
 }
 if(lower>upper)return null;
 return {lo,hi,lower,upper,areaWidth:cells.length/(hi-lo+1)};
}
module.exports={sourceObliqueDashFootprint};
