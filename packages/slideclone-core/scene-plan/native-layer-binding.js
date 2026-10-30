// @ts-check
'use strict';
const path=require('node:path');
const {readPngBuffer}=require('../png');
const {record,list,snapshot,fingerprint,absolutePath,hash,identifier}=require('./approved-frame-application-input');
const {digest,readFile,assetFile,workspace}=require('./approved-frame-application-files');
const {finite,keys}=require('./native-layer-change-style');
/** @typedef {{version:1,source:{sha256:string,width:number,height:number},slideSize:{widthPt:number,heightPt:number},pageFingerprint:string,assets:{imageId:string,sha256:string,bytes:number}[],applicationAuthorized:false,sourceErasureAuthority:false,strictSourceEquivalent:false}} NativeLayerBinding */
/** Serialized byte evidence only. No review, flag or digest confers authority.
 * @param {unknown} input @returns {NativeLayerBinding} */
function parseNativeLayerBinding(input){
 const b=record(input);keys(b,['version','source','slideSize','pageFingerprint','assets','applicationAuthorized','sourceErasureAuthority','strictSourceEquivalent']);
 const source=record(b.source),size=record(b.slideSize);keys(source,['sha256','width','height']);keys(size,['widthPt','heightPt']);
 if(b.version!==1||b.applicationAuthorized!==false||b.sourceErasureAuthority!==false||b.strictSourceEquivalent!==false
  ||!finite(source.width,1,32768)||!Number.isSafeInteger(source.width)||!finite(source.height,1,32768)||!Number.isSafeInteger(source.height)
  ||source.width*source.height>40000000||!finite(size.widthPt,1,100000)||!finite(size.heightPt,1,100000))throw new TypeError('native-layer-binding-invalid');
 let total=0;
 const assets=list(b.assets,512).map(raw=>{
  const row=record(raw);keys(row,['imageId','sha256','bytes']);
  if(!finite(row.bytes,1,12*1024*1024)||!Number.isSafeInteger(row.bytes)||(total+=row.bytes)>128*1024*1024)throw new TypeError('native-layer-binding-invalid');
  return {imageId:identifier(row.imageId),sha256:hash(row.sha256),bytes:row.bytes};
 });
 if(new Set(assets.map(row=>row.imageId)).size!==assets.length)throw new TypeError('native-layer-binding-invalid');
 return {version:1,source:{sha256:hash(source.sha256),width:source.width,height:source.height},slideSize:{widthPt:size.widthPt,heightPt:size.heightPt},
  pageFingerprint:hash(b.pageFingerprint),assets,applicationAuthorized:false,sourceErasureAuthority:false,strictSourceEquivalent:false};
}
/** Capture actual source/asset bytes and canonicalize ONLY direct image paths
 * and their verified style aliases. All other page data remains bound.
 * Random working directories can change; a byte, drawing or source change
 * cannot be hidden by replacing an expected fingerprint.
 * @param {unknown} context @returns {NativeLayerBinding} */
function captureNativeLayerBinding(context){
 try{
  const data=record(context),deck=record(data.deck);snapshot(deck);
  const pages=list(deck.pages,1),page=record(pages[0]);if(pages.length!==1)throw new TypeError('native-layer-binding-invalid');
  const {root}=workspace(data.root),file=assetFile(root,path.relative(root,absolutePath(data.sourceFile)));
  const bytes=readFile(file,128*1024*1024),source=readPngBuffer(bytes),sha256=digest(bytes);
  if(record(record(page.source).sourceScene).sourceHash!==sha256)throw new TypeError('native-layer-binding-invalid');
  let total=0;
  /** @type {NativeLayerBinding['assets']} */const assets=[];
  const images=list(page.images,512).map(raw=>{
   const image=record(raw),style=image.style===undefined?undefined:record(image.style);
   if(style?.assetPath!==undefined&&style.assetPath!==image.assetPath)throw new TypeError('native-layer-binding-invalid');
   const content=readFile(assetFile(root,image.assetPath),Math.min(12*1024*1024,128*1024*1024-total));
   total+=content.length;const sha256=digest(content),assetPath='sha256:'+sha256;
   assets.push({imageId:identifier(image.id),sha256,bytes:content.length});
   return {...image,assetPath,...(style?.assetPath===undefined?{}:{style:{...style,assetPath}})};
  });
  return parseNativeLayerBinding({version:1,source:{sha256,width:source.width,height:source.height},slideSize:deck.slideSize,
   pageFingerprint:fingerprint({...page,images}),assets,applicationAuthorized:false,sourceErasureAuthority:false,strictSourceEquivalent:false});
 }catch(error){throw new TypeError('native-layer-binding-invalid',{cause:error});}
}
module.exports={captureNativeLayerBinding,parseNativeLayerBinding};
