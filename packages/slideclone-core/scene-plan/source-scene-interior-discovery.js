// @ts-check
'use strict';
const {parseBandBackground}=require('./source-scene-band-geometry');
const {record}=require('./source-scene-group-containment');
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {sceneIconSearchWindow}=require('./source-scene-icon-window');
const {matteSceneParametricBackdrop,sceneIconBackdropBound}=require('./source-scene-parametric-surface');
const {makeEdgeConnectedBackgroundTransparent}=require('./edge-background-alpha');
const {sceneIconTextFootprint}=require('./source-scene-glyph-occlusion');
/** Discover geometry from complete foreground components inside one parent.
 * This grants no drawing, erasure, membership or source-isolation authority.
 * The original icon consumer must still recheck the unmodified source crop.
 * Use the dense pictorial core's 42/235 color distinction and line-art's
 * 12-cell minimum; a one-pixel fringe cannot name a missing illustration.
 * @param {unknown} input */
function discoverSceneInteriorForeground(input){
 if(!record(input))throw new TypeError('Scene interior discovery controls are invalid');
 const {image,hint,textMasks,budget}=parseBandBackground({image:input.image,hint:input.box,textMasks:input.textMasks,budget:input.budget,owners:[]});
 const window=sceneIconSearchWindow(image,hint,hint);
 if(!sceneIconBackdropBound(input.backdrop,image,budget)||budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return null;
 const raster=readSceneFillRaster(image,window,budget),crop={...raster,rgba:Buffer.from(raster.rgba)};
 const foreground=makeEdgeConnectedBackgroundTransparent(matteSceneParametricBackdrop(input.backdrop,image,budget,window,crop));
 const area=window.w*window.h,seen=new Uint8Array(area),queue=new Int32Array(area);
 /** @type {Map<number,((x:number,y:number)=>boolean)|null>} */const glyphs=new Map();
 let left=window.w,top=window.h,right=-1,bottom=-1,components=0;
 for(let i=0;i<area;i++){
  if(seen[i]||(foreground.rgba[i*4+3]??0)<64)continue;
  let head=0,tail=1,boundary=false,chromatic=0,owned=false,minX=window.w,minY=window.h,maxX=0,maxY=0;
  queue[0]=i;seen[i]=1;
  while(head<tail){
   const n=queue[head++];if(n===undefined)throw new TypeError('Scene interior discovery traversal is invalid');
   const x=n%window.w,y=Math.floor(n/window.w),sx=window.x+x,sy=window.y+y;
   const rgb=[0,1,2].map(k=>foreground.rgba[n*4+k]??0);
   if(Math.max(...rgb)-Math.min(...rgb)>=42&&(rgb[0]??0)*.2126+(rgb[1]??0)*.7152+(rgb[2]??0)*.0722<=235)chromatic++;
   boundary ||= x===0||y===0||x===window.w-1||y===window.h-1;
   minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   for(let index=0;index<textMasks.length;index++){
    const t=textMasks[index];if(!t||sx<t.x||sy<t.y||sx>=t.x+t.w||sy>=t.y+t.h)continue;
    if(!glyphs.has(index))glyphs.set(index,sceneIconTextFootprint(input.glyphOcclusion,image,budget,t));
    const proof=glyphs.get(index);if(!proof||proof(sx,sy))owned=true;
   }
   for(const next of [x?n-1:-1,x<window.w-1?n+1:-1,y?n-window.w:-1,y<window.h-1?n+window.w:-1]){
    if(next<0||seen[next]||(foreground.rgba[next*4+3]??0)<64)continue;seen[next]=1;queue[tail++]=next;
   }
  }
  // Discard whole collided components. Cutting glyph cells away would falsely
  // authorize their remainder as a picture, or hide a clipped parent stroke.
  if(boundary||owned||chromatic<12)continue;
  left=Math.min(left,minX);top=Math.min(top,minY);right=Math.max(right,maxX);bottom=Math.max(bottom,maxY);components++;
 }
 return right<left?null:{seed:{x:window.x+left,y:window.y+top,w:right-left+1,h:bottom-top+1},components};
}
module.exports={discoverSceneInteriorForeground};
