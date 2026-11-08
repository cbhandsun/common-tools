// @ts-check
'use strict';
const {curveControls,curveList,curvePoints,curveRecord,reserveCurveWork}=require('./source-route-curve-input');
const {splitSourceCurve}=require('./source-route-curve-geometry');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{c:Point[],from:string,to:string}} Piece */
/** @param {Point} a @param {Point} b */const same=(a,b)=>a.x===b.x&&a.y===b.y;
/** Prove complete-curve injectivity and no new pair contacts using Bezier
 * convex hulls, separating axes and bounded De Casteljau subdivision. Shared
 * labels must have identical coordinates modulo the forward error of the
 * bounded normalization round trip; a label never excuses visible overlap.
 * No source, paint or output credential is created here.
 * @param {unknown} input */
function certifySourceRouteCurveTopology(input){
 const {row,work}=curveControls(input),edges=curveList(row.edges,work,1,128);
 /** @type {Piece[]} */const pieces=[];
 /** @type {Map<string,Point>} */const vertices=new Map();
 // At most eight scalar operations recover a normalized output coordinate,
 // each bounded by the admitted +/-100000 coordinate frame. This is machine
 // roundoff accounting, not a source geometry/contact tolerance or user knob.
 const roundtripError=8*Number.EPSILON*100000;let maximumEndpointRoundoffPx=0;
 /** @param {string} name @param {Point} p */
 const bind=(name,p)=>{
  const previous=vertices.get(name);
  if(previous&&!same(previous,p)){
   const distance=Math.hypot(previous.x-p.x,previous.y-p.y);if(distance>roundtripError)return false;
   maximumEndpointRoundoffPx=Math.max(maximumEndpointRoundoffPx,distance);p.x=previous.x;p.y=previous.y;
  }else vertices.set(name,p);
  return true;
 };
 for(const [ordinal,value]of edges.entries()){
  const edge=curveRecord(value,work);
  if(typeof edge.from!=='string'||typeof edge.to!=='string'||![edge.from,edge.to].every(v=>/^[A-Za-z0-9_-]{1,64}$/u.test(v)))throw new TypeError('Source curve vertices are invalid');
  const curves=curveList(edge.curves,work,1,120).map(raw=>{const c=curvePoints(raw,work,2,4);if(c.length===3)throw new TypeError('Source curve degree is invalid');return c;});
  reserveCurveWork(work,curves.length*4);if(pieces.length+curves.length>4096)return {passed:false,reason:'curve-piece-capacity'};
  for(const [i,c]of curves.entries()){
   const from=i===0?'vertex-'+edge.from:'internal-'+ordinal+'-'+i,to=i===curves.length-1?'vertex-'+edge.to:'internal-'+ordinal+'-'+(i+1);
   if(!bind(from,/** @type {Point} */(c[0]))||!bind(to,/** @type {Point} */(c.at(-1))))return {passed:false,reason:'curve-vertex-discontinuity'};
   pieces.push({c,from,to});
  }
 }
 let pairs=0,maximumDepth=0;
 /** @type {WeakMap<Point[],{left:number,right:number,top:number,bottom:number}>} */const boundsCache=new WeakMap();
 /** @param {Point[]} c */const bounds=c=>{
  const known=boundsCache.get(c);if(known)return known;reserveCurveWork(work,c.length*2+1);
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const p of c){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);}
  const result={left,right,top,bottom};boundsCache.set(c,result);return result;
 };
 /** @param {Point[]} a @param {Point[]} b @param {Point|null} contact */
 const separated=(a,b,contact)=>{
  reserveCurveWork(work,2);const aaBounds=bounds(a),bbBounds=bounds(b);
  if(aaBounds.right<bbBounds.left-1e-10||bbBounds.right<aaBounds.left-1e-10||aaBounds.bottom<bbBounds.top-1e-10||bbBounds.bottom<aaBounds.top-1e-10)return true;
  /** @type {Point[]} */const axes=[{x:1,y:0},{x:0,y:1}];
  reserveCurveWork(work,a.length*a.length+b.length*b.length+4);
  if(contact){
   const aa=/** @type {Point} */(same(/** @type {Point} */(a[0]),contact)?a.at(-1):a[0]),bb=/** @type {Point} */(same(/** @type {Point} */(b[0]),contact)?b.at(-1):b[0]);
   const la=Math.hypot(aa.x-contact.x,aa.y-contact.y),lb=Math.hypot(bb.x-contact.x,bb.y-contact.y);
   if(Math.min(la,lb)>1e-12)axes.push({x:(bb.x-contact.x)/lb-(aa.x-contact.x)/la,y:(bb.y-contact.y)/lb-(aa.y-contact.y)/la});
  }
  // Every hull edge is one of these pairs; extra axes are equally valid.
  for(const ps of [a,b])for(let i=0;i<ps.length;i++)for(let j=0;j<i;j++)axes.push({x:Number(ps[j]?.y)-Number(ps[i]?.y),y:Number(ps[i]?.x)-Number(ps[j]?.x)});
  for(const axis of axes){
   const length=Math.hypot(axis.x,axis.y);if(length<1e-12)continue;reserveCurveWork(work,a.length+b.length);
   const nx=axis.x/length,ny=axis.y/length,origin=contact??{x:0,y:0},dot=(/** @type {Point} */p)=>(p.x-origin.x)*nx+(p.y-origin.y)*ny;
   const pa=a.map(dot),pb=b.map(dot),amin=Math.min(...pa),amax=Math.max(...pa),bmin=Math.min(...pb),bmax=Math.max(...pb);
   if(amax<bmin-1e-10||bmax<amin-1e-10)return true;
   if(contact){
    const ae=dot(/** @type {Point} */(same(/** @type {Point} */(a[0]),contact)?a.at(-1):a[0])),be=dot(/** @type {Point} */(same(/** @type {Point} */(b[0]),contact)?b.at(-1):b[0]));
    // The shared endpoint is exactly zero. All other Bernstein weights
    // are positive inside (0,1), so strict opposite ends prove no overlap.
    if(amax<=0&&bmin>=0&&ae< -1e-9&&be>1e-9||bmax<=0&&amin>=0&&be< -1e-9&&ae>1e-9)return true;
   }
  }
  return false;
 };
 /** @param {Point[]} a @param {Point[]} b @param {Point|null} contact @param {number} depth @returns {boolean} */
 const disjoint=(a,b,contact,depth)=>{
  reserveCurveWork(work,1);maximumDepth=Math.max(maximumDepth,depth);if(separated(a,b,contact))return true;if(depth>=24)return false;
  const span=(/** @type {Point[]} */c)=>{const b=bounds(c);return Math.max(b.right-b.left,b.bottom-b.top);};
  reserveCurveWork(work,14);
  const splitA=span(a)>=span(b);
  for(const c of splitSourceCurve(splitA?a:b)){
   const retained=contact&&(same(/** @type {Point} */(c[0]),contact)||same(/** @type {Point} */(c.at(-1)),contact))?contact:null;
   if(!(splitA?disjoint(c,b,retained,depth+1):disjoint(a,c,retained,depth+1)))return false;
  }return true;
 };
 /** @param {Point[]} c @param {number} depth @returns {boolean} */
 const simple=(c,depth)=>{
  reserveCurveWork(work,c.length*3);const start=/** @type {Point} */(c[0]),end=/** @type {Point} */(c.at(-1));if(c.length===2)return !same(start,end);
  const derivatives=c.slice(1).map((p,i)=>({x:p.x-Number(c[i]?.x),y:p.y-Number(c[i]?.y)}));
  for(const axis of [{x:end.x-start.x,y:end.y-start.y},{x:1,y:0},{x:0,y:1}]){
   reserveCurveWork(work,derivatives.length);const values=derivatives.map(d=>d.x*axis.x+d.y*axis.y),low=Math.min(...values),high=Math.max(...values);
   if(low>=0&&high>1e-12||high<=0&&low< -1e-12)return true;
  }
  if(depth>=12)return false;reserveCurveWork(work,12);const halves=splitSourceCurve(c),left=/** @type {Point[]} */(halves[0]),right=/** @type {Point[]} */(halves[1]);
  return disjoint(left,right,/** @type {Point} */(left.at(-1)),0)&&simple(left,depth+1)&&simple(right,depth+1);
 };
 for(let i=0;i<pieces.length;i++){
  const a=/** @type {Piece} */(pieces[i]);if(!simple(a.c,0))return {passed:false,reason:'curve-self-contact',piece:i};
  for(let j=0;j<i;j++){
   const b=/** @type {Piece} */(pieces[j]);pairs++;reserveCurveWork(work,4);let contact=null;
   for(const [an,ap]of [[a.from,a.c[0]],[a.to,a.c.at(-1)]])for(const [bn]of [[b.from],[b.to]])if(an===bn)contact=/** @type {Point} */(ap);
   if(!disjoint(a.c,b.c,contact,0))return {passed:false,reason:'curve-pair-contact',a:i,b:j};
  }
 }
 return {passed:true,pieces:pieces.length,pairs,maximumDepth,maximumEndpointRoundoffPx};
}
module.exports={certifySourceRouteCurveTopology};
