// @ts-check
'use strict';
const {chargeSharedOutput,sharedOutputWork}=require('./source-shared-route-output-snapshot');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{curves:Point[][],widthPx:number,cells:number[],from:number,to:number,fromHead:boolean,toHead:boolean}} Edge */
/** Internal representation predicate. Callers supply a PRIVATE original shaft
 * mask; returning true grants no source/paint/erasure capability. Curves use
 * source-window coordinates. The old .75px body, 2px halo/2% cap, head flares
 * and joint wedges remain unchanged. Curve error is ADDED to distance, never
 * added to those allowances or to an earlier source displacement budget.
 * The optional cell roster comes only from the registry's complete source
 * scan, never from output rows or a caller's serialized fit. It grants no
 * authority here; the measurement registry owns its identity and membership.
 * @param {{mask:Uint8Array,sourceCells?:readonly number[],width:number,height:number,edges:Edge[],joints:number[],work:import('./source-shared-route-output-snapshot').Work}} input */
function sourceCurveFootprint({mask,sourceCells,width,height,edges,joints,work}){
 if(!sharedOutputWork(work))throw new TypeError('Source curve footprint work is invalid');
 if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0)||width*height>262144||mask.length!==width*height)
  throw new TypeError('Source curve footprint frame is invalid');
 /** @param {number} count */
 const charge=count=>{if(!chargeSharedOutput(work,count))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 /** @type {Map<string,{a:Point,b:Point,error:number,radius:number,halo:number}[]>} */const buckets=new Map();
 /** @param {Point} p @param {Point} a @param {Point} b */
 const distance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
 /** @param {Point} a @param {Point} b */const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
 /** @param {Point} a @param {Point} b @param {number} error @param {number} radius @param {number} halo */
 const add=(a,b,error,radius,halo)=>{
  const left=Math.floor((Math.min(a.x,b.x)-halo-error)/16),right=Math.floor((Math.max(a.x,b.x)+halo+error)/16),
   top=Math.floor((Math.min(a.y,b.y)-halo-error)/16),bottom=Math.floor((Math.max(a.y,b.y)+halo+error)/16);
  charge((right-left+1)*(bottom-top+1));const row={a,b,error,radius,halo};
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const key=x+','+y,list=buckets.get(key)??[];list.push(row);buckets.set(key,list);}
 };
 let pieces=0;
 /** The control hull lies in a chord capsule. Continuity of its projection
  * onto that chord bounds distance in both directions by the capsule radius.
  * @param {Point[]} c @param {number} radius @param {number} halo @param {number} depth @returns {boolean} */
 const flatten=(c,radius,halo,depth)=>{
  charge(4);const a=c[0],b=c.at(-1);if(!a||!b)return false;
  const error=c.length===2?0:Math.max(distance(/** @type {Point} */(c[1]),a,b),distance(/** @type {Point} */(c[2]),a,b));
  if(error<=1/64){if(++pieces>4096)return false;add(a,b,error,radius,halo);return true;}
  if(depth>=16)return false;
  const ab=mid(a,/** @type {Point} */(c[1])),bc=mid(/** @type {Point} */(c[1]),/** @type {Point} */(c[2])),cd=mid(/** @type {Point} */(c[2]),b),abc=mid(ab,bc),bcd=mid(bc,cd),m=mid(abc,bcd);
  return flatten([a,ab,abc,m],radius,halo,depth+1)&&flatten([m,bcd,cd,b],radius,halo,depth+1);
 };
 /** @param {number} n */const point=n=>({x:n%width,y:Math.floor(n/width)});
 for(const edge of edges){
  const radius=edge.widthPx/2+.75,halo=edge.widthPx/2+2;
  for(const curve of edge.curves)if(!flatten(curve,radius,halo,0))return false;
  charge(edge.cells.length);
  for(let i=0;i<edge.cells.length;i++)if(edge.fromHead&&i<16||edge.toHead&&i>=edge.cells.length-16){
   const p=point(/** @type {number} */(edge.cells[i]));add(p,p,0,Math.max(8.5,radius),Math.max(10,halo));
  }
 }
 for(const n of joints){charge(edges.length);const incident=edges.filter(e=>e.from===n||e.to===n);if(!incident.length)continue;
  const p=point(n),radius=Math.min(15,Math.max(8.5,Math.max(...incident.map(e=>e.widthPx))*2.5+.75));add(p,p,0,radius,radius);
 }
 let ink=0,halo=0;charge(sourceCells?.length??mask.length);
 for(let index=0;index<(sourceCells?.length??mask.length);index++){
  const n=sourceCells?/** @type {number} */(sourceCells[index]):index;
  if(!mask[n])continue;
  ink++;const p=point(n);let covered=false,near=false;
  for(const row of buckets.get(Math.floor(p.x/16)+','+Math.floor(p.y/16))??[]){
   charge(1);const d=distance(p,row.a,row.b)+row.error;
   if(d<=row.radius){covered=true;break;}if(d<=row.halo)near=true;
  }
  if(!covered){if(!near)return false;halo++;}
 }
 return ink>0&&halo<=ink*.02;
}
module.exports={sourceCurveFootprint};
