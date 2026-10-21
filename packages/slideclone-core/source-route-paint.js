// @ts-check
'use strict';
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{position:number,color:string}} Stop */
/** @param {number[]} rgb */
const hex=rgb=>'#'+rgb.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase();
/** @param {string} color */
const rgb=color=>[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16));
/** Fit native linear color stops to already charged original route cells.
 * Four million geometry checks, six stops, 18-channel error and .9 support
 * remain unchanged. Geometry, direction, coverage and ports stay separate.
 * @param {Point[]} path @param {Uint8Array} rgba @param {number} width
 * @param {{checks:number}} work @param {Stop[]} [priorStops] */
function measureSourceRoutePaint(path,rgba,width,work,priorStops){
 work.checks+=path.length*2;if(work.checks>4000000||path.length<8||path.length>512)return null;
 const colors=path.map(p=>[0,1,2].map(c=>rgba[(p.y*width+p.x)*4+c]??0));
 // Attachment is checked against the actual terminal source cells. A global
 // .9 paint fit can legitimately exclude antialiased terminal samples; its
 // extrapolated stop colors cannot substitute for physical source contact.
 const startColor=hex(colors[0]??[]),endColor=hex(colors.at(-1)??[]);
 const median=[0,1,2].map(c=>colors.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(colors.length/2)]??0);
 const solidSupport=colors.filter(p=>p.every((v,c)=>Math.abs(v-(median[c]??0))<=18)).length/colors.length;
 if(solidSupport>=.9)
  return {color:hex(median),startColor,endColor,support:solidSupport};
 const distances=[0];
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i];if(!a||!b)return null;
  distances.push((distances[i-1]??0)+Math.hypot(a.x-b.x,a.y-b.y));
 }
 const length=distances.at(-1)??0;if(!length)return null;
 const positions=distances.map(d=>d/length);
 // Neighboring endpoint hypotheses often traverse the same source shaft.
 // Reuse only a paint hypothesis: every original cell on this candidate
 // must be independently rechecked at the same error/support gates.
 const candidates=Array.isArray(priorStops)?(priorStops.length>0&&Array.isArray(priorStops[0])?priorStops:(priorStops.length>0&&priorStops[0]?.color?[priorStops]:[])):[];
 for(const candidate of candidates){
  let matching=0,mismatches=0;const maxMismatches=Math.floor(colors.length*.1);
  for(const [index,color]of colors.entries()){
   work.checks+=1;if(work.checks>4000000)return null;
   const actual=sourceRoutePaintColor(candidate,positions[index]??0);
   if(color.every((v,c)=>Math.abs(v-(actual[c]??0))<=18))matching++;
   else if(++mismatches>maxMismatches)break;
  }
  if(matching/colors.length>=.9)return {color:hex(median),startColor,endColor,
   support:matching/colors.length,stops:candidate,positions};
 }
 for(let count=2;count<=6;count++){
  const rows=Array.from({length:count},()=>Array(count+3).fill(0));
  for(const [index,color]of colors.entries()){
   work.checks+=1;if(work.checks>4000000)return null;
   const t=(positions[index]??0)*(count-1),j=Math.min(count-2,Math.floor(t)),f=t-j;
   for(const [a,wa]of [[j,1-f],[j+1,f]]){
    const row=rows[a??-1];if(!row||wa===undefined)return null;
    for(const [b,wb]of [[j,1-f],[j+1,f]])if(b!==undefined&&wb!==undefined)row[b]=(row[b]??0)+wa*wb;
    for(let c=0;c<3;c++)row[count+c]=(row[count+c]??0)+wa*(color[c]??0);
   }
  }
  // The small source-normal equation is bounded by six native stops. A
  // singular or non-finite fit fails instead of inventing a paint fallback.
  let singular=false;
  for(let i=0;i<count;i++){
   work.checks+=count*(count+3);if(work.checks>4000000)return null;
   const row=rows[i],pivot=row?.[i];if(!row||pivot===undefined||!Number.isFinite(pivot)||Math.abs(pivot)<1e-9){singular=true;break;}
   for(let c=i;c<count+3;c++)row[c]=(row[c]??0)/pivot;
   for(let r=0;r<count;r++)if(r!==i){const other=rows[r];if(!other)return null;const factor=other[i]??0;
    for(let c=i;c<count+3;c++)other[c]=(other[c]??0)-factor*(row[c]??0);}
  }
  if(singular)continue;
  const paint=rows.map(row=>row.slice(count));if(paint.flat().some(v=>!Number.isFinite(v)))continue;
  const stops=paint.map((color,i)=>({position:i/(count-1),color:hex(color)}));let matching=0;
  for(const [index,color]of colors.entries()){
   work.checks+=16;if(work.checks>4000000)return null;
   const actual=sourceRoutePaintColor(stops,positions[index]??0);
   if(color.every((v,c)=>Math.abs(v-(actual[c]??0))<=18))matching++;
  }
  if(matching/colors.length>=.9)return {color:hex(median),startColor,endColor,
   support:matching/colors.length,stops,positions};
 }
 // Equally spaced stops cannot describe a short source head transition.
 // Adaptive knots are proposals only: every ORIGINAL cell must still pass
 // the same 18-channel / .9 gate, with at most six native stops.
 const adaptive=adaptiveSourcePaint(colors,positions,work);
 return adaptive?{color:hex(median),startColor,endColor,...adaptive,positions}:null;
}
/** Local five-cell medians propose paint, never replace observed evidence.
 * A one-cell antialias/compression extreme must not place every later knot.
 * @param {number[][]} colors @param {number[]} positions @param {{checks:number}} work */
