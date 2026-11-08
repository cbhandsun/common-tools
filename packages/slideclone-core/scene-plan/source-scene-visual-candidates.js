// @ts-check
'use strict';
const crypto=require('node:crypto');
const {types}=require('node:util');
const {record,list,box}=require('./source-scene-group-containment');
const {detectColorComponents}=require('./color-component-bounds');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id:string,box:Box,inkPixels:number,touchesFrame:boolean}} Candidate */
/** Cheap ink proposals are locations, never complete objects, classes, masks,
 * ports or erase authority. Keep OCR-like components so OCR mistakes cannot
 * erase the very pictogram being sought. No source-dependent tuning.
 * @param {unknown} value */
function detectSceneVisualCandidates(value){
 if(!record(value)||!record(value.image)||typeof value.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(value.sourceHash))
  throw new TypeError('Scene candidate source is invalid');
 const {width,height,rgba}=value.image;
 if(typeof width!=='number'||typeof height!=='number'||![width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||width*height>4000000||types.isProxy(rgba)||!types.isUint8Array(rgba))
  throw new TypeError('Scene candidate raster is invalid');
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,'buffer',rgba),offset=Reflect.get(proto,'byteOffset',rgba),length=Reflect.get(proto,'length',rgba);
 if(!types.isArrayBuffer(buffer)||length!==width*height*4)throw new TypeError('Scene candidate raster is invalid');
 const pixels=new Uint8Array(buffer,offset,length);
 const components=detectColorComponents({width,height,rgba:pixels},{stride:1,minAreaPx:16,predicate:(r,g,b,a)=>a>=128&&r+g+b<570});
 if(components.length>2048)throw new RangeError('Scene candidate component budget exceeded');
 const parent=components.map((_,i)=>i);
 /** @param {number} i @returns {number} */
 const find=i=>{while(parent[i]!==i){const next=parent[i];if(next===undefined)throw new TypeError('Scene candidate grouping is invalid');i=next;}return i;};
 // Link ORIGINAL components, not growing envelopes: empty space enclosed by
 // a large merged box must not pull in unrelated neighboring strokes.
 for(let i=0;i<components.length;i++)for(let j=i+1;j<components.length;j++){
  const a=components[i],b=components[j];if(!a||!b)throw new TypeError('Scene candidate grouping is invalid');
  // An enclosing outline's empty bounding-box interior is not physical ink.
  if(a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h)continue;
  const dx=Math.max(0,a.x-b.x-b.w,b.x-a.x-a.w),dy=Math.max(0,a.y-b.y-b.h,b.y-a.y-a.h);
  if(Math.hypot(dx,dy)<=4)parent[find(j)]=find(i);
 }
 /** @type {Map<number,{box:Box,inkPixels:number}>} */const groups=new Map();
 for(const [i,c]of components.entries()){
  const key=find(i),previous=groups.get(key),a=previous?.box;
  groups.set(key,{box:a?{x:Math.min(a.x,c.x),y:Math.min(a.y,c.y),w:Math.max(a.x+a.w,c.x+c.w)-Math.min(a.x,c.x),h:Math.max(a.y+a.h,c.y+c.h)-Math.min(a.y,c.y)}
   :{x:c.x,y:c.y,w:c.w,h:c.h},inkPixels:(previous?.inkPixels??0)+c.areaPx});
 }
 const oversized=[...groups.values()].filter(c=>c.box.w*c.box.h>262144);
 const admitted=[...groups.values()].filter(c=>c.box.w*c.box.h<=262144).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
 if(admitted.length>256)throw new RangeError('Scene candidate catalog budget exceeded');
 const sourceHash=value.sourceHash;
 const candidates=admitted.map(c=>({id:'candidate-'+crypto.createHash('sha256').update(JSON.stringify([sourceHash,c.box])).digest('hex').slice(0,24),
  box:{...c.box},inkPixels:c.inkPixels,touchesFrame:c.box.x===0||c.box.y===0||c.box.x+c.box.w===width||c.box.y+c.box.h===height}));
 return {version:1,sourceHash,widthPx:width,heightPx:height,candidates,
  evidence:{method:'dark-ink-components-v1',scannedPixels:width*height,components:components.length,oversizedGroups:oversized.length,proposals:candidates.length,sourceAuthorized:false}};
}
/** Exact catalog admission also supports independent future detectors. A
 * model may classify an ID but cannot replace its source-bound envelope.
 * @param {unknown} value @returns {{sourceHash:string,widthPx:number,heightPx:number,candidates:Candidate[]}} */
function parseSceneCandidateCatalog(value){
 if(!record(value)||typeof value.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(value.sourceHash)
  ||typeof value.widthPx!=='number'||typeof value.heightPx!=='number'||![value.widthPx,value.heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||value.widthPx*value.heightPx>4000000||!list(value.candidates)||value.candidates.length>256)throw new TypeError('Scene candidate catalog is invalid');
 const widthPx=value.widthPx,heightPx=value.heightPx,ids=new Set();
 const candidates=value.candidates.map(c=>{
  if(!record(c)||typeof c.id!=='string'||!/^candidate-[a-f0-9]{24}$/u.test(c.id)||ids.has(c.id)||!box(c.box)
   ||!Object.values(c.box).every(Number.isSafeInteger)||c.box.x+c.box.w>widthPx||c.box.y+c.box.h>heightPx||c.box.w*c.box.h>262144
   ||typeof c.inkPixels!=='number'||!Number.isSafeInteger(c.inkPixels)||c.inkPixels<1||c.inkPixels>c.box.w*c.box.h||typeof c.touchesFrame!=='boolean')
   throw new TypeError('Scene candidate entry is invalid');
  ids.add(c.id);return {id:c.id,box:{...c.box},inkPixels:c.inkPixels,touchesFrame:c.touchesFrame};
 });
 return {sourceHash:value.sourceHash,widthPx,heightPx,candidates};
}
module.exports={detectSceneVisualCandidates,parseSceneCandidateCatalog};
