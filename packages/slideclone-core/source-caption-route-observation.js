// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
const {sourceRaster}=require('./residual-text-mask');
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {hasMeasuredScenePortFrame,measuredScenePortBodyMask}=require('./source-scene-port-evidence');
const {sceneIconTextFootprint,sceneGlyphOcclusionMatches}=require('./source-scene-glyph-occlusion');
/** Admit the same private node/source boundary as continuous routes. A label
 * rectangle cannot hide ink: only its independently measured glyph footprint
 * may leave this route observation, and the output never erases that text.
 * @param {unknown} input */
function observeCaptionRoute(input){
 const node=(/** @type {unknown} */n)=>record(n)&&typeof n.id==='string'&&/^[A-Za-z0-9_.:-]{1,256}$/u.test(n.id)&&box(n.box);
 if(!record(input)||!record(input.image)||!Buffer.isBuffer(input.image.rgba)||!node(input.from)||!node(input.to)
  ||!record(input.from)||!record(input.to)||input.from.id===input.to.id||!box(input.shaftBox)||!record(input.budget)
  ||!Number.isSafeInteger(input.budget.used)||Number(input.budget.used)<0||Number(input.budget.used)>4000000
  ||typeof input.direction!=='string'||!['forward','backward','both','undirected'].includes(input.direction))throw new TypeError('Caption route controls are invalid');
 const raw=sourceRaster(input.image),image={...raw,rgba:input.image.rgba},budget=/** @type {{used:number}} */(input.budget);
 const from=/** @type {{id:string,box:import('./source-scene-plan').Box,portFrame?:unknown}} */(input.from),to=/** @type {typeof from} */(input.to);
 const texts=input.textMasks,others=input.otherNodes??[];
 if(!list(texts)||texts.length>10000||!texts.every(box)||!list(others)||others.length>88||!others.every(box)
  ||[from.box,to.box,input.shaftBox,...texts,...others].some(b=>b.x+b.w>image.width||b.y+b.h>image.height))throw new TypeError('Caption route frame is invalid');
 if(!hasMeasuredScenePortFrame(image,from.portFrame,from.box)||!hasMeasuredScenePortFrame(image,to.portFrame,to.box)
  ||!sceneGlyphOcclusionMatches(input.glyphOcclusion,image,budget))return null;
 const b=input.shaftBox,x=Math.max(0,Math.floor(b.x)-2),y=Math.max(0,Math.floor(b.y)-2);
 const window={x,y,w:Math.min(image.width,Math.ceil(b.x+b.w)+2)-x,h:Math.min(image.height,Math.ceil(b.y+b.h)+2)-y},area=window.w*window.h;
 if(area>262144||budget.used+sceneFillRasterReadCost(image,window,budget)>4000000)return null;
 const raster=readSceneFillRaster(image,window,budget),work={checks:0},blocked=new Uint8Array(area);
 for(const n of [from,to]){
  const mask=measuredScenePortBodyMask(image,n.portFrame,n.box,window,work);if(!mask)return null;
  for(let i=0;i<area;i++){if(++work.checks>4000000)return null;blocked[i]=(blocked[i]??0)|(mask[i]??0);}
 }
 /** @type {number[][]} */const perimeter=[];
 for(let i=0;i<area;i++)if(!blocked[i]&&(i<window.w||i>=area-window.w||i%window.w===0||i%window.w===window.w-1)){
  if((raster.rgba[i*4+3]??0)<240)return null;perimeter.push([0,1,2].map(c=>raster.rgba[i*4+c]??0));
 }
 if(perimeter.length<8)return null;
 const background=[0,1,2].map(c=>perimeter.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(perimeter.length/2)]??0),mask=new Uint8Array(area);
 for(let i=0;i<area;i++)if(!blocked[i]){
  if((raster.rgba[i*4+3]??0)<240)return null;
  mask[i]=background.some((v,c)=>Math.abs(v-(raster.rgba[i*4+c]??0))>=42)?1:0;
 }
 const captions=[];
 for(const text of texts){
  const indices=[];
  for(let row=Math.max(window.y,Math.floor(text.y));row<Math.min(window.y+window.h,Math.ceil(text.y+text.h));row++)
   for(let col=Math.max(window.x,Math.floor(text.x));col<Math.min(window.x+window.w,Math.ceil(text.x+text.w));col++){
    if(++work.checks>4000000)return null;const i=(row-window.y)*window.w+col-window.x;if(mask[i])indices.push(i);
   }
  if(!indices.length)continue;
  const owned=sceneIconTextFootprint(input.glyphOcclusion,image,budget,text);if(!owned)return null;
  let removed=0;
  for(const i of indices){if(++work.checks>4000000)return null;
   if(owned(window.x+i%window.w,window.y+Math.floor(i/window.w))){mask[i]=0;removed++;}}
  // Overlapping source ink is retained and must pass complete route coverage.
  // A text rectangle never grants authority over unowned cells.
  if(removed)captions.push({...text});
 }
 const caption=captions[0];if(captions.length!==1||!caption)return null;
 // Other native nodes may not disappear into a masked caption corridor.
 // Keep them in the observation; final fragment/gap proofs reject any overlap.
 return {image,from,to,direction:input.direction,budget,window,raster,mask,work,caption,others,texts};
}
module.exports={observeCaptionRoute};
