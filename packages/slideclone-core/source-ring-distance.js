// @ts-check
'use strict';
/** Exact squared Euclidean distance to an observed hole. Separability keeps
 * work linear in the bounded raster, without rotating or creating ink cells.
 * @param {number} width @param {number} height @param {number[]} hole */
function sourceRingDistance(width,height,hole){
 const area=width*height,dist=new Float64Array(area);dist.fill(Infinity);
 for(const n of hole)dist[n]=0;
 const size=Math.max(width,height),values=new Float64Array(size),out=new Float64Array(size),sites=new Int32Array(size),cuts=new Float64Array(size+1);
 /** Lower envelope of equal-curvature parabolas. Empty lines stay unknown.
  * @param {number} length */
 const transform=length=>{
  let last=-1;
  for(let q=0;q<length;q++){
   const value=values[q]??Infinity;if(!Number.isFinite(value))continue;let cut=-Infinity;
   while(last>=0){const p=sites[last]??0;cut=(value+q*q-(values[p]??0)-p*p)/(2*(q-p));if(cut>(cuts[last]??0))break;last--;}
   last++;sites[last]=q;cuts[last]=last?cut:-Infinity;cuts[last+1]=Infinity;
  }
  if(last<0){out.fill(Infinity,0,length);return;}
  let k=0;for(let q=0;q<length;q++){while((cuts[k+1]??Infinity)<q)k++;const p=sites[k]??0;out[q]=(q-p)**2+(values[p]??Infinity);}
 };
 for(let y=0;y<height;y++){for(let x=0;x<width;x++)values[x]=dist[y*width+x]??Infinity;transform(width);for(let x=0;x<width;x++)dist[y*width+x]=out[x]??Infinity;}
 for(let x=0;x<width;x++){for(let y=0;y<height;y++)values[y]=dist[y*width+x]??Infinity;transform(height);for(let y=0;y<height;y++)dist[y*width+x]=out[y]??Infinity;}
 return dist;
}
module.exports={sourceRingDistance};
