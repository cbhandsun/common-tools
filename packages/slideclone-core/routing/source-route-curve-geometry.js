// @ts-check
'use strict';
const {curveControls,curveList,curvePoints,reserveCurveWork}=require('./source-route-curve-input');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{a:Point,b:Point,error:number}} Segment */
/** @typedef {import('./source-shared-route-output-snapshot').Work} Work */
/** @param {Point} p @param {Point} a @param {Point} b */
function curveSegmentDistance(p,a,b){const x=b.x-a.x,y=b.y-a.y,d=x*x+y*y,t=d?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/d)):0;return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y);}
/** @param {Point} a @param {Point} b */const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
/** De Casteljau halves; a line remains a line. @param {Point[]} c */
function splitSourceCurve(c){
 const a=/** @type {Point} */(c[0]),b=/** @type {Point} */(c.at(-1));if(c.length===2){const m=mid(a,b);return [[a,m],[m,b]];}
 const ab=mid(a,/** @type {Point} */(c[1])),bc=mid(/** @type {Point} */(c[1]),/** @type {Point} */(c[2])),cd=mid(/** @type {Point} */(c[2]),b),abc=mid(ab,bc),bcd=mid(bc,cd),m=mid(abc,bcd);
 return [[a,ab,abc,m],[m,bcd,cd,b]];
}
/** Independent finite-segment capsule bound, never a tolerance increase.
 * @param {Point[][]} curves @param {Work} work @returns {Segment[]|null} */
function flattenSourceCurves(curves,work){
 /** @type {Segment[]} */const segments=[];
 /** @param {Point[]} c @param {number} depth @returns {boolean} */
 const visit=(c,depth)=>{
  reserveCurveWork(work,4);const a=/** @type {Point} */(c[0]),b=/** @type {Point} */(c.at(-1));
  const error=c.length===2?0:Math.max(curveSegmentDistance(/** @type {Point} */(c[1]),a,b),curveSegmentDistance(/** @type {Point} */(c[2]),a,b));
  if(error<=1/64){if(segments.length>=4096)return false;segments.push({a,b,error});return true;}
  if(depth>=16)return false;reserveCurveWork(work,12);const halves=splitSourceCurve(c);
  return visit(/** @type {Point[]} */(halves[0]),depth+1)&&visit(/** @type {Point[]} */(halves[1]),depth+1);
 };
 for(const c of curves)if(!visit(c,0))return null;return segments;
}
/** @param {Segment[]} from @param {Segment[]} to @param {Work} work */
function directedCurveBound(from,to,work){
 /** @type {Map<string,Segment[]>} */const buckets=new Map();
 for(const s of to){
  const left=Math.floor(Math.min(s.a.x,s.b.x)-.75),right=Math.floor(Math.max(s.a.x,s.b.x)+.75),top=Math.floor(Math.min(s.a.y,s.b.y)-.75),bottom=Math.floor(Math.max(s.a.y,s.b.y)+.75);
  reserveCurveWork(work,(right-left+1)*(bottom-top+1));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const key=x+','+y,rows=buckets.get(key)??[];rows.push(s);buckets.set(key,rows);}
 }
 let maximum=0,observations=0;
 for(const s of from){
  const length=Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y),count=Math.max(1,Math.ceil(length/.25)),step=length/count;
  if(observations+count+1>65536)return null;reserveCurveWork(work,count+1);observations+=count+1;
  for(let i=0;i<=count;i++){
   const t=i/count,p={x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t},rows=buckets.get(Math.floor(p.x)+','+Math.floor(p.y))??[];let nearest=Infinity;
   reserveCurveWork(work,rows.length);
   for(const target of rows)nearest=Math.min(nearest,curveSegmentDistance(p,target.a,target.b)+target.error);
   maximum=Math.max(maximum,nearest+step/2+s.error);
  }
 }
 return {maximumCertifiedBound:maximum,observations,passed:maximum<=.75};
}
/** Bidirectional continuous bound against ALL original source segments. Both
 * capsule errors and half the observation step are ADDED to distance. A good
 * observation fit alone never suffices. No source/output authority is issued.
 * @param {unknown} input */
function certifySourceRouteCurveGeometry(input){
 const {row,work}=curveControls(input),points=curvePoints(row.points,work,2,1024),curves=curveList(row.curves,work,1,120).map(c=>{
  const ps=curvePoints(c,work,2,4);if(ps.length===3)throw new TypeError('Source curve degree is invalid');return ps;
 });
 reserveCurveWork(work,points.length+curves.length);
 const same=(/** @type {Point|undefined} */a,/** @type {Point|undefined} */b)=>!!a&&!!b&&Math.hypot(a.x-b.x,a.y-b.y)<=1e-9;
 if(!same(points[0],curves[0]?.[0])||!same(points.at(-1),curves.at(-1)?.at(-1)))
  return {passed:false,reason:'curve-endpoints'};
 for(let i=1;i<curves.length;i++)if(!same(curves[i]?.[0],curves[i-1]?.at(-1)))return {passed:false,reason:'curve-discontinuity'};
 const flattened=flattenSourceCurves(curves,work);if(!flattened)return {passed:false,reason:'curve-subdivision-capacity'};
 const original=points.slice(1).map((p,i)=>({a:/** @type {Point} */(points[i]),b:p,error:0}));
 const sourceToCurve=directedCurveBound(original,flattened,work),curveToSource=directedCurveBound(flattened,original,work);
 reserveCurveWork(work,flattened.length+1);
 const route=[/** @type {Segment} */(flattened[0]).a,...flattened.map(s=>s.b)];
 return {passed:sourceToCurve?.passed===true&&curveToSource?.passed===true,sourceToCurve,curveToSource,segments:flattened.length,route};
}
module.exports={certifySourceRouteCurveGeometry,curveSegmentDistance,splitSourceCurve,flattenSourceCurves};
