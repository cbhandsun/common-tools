// @ts-check
'use strict';
const {sharedOutputWork,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{ordinal:number,index:number,x:number,y:number}} Sample */
/** @typedef {{index:number,normal:Point|null,flags:string[],normalOffset:number|null}} Section */
/** Reuse one RGB scratch section. The first pass reads source and finds the
 * peak; the second computes all paint tests and moments together. There are
 * no per-pixel objects, projection/weight arrays or repeated RGB reductions.
 * Reservations count 12 flank reads, 6 background values, 25 x (4 source
 * reads + 3 scratch writes + row), then 25 x (3 scratch reads + row).
 * Scalar arithmetic is folded into those traversals, as in the old ledger.
 * @param {{pixels:Uint8Array,width:number}} source @param {number} x
 * @param {number} y @param {number} axis @param {Float64Array} delta
 * @param {(count:number)=>void} charge */
function transverseMoment(source,x,y,axis,delta,charge){
 charge(18+25*12);
 const at=(y*source.width+x)*4,step=axis===0?4:source.width*4,pixels=source.pixels;
 const first=at-12*step,second=at-11*step,penultimate=at+11*step,last=at+12*step;
 const lr=(Number(pixels[first])+Number(pixels[second]))/2,lg=(Number(pixels[first+1])+Number(pixels[second+1]))/2,lb=(Number(pixels[first+2])+Number(pixels[second+2]))/2;
 const rr=(Number(pixels[penultimate])+Number(pixels[last]))/2,rg=(Number(pixels[penultimate+1])+Number(pixels[last+1]))/2,rb=(Number(pixels[penultimate+2])+Number(pixels[last+2]))/2;
 const flank=Math.abs(Number(pixels[first])-Number(pixels[second]))>18||Math.abs(Number(pixels[first+1])-Number(pixels[second+1]))>18||Math.abs(Number(pixels[first+2])-Number(pixels[second+2]))>18
  ||Math.abs(Number(pixels[penultimate])-Number(pixels[last]))>18||Math.abs(Number(pixels[penultimate+1])-Number(pixels[last+1]))>18||Math.abs(Number(pixels[penultimate+2])-Number(pixels[last+2]))>18;
 let opaque=true,maximum=-1,peak=9;
 for(let i=0;i<25;i++){
  const pos=at+(i-12)*step,t=(i-12+11.5)/23;
  const r=Number(pixels[pos])-lr-(rr-lr)*t,g=Number(pixels[pos+1])-lg-(rg-lg)*t,b=Number(pixels[pos+2])-lb-(rb-lb)*t;
  delta[i*3]=r;delta[i*3+1]=g;delta[i*3+2]=b;
  if(Number(pixels[pos+3])<240)opaque=false;
  if(i>=9&&i<=15){const size=r*r+g*g+b*b;if(size>maximum){maximum=size;peak=i;}}
 }
 const vr=Number(delta[peak*3]),vg=Number(delta[peak*3+1]),vb=Number(delta[peak*3+2]),squared=vr*vr+vg*vg+vb*vb;
 let mixed=false,blank=true,on=false,runs=0,mass=0,moment=0;
 let rMass=0,gMass=0,bMass=0,rMoment=0,gMoment=0,bMoment=0;
 for(let i=0;i<25;i++){
  const r=Number(delta[i*3]),g=Number(delta[i*3+1]),b=Number(delta[i*3+2]),active=Math.max(Math.abs(r),Math.abs(g),Math.abs(b))>18;
  const projection=squared?(r*vr+g*vg+b*vb)/squared:0,positive=Math.max(0,projection),offset=i-12;
  if(active&&(Math.abs(r-projection*vr)>18||Math.abs(g-projection*vg)>18||Math.abs(b-projection*vb)>18))mixed=true;
  if(active&&(i<2||i>22))blank=false;
  const ink=projection>.1;if(ink&&!on)runs++;on=ink;
  mass+=positive;moment+=offset*positive;
  if(Math.abs(vr)>=42){const w=Math.max(0,r/vr);rMass+=w;rMoment+=offset*w;}
  if(Math.abs(vg)>=42){const w=Math.max(0,g/vg);gMass+=w;gMoment+=offset*w;}
  if(Math.abs(vb)>=42){const w=Math.max(0,b/vb);bMass+=w;bMoment+=offset*w;}
 }
 const flags=[];
 if(!opaque)flags.push('nonopaque');if(flank)flags.push('flank-disagreement');
 if(Math.max(Math.abs(vr),Math.abs(vg),Math.abs(vb))<42||squared<=0)flags.push('low-contrast');
 if(mixed)flags.push('mixed-transverse-paint');if(!blank)flags.push('no-blank-flank');
 if(runs!==1)flags.push('multiple-or-missing-runs');
 let low=Infinity,high=-Infinity;
 for(const [total,value]of [[rMass,rMoment],[gMass,gMoment],[bMass,bMoment]])if(Number(total)>0){const center=Number(value)/Number(total);low=Math.min(low,center);high=Math.max(high,center);}
 if(high-low>.25)flags.push('channel-center-disagreement');
 return {flags,centroid:mass?moment/mass:null};
}
/** Source-only observations, never paint, source ownership or erasure proof.
 * The measurement registry supplies immutable measured paths and its PRIVATE
 * original source view. No caller-provided pixels or serialized fit is used.
 * Every native-polyline sample remains classified; only a single opaque paint
 * over locally linear flanks supplies a first-moment target. Full source ink
 * and topology still require separate checks after any proposed curve fit.
 * @param {import('./source-shared-route-measurement').SharedRouteFit} fit
 * @param {{pixels:Uint8Array,width:number,height:number}} source
 * @param {import('./source-shared-route-output-snapshot').Work} work */
