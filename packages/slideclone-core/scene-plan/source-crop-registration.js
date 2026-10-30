// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{types}=require('node:util');
const {record}=require('./source-scene-group-containment');
const {sourceRaster}=require('../typography/residual-text-mask');
const {pxToPtBox}=require('./raster-native-detection');
const {readPng,readPngBuffer}=require('../png');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{widthPt:number,heightPt:number}} Slide */
/** @typedef {{pixelBox:Box,box:Box,hash:string}} Registration */
/** @typedef {{root:string,width:number,height:number,sourceHash:string,slide:Slide,rows:Map<string,Registration>,pixels:number}} Scope */
/** @type {WeakMap<object,Scope>} */const sessions=new WeakMap();
/** @type {Scope|null} */let active=null;
/** @param {unknown} input */
function raster(input){
 const checked=sourceRaster(input);
 if(!record(input)||!Buffer.isBuffer(input.rgba))throw new TypeError('Source crop pixels are invalid');
 return {...checked,rgba:input.rgba};
}
/** @param {Uint8Array} bytes */const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
/** @param {unknown} input @returns {input is Box} */
const box=input=>record(input)&&[input.x,input.y,input.w,input.h].every(n=>typeof n==='number'&&Number.isFinite(n))
 &&Number(input.x)>=0&&Number(input.y)>=0&&Number(input.w)>0&&Number(input.h)>0;
/** @param {Box} a @param {Box} b */const sameBox=(a,b)=>['x','y','w','h'].every(key=>a[/** @type {keyof Box} */(key)]===b[/** @type {keyof Box} */(key)]);
/** Existing native generation is synchronous. Keep its registration receipts
 * in a per-rebuild private scope, across later metadata copies and source
 * buffer reloads. No serialized metadata can re-create this capability.
 * @template T @param {unknown} imageInput @param {unknown} rootInput @param {unknown} slideInput @param {()=>T} build */
function captureSourceCropRegistrations(imageInput,rootInput,slideInput,build){
 const image=raster(imageInput);
 if(typeof rootInput!=='string'||!path.isAbsolute(rootInput)||rootInput.includes('\0')||rootInput.length>32768
  ||!record(slideInput)||![slideInput.widthPt,slideInput.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000)
  ||typeof build!=='function')throw new TypeError('Source crop capture controls are invalid');
 const info=fs.lstatSync(rootInput);if(!info.isDirectory()||info.isSymbolicLink())throw new TypeError('Source crop root is invalid');
 const scope={root:fs.realpathSync(rootInput),width:image.width,height:image.height,sourceHash:hash(image.rgba),
  slide:{widthPt:Number(slideInput.widthPt),heightPt:Number(slideInput.heightPt)},rows:new Map(),pixels:0};
 const token=Object.freeze({}),previous=active;active=scope;
 try{
  const result=build();if(types.isPromise(result))throw new TypeError('Source crop capture must be synchronous');
  sessions.set(token,scope);return {result,token};
 }finally{active=previous;}
}
/** @param {Scope} scope @param {unknown} file */
function assetFile(scope,file){
 if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0')||file.length>32768)return null;
 const relative=path.relative(scope.root,file);
 if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)||!relative.startsWith(`assets${path.sep}`))return null;
 let current=scope.root;
 for(const part of relative.split(path.sep)){
  current=path.join(current,part);const info=fs.lstatSync(current);
  const actual=path.relative(scope.root,fs.realpathSync(current));
  if(info.isSymbolicLink()||actual==='..'||actual.startsWith(`..${path.sep}`)||path.isAbsolute(actual))return null;
 }
 return fs.lstatSync(current).isFile()?current:null;
}
/** @param {Scope} scope @param {ReturnType<typeof raster>} image */
const sameSource=(scope,image)=>scope.width===image.width&&scope.height===image.height&&scope.sourceHash===hash(image.rgba);
/** Called only at the actual crop producer, after writing its bounded asset.
 * Registration is geometry/provenance, not paint or erasure authorization.
 * @param {unknown} sourceInput @param {unknown} pixelInput @param {unknown} fileInput @param {unknown} cropInput @param {unknown} boxInput */
function registerSourceCrop(sourceInput,pixelInput,fileInput,cropInput,boxInput){
 if(!active)return false;
 const source=raster(sourceInput),crop=raster(cropInput),scope=active;
 if(!box(pixelInput)||!box(boxInput)||![pixelInput.x,pixelInput.y,pixelInput.w,pixelInput.h].every(Number.isSafeInteger)
  ||pixelInput.x+pixelInput.w>source.width||pixelInput.y+pixelInput.h>source.height
  ||crop.width!==pixelInput.w||crop.height!==pixelInput.h)
  throw new TypeError('Source crop registration is invalid');
 // Large producer crops remain valid assets; this bounded optional receipt
 // must not turn their ordinary reconstruction into a job failure.
 if(pixelInput.w*pixelInput.h>262144)return false;
 if(!sameSource(scope,source)||!sameBox(boxInput,pxToPtBox(pixelInput,source,scope.slide,0)))return false;
 const file=assetFile(scope,fileInput);if(!file)return false;
 const previous=scope.rows.get(file),pixels=scope.pixels-(previous?previous.pixelBox.w*previous.pixelBox.h:0)+crop.width*crop.height;
 if(pixels>4000000||!previous&&scope.rows.size>=10000)return false;
 scope.rows.set(file,{pixelBox:{...pixelInput},box:{...boxInput},hash:hash(crop.rgba)});scope.pixels=pixels;return true;
}
/** Recover the exact crop window at its trusted rewrite boundary. Never turn
 * a rounded public box back into a new sampling window when this receipt exists.
 * @param {unknown} sourceInput @param {unknown} fileInput @param {unknown} boxInput */
