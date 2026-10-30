// @ts-check
'use strict';
const {record}=require('../scene-plan/source-scene-group-containment');
const {types}=require('node:util');
const {sharedOutputWork,sharedOutputRecord,sharedOutputList,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {import('./source-shared-route-output-snapshot').Work} Work */
/** @param {Work} work @param {number} checks */
function reserve(work,checks){if(!chargeSharedOutput(work,checks))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');}
/** Fixed eight-step, five-diagonal ADMM representation solver. Every sample
 * stays within .5px of its original position; the two endpoints stay fixed.
 * This grants no source, paint, topology, convergence or erasure authority.
 * @param {unknown} input */
function smoothSourceRouteSamples(input){
 if(!record(input)||!sharedOutputWork(input.work))throw new TypeError('Source smoothing controls are invalid');
 const work=input.work;
 /** @param {unknown} value @returns {Record<string,unknown>} */
 const obj=value=>{if(!sharedOutputRecord(value,work))throw new TypeError('Source smoothing record is invalid');return value;};
 /** @param {unknown} value @param {number} low @param {number} high @returns {unknown[]} */
 const array=(value,low,high)=>{if(types.isProxy(value)||!Array.isArray(value)||value.length<low||value.length>high||!sharedOutputList(value,work))
  throw new TypeError('Source smoothing samples are invalid');return value;};
 /** @param {unknown} n @param {number} bound @returns {n is number} */
 const finite=(n,bound)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=bound;
 const raw=array(input.points,4,1024),targets=array(input.targets,0,raw.length),count=raw.length;
 reserve(work,count*64);
 const points=raw.map(value=>{const p=obj(value);if(!finite(p.x,100000)||!finite(p.y,100000))throw new TypeError('Source smoothing point is invalid');return {x:p.x,y:p.y};});
 const target=points.map(p=>({...p})),weights=new Float64Array(count).fill(.02),seen=new Set();
 for(const value of targets){const row=obj(value),i=row.index;
  if(typeof i!=='number'||!Number.isSafeInteger(i)||i<0||i>=count||seen.has(i)||!finite(row.dx,32)||!finite(row.dy,32))throw new TypeError('Source smoothing target is invalid');
  seen.add(i);const p=target[i];if(!p)throw new TypeError('Source smoothing target is invalid');p.x+=row.dx;p.y+=row.dy;weights[i]=1;
 }
 const d=weights.slice(),off1=new Float64Array(count-1),off2=new Float64Array(count-2),rhs=target.map((p,i)=>({x:p.x*(weights[i]??0),y:p.y*(weights[i]??0)}));
 for(let i=0;i<count-2;i++){
  const a=/** @type {Point} */(points[i]),b=/** @type {Point} */(points[i+1]),c=/** @type {Point} */(points[i+2]);
  const h=Math.hypot(b.x-a.x,b.y-a.y),k=Math.hypot(c.x-b.x,c.y-b.y);
  if(h<1e-9||k<1e-9)throw new TypeError('Source smoothing spacing is invalid');
  const l=2/(h*(h+k)),r=2/(k*(h+k)),m=-l-r;
  d[i]=Number(d[i])+16*l*l;d[i+1]=Number(d[i+1])+16*m*m;d[i+2]=Number(d[i+2])+16*r*r;
  off1[i]=Number(off1[i])+16*l*m;off1[i+1]=Number(off1[i+1])+16*m*r;off2[i]=16*l*r;
 }
 const last=/** @type {Point} */(points.at(-1)),first=/** @type {Point} */(points[0]);
 for(const [i,v,p]of /** @type {[number,number,Point][]} */([[1,off1[0],first],[2,off2[0],first],[count-2,off1[count-2],last],[count-3,off2[count-3],last]])){
  const q=/** @type {Point} */(rhs[i]);q.x-=v*p.x;q.y-=v*p.y;
 }
 const size=count-2,ld=new Float64Array(size),l1=new Float64Array(size),l2=new Float64Array(size);
 for(let i=0;i<size;i++){
  if(i>=2)l2[i]=Number(off2[i-1])/Number(ld[i-2]);
  if(i>=1)l1[i]=(Number(off1[i])-Number(l2[i])*Number(l1[i-1]))/Number(ld[i-1]);
  const pivot=Number(d[i+1])+1-Number(l1[i])**2-Number(l2[i])**2;
  if(!Number.isFinite(pivot)||pivot<=0)return null;ld[i]=Math.sqrt(pivot);
 }
 const z=points.map(p=>({...p})),u=points.map(()=>({x:0,y:0})),q=points.map(p=>({...p})),y=points.map(()=>({x:0,y:0}));let residual=0;
 for(let iteration=0;iteration<8;iteration++){
  // Vector sweeps replace six scalar-coordinate traversals with three.
  // Matrix reads shared by x/y fall by 3 forward + 3 backward + 5 residual
  // entries per interior sample. Retain the independent residual in EVERY
  // iteration and reserve the old 64 minus those 11 eliminated reads.
  reserve(work,count*53);
  for(let i=0;i<size;i++){
   const at=i+1,r=/** @type {Point} */(rhs[at]),zz=/** @type {Point} */(z[at]),uu=/** @type {Point} */(u[at]),out=/** @type {Point} */(y[at]),pivot=Number(ld[i]);
   let x=r.x+zz.x-uu.x,yy=r.y+zz.y-uu.y;
   if(i>=1){const k=Number(l1[i]),p=/** @type {Point} */(y[at-1]);x-=k*p.x;yy-=k*p.y;}
   if(i>=2){const k=Number(l2[i]),p=/** @type {Point} */(y[at-2]);x-=k*p.x;yy-=k*p.y;}
   out.x=x/pivot;out.y=yy/pivot;
  }
  for(let i=size-1;i>=0;i--){
   const at=i+1,v=/** @type {Point} */(y[at]),out=/** @type {Point} */(q[at]),pivot=Number(ld[i]);let x=v.x,yy=v.y;
   if(i+1<size){const k=Number(l1[i+1]),p=/** @type {Point} */(q[at+1]);x-=k*p.x;yy-=k*p.y;}
   if(i+2<size){const k=Number(l2[i+2]),p=/** @type {Point} */(q[at+2]);x-=k*p.x;yy-=k*p.y;}
   out.x=x/pivot;out.y=yy/pivot;
  }
  // Independently evaluate the true five-diagonal equation, not L's recurrence.
  for(let i=0;i<size;i++){
   const at=i+1,p=/** @type {Point} */(q[at]),diag=Number(d[at])+1;let x=diag*p.x,yy=diag*p.y;
   if(i>=1){const k=Number(off1[at-1]),v=/** @type {Point} */(q[at-1]);x+=k*v.x;yy+=k*v.y;}
   if(i>=2){const k=Number(off2[at-2]),v=/** @type {Point} */(q[at-2]);x+=k*v.x;yy+=k*v.y;}
   if(i+1<size){const k=Number(off1[at]),v=/** @type {Point} */(q[at+1]);x+=k*v.x;yy+=k*v.y;}
   if(i+2<size){const k=Number(off2[at]),v=/** @type {Point} */(q[at+2]);x+=k*v.x;yy+=k*v.y;}
   const r=/** @type {Point} */(rhs[at]),zz=/** @type {Point} */(z[at]),uu=/** @type {Point} */(u[at]);
   residual=Math.max(residual,Math.abs(x-r.x-zz.x+uu.x),Math.abs(yy-r.y-zz.y+uu.y));
  }
  if(!Number.isFinite(residual)||residual>=1e-8)return null;
  for(let at=1;at<count-1;at++){
   const p=/** @type {Point} */(points[at]),v=/** @type {Point} */(q[at]),dual=/** @type {Point} */(u[at]);
   const dx=v.x+dual.x-p.x,dy=v.y+dual.y-p.y,factor=Math.min(1,.5/Math.max(Math.hypot(dx,dy),1e-30)),out=/** @type {Point} */(z[at]);
   out.x=p.x+dx*factor;out.y=p.y+dy*factor;dual.x+=v.x-out.x;dual.y+=v.y-out.y;
  }
 }
 return {points:z,iterations:8,maximumLinearSolveResidual:residual};
}
module.exports={smoothSourceRouteSamples};
