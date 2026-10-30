// @ts-check
'use strict';
const {parseBandBackground}=require('../scene-plan/source-scene-band-geometry');
const {record,box:validBox,list}=require('../scene-plan/source-scene-group-containment');
const {readSceneFillRaster,sceneFillRasterReadCost}=require('../scene-plan/source-scene-fill-raster-cache');
const {hasMeasuredScenePortFrame,measuredScenePortBodyMask}=require('../scene-plan/source-scene-port-evidence');
/** @typedef {import('../scene-plan/source-scene-plan').Box} Box */
/** @typedef {{x:number,y:number}} Point */
/** Observe ALL disconnected ink components in an explicit source shaft window.
 * This does not close gaps, grant relation identity or mint any port/paint token.
 * Only private measured node bodies may exclude their source ink; text/other
 * nodes remain explicit exclusions. The caller must prove an entire unique
 * chain before using these observations as a segmented editable relation.
 * @param {unknown} input */
function observeSegmentedSourceRoute(input){
 if(!record(input)||!record(input.from)||!record(input.to)||!validBox(input.from.box)||!validBox(input.to.box)
  ||!list(input.otherNodes)||input.otherNodes.length>88||!input.otherNodes.every(validBox))throw new TypeError('Segmented route controls are invalid');
 const parsed=parseBandBackground({image:input.image,hint:input.shaftBox,budget:input.budget,textMasks:input.textMasks,owners:[]});
 if(!record(input.image)||!Buffer.isBuffer(input.image.rgba))throw new TypeError('Segmented route source is invalid');
 const image={...parsed.image,rgba:input.image.rgba},{hint,budget,textMasks}=parsed;
 if(!hasMeasuredScenePortFrame(image,input.from.portFrame,input.from.box)||!hasMeasuredScenePortFrame(image,input.to.portFrame,input.to.box))return {failure:'segmented-private-ports'};
 if(input.otherNodes.some(b=>b.x+b.w>image.width||b.y+b.h>image.height))throw new TypeError('Segmented route frame is invalid');
 const x=Math.max(0,Math.floor(hint.x)-2),y=Math.max(0,Math.floor(hint.y)-2),
  window={x,y,w:Math.min(image.width,Math.ceil(hint.x+hint.w)+2)-x,h:Math.min(image.height,Math.ceil(hint.y+hint.h)+2)-y};
 if(window.w*window.h>262144||budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return {failure:'segmented-source-budget'};
 const raster=readSceneFillRaster(image,window,budget),area=window.w*window.h,blocked=new Uint8Array(area),unknown=new Uint8Array(area),work={checks:0};
 for(const n of [input.from,input.to]){
  const mask=measuredScenePortBodyMask(image,n.portFrame,/** @type {Box} */(n.box),window,work);if(!mask)return {failure:'segmented-geometry-budget'};
  for(let i=0;i<area;i++){if(++work.checks>4000000)return {failure:'segmented-geometry-budget'};blocked[i]=(blocked[i]??0)|(mask[i]??0);}
 }
 for(const b of [...textMasks,...input.otherNodes]){
  const left=Math.max(0,Math.ceil(b.x-x-.5)),right=Math.min(window.w,Math.ceil(b.x+b.w-x-.5)),
   top=Math.max(0,Math.ceil(b.y-y-.5)),bottom=Math.min(window.h,Math.ceil(b.y+b.h-y-.5));
  if(left>=right||top>=bottom)continue;work.checks+=(right-left)*(bottom-top);if(work.checks>4000000)return {failure:'segmented-geometry-budget'};
  for(let row=top;row<bottom;row++){blocked.fill(1,row*window.w+left,row*window.w+right);unknown.fill(1,row*window.w+left,row*window.w+right);}
 }
 /** @type {number[][]} */const edge=[];
 for(let i=0;i<area;i++)if(!blocked[i]&&(i<window.w||i>=area-window.w||i%window.w===0||i%window.w===window.w-1)){
  if((raster.rgba[i*4+3]??0)<240)return {failure:'segmented-source-alpha'};
  edge.push([raster.rgba[i*4]??0,raster.rgba[i*4+1]??0,raster.rgba[i*4+2]??0]);
 }
 if(edge.length<8)return {failure:'segmented-background'};
 const background=[0,1,2].map(c=>edge.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(edge.length/2)]??0),mask=new Uint8Array(area);
 for(let i=0;i<area;i++)if(!blocked[i]){
  if((raster.rgba[i*4+3]??0)<240)return {failure:'segmented-source-alpha'};
  mask[i]=background.some((v,c)=>Math.abs(v-(raster.rgba[i*4+c]??0))>=42)?1:0;
 }
 const seen=new Uint8Array(area);
 /** @type {{cells:Point[],box:Box,boundary:boolean}[]} */const components=[];let noisePixels=0;
 for(let seed=0;seed<area;seed++)if(mask[seed]&&!seen[seed]){
  const queue=[seed];seen[seed]=1;let boundary=false;
  for(let k=0;k<queue.length;k++){
   const n=queue[k];if(n===undefined)throw new TypeError('Segmented route traversal is invalid');const xx=n%window.w,yy=Math.floor(n/window.w);
   boundary ||=xx===0||yy===0||xx===window.w-1||yy===window.h-1;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(++work.checks>4000000)return {failure:'segmented-geometry-budget'};
    const px=xx+dx,py=yy+dy,index=py*window.w+px;
    if(px>=0&&py>=0&&px<window.w&&py<window.h&&unknown[index])boundary=true;
    if(px>=0&&py>=0&&px<window.w&&py<window.h&&mask[index]&&!seen[index]){seen[index]=1;queue.push(index);}
   }
  }
  if(queue.length<4){noisePixels+=queue.length;continue;}
  if(components.length>=32)return {failure:'segmented-parts-budget'};
  const cells=queue.map(i=>({x:i%window.w+x,y:Math.floor(i/window.w)+y}));let left=Infinity,top=Infinity,right=0,bottom=0;
  for(const p of cells){left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}
  components.push({cells,box:{x:left,y:top,w:right-left+1,h:bottom-top+1},boundary});
 }
 return {failure:/** @type {null} */(null),components,noisePixels,window,background,workChecks:work.checks,authorityGranted:false};
}
module.exports={observeSegmentedSourceRoute};
