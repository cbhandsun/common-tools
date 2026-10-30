// @ts-check
"use strict";
const {parseBandBackground,insidePolygon,ownerVertices,foregroundOwnsPoint,crossesUnobservedCore,curveTouchesUnobservedCore}=require("./source-scene-band-geometry");
const {sampleAtomInteriorFill}=require("./visual-atom-interior-fill");
const {readSceneFillRaster}=require("./source-scene-fill-raster-cache");
const {traceNativeMaskContours}=require("./native-mask-contours");
/** An oversized parent may have independently measured child bodies. Observe
 * its perimeter band instead of charging an oversized whole-body rectangle.
 * Source paint and source outline can close the same silhouette. Neither a
 * child proposal nor the unknown raster core contributes foreground cells.
 * @param {unknown} input */
function measureLayeredSceneBackground(input){
 const {image,hint,budget,textMasks,owners,frame,core,windows,area}=parseBandBackground(input);
 // This is a large-parent fallback, never an alternate gate for failed small
 // components. All reads retain the existing compiler and per-unit caps.
 if(hint.w*hint.h<=262144||!owners.length||area>262144||budget.used+area+576>4000000)return null;
 const relevant=owners.filter(o=>o.box.w*o.box.h<hint.w*hint.h*.8),ownerPolygons=relevant.map(o=>({box:o.box,vertices:ownerVertices(o)}));
 if(!relevant.length)return null;
 budget.used+=576;
 const sample=sampleAtomInteriorFill(image,{x:hint.x,y:hint.y,w:hint.w,h:Math.max(8,hint.h*.16)},[...textMasks,...relevant.map(o=>o.box)]);
 if(!sample)return null;
 const strips=windows.map(window=>({window,raster:readSceneFillRaster(image,window,budget)}));
 /** @param {number} x @param {number} y */
 const pixel=(x,y)=>{
  const strip=strips.find(s=>x>=s.window.x&&y>=s.window.y&&x<s.window.x+s.window.w&&y<s.window.y+s.window.h);
  if(!strip)throw new TypeError("Scene background read reached an unobserved cell");
  const offset=((y-strip.window.y)*strip.window.w+x-strip.window.x)*4;
  return [strip.raster.rgba[offset]??0,strip.raster.rgba[offset+1]??0,strip.raster.rgba[offset+2]??0,strip.raster.rgba[offset+3]??0];
 };
 const fill=[1,3,5].map(i=>Number.parseInt(sample.color.slice(i,i+2),16));
 const exterior=[[frame.x,frame.y],[frame.x+frame.w-1,frame.y],[frame.x,frame.y+frame.h-1],[frame.x+frame.w-1,frame.y+frame.h-1]]
  .map(([x,y])=>pixel(x??0,y??0));
 /** @param {number[]} a @param {number[]} b */
 const distance=(a,b)=>Math.max(...a.slice(0,3).map((v,c)=>Math.abs(v-(b[c]??0))));
 if(exterior.some(p=>(p[3]??0)<240)||(exterior.map(p=>distance(p,fill)).sort((a,b)=>a-b)[1]??0)<6)return null;
 /** @param {number} x @param {number} y */
 const masked=(x,y)=>textMasks.some(m=>x>=m.x&&y>=m.y&&x<m.x+m.w&&y<m.y+m.h)
  ||ownerPolygons.some(o=>x>=o.box.x&&y>=o.box.y&&x<o.box.x+o.box.w&&y<o.box.y+o.box.h&&foregroundOwnsPoint({x:x+.5,y:y+.5},o.vertices));
 const cells=new Set(),paint=new Set();
 for(const {window}of strips)for(let y=window.y;y<window.y+window.h;y++)for(let x=window.x;x<window.x+window.w;x++){
  if(masked(x,y))continue;const p=pixel(x,y);if((p[3]??0)<240)continue;
  const bodyDistance=distance(p,fill),outsideDistance=Math.min(...exterior.map(e=>distance(p,e)));
  const isPaint=bodyDistance<=18&&outsideDistance>=bodyDistance+6;
  const isOutline=bodyDistance>=18&&outsideDistance>=18;
  if(isPaint||isOutline)cells.add(y*image.width+x);if(isPaint)paint.add(y*image.width+x);
 }
 const fits=[];
 while(cells.size){
  const seed=/** @type {number} */(cells.values().next().value),queue=[seed];cells.delete(seed);
  let minX=image.width,minY=image.height,maxX=0,maxY=0,touches=false;
  for(let at=0;at<queue.length;at++){
   const n=queue[at]??0,x=n%image.width,y=Math.floor(n/image.width);
   minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   touches ||=x===frame.x||y===frame.y||x===frame.x+frame.w-1||y===frame.y+frame.h-1;
   for(const next of[x?n-1:-1,x<image.width-1?n+1:-1,y?n-image.width:-1,y<image.height-1?n+image.width:-1])if(cells.delete(next))queue.push(next);
  }
  const box={x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
  if(touches||box.w<hint.w*.7||box.w>hint.w*1.35||box.h<hint.h*.55||box.h>hint.h*1.6)continue;
  const points=queue.map(n=>({x:n%image.width,y:Math.floor(n/image.width)}));
  const segments=traceNativeMaskContours(points,box,{outerOnly:true,curveFallback:true});
  if(!segments||segments.filter(s=>s.type==="moveTo").length!==1)continue;
  const vertices=ownerVertices({box,segments});if(crossesUnobservedCore(vertices,core)||curveTouchesUnobservedCore({box,segments},core))continue;
  // Keep .58 on the actually observed visible layer, excluding only admitted
  // foreground bodies and text owners. Ink cannot inflate paint support.
  let exposed=0,supported=0;
  for(const {window}of strips)for(let y=Math.max(box.y,window.y);y<Math.min(box.y+box.h,window.y+window.h);y++)
   for(let x=Math.max(box.x,window.x);x<Math.min(box.x+box.w,window.x+window.w);x++){
    if(masked(x,y)||!insidePolygon({x:x+.5,y:y+.5},vertices))continue;exposed++;if(paint.has(y*image.width+x))supported++;
   }
  if(!exposed||supported/exposed<.58)continue;
  fits.push({box,fill:sample.color,segments,support:supported/exposed});
 }
 return fits.length===1?fits[0]??null:null;
}
module.exports={measureLayeredSceneBackground};
