// @ts-check
'use strict';
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {fitSourceRoutePaint,sourceRoutePaintColor}=require('./source-route-paint-fit');
const {sharedOutputWork,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
const {fitAdaptiveGradientPaint}=require('./source-adaptive-gradient-paint');
/** A diagonal source gradient is a single Office stroke too. Infer candidate
 * axes from the observed RGB plane, then independently verify every original
 * sample with the existing six-stop, .9 support, 18-channel paint solver.
 * This detached paint fit supplies no geometry, identity or erasure rights.
 * @param {{points:{x:number,y:number}[],colors:number[][],bounds:{x:number,y:number,w:number,h:number},
 * work:import('./source-shared-route-output-snapshot').Work}} input */
function fitWholeRoutePaint(input){
 if(!record(input)||!list(input.points)||input.points.length<8||input.points.length>512||!list(input.colors)
  ||input.colors.length!==input.points.length||!record(input.bounds)||!sharedOutputWork(input.work)
  ||!input.points.every(p=>record(p)&&[p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000))
  ||!input.colors.every(c=>list(c)&&c.length===3&&c.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=255))
  ||![input.bounds.x,input.bounds.y,input.bounds.w,input.bounds.h].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)
  ||input.bounds.w<0||input.bounds.h<0)throw new TypeError('Whole route paint controls are invalid');
 const {points,colors,bounds,work}=input,n=points.length;
 /** @param {number} count */const charge=count=>{if(!chargeSharedOutput(work,count))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 charge(n*32);
 const mx=points.reduce((s,p)=>s+p.x,0)/n,my=points.reduce((s,p)=>s+p.y,0)/n;
 const xx=points.reduce((s,p)=>s+(p.x-mx)**2,0),yy=points.reduce((s,p)=>s+(p.y-my)**2,0),xy=points.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0),det=xx*yy-xy*xy;
 if(Math.abs(det)<=1e-10*Math.max(1,xx*yy))return null;
 const axes=[0,1,2].map(c=>{
  const mean=colors.reduce((s,p)=>s+(p[c]??0),0)/n;
  const xc=points.reduce((s,p,i)=>s+(p.x-mx)*((colors[i]?.[c]??0)-mean),0),yc=points.reduce((s,p,i)=>s+(p.y-my)*((colors[i]?.[c]??0)-mean),0);
  const x=(xc*yy-yc*xy)/det,y=(yc*xx-xc*xy)/det,len=Math.hypot(x,y);
  return {x:x/len,y:y/len,len};
 }).filter(a=>a.len>1e-8&&[a.x,a.y].every(Number.isFinite)).sort((a,b)=>b.len-a.len);
 /** @param {number[]} rgb */const hex=rgb=>'#'+rgb.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase();
 // A global least-squares plane is only an axis nomination. A short source
 // transition plus a long beam can bias it. Search a fixed bounded stencil;
 // only the unchanged independent original-sample verification admits it.
 const candidates=axes.flatMap(axis=>[0,20,-20,10,-10,30,-30].map(degrees=>{
  const r=degrees*Math.PI/180;return {x:axis.x*Math.cos(r)-axis.y*Math.sin(r),y:axis.x*Math.sin(r)+axis.y*Math.cos(r)};
 }));
 // First try the cheap strongest-axis models. A near-axis gradient with
 // short nonuniform transitions needs a separate bounded knot proposal;
 // fitting every plane nomination adaptively wastes the shared source ledger.
 const near=(bounds.h>=bounds.w?87.5:2.5)*Math.PI/180;
 const proposals=[...candidates.slice(0,3).map(axis=>({axis,adaptive:false})),
  {axis:{x:Math.cos(near),y:Math.sin(near)},adaptive:true},...candidates.slice(3).map(axis=>({axis,adaptive:false}))];
 for(const {axis,adaptive}of proposals){
  charge(n*(8+Math.ceil(Math.log2(n))));
  const values=points.map(p=>p.x*axis.x+p.y*axis.y),lo=Math.min(...values),span=Math.max(...values)-lo;if(span<1e-8)continue;
  const order=values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v),positions=order.map(p=>(p.v-lo)/span);
  const observations=order.map(p=>colors[p.i]??[]),fit=adaptive?fitAdaptiveGradientPaint(observations,positions,work):fitSourceRoutePaint(observations,positions,work);
  if(work.checks>4000000)throw new TypeError('Scene shared path binding failed: shared-geometry-budget');
  if(!fit)continue;
  const projected=[{x:bounds.x,y:bounds.y},{x:bounds.x+bounds.w,y:bounds.y},{x:bounds.x,y:bounds.y+bounds.h},{x:bounds.x+bounds.w,y:bounds.y+bounds.h}]
   .map(p=>p.x*axis.x+p.y*axis.y),start=Math.min(...projected),end=Math.max(...projected),length=end-start;
  if(length<1e-8)return null;
  /** @param {number} at */const color=at=>hex(sourceRoutePaintColor(fit.stops,Math.max(0,Math.min(1,(at-lo)/span))));
  const stops=[{position:0,color:color(start)},...fit.stops.map(s=>({position:(lo+s.position*span-start)/length,color:s.color}))
   .filter(s=>s.position>0&&s.position<1),{position:1,color:color(end)}];
  return {gradient:{type:'linear',angleDeg:(Math.atan2(axis.y,axis.x)*180/Math.PI+360)%360,stops},
   color:color((lo+lo+span)/2),support:fit.support};
 }
 return null;
}
module.exports={fitWholeRoutePaint};
