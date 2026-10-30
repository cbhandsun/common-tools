// @ts-check
'use strict';
const {sourceRouteFootprintPolyline}=require('./source-route-footprint-polyline');
const {SOURCE_ROUTE_VERTEX_LIMIT}=require('./source-route-centerline');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{point:Point,body:Uint8Array}} AxisContact */
/** @typedef {{start:AxisContact,end:AxisContact}} HeadContacts */
/** The filled-head certificate owns its internal skeleton. Simplify only the
 * complete thin shaft, then append the ORIGINAL tips with fixed cut vertices.
 * A head chord must lie continuously inside that SAME head's original unit
 * cells. No extra error is granted to the chord, and the cut cannot disappear
 * in a later simplification. All source shaft cells and bounds stay unchanged.
 * Internal input is supplied by the validated compound partition, not a new
 * external evidence or erasure boundary.
 * @param {Parameters<typeof import('./source-compound-route-partition').partitionSourceCompoundRoute>[0]&{headContacts?:HeadContacts}} input
 * @param {NonNullable<ReturnType<typeof import('./source-compound-route-partition').partitionSourceCompoundRoute>>} partition
 * @returns {Point[]|null} */
function sourceCompoundRouteAxis(input,partition){
 const {path,width,height,work}=input,{trimmed,remaining,startHead,endHead,queue,shaft}=partition;
 if(work.checks>=4000000||path.length<2||path.length>512||trimmed.length<2)return null;
 let first=-1,last=-1;const seen=new Set();
 for(let i=0;i<path.length;i++){
  if(++work.checks>4000000)return null;const p=path[i];if(!p)return null;
  const n=p.y*width+p.x;if(seen.has(n))return null;seen.add(n);
  if(remaining[n]){if(first<0)first=i;last=i;}
 }
 if(first<0||last-first+1!==trimmed.length||first===0&&last===path.length-1)return null;
 for(let i=0;i<path.length;i++){
  if(++work.checks>4000000)return null;const p=path[i];if(!p)return null;
  if(i<first){if(!startHead?.selected.has(p.y*width+p.x))return null;}
  else if(i>last){if(!endHead?.selected.has(p.y*width+p.x))return null;}
  else{const q=trimmed[i-first];if(!remaining[p.y*width+p.x]||!q||p.x!==q.x||p.y!==q.y)return null;}
 }
 const start=path[0],end=path.at(-1),a=trimmed[0],b=trimmed.at(-1);if(!start||!end||!a||!b)return null;
 if(first>0&&(!startHead||!headAxisSupported(start,a,startHead.selected,width,work)))return null;
 if(last<path.length-1&&(!endHead||!headAxisSupported(b,end,endHead.selected,width,work)))return null;
 // The existing private port may project a tip by up to 2px. Audit the actual
 // final chord too, using only this head and nearby independently measured
 // body cells. A body envelope or a blanket 2px head dilation grants nothing.
 if(input.headContacts){
  if(first>0&&startHead&&!contactAxisSupported(a,start,startHead.selected,input.headContacts.start,width,height,work))return null;
  if(last<path.length-1&&endHead&&!contactAxisSupported(b,end,endHead.selected,input.headContacts.end,width,height,work))return null;
 }
 const points=sourceRouteFootprintPolyline({points:trimmed,cells:queue,width,height,shaft,work});if(!points)return null;
 const result=[...(first>0?[start]:[]),...points,...(last<path.length-1?[end]:[])];
 return result.length<=SOURCE_ROUTE_VERTEX_LIMIT?result:null;
}
/** Walk every continuous parameter interval between exact half-cell crossings.
 * Checking one interior point per such interval proves the WHOLE chord lies
 * in the union of original closed pixel cells; fixed-step sampling can miss
 * a short empty interval. Integer cross products handle corner ties exactly.
 * @param {Point} a @param {Point} b @param {Set<number>} cells
 * @param {number} width @param {{checks:number}} work */
function headAxisSupported(a,b,cells,width,work){
 if(!cells.has(a.y*width+a.x)||!cells.has(b.y*width+b.x))return false;
 const dx=b.x-a.x,dy=b.y-a.y,ax=Math.abs(dx),ay=Math.abs(dy);
 let ix=0,iy=0,t=0;
 while(t<1){
  if(++work.checks>4000000)return false;
  const cross=ax&&ay?(2*ix+1)*ay-(2*iy+1)*ax:ax?-1:1;
  const next=Math.min(1,cross<=0?(ix+.5)/ax:(iy+.5)/ay);
  if(!Number.isFinite(next)||next<=t)return false;
  const middle=(t+next)/2,x=Math.floor(a.x+dx*middle+.5),y=Math.floor(a.y+dy*middle+.5);
  if(!cells.has(y*width+x))return false;
  if(cross<=0)ix++;if(cross>=0)iy++;t=next;
 }
 return true;
}
/** Fractional private contours need exact continuous interval coverage, not
 * rounding to a source centre or reusing the integer-only corner traversal.
 * @param {Point} cut @param {Point} tip @param {Set<number>} head @param {AxisContact} contact
 * @param {number} width @param {number} height @param {{checks:number}} work */
function contactAxisSupported(cut,tip,head,contact,width,height,work){
 const end=contact.point;
 if(!Number.isFinite(end.x)||!Number.isFinite(end.y)||Math.hypot(end.x-tip.x,end.y-tip.y)>2||contact.body.length!==width*height)return false;
 work.checks+=head.size;if(work.checks>4000000)return false;
 const cells=new Set(head);
 for(let y=Math.max(0,tip.y-2);y<=Math.min(height-1,tip.y+2);y++)for(let x=Math.max(0,tip.x-2);x<=Math.min(width-1,tip.x+2);x++){
  if(++work.checks>4000000)return false;const n=y*width+x;
  if(contact.body[n]&&Math.hypot(x-tip.x,y-tip.y)<=2)cells.add(n);
 }
 /** @type {{lo:number,hi:number}[]} */const intervals=[];
 for(const n of cells){
  work.checks+=8;if(work.checks>4000000)return false;
  let lo=0,hi=1;
  for(const [a,b,c] of [[cut.x,end.x,n%width],[cut.y,end.y,Math.floor(n/width)]]){
   if(a===undefined||b===undefined||c===undefined)return false;
   const d=b-a;
   if(!d){if(a<c-.5||a>c+.5){hi=-1;break;}}
   else{const u=(c-.5-a)/d,v=(c+.5-a)/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));}
  }
  if(lo<=hi)intervals.push({lo,hi});
 }
 intervals.sort((a,b)=>{if(work.checks>=4000000){work.checks=4000001;return 0;}work.checks++;return a.lo-b.lo;});
 if(work.checks>4000000)return false;
 let covered=0;
 for(const interval of intervals){if(++work.checks>4000000||interval.lo>covered)return false;covered=Math.max(covered,interval.hi);if(covered>=1)return true;}
 return false;
}
module.exports={sourceCompoundRouteAxis};
