// @ts-check
'use strict';
const {curveControls,curvePoints,reserveCurveWork}=require('./source-route-curve-input');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{controls:Point[],low:number,high:number,maxObservationError:number}} Curve */
/** @param {Point} p @returns {Point|null} */
function unit(p){const d=Math.hypot(p.x,p.y);return d<1e-12?null:{x:p.x/d,y:p.y/d};}
/** @param {Point} a @param {Point} b */const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
/** @param {Point[]} c @param {number} u */
function evaluateSourceCubic(c,u){
 const a=/** @type {Point} */(c[0]),b=/** @type {Point} */(c[1]),d=/** @type {Point} */(c[2]),e=/** @type {Point} */(c[3]);
 const v=1-u,k0=v*v*v,k1=3*v*v*u,k2=3*v*u*u,k3=u*u*u;
 return {x:k0*a.x+k1*b.x+k2*d.x+k3*e.x,y:k0*a.y+k1*b.y+k2*d.y+k3*e.y};
}
/** Fixed 1/16px observation fit, at most five reparameterizations per split.
 * Endpoints and every original sample index are retained. This proposes
 * geometry only; continuous distance, source ink and topology are separate.
 * @param {unknown} input @returns {Curve[]|null} */
function fitSourceRouteCubics(input){
 const {row,work}=curveControls(input),points=curvePoints(row.points,work,2,1024);
 reserveCurveWork(work,points.length);
 for(let i=1;i<points.length;i++)if(Math.hypot(Number(points[i]?.x)-Number(points[i-1]?.x),Number(points[i]?.y)-Number(points[i-1]?.y))<1e-9)
  throw new TypeError('Source curve spacing is invalid');
 /** @type {Curve[]} */const curves=[];
 /** @param {number} low @param {number} high @param {number[]} u @param {Point} ta @param {Point} tb @param {number} arc */
 const generate=(low,high,u,ta,tb,arc)=>{
  reserveCurveWork(work,(high-low+1)*4);
  const start=/** @type {Point} */(points[low]),end=/** @type {Point} */(points[high]);let a=0,b=0,c=0,x=0,y=0;
  for(let i=low;i<=high;i++){
   const t=Number(u[i-low]),v=1-t,b1=3*t*v*v,b2=3*t*t*v,p=/** @type {Point} */(points[i]);
   const ax=ta.x*b1,ay=ta.y*b1,bx=tb.x*b2,by=tb.y*b2,rx=p.x-start.x*(v*v*v+b1)-end.x*(t*t*t+b2),ry=p.y-start.y*(v*v*v+b1)-end.y*(t*t*t+b2);
   a+=ax*ax+ay*ay;b+=ax*bx+ay*by;c+=bx*bx+by*by;x+=ax*rx+ay*ry;y+=bx*rx+by*ry;
  }
  const det=a*c-b*b,d=Math.hypot(end.x-start.x,end.y-start.y);let al=Math.abs(det)>1e-12?(x*c-y*b)/det:d/3,ar=Math.abs(det)>1e-12?(a*y-b*x)/det:d/3;
  if(Math.min(al,ar)<1e-6||Math.max(al,ar)>2*arc)al=ar=d/3;
  return [start,{x:start.x+ta.x*al,y:start.y+ta.y*al},{x:end.x+tb.x*ar,y:end.y+tb.y*ar},end];
 };
 /** @param {number} low @param {number} high @param {number[]} u @param {Point[]} c */
 const reparameterize=(low,high,u,c)=>{
  reserveCurveWork(work,(high-low+1)*6+16);
  const start=/** @type {Point} */(c[0]),a=/** @type {Point} */(c[1]),b=/** @type {Point} */(c[2]),end=/** @type {Point} */(c[3]);
  const d0={x:3*(a.x-start.x),y:3*(a.y-start.y)},d1={x:3*(b.x-a.x),y:3*(b.y-a.y)},d2={x:3*(end.x-b.x),y:3*(end.y-b.y)};
  const q0={x:2*(d1.x-d0.x),y:2*(d1.y-d0.y)},q1={x:2*(d2.x-d1.x),y:2*(d2.y-d1.y)},result=[0];let monotone=true;
  for(let i=low+1;i<high;i++){
   const t=Number(u[i-low]),v=1-t,point=evaluateSourceCubic(c,t),p=/** @type {Point} */(points[i]);
   const dx=v*v*d0.x+2*v*t*d1.x+t*t*d2.x,dy=v*v*d0.y+2*v*t*d1.y+t*t*d2.y,ddx=v*q0.x+t*q1.x,ddy=v*q0.y+t*q1.y;
   const den=dx*dx+dy*dy+(point.x-p.x)*ddx+(point.y-p.y)*ddy,next=Math.abs(den)>1e-12?Math.max(0,Math.min(1,t-((point.x-p.x)*dx+(point.y-p.y)*dy)/den)):t;
   if(!Number.isFinite(next)||next<=Number(result.at(-1)))monotone=false;result.push(next);
  }
  if(Number(result.at(-1))>=1)monotone=false;result.push(1);return monotone?result:u;
 };
 /** @param {number} low @param {number} high @param {Point} ta @param {Point} tb @param {number} depth @returns {boolean} */
 const fit=(low,high,ta,tb,depth)=>{
  reserveCurveWork(work,8);if(depth>32||curves.length>=119)return false;
  if(high-low===1){curves.push({controls:[/** @type {Point} */(points[low]),/** @type {Point} */(points[high])],low,high,maxObservationError:0});return true;}
  reserveCurveWork(work,(high-low+1)*3);const distances=[0];let arc=0;
  for(let i=low+1;i<=high;i++){arc+=Math.hypot(Number(points[i]?.x)-Number(points[i-1]?.x),Number(points[i]?.y)-Number(points[i-1]?.y));distances.push(arc);}
  let u=distances.map(d=>d/arc),c=generate(low,high,u,ta,tb,arc),worst=low+1;
  for(let iteration=0;iteration<5;iteration++){
   reserveCurveWork(work,(high-low+1)*3);let maximum=-1;
   for(let i=low+1;i<high;i++){const q=evaluateSourceCubic(c,Number(u[i-low])),p=/** @type {Point} */(points[i]),d=Math.hypot(q.x-p.x,q.y-p.y);if(d>maximum){maximum=d;worst=i;}}
   if(maximum<=1/16){curves.push({controls:c,low,high,maxObservationError:maximum});return true;}
   if(iteration<4){u=reparameterize(low,high,u,c);c=generate(low,high,u,ta,tb,arc);}
  }
  const tangent=unit(sub(/** @type {Point} */(points[worst-1]),/** @type {Point} */(points[worst+1])));if(!tangent)return false;
  return fit(low,worst,ta,tangent,depth+1)&&fit(worst,high,{x:-tangent.x,y:-tangent.y},tb,depth+1);
 };
 const ta=unit(sub(/** @type {Point} */(points[1]),/** @type {Point} */(points[0]))),tb=unit(sub(/** @type {Point} */(points.at(-2)),/** @type {Point} */(points.at(-1))));
 return ta&&tb&&fit(0,points.length-1,ta,tb,0)?curves:null;
}
module.exports={fitSourceRouteCubics};
