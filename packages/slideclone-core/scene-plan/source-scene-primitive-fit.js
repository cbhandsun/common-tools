// @ts-check
"use strict";
const {parsePrimitiveCandidate,constructPrimitiveCandidate}=require('./source-scene-primitive-candidate');
const {parseBandBackground,insidePolygon}=require('./source-scene-band-geometry');
const {record,list,box:validBox}=require('./source-scene-group-containment');
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
/** @typedef {import('./source-scene-primitive-candidate').Recipe} Recipe */
/** @typedef {{x:number,y:number,color:number[]}} Sample */
/** @param {string} color */
const rgb=color=>[1,3,5].map(i=>Number.parseInt(color.slice(i,i+2),16));
/** @param {number[]} color */
const hex=color=>'#'+color.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
/** @param {number[]} values */
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
/** @param {number} x @param {number} y @param {number} cx @param {number} cy @param {number} rx @param {number} ry */
function ellipseDistance(x,y,cx,cy,rx,ry){
 const nx=(x-cx)/rx,ny=(y-cy)/ry,r=Math.hypot(nx,ny);
 return (r-1)*Math.min(rx,ry);
}
/** @param {Recipe} r @param {number} x @param {number} y */
function surfaceDistance(r,x,y){
 const b=r.box,cx=b.x+b.w/2,cy=b.y+b.h/2;
 if(r.kind==='ellipse')return ellipseDistance(x,y,cx,cy,b.w/2,b.h/2);
 if(r.kind==='quad'){
  const ps=(r.corners??[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]).map(p=>({x:b.x+p.x*b.w,y:b.y+p.y*b.h}));
  let d=Infinity;
  for(let i=0;i<4;i++){const a=ps[i],z=ps[(i+1)%4],dx=z.x-a.x,dy=z.y-a.y;
   const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
   d=Math.min(d,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));}
  return insidePolygon({x,y},ps)?-d:d;
 }
 if(r.kind==='cylinder'){
  const cap=b.h*r.capRatio,top=b.y+cap/2,bottom=b.y+b.h-cap/2;
  if(y>bottom)return Math.max(Math.abs(x-cx)-b.w/2,ellipseDistance(x,y,cx,bottom,b.w/2,cap/2));
  return Math.max(Math.abs(x-cx)-b.w/2,top-y,y-bottom);
 }
 const radius=r.radiusRatio*Math.min(b.w,b.h),qx=Math.abs(x-cx)-b.w/2+radius,qy=Math.abs(y-cy)-b.h/2+radius;
 return Math.hypot(Math.max(0,qx),Math.max(0,qy))+Math.min(0,Math.max(qx,qy))-radius;
}
/** Approximate inverse rendering proposes geometry only. It does not grant
 * source paint, erase, glyph, ports, groups or completion. Actual native
 * rendering and all original private source predicates remain mandatory.
 * @param {Recipe} r @param {Sample} sample @param {number[]} background */
function candidateColor(r,sample,background){
 const {x,y}=sample,b=r.box,d=surfaceDistance(r,x,y),width=r.strokeWidthPx/2;
 let color=d<=0&&r.kind!=='handFrame'?rgb(r.fill):background;
 const paintStroke=(/** @type {number} */distance)=>{
  const dashed=r.dash==='dash'&&((Math.abs(x-b.x)+Math.abs(y-b.y))%Math.max(4,r.strokeWidthPx*6))>Math.max(2,r.strokeWidthPx*3);
  if(!dashed&&Math.abs(distance)<=width)color=rgb(r.stroke);
 };
 paintStroke(d);
 if(r.kind==='cylinder'){
  const cap=b.h*r.capRatio,capD=ellipseDistance(x,y,b.x+b.w/2,b.y+cap/2,b.w/2,cap/2);
  for(const seam of r.seams){const u=(x-b.x-b.w/2)/(b.w/2);
   if(Math.abs(u)<=1&&d<=0)paintStroke(y-b.y-b.h*seam-cap/2*Math.sqrt(1-u*u));}
  if(capD<=0)color=rgb(r.capFill);paintStroke(capD);
 }
 return color;
}
/** @param {Recipe} recipe @param {Sample[]} samples @param {number[]} background */
function score(recipe,samples,background){
 let changed=0,delta=0;
 for(const sample of samples){const color=candidateColor(recipe,sample,background),d=color.map((v,c)=>Math.abs(v-sample.color[c]));
  if(Math.max(...d)>24)changed++;delta+=d.reduce((n,v)=>n+v,0)/3;
 }
 return {changed,delta,loss:changed/samples.length+delta/samples.length/255};
}
/** Construct first, then calibrate a real native recipe against one charged
 * source window. The immutable snapshot serves every trial; repeats never
 * open a new job budget or create glyph/ownership authority. Protected child
 * rectangles affect this proposal objective only, never SOURCE erasure.
 * @param {unknown} input */