function sourceRouteTransverseTargets(fit,source,work){
 if(!sharedOutputWork(work))throw new TypeError('Source transverse work is invalid');
 /** Charge the shared ledger before each bounded allocation or traversal.
  * @param {number} count */const charge=count=>{if(!chargeSharedOutput(work,count))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 charge(fit.edges.length*8);
 /** @type {Float64Array|null} */let delta=null;
 /** @type {Map<string,Sample[]>[]} */const lines=[new Map(),new Map()];
 for(const [ordinal,edge]of fit.edges.entries()){
  charge(edge.path.length*12);
  for(const [index,p]of edge.path.entries()){
   const row={ordinal,index,x:p.x+fit.window.x,y:p.y+fit.window.y};
   for(const axis of [0,1]){const line=/** @type {Map<string,Sample[]>} */(lines[axis]),fixed=axis===0?row.y:row.x,moving=axis===0?row.x:row.y,key=fixed+':'+Math.floor(moving/16),items=line.get(key)??[];
    items.push(row);line.set(key,items);}
  }
 }
 return fit.edges.map((edge,ordinal)=>{
  /** @type {Section[]} */const sections=[];
  /** @type {{index:number,dx:number,dy:number}[]} */const targets=[];
  if(edge.nativePolyline!==true)return {ordinal,samples:edge.path.length,eligible:false,sections,targets};
  charge(edge.path.length*12);
  for(const [index,p]of edge.path.entries()){
   if(index<12||index>=edge.path.length-12){sections.push({index,normal:null,flags:['endpoint-or-contact'],normalOffset:null});continue;}
   charge(24);
   const a=/** @type {Point} */(edge.path[Math.max(0,index-4)]),b=/** @type {Point} */(edge.path[Math.min(edge.path.length-1,index+4)]),dx=b.x-a.x,dy=b.y-a.y,norm=Math.hypot(dx,dy);
   if(norm===0)throw new TypeError('Source transverse tangent is invalid');
   const axis=Math.abs(dy)>=Math.abs(dx)?0:1,normal={x:-dy/norm,y:dx/norm},x=p.x+fit.window.x,y=p.y+fit.window.y;
   const fixed=axis===0?y:x,moving=axis===0?x:y,line=/** @type {Map<string,Sample[]>} */(lines[axis]);let near=false;
   for(let off=-1;off<=1;off++){
    for(let bin=Math.floor((moving-12)/16);bin<=Math.floor((moving+12)/16);bin++){
     const candidates=line.get((fixed+off)+':'+bin)??[];charge(candidates.length+1);
     for(const q of candidates)if(!(q.ordinal===ordinal&&Math.abs(q.index-index)<=8)&&Math.abs((axis===0?q.x:q.y)-moving)<=12){near=true;break;}
     if(near)break;
    }
    if(near)break;
   }
   if(near){sections.push({index,normal,flags:['near-other-path-parts'],normalOffset:null});continue;}
   if(x-(axis===0?12:0)<0||x+(axis===0?12:0)>=source.width||y-(axis===1?12:0)<0||y+(axis===1?12:0)>=source.height){
    sections.push({index,normal,flags:['section-out-of-bounds'],normalOffset:null});continue;
   }
   if(delta===null){charge(75);delta=new Float64Array(75);}
   const {flags,centroid}=transverseMoment(source,x,y,axis,delta,charge);
   const normalOffset=centroid===null?null:centroid*(axis===0?normal.x:normal.y);
   sections.push({index,normal,flags,normalOffset});
   if(!flags.length&&normalOffset!==null)targets.push({index,dx:normal.x*normalOffset,dy:normal.y*normalOffset});
  }
  return {ordinal,samples:edge.path.length,eligible:true,sections,targets};
 });
}
module.exports={sourceRouteTransverseTargets};
