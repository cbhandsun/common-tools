// @ts-check
'use strict';
const {createHash}=require('node:crypto');
const {sourceRaster}=require('../typography/residual-text-mask');
const {record,list}=require('./source-scene-group-containment');
const {residualConnectorPath}=require('./residual-connector-path');
const {routeBackdropDifference:difference,routeBackdropMixture,selectRouteBackdropField}=require('./source-route-backdrop-field');
/** @typedef {{cell:number,before:number[],color:number[],samples:number[]}} Pixel */
/** Prepare an UNAPPROVED preview from the actual native path, independently
 * of the legacy straight-chord eraser. Opposite two-pixel flanks nominate an
 * interpolated background; source paint must match the native stroke palette.
 * Even matching flanks are approximation, never ownership or application
 * authority. Existing changed pixels, transparent targets and ambiguous
 * flanks remain untouched. No output is consumed by production erasure.
 * @param {unknown} input */
function proposeSourceRouteBackdrop(input){
 if(!record(input)||!record(input.slideSize)||!record(input.shape)||!record(input.shape.style))throw new TypeError('Route backdrop proposal input is invalid');
 const image=sourceRaster(input.image),residual=sourceRaster(input.residual),size=input.slideSize,style=input.shape.style;
 if(image.width!==residual.width||image.height!==residual.height)throw new TypeError('Route backdrop proposal frames differ');
 if(typeof size.w!=='number'||typeof size.h!=='number'||![size.w,size.h].every(n=>Number.isFinite(n)&&n>0&&n<=100000)
  ||typeof style.strokeWidthPt!=='number'||!Number.isFinite(style.strokeWidthPt)||style.strokeWidthPt<=0)throw new TypeError('Route backdrop proposal dimensions are invalid');
 const sx=image.width/size.w,sy=image.height/size.h,width=style.strokeWidthPt*Math.max(sx,sy);
 if(width>32)throw new RangeError('Route backdrop proposal width exceeds boundary');
 /** @param {unknown} value */const rgb=value=>{
  if(typeof value!=='string'||!/^#[\da-f]{6}$/iu.test(value))throw new TypeError('Route backdrop proposal paint is invalid');
  return [1,3,5].map(i=>Number.parseInt(value.slice(i,i+2),16));
 };
 const colors=[rgb(style.stroke)];
 if(style.strokeGradient!==undefined){
  const gradient=style.strokeGradient;
  if(!record(gradient)||gradient.type!=='linear'||!list(gradient.stops)||gradient.stops.length<2||gradient.stops.length>16)throw new TypeError('Route backdrop proposal gradient is invalid');
  let previous=-1;
  for(const stop of gradient.stops){
   if(!record(stop)||typeof stop.position!=='number'||!Number.isFinite(stop.position)||stop.position<0||stop.position>1||stop.position<=previous)throw new TypeError('Route backdrop proposal gradient is invalid');
   previous=stop.position;colors.push(rgb(stop.color));
  }
 }
 const points=residualConnectorPath(input.shape,{x:sx,y:sy}),radius=width/2+.75,reach=Math.ceil(radius)+3;
 let checks=0;
 /** @param {number} count */const charge=count=>{checks+=count;if(checks>4000000)throw new RangeError('Route backdrop proposal budget exceeded');};
 /** @type {Map<number,{distance:number,horizontal:boolean,reach:number}>} */const corridor=new Map();
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];if(!a||!b)throw new TypeError('Route backdrop proposal path is invalid');
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;if(!length)continue;
  const left=Math.max(0,Math.floor(Math.min(a.x,b.x)-radius)),right=Math.min(image.width-1,Math.ceil(Math.max(a.x,b.x)+radius));
  const top=Math.max(0,Math.floor(Math.min(a.y,b.y)-radius)),bottom=Math.min(image.height-1,Math.ceil(Math.max(a.y,b.y)+radius));
  charge(Math.max(0,right-left+1)*Math.max(0,bottom-top+1));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length)),distance=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
   if(distance>radius)continue;
   const cell=y*image.width+x,old=corridor.get(cell);
   if(!old||distance<old.distance)corridor.set(cell,{distance,horizontal:Math.abs(dy)>=Math.abs(dx),reach});
  }
 }
 // A nominal Office triangle envelope only nominates source samples. It is
 // explicitly approximation and cannot certify arrow pixels or grant erasure.
 for(const [key,tip,other]of [['startArrow',points[0],points[1]],['endArrow',points.at(-1),points.at(-2)]]){
  const arrow=style[/** @type {string} */(key)];
  if(arrow===undefined||arrow==='none')continue;
  if(arrow!=='triangle')throw new TypeError('Route backdrop proposal arrow is unsupported');
  const prefix=key==='startArrow'?'startArrow':'endArrow';
  /** @param {unknown} value */const factor=value=>{if(value===undefined||value==='medium')return 3;if(value==='small')return 2;if(value==='large')return 5;throw new TypeError('Route backdrop proposal arrow size is invalid');};
  const length=width*factor(style[prefix+'Length']),half=width*factor(style[prefix+'Width'])/2;
  if(!record(tip)||!record(other)||typeof tip.x!=='number'||typeof tip.y!=='number'||typeof other.x!=='number'||typeof other.y!=='number')throw new TypeError('Route backdrop proposal arrow geometry is invalid');
  const dx=tip.x-other.x,dy=tip.y-other.y,norm=Math.hypot(dx,dy);if(!norm)throw new TypeError('Route backdrop proposal arrow geometry is invalid');
  const ux=dx/norm,uy=dy/norm,span=Math.ceil(length+half+1);
  const left=Math.max(0,Math.floor(tip.x-span)),right=Math.min(image.width-1,Math.ceil(tip.x+span));
  const top=Math.max(0,Math.floor(tip.y-span)),bottom=Math.min(image.height-1,Math.ceil(tip.y+span));
  charge(Math.max(0,right-left+1)*Math.max(0,bottom-top+1));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const along=(tip.x-x)*ux+(tip.y-y)*uy,across=Math.abs((x-tip.x)*uy-(y-tip.y)*ux);
   if(along<-.75||along>length+.75||across>half*Math.max(0,along)/length+.75)continue;
   corridor.set(y*image.width+x,{distance:0,horizontal:Math.abs(dy)>=Math.abs(dx),reach:Math.ceil(half)+3});
  }
 }
 /** @param {number} n */const color=n=>[0,1,2].map(c=>image.rgba[n*4+c]??0);
 /** @type {Pixel[]} */const pixels=[];
 const rejected={changedTarget:0,clipped:0,ambiguousFlanks:0,notStroke:0};
 for(const [cell,section]of [...corridor].sort((a,b)=>a[0]-b[0])){
  charge(40+colors.length*8);
  const offset=cell*4;
  if((residual.rgba[offset+3]??0)===0)continue;
  if([0,1,2,3].some(c=>residual.rgba[offset+c]!==image.rgba[offset+c])){rejected.changedTarget++;continue;}
  const x=cell%image.width,y=Math.floor(cell/image.width),horizontal=section.horizontal;
  const axis=horizontal?x:y,maximum=horizontal?image.width:image.height;
  if(axis-section.reach-1<0||axis+section.reach+1>=maximum){rejected.clipped++;continue;}
  const step=horizontal?1:image.width;
  /** @type {{background:number[],samples:number[]}[]} */const fields=[];
  /** @type {number[][]} */const obstructions=[];let blocked=false;
  for(const extra of [0,4,8,12]){
   const distance=section.reach+extra;charge(40);
   if(axis-distance-1<0||axis+distance+1>=maximum)continue;
   const samples=[cell-step*(distance+1),cell-step*distance,cell+step*distance,cell+step*(distance+1)];
   const flanks=samples.map(color),first=flanks[0]??[],second=flanks[1]??[],third=flanks[2]??[],fourth=flanks[3]??[];
   if(samples.some(n=>(image.rgba[n*4+3]??0)!==255)){blocked=true;break;}
   if(difference(first,second)>18||difference(third,fourth)>18||difference(second,third)>18){
    // Defer color interpretation until independently agreeing outer fields
    // exist. Antialias mixtures need that background; every obstructed sample
    // must then be explained, rather than borrowing one recognizable neighbor.
    obstructions.push(...flanks);continue;
   }
   fields.push({background:[0,1,2].map(c=>Math.round(((first[c]??0)+(second[c]??0)+(third[c]??0)+(fourth[c]??0))/4)),samples});
  }
  const field=blocked?null:selectRouteBackdropField(fields,obstructions,colors,charge);
  if(!field){rejected.ambiguousFlanks++;continue;}
  const {background,samples}=field;
  const observed=color(cell);
  if(difference(observed,background)<18){rejected.notStroke++;continue;}
  // Source antialias may be a mixture of stroke and background. Reject ink
  // whose independent channel residual does not fit any nominated paint.
  const matches=routeBackdropMixture(observed,background,colors,charge);
  if(!matches){rejected.notStroke++;continue;}
  if(pixels.length>=10000)throw new RangeError('Route backdrop proposal pixel count exceeds boundary');
  pixels.push({cell,before:[...residual.rgba.subarray(offset,offset+4)],color:background,samples});
 }
 /** @param {Uint8Array} bytes */const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 return {version:1,reviewOnly:true,approximation:true,applicationAuthorized:false,width:image.width,height:image.height,
  sourceRgbaSha256:hash(image.rgba),residualRgbaSha256:hash(residual.rgba),
  drawingSha256:createHash('sha256').update(JSON.stringify({points,width,colors})).digest('hex'),
  pixels,rejected,checks,corridorPixels:corridor.size,limitations:['background-and-nominal-arrow-envelope-are-approximations','unresolved-flanks-and-source-geometry-remain']};
}
module.exports={proposeSourceRouteBackdrop};