function fitScenePrimitiveCandidate(input){
 if(!record(input)||Object.keys(input).some(k=>!['recipe','image','textMasks','protectedChildren','budget','frame'].includes(k)))
  throw new TypeError('Native primitive fit is invalid');
 const initial=parsePrimitiveCandidate(input.recipe);
 if(initial.kind==='pathSurface'||initial.kind==='openPaths')throw new TypeError('Native primitive fit representation is unsupported');
 // Validate the executable recipe and output frame before any source read.
 constructPrimitiveCandidate(initial,input.frame);
 const parsed=parseBandBackground({image:input.image,hint:initial.box,textMasks:input.textMasks,owners:[],budget:input.budget});
 const {image,budget,textMasks}=parsed;
 if(!record(input.frame)||input.frame.widthPx!==image.width||input.frame.heightPx!==image.height)
  throw new TypeError('Native primitive fit source frame is invalid');
 const children=input.protectedChildren??[];
 if(!list(children)||children.length>96||children.some(b=>!validBox(b)||b.x+b.w>image.width||b.y+b.h>image.height))
  throw new TypeError('Native primitive fit child scope is invalid');
 const protectedBoxes=[...textMasks,.../** @type {import('./source-scene-plan').Box[]} */(children)];
 const pad=Math.max(4,Math.min(32,Math.ceil(Math.min(initial.box.w,initial.box.h)*.08)));
 const x=Math.max(0,Math.floor(initial.box.x-pad)),y=Math.max(0,Math.floor(initial.box.y-pad));
 const window={x,y,w:Math.min(image.width,Math.ceil(initial.box.x+initial.box.w+pad))-x,
  h:Math.min(image.height,Math.ceil(initial.box.y+initial.box.h+pad))-y};
 if(window.w*window.h>262144||budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return null;
 const raster=readSceneFillRaster(image,window,budget),step=Math.max(1,Math.ceil(Math.sqrt(window.w*window.h/2048)));
 /** @type {Sample[]} */const samples=[];
 /** @type {number[][]} */const outside=[];
 for(let dy=0;dy<window.h;dy+=step)for(let dx=0;dx<window.w;dx+=step){
  const sx=x+dx+.5,sy=y+dy+.5,at=(dy*raster.width+dx)*4;
  if(raster.rgba[at+3]<240||protectedBoxes.some(b=>sx>=b.x&&sx<b.x+b.w&&sy>=b.y&&sy<b.y+b.h))continue;
  const color=[0,1,2].map(c=>raster.rgba[at+c]);samples.push({x:sx,y:sy,color});
  if(sx<initial.box.x-2||sx>initial.box.x+initial.box.w+2||sy<initial.box.y-2||sy>initial.box.y+initial.box.h+2)outside.push(color);
 }
 if(samples.length<32||outside.length<8)return null;
 const background=[0,1,2].map(c=>median(outside.map(p=>p[c]))),before=score(initial,samples,background);
 let recipe=initial,best=before;
 /** @param {Recipe} candidate */
 const trial=candidate=>{
  if(candidate.box.x<0||candidate.box.y<0||candidate.box.w<=2||candidate.box.h<=2
   ||candidate.box.x+candidate.box.w>image.width||candidate.box.y+candidate.box.h>image.height
   ||Math.abs(candidate.box.x-initial.box.x)>pad||Math.abs(candidate.box.y-initial.box.y)>pad
   ||Math.abs(candidate.box.x+candidate.box.w-initial.box.x-initial.box.w)>pad
   ||Math.abs(candidate.box.y+candidate.box.h-initial.box.y-initial.box.h)>pad)return;
  const result=score(candidate,samples,background);
  if(result.loss+1e-12<best.loss){recipe=candidate;best=result;}
 };
 // Material alternatives are source colors, not fixed image-specific paint.
 /** @type {Map<string,number[][]>} */const palette=new Map();
 for(const s of samples){const key=s.color.map(v=>v>>4).join(':');const bin=palette.get(key)??[];bin.push(s.color);palette.set(key,bin);}
 const colors=[...palette.values()].sort((a,b)=>b.length-a.length).slice(0,6).map(bin=>hex([0,1,2].map(c=>median(bin.map(p=>p[c])))));
 for(const color of colors){trial({...recipe,fill:color});if(recipe.kind==='cylinder')trial({...recipe,capFill:color});}
 for(const amount of [Math.max(2,pad/2),2,1]){
  for(const edge of ['left','right','top','bottom'])for(const sign of [-1,1]){
   const b={...recipe.box},change=amount*sign;
   if(edge==='left'){b.x+=change;b.w-=change;}if(edge==='right')b.w+=change;
   if(edge==='top'){b.y+=change;b.h-=change;}if(edge==='bottom')b.h+=change;
   trial({...recipe,box:b});
  }
  for(const sign of [-1,1])trial({...recipe,strokeWidthPx:Math.max(0,Math.min(16,recipe.strokeWidthPx+sign*amount/2))});
  if(['roundRect','handFrame'].includes(recipe.kind))for(const sign of [-1,1])trial({...recipe,radiusRatio:Math.max(.01,Math.min(.5,recipe.radiusRatio+sign*.04))});
 }
 return {...constructPrimitiveCandidate(recipe,input.frame),recipe,
  calibration:{before,after:best,samples:samples.length,sourceWindow:window,approximateInverseRender:true},
  sourceAuthorized:false,labelsCompleted:false,portsAuthorized:false};
}
module.exports={fitScenePrimitiveCandidate};
