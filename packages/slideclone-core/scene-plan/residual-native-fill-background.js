// @ts-check
"use strict";
const {pointInMask}=require("./raster-native-detection");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{mask:import('./raster-native-detection').Mask,bounds:Box,fill:readonly number[]|undefined}} Owner */
/** @typedef {{bounds:Box,ink:{color:readonly number[]},owned:Uint8Array,background:Uint8Array,scannedPixels:number,overlaps:Owner[]}} Plan */
/** @typedef {{fill:readonly number[],members:Uint8Array,witnessed:boolean}} Paint */
/** Native paint corroborates a replacement background, never glyph identity.
 * The admitted source plans retain every core, rejected component and owned
 * cell. Witnesses must be opaque stable 3x3 patches inside the paint footprint,
 * disjoint from every owned glyph. A claim without source witnesses does nothing.
 * Inputs are internal outputs of residualTextPlans, whose public boundary has
 * already admitted the source, geometry, masks and fills.
 * @param {Raster} source @param {Plan[]} plans @param {number} remainingPixels */
function restoreResidualNativeFillBackground(source,plans,remainingPixels){
 const glyphs=new Uint8Array(source.width*source.height);
 for(const plan of plans)for(let i=0;i<plan.owned.length;i++)if(plan.owned[i])
  glyphs[(plan.bounds.y+Math.floor(i/plan.bounds.w))*source.width+plan.bounds.x+i%plan.bounds.w]=1;
 let samples=0,restoredPixels=0;
 for(const plan of plans){
  const before=samples,{bounds}=plan,area=bounds.w*bounds.h;
  /** @type {Map<string,Paint>} */const paints=new Map();
  for(const owner of plan.overlaps){
   const fill=owner.fill;
   if(!fill||Math.max(...fill.map((v,c)=>Math.abs(v-(plan.ink.color[c]??0))))<64)continue;
   const key=fill.join(',');let paint=paints.get(key);
   if(!paint){paint={fill,members:new Uint8Array(area),witnessed:false};paints.set(key,paint);}
   if(paints.size>8)break;
   const left=Math.max(bounds.x,owner.bounds.x),right=Math.min(bounds.x+bounds.w,owner.bounds.x+owner.bounds.w);
   const top=Math.max(bounds.y,owner.bounds.y),bottom=Math.min(bounds.y+bounds.h,owner.bounds.y+owner.bounds.h);
   for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(pointInMask(x,y,owner.mask))
    paint.members[(y-bounds.y)*bounds.w+x-bounds.x]=1;
  }
  if(paints.size>8)continue;
  for(const paint of paints.values()){
   let witnesses=0;
   for(let i=0;i<area&&witnesses<4;i++){
    const px=i%bounds.w,py=Math.floor(i/bounds.w),x=bounds.x+px,y=bounds.y+py;
    if(!paint.members[i]||px===0||py===0||px===bounds.w-1||py===bounds.h-1)continue;
    // Reserve the complete patch before reading it; optional paint cannot
    // exceed or hide the original shared page scan allowance.
    if(samples+9>remainingPixels)break;
    let stable=true;
    for(let dy=-1;dy<=1&&stable;dy++)for(let dx=-1;dx<=1;dx++){
     const local=i+dy*bounds.w+dx,pixel=(y+dy)*source.width+x+dx;
     if(!paint.members[local]||glyphs[pixel]){stable=false;break;}
     const offset=pixel*4;samples++;
     if((source.rgba[offset+3]??0)<240||paint.fill.some((v,c)=>Math.abs(v-(source.rgba[offset+c]??0))>16)){
      stable=false;break;
     }
    }
    if(stable)witnesses++;
   }
   paint.witnessed=witnesses===4;
  }
  const witnessed=[...paints.values()].filter(p=>p.witnessed);
  for(let i=0;i<area;i++){
   if(!plan.owned[i])continue;
   // Different overlapping paints require a layer proof. Do not guess order
   // from color, the caller's array order or an OCR rectangle.
   const choices=witnessed.filter(p=>p.members[i]);
   if(choices.length!==1)continue;
   const fill=choices[0]?.fill;if(!fill)continue;
   if(fill.some((v,c)=>v!==plan.background[i*3+c])){
    plan.background.set(fill,i*3);restoredPixels++;
   }
  }
  plan.scannedPixels+=samples-before;
 }
 return {samples,restoredPixels};
}
module.exports={restoreResidualNativeFillBackground};