function adaptiveSourcePaint(colors,positions,work){
 work.checks+=colors.length*2;if(work.checks>4000000)return null;
 const smooth=colors.map((color,i)=>color.map((_,c)=>{
  const values=colors.slice(Math.max(0,i-2),Math.min(colors.length,i+3)).map(p=>p[c]??0).sort((a,b)=>a-b);
  return values[Math.floor(values.length/2)]??0;
 }));
 const knots=[0,colors.length-1];
 for(let count=2;count<=6;count++){
  const stops=knots.map(i=>({position:positions[i]??NaN,color:hex(smooth[i]??[])}));
  if(stops.some((s,i)=>!Number.isFinite(s.position)||i>0&&s.position<=(stops[i-1]?.position??0)))return null;
  let matching=0,worst=-1,next=-1;
  for(const [i,color]of colors.entries()){
   work.checks+=2;if(work.checks>4000000)return null;
   const actual=sourceRoutePaintColor(stops,positions[i]??0);
   if(color.every((v,c)=>Math.abs(v-(actual[c]??0))<=18))matching++;
   const error=Math.max(...(smooth[i]??[]).map((v,c)=>Math.abs(v-(actual[c]??0))));
   if(!knots.includes(i)&&error>worst){worst=error;next=i;}
  }
  if(matching/colors.length>=.9)return {support:matching/colors.length,stops};
  if(next<0)break;knots.push(next);knots.sort((a,b)=>a-b);
 }
 return null;
}
/** @param {Stop[]} stops @param {number} position */
function sourceRoutePaintColor(stops,position){
 const last=stops.at(-1),first=stops[0];if(!first||!last)throw new TypeError('Route paint stops are invalid');
 const right=stops.findIndex(s=>s.position>=position),b=stops[Math.max(1,right)]??last,a=stops[Math.max(0,right-1)]??first;
 const f=(position-a.position)/(b.position-a.position),low=rgb(a.color),high=rgb(b.color);
 return low.map((v,c)=>v*(1-f)+(high[c]??0)*f);
}
/** Clip the source-certified stops to one original simplified segment. No
 * new color fit, source sample or extra native part is introduced here.
 * @param {Stop[]} stops @param {number} start @param {number} end @param {number} angleDeg */
function sourceRouteSegmentGradient(stops,start,end,angleDeg){
 if(!(start>=0&&end>start&&end<=1)||!Number.isFinite(angleDeg))throw new TypeError('Route paint interval is invalid');
 return {type:'linear',angleDeg,stops:[{position:0,color:hex(sourceRoutePaintColor(stops,start))},
  ...stops.filter(s=>s.position>start&&s.position<end).map(s=>({position:(s.position-start)/(end-start),color:s.color})),
  {position:1,color:hex(sourceRoutePaintColor(stops,end))}]};
}
module.exports={measureSourceRoutePaint,sourceRouteSegmentGradient};
