// @ts-check
"use strict";
const {readSceneFillRaster}=require('./source-scene-fill-raster-cache');
const {makeEdgeConnectedBackgroundTransparent}=require('./edge-background-alpha');
const {residualInkFringe}=require('./residual-ink-components');
const {sceneIconSearchWindow}=require('./source-scene-icon-window');
/** @typedef {import('./source-scene-plan').Box} Box */
/** Human review supplies identity only. This independent source scan must
 * still find complete components, their complete alpha fringe, a real blank
 * corridor and a nonempty caption in the unchanged full observation window.
 * It grants no erasure, source crop, geometry or native representation rights.
 * @param {import('../png').PngImage} image @param {Box} seed @param {Box} window
 * @param {Box} text @param {Box} textStart @param {number} expectedComponents
 * @param {{used:number}} budget @returns {Set<number>|null} */
function measureLeadingSceneIconFootprint(image,seed,window,text,textStart,expectedComponents,budget){
 const raster=readSceneFillRaster(image,window,budget);
 const transparent=makeEdgeConnectedBackgroundTransparent({...raster,rgba:Buffer.from(raster.rgba)});
 const search=sceneIconSearchWindow(image,seed,undefined),original=readSceneFillRaster(image,search,budget);
 const originalInk=makeEdgeConnectedBackgroundTransparent({...original,rgba:Buffer.from(original.rgba)});
 const {w,h}=window,area=w*h,candidates=new Uint8Array(area),solid=new Uint8Array(area),seen=new Uint8Array(area),owned=new Uint8Array(area),bodyStart=new Uint8Array(area),queue=new Int32Array(area);
 for(let i=0;i<area;i++){const a=transparent.rgba[i*4+3]??0;candidates[i]=a>=32?1:0;solid[i]=a>=64?1:0;}
 // Background estimation is local. Preserve the UNION of both unchanged
 // source observations so no alpha32 fringe from the original icon search
 // can disappear when the wider caption context has a slightly different
 // border color. The complete union still has to satisfy every proof below.
 for(let y=0;y<search.h;y++)for(let x=0;x<search.w;x++){
  const i=(search.y+y-window.y)*w+search.x+x-window.x,a=originalInk.rgba[(y*search.w+x)*4+3]??0;
  if(a>=32)candidates[i]=1;if(a>=64)solid[i]=1;
 }
 let components=0,startComponents=0;
 for(let i=0;i<area;i++){
  if(!solid[i]||seen[i])continue;
  let head=0,tail=1,seeded=false,boundary=false,starts=false,outsideStart=false;queue[0]=i;seen[i]=1;
  while(head<tail){
   const j=queue[head++]??0,x=j%w,y=Math.floor(j/w),sx=window.x+x,sy=window.y+y;
   seeded ||= sx>=seed.x&&sx<seed.x+seed.w&&sy>=seed.y&&sy<seed.y+seed.h;
   const inStart=sx>=textStart.x&&sx<textStart.x+textStart.w&&sy>=textStart.y&&sy<textStart.y+textStart.h;
   starts ||= inStart;outsideStart ||= !inStart;
   boundary ||= x===0||y===0||x===w-1||y===h-1;
   for(const n of [x?j-1:-1,x<w-1?j+1:-1,y?j-w:-1,y<h-1?j+w:-1]){
    if(n<0||!solid[n]||seen[n])continue;seen[n]=1;queue[tail++]=n;
   }
  }
  if(starts){
   if(seeded||boundary||outsideStart)return null;
   startComponents++;for(let k=0;k<tail;k++)bodyStart[queue[k]??0]=1;
  }
  if(!seeded)continue;
  if(boundary)return null;
  components++;for(let k=0;k<tail;k++)owned[queue[k]??0]=1;
 }
 if(components!==expectedComponents||startComponents!==1)return null;
 const fringe=residualInkFringe(candidates,solid,w,owned),startFringe=residualInkFringe(candidates,solid,w,bodyStart),cells=new Set(),columns=new Uint8Array(w);
 let right=-1;
 for(let i=0;i<area;i++){
  if(!candidates[i])continue;
  const x=i%w,y=Math.floor(i/w);columns[x]=1;
  if(startFringe[i]===1&&(window.x+x<textStart.x||window.x+x>=textStart.x+textStart.w||window.y+y<textStart.y||window.y+y>=textStart.y+textStart.h))return null;
  if(fringe[i]!==1)continue;
  if(x===0||y===0||x===w-1||y===h-1)return null;
  if(window.x+x>=textStart.x)return null;
  cells.add((window.y+y)*image.width+window.x+x);right=Math.max(right,x);
 }
 // A leading pictorial unit cannot include or be connected to the body.
 // Require two fully observed blank columns before any remaining caption ink.
 let bodyLeft=w,body=false;
 for(let i=0;i<area;i++)if(candidates[i]&&fringe[i]!==1){
  const x=i%w,y=Math.floor(i/w),sx=window.x+x,sy=window.y+y;
  if(sx>=Math.floor(text.x)&&sx<Math.ceil(text.x+text.w)&&sy>=Math.floor(text.y)&&sy<Math.ceil(text.y+text.h)){
   if(x<=right)return null;body=true;bodyLeft=Math.min(bodyLeft,x);
  }
 }
 if(!body||bodyLeft-right<3)return null;
 let blank=false;
 for(let x=right+1;x+1<bodyLeft;x++)if(!columns[x]&&!columns[x+1])blank=true;
 return blank?cells:null;
}
module.exports={measureLeadingSceneIconFootprint};
