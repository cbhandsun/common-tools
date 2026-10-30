// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {readPngBuffer}=require('../png');
const {record,list,box}=require('./source-scene-group-containment');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{root:string,items:Set<object>,bytes:number,pixels:number,proofCount:number,cache:Map<string,{bytes:Buffer,raster:import('../png').PngImage}>,proofs:Map<object,Map<string,{bounds:Box,signature:string}>>}} Scope */
/** @type {WeakMap<object,Scope>} */const scopes=new WeakMap();
/** Output paint inspection grants no source ownership or erasure. Only this
 * synchronous compiler scope can query its actual image objects, never IDs or
 * a serialized "transparent" flag. Large/unsupported images stay conservative.
 * @param {unknown} images @param {unknown} root */
function prepareSceneCropPaint(images,root){
 if(!list(images)||images.length>10000||images.some(item=>!record(item))
  ||typeof root!=='string'||!path.isAbsolute(root)||root.includes('\0'))throw new TypeError('Scene crop paint controls are invalid');
 const info=fs.lstatSync(root);if(!info.isDirectory()||info.isSymbolicLink())throw new TypeError('Scene crop paint root is invalid');
 const token=Object.freeze({});scopes.set(token,{root:fs.realpathSync(root),items:new Set(images.filter(record)),bytes:0,pixels:0,proofCount:0,cache:new Map(),proofs:new Map()});return token;
}
/** @param {Scope} scope @param {string} relative */
function safeFile(scope,relative){
 if(path.isAbsolute(relative)||relative.includes('\0')||relative.length>32768)return null;
 const file=path.resolve(scope.root,relative),local=path.relative(scope.root,file);
 if(!local.startsWith('assets'+path.sep)||local==='..'||local.startsWith('..'+path.sep)||path.isAbsolute(local))return null;
 let current=scope.root;
 for(const part of local.split(path.sep)){
  current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())return null;
 }
 const info=fs.statSync(file);return info.isFile()&&info.size<=12*1024*1024?{file,size:info.size}:null;
}
/** Only bounded primitive draw fields enter a dependency signature. Source
 * metadata and stringification hooks cannot participate in paint authority.
 * @param {Record<string,unknown>} item @param {Box} b */
function signature(item,b){const style=record(item.style)?item.style:{};
 return JSON.stringify([item.assetPath,b.x,b.y,b.w,b.h,style.assetPath??null,style.opacity??null]);}
/** Actual alpha is a paint-order proof only. Any nonzero alpha conflicts;
 * inspect a one-texel halo for image filtering. Source masks, crop metadata and
 * enclosing bodies cannot substitute for these bytes. Read the file afresh on
 * every query so external changes cannot reuse a stale transparent raster.
 * @param {unknown} token @param {unknown} item @param {Box} bounds
 * @param {{used:number,exhausted:boolean}} work */
function sceneCropPaintDisjoint(token,item,bounds,work){
 const scope=token!==null&&typeof token==='object'?scopes.get(token):undefined;
 if(!scope||!record(item)||!scope.items.has(item)||!box(item.box)||!box(bounds)||!record(work)
  ||!Number.isSafeInteger(work.used)||work.used<0||work.used>=4000000||work.exhausted!==false)return false;
 work.used++;
 if(Object.keys(item).some(key=>!['id','type','assetPath','box','style','source','layerType','detector','expressionForm','expressionSubtype','recommendedAction'].includes(key))
  ||typeof item.assetPath!=='string')return false;
 const style=item.style;
 if(style!==undefined&&(!record(style)||Object.keys(style).some(key=>!['assetPath','opacity','strategy'].includes(key))
  ||style.assetPath!==undefined&&style.assetPath!==item.assetPath
  ||style.opacity!==undefined&&(typeof style.opacity!=='number'||!Number.isFinite(style.opacity)||style.opacity<0||style.opacity>1)))return false;
 const found=safeFile(scope,item.assetPath);if(!found)return false;
 if(scope.bytes+found.size>64*1024*1024)return false;
 const bytes=fs.readFileSync(found.file);scope.bytes+=bytes.length;
 if(bytes.length>12*1024*1024||scope.bytes>64*1024*1024)return false;
 let cached=scope.cache.get(found.file);
 if(!cached||!bytes.equals(cached.bytes)){
  // Oversized legitimate crops remain supported by the renderer. They simply
  // cannot participate in this bounded optional paint-order proof.
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
   &&bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>4000000)return false;
  const raster=readPngBuffer(bytes,{maxFileBytes:12*1024*1024,maxPixels:4000000});
  if(scope.pixels+raster.width*raster.height>4000000)return false;
  scope.pixels+=raster.width*raster.height;cached={bytes,raster};scope.cache.set(found.file,cached);
 }
 const {raster}=cached,b=item.box,sx=raster.width/b.w,sy=raster.height/b.h;
 const x0=Math.max(0,Math.floor((bounds.x-b.x)*sx)-1),y0=Math.max(0,Math.floor((bounds.y-b.y)*sy)-1);
 const x1=Math.min(raster.width,Math.ceil((bounds.x+bounds.w-b.x)*sx)+1),y1=Math.min(raster.height,Math.ceil((bounds.y+bounds.h-b.y)*sy)+1);
 if(![sx,sy,x0,y0,x1,y1].every(Number.isFinite))return false;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  if(++work.used>4000000){work.exhausted=true;return false;}
  if(raster.rgba[(y*raster.width+x)*4+3]!==0)return false;
 }
 let proofs=scope.proofs.get(item);if(!proofs){proofs=new Map();scope.proofs.set(item,proofs);}
 const key=JSON.stringify([bounds.x,bounds.y,bounds.w,bounds.h]);
 if(!proofs.has(key)){if(scope.proofCount>=10000)return false;scope.proofCount++;proofs.set(key,{bounds:{...bounds},signature:signature(item,b)});}
 return true;
}
/** Recheck the exact dependencies at final group retention, after later image
 * refinements. A stale/moved image or new opaque texel revokes the grouping.
 * @param {unknown} token @param {{used:number,exhausted:boolean}} work */
function retainedSceneCropPaint(token,work){
 const scope=token!==null&&typeof token==='object'?scopes.get(token):undefined;if(!scope)return false;
 for(const [item,proofs]of scope.proofs)for(const proof of proofs.values()){
  if(!record(item)||!box(item.box)||signature(item,item.box)!==proof.signature
   ||!sceneCropPaintDisjoint(token,item,proof.bounds,work))return false;
 }
 return true;
}
module.exports={prepareSceneCropPaint,sceneCropPaintDisjoint,retainedSceneCropPaint};
