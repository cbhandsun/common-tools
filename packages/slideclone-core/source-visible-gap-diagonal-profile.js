// @ts-check
'use strict';
const {sourceVisibleGapProfile}=require('./source-visible-gap-profile');
/** Integer column shear is a one-to-one indexing of observed source cells.
 * It never rotates, interpolates, dilates or fills a missing source pixel.
 * The original complete-component profile still decides heads and continuity.
 * @param {{cells:number[],width:number,rgba:Uint8Array,horizontal:boolean,direction:string,increasing:boolean,work:{checks:number}}} input */
function sourceVisibleGapDiagonalProfile({cells,width,rgba,horizontal,direction,increasing,work}){
 /** @type {Map<number,number[]>} */const columns=new Map();
 for(const n of cells){const x=n%width,y=Math.floor(n/width),a=horizontal?x:y,c=horizontal?y:x;
  const values=columns.get(a)??[];values.push(c);columns.set(a,values);}
 const keys=[...columns.keys()].sort((a,b)=>a-b),lo=keys[0],hi=keys.at(-1);
 if(lo===undefined||hi===undefined||hi-lo<8||hi-lo>512||keys.length!==hi-lo+1)return null;
 work.checks+=cells.length*8+keys.length*32;if(work.checks>4000000)return null;
 // Use a contiguous narrow body only to nominate the tangent. A broad
 // oblique head biases both column centers and whole-component covariance.
 // The entire original component must still pass every profile gate below.
 const centers=keys.map(a=>{const values=columns.get(a)??[];return (Math.min(...values)+Math.max(...values))/2;});
 const runs=[];let first=-1;
 for(let i=0;i<=keys.length;i++){
  const values=columns.get(keys[i]??-1)??[],span=values.length?Math.max(...values)-Math.min(...values)+1:0;
  const narrow=span>0&&span<=Math.ceil(5*Math.SQRT2)&&values.length===span;
  if(narrow&&first<0)first=i;
  if(!narrow&&first>=0){if(i-first>=8)runs.push({first,last:i});first=-1;}
 }
 runs.sort((a,b)=>(b.last-b.first)-(a.last-a.first));const body=runs[0];
 if(!body||runs[1]&&runs[1].last-runs[1].first===body.last-body.first)return null;
 const bodyKeys=keys.slice(body.first,body.last),mean=bodyKeys.reduce((s,a)=>s+a,0)/bodyKeys.length;
 const centerMean=centers.slice(body.first,body.last).reduce((s,c)=>s+c,0)/bodyKeys.length;let numerator=0,denominator=0;
 for(let i=body.first;i<body.last;i++){numerator+=((keys[i]??0)-mean)*((centers[i]??0)-centerMean);denominator+=((keys[i]??0)-mean)**2;}
 const slope=numerator/denominator,scale=Math.hypot(1,slope);
 if(!Number.isFinite(slope)||Math.abs(slope)<.05||Math.abs(slope)>1||scale*(hi-lo)>512)return null;
 const shifts=keys.map(a=>Math.round(slope*(a-lo)));
 const across=cells.map(n=>{const a=horizontal?n%width:Math.floor(n/width),c=horizontal?Math.floor(n/width):n%width;return c-(shifts[a-lo]??0);});
 const bottom=Math.min(...across)-1,top=Math.max(...across)+1,w=hi-lo+1,h=top-bottom+1;
 if(w*h>262144||h>27)return null;
 const pixels=new Uint8Array(w*h*4),mapped=[];
 for(let i=0;i<cells.length;i++){const n=cells[i]??0,a=(horizontal?n%width:Math.floor(n/width))-lo,c=(across[i]??0)-bottom,index=c*w+a;
  mapped.push(index);pixels.set(rgba.subarray(n*4,n*4+4),index*4);}
 const profile=sourceVisibleGapProfile({cells:mapped,width:w,horizontal:true,rgba:pixels,direction,increasing,work});
 if(!profile||profile.widthPx/scale<1)return null;
 // Keep the head observation inside twelve ORIGINAL Euclidean pixels.
 // A diagonal must not acquire a longer terminal by changing coordinates.
 const widths=keys.map(a=>{const values=columns.get(a)??[];return Math.max(...values)-Math.min(...values)+1;});
 for(let i=0;i<widths.length;i++)if((widths[i]??0)>profile.widthPx+1&&Math.min(i,widths.length-1-i)*scale>12)return null;
 const intercept=bottom+profile.axis-slope*lo;
 if(centers.some((c,i)=>Math.abs(c-(slope*(keys[i]??0)+intercept))>2))return null;
 return {...profile,lo,hi,slope,intercept,widthPx:profile.widthPx/scale};
}
module.exports={sourceVisibleGapDiagonalProfile};