function sourceCropBoxForWrite(sourceInput,fileInput,boxInput){
 if(!active||!box(boxInput))return null;
 const scope=active,source=raster(sourceInput),file=assetFile(scope,fileInput);if(!file||!sameSource(scope,source))return null;
 const row=scope.rows.get(file);if(!row||!sameBox(row.box,boxInput))return null;
 const actual=readPng(file,{maxFileBytes:12*1024*1024,maxPixels:262144});
 if(actual.width!==row.pixelBox.w||actual.height!==row.pixelBox.h||hash(actual.rgba)!==row.hash)return null;
 return {...row.pixelBox};
}
/** Read only an exact, unchanged captured asset at its original placement.
 * Copies of public image metadata are allowed; forged tokens, changed bytes,
 * relocated/scaled assets and a different source are not. The returned window
 * is detached and itself grants no permission to erase a single source cell.
 * @param {unknown} token @param {unknown} sourceInput @param {unknown} rootInput @param {unknown} fileInput
 * @param {unknown} boxInput @param {unknown} cropInput */
function readRegisteredSourceCrop(token,sourceInput,rootInput,fileInput,boxInput,cropInput){
 const found=readRegisteredSourceCropSnapshot(token,sourceInput,rootInput,fileInput,boxInput);if(!found)return null;
 const crop=raster(cropInput);
 return crop.width===found.raster.width&&crop.height===found.raster.height&&hash(crop.rgba)===hash(found.raster.rgba)?found.pixelBox:null;
}
/** Current source-domain image contribution at its original captured placement.
 * Read bytes afresh: a renderer's PNG cache cannot establish current identity.
 * The detached raster grants no semantic owner, visible layer or erasure.
 * @param {unknown} token @param {unknown} sourceInput @param {unknown} rootInput @param {unknown} fileInput @param {unknown} boxInput */
function readRegisteredSourceCropSnapshot(token,sourceInput,rootInput,fileInput,boxInput){
 const scope=token!==null&&typeof token==='object'?sessions.get(token):undefined;
 if(!scope||typeof rootInput!=='string'||!path.isAbsolute(rootInput)||!box(boxInput))return null;
 if(fs.realpathSync(rootInput)!==scope.root)return null;
 const source=raster(sourceInput),file=assetFile(scope,fileInput);if(!file||!sameSource(scope,source))return null;
 const row=scope.rows.get(file);
 if(!row||!sameBox(row.box,boxInput))return null;
 if(fs.statSync(file).size>12*1024*1024)throw new RangeError('Source crop file exceeds the processing boundary');
 const actual=readPngBuffer(fs.readFileSync(file),{maxFileBytes:12*1024*1024,maxPixels:262144});
 return actual.width===row.pixelBox.w&&actual.height===row.pixelBox.h&&hash(actual.rgba)===row.hash?{pixelBox:{...row.pixelBox},raster:actual}:null;
}
/** Preserve exact placement across an alpha-only derived crop. This records
 * provenance, never permission to erase: the caller still needs its independent
 * native paint proof. RGB changes, added opacity and invented sampling windows
 * cannot acquire a descendant registration. Both original assets stay valid.
 * @param {unknown} token @param {unknown} sourceInput @param {unknown} rootInput
 * @param {unknown} oldFile @param {unknown} boxInput @param {unknown} nextFile */
function registerDerivedSourceCrop(token,sourceInput,rootInput,oldFile,boxInput,nextFile){
 const scope=token!==null&&typeof token==='object'?sessions.get(token):undefined;if(!scope)return false;
 const old=readRegisteredSourceCropSnapshot(token,sourceInput,rootInput,oldFile,boxInput);if(!old)return false;
 const file=assetFile(scope,nextFile);if(!file)return false;
 // A descendant must never rebind another captured asset (including itself).
 // Existing source windows retain their independent identity for later proof.
 if(scope.rows.has(file))return false;
 const next=readPng(file,{maxFileBytes:12*1024*1024,maxPixels:262144});
 if(next.width!==old.raster.width||next.height!==old.raster.height)return false;
 for(let i=0;i<next.rgba.length;i+=4){
  if([0,1,2].some(c=>next.rgba[i+c]!==old.raster.rgba[i+c])
   ||next.rgba[i+3]!==old.raster.rgba[i+3]&&next.rgba[i+3]!==0)return false;
 }
 const previous=scope.rows.get(file),pixels=scope.pixels-(previous?previous.pixelBox.w*previous.pixelBox.h:0)+next.width*next.height;
 if(pixels>4000000||!previous&&scope.rows.size>=10000)return false;
 scope.rows.set(file,{pixelBox:{...old.pixelBox},box:{.../** @type {Box} */(boxInput)},hash:hash(next.rgba)});scope.pixels=pixels;return true;
}
module.exports={captureSourceCropRegistrations,registerSourceCrop,sourceCropBoxForWrite,readRegisteredSourceCrop,readRegisteredSourceCropSnapshot,registerDerivedSourceCrop};
