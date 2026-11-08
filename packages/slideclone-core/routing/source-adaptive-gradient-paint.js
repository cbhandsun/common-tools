// @ts-check
'use strict';
const {list}=require('../scene-plan/source-scene-group-containment');
const {sharedOutputWork,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
/** Six-stop proposals use interval sufficient statistics, so a short source
 * transition does not require rescanning every pixel for every knot set.
 * Only full original-sample verification admits paint. Robust reweighting
 * changes proposals, never the 18-channel / .9 support or evidence samples.
 * @param {number[][]} colors @param {number[]} positions
 * @param {import('./source-shared-route-output-snapshot').Work} work */
function fitAdaptiveGradientPaint(colors,positions,work){
 if(!list(colors)||colors.length<8||colors.length>512||!list(positions)||positions.length!==colors.length||!sharedOutputWork(work)
  ||!colors.every(c=>list(c)&&c.length===3&&c.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=255))
  ||!positions.every((n,i)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1&&(i===0||n>=(positions[i-1]??0))))throw new TypeError('Adaptive source paint controls are invalid');
 /** @param {number} n */const charge=n=>{if(!chargeSharedOutput(work,n))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 /** @param {number} at */const quantile=at=>{const i=at*(unique.length-1),j=Math.floor(i);return (unique[j]??0)*(1-i+j)+(unique[Math.min(j+1,unique.length-1)]??0)*(i-j);};
 charge(positions.length*16);
 const unique=[...new Set(positions)];let candidates=[...new Set(Array.from({length:15},(_,i)=>quantile((i+1)/16)))].filter(p=>p>0&&p<1);
 if(candidates.length<4)return null;
 // Nearby quantiles on a long nearly flat beam add redundant knot sets.
 // Rank proposals by median color curvature; observations remain untouched
 // and all of them still participate in the final independent verification.
 if(candidates.length>11){
  charge(positions.length*54);
  const all=[0,...candidates,1],medians=all.map((at,i)=>{
   const lo=((all[Math.max(0,i-1)]??0)+at)/2,hi=((all[Math.min(all.length-1,i+1)]??1)+at)/2;
   const cells=colors.filter((_,k)=>(positions[k]??0)>=lo&&(positions[k]??0)<=hi);
   return [0,1,2].map(c=>cells.map(row=>row[c]??0).sort((a,b)=>a-b)[Math.floor(cells.length/2)]??0);
  });
  const scored=candidates.map((at,i)=>{const lo=all[i]??0,hi=all[i+2]??1;
   const score=Math.max(...(medians[i+1]??[]).map((v,c)=>Math.abs(v-((medians[i]?.[c]??0)*(hi-at)+(medians[i+2]?.[c]??0)*(at-lo))/(hi-lo))));
   return {at,score};});
  while(scored.length>11){
   let closest=0;
   for(let i=1;i<scored.length-1;i++)if((scored[i+1]?.at??1)-(scored[i]?.at??0)<(scored[closest+1]?.at??1)-(scored[closest]?.at??0))closest=i;
   scored.splice((scored[closest]?.score??0)<(scored[closest+1]?.score??0)?closest:closest+1,1);
  }
  candidates=scored.map(row=>row.at);
 }
 const prefix=[Array(10).fill(0)];
 for(const [i,t]of positions.entries()){
  const c=colors[i]??[],previous=prefix[i]??[],row=[1,t,t*t,...c,...c.map(v=>v*t),c.reduce((s,v)=>s+v*v,0)];
  prefix.push(row.map((v,k)=>v+(previous[k]??0)));
 }
 /** @param {number} t */const lower=t=>{let lo=0,hi=positions.length;while(lo<hi){const m=(lo+hi)>>>1;if((positions[m]??1)<t)lo=m+1;else hi=m;}return lo;};
 /** @param {number[]} diagonal @param {number[]} off @param {number[][]} rhs */
 const solve=(diagonal,off,rhs)=>{
  for(let i=1;i<6;i++){
   const pivot=diagonal[i-1]??0;if(!Number.isFinite(pivot)||Math.abs(pivot)<1e-9)return null;
   const factor=(off[i-1]??0)/pivot;diagonal[i]=(diagonal[i]??0)-factor*(off[i-1]??0);
   for(let c=0;c<3;c++)/** @type {number[]} */(rhs[i])[c]=(rhs[i]?.[c]??0)-factor*(rhs[i-1]?.[c]??0);
  }
  const rgb=Array.from({length:6},()=>[0,0,0]);
  for(let i=5;i>=0;i--){const pivot=diagonal[i]??0;if(!Number.isFinite(pivot)||Math.abs(pivot)<1e-9)return null;
   for(let c=0;c<3;c++)/** @type {number[]} */(rgb[i])[c]=((rhs[i]?.[c]??0)-(off[i]??0)*(rgb[i+1]?.[c]??0))/pivot;
  }
  return rgb.every(row=>row.every(Number.isFinite))?rgb:null;
 };
 /** @type {{knots:number[],error:number,rgb:number[][]}[]} */const ranked=[];
 for(let a=0;a<candidates.length-3;a++)for(let b=a+1;b<candidates.length-2;b++)for(let c=b+1;c<candidates.length-1;c++)for(let d=c+1;d<candidates.length;d++){
  charge(6*24);
  const knots=[0,candidates[a]??0,candidates[b]??0,candidates[c]??0,candidates[d]??0,1],diagonal=Array(6).fill(0),off=Array(5).fill(0),rhs=Array.from({length:6},()=>[0,0,0]);
  for(let j=0;j<5;j++){
   const lo=knots[j]??0,hi=knots[j+1]??1,span=hi-lo;if(span<1e-8)continue;
   const start=prefix[lower(lo)]??[],end=prefix[j===4?positions.length:lower(hi)]??[],s=end.map((v,k)=>v-(start[k]??0));
   const count=s[0]??0,sum=s[1]??0,squares=s[2]??0;
   diagonal[j]+=(hi*hi*count-2*hi*sum+squares)/(span*span);
   diagonal[j+1]+=(squares-2*lo*sum+lo*lo*count)/(span*span);
   off[j]=((lo+hi)*sum-lo*hi*count-squares)/(span*span);
   for(let channel=0;channel<3;channel++){
    /** @type {number[]} */(rhs[j])[channel]=(rhs[j]?.[channel]??0)+(hi*(s[3+channel]??0)-(s[6+channel]??0))/span;
    /** @type {number[]} */(rhs[j+1])[channel]=(rhs[j+1]?.[channel]??0)+((s[6+channel]??0)-lo*(s[3+channel]??0))/span;
   }
  }
  const original=rhs.map(r=>r.slice()),rgb=solve(diagonal,off,rhs);if(!rgb)continue;
  const error=(prefix.at(-1)?.[9]??0)-original.reduce((sum,row,i)=>sum+row.reduce((s,v,c)=>s+v*(rgb[i]?.[c]??0),0),0);
  ranked.push({knots,error,rgb});
 }
 charge(ranked.length*Math.ceil(Math.log2(Math.max(2,ranked.length))));ranked.sort((a,b)=>a.error-b.error);
 for(const proposal of ranked.slice(0,64)){
  let rgb=proposal.rgb;const knots=proposal.knots;
  for(let iteration=0;iteration<3;iteration++){
   charge(colors.length*4+6*18);
   const rounded=rgb.map(row=>row.map(v=>Math.round(Math.max(0,Math.min(255,v))))),diagonal=Array(6).fill(0),off=Array(5).fill(0),rhs=Array.from({length:6},()=>[0,0,0]);let matching=0;
   for(const [index,color]of colors.entries()){
    const t=positions[index]??0;let j=0;while(j<4&&t>(knots[j+1]??1))j++;
    const f=(t-(knots[j]??0))/((knots[j+1]??1)-(knots[j]??0)),a=1-f;
    const residual=Math.max(...color.map((v,c)=>Math.abs(v-((rounded[j]?.[c]??0)*a+(rounded[j+1]?.[c]??0)*f))));
    if(residual<=18)matching++;
    const weight=Math.min(1,18/Math.max(1,residual))**2;
    diagonal[j]+=weight*a*a;diagonal[j+1]+=weight*f*f;off[j]+=weight*a*f;
    for(let c=0;c<3;c++){
     /** @type {number[]} */(rhs[j])[c]=(rhs[j]?.[c]??0)+weight*a*(color[c]??0);
     /** @type {number[]} */(rhs[j+1])[c]=(rhs[j+1]?.[c]??0)+weight*f*(color[c]??0);
    }
   }
   if(matching/colors.length>=.9)return {support:matching/colors.length,stops:knots.map((position,i)=>({position,
    color:'#'+(rounded[i]??[]).map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase()}))};
   const next=solve(diagonal,off,rhs);if(!next)break;rgb=next;
  }
 }
 return null;
}
module.exports={fitAdaptiveGradientPaint};
