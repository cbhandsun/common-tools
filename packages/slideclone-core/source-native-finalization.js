// @ts-check
"use strict";
const fs=require("node:fs"),path=require("node:path");
const {types}=require("node:util");
const {readPng}=require("./png");
const {safeAssetPath}=require("./deck-ir-admission");
const {orderSourceIconLayers}=require("./source-icon-layer-order");
const {reconcileSourceConnectorCrops}=require("./source-connector-crop-contour");
const {retainedSceneGroupMembers}=require('./source-scene-group-retention');
const {list}=require('./source-scene-group-containment');
const {retainedOpenSceneOwnerTransaction}=require('./source-scene-open-owner-transaction');
/** Remove legacy hybrid groups while keeping complete private source receipts.
 * No serialized ID, copied token or partially surviving unit grants retention.
 * @param {unknown} page
 * @param {unknown} [receipt] @param {unknown} [openOwnerReceipt] */
function ungroupSourceNativeOverlays(page,receipt,openOwnerReceipt){
 if(!record(page))return;
 const shapes=list(page.shapes)?page.shapes:[],labels=list(page.textBoxes)?page.textBoxes:[];
 if([...shapes,...labels].some(item=>!record(item)))return;
 const retained=retainedSceneGroupMembers(page,receipt);
 if(openOwnerReceipt!==undefined){
  const open=retainedOpenSceneOwnerTransaction(openOwnerReceipt,page);
  if(!open)throw new TypeError('Open owner final output binding is invalid');
  for(const member of open.members)retained.add(member);
 }
 for(const item of [...shapes,...labels]){
  if(!record(item))continue;
  if(retained.has(item))continue;
  if(record(item.style))delete item.style.nativeComponentGroupId;
  if(record(item.source))for(const key of Object.keys(item.source))if(key.startsWith('nativeComponent'))delete item.source[key];
 }
}
/** @typedef {Record<string,unknown>} Item */
/** @param {unknown} value @returns {value is Item} */
function record(value) {
  return value!==null && typeof value==="object" && !types.isProxy(value) && !Array.isArray(value)
    && [null,Object.prototype].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);
}
/** Final ownership reconciliation runs after semantic composition, when every
 * native owner exists. It never accepts a crop from bounding-box overlap alone.
 * @param {unknown} pageInput @param {unknown} slideSize @param {unknown} rootInput */
function proposeSourceNativePage(pageInput,slideSize,rootInput) {
  if(!record(pageInput) || !Array.isArray(pageInput.shapes) || !Array.isArray(pageInput.images)
    || typeof rootInput!=="string" || !path.isAbsolute(rootInput) || rootInput.includes("\0") || rootInput.length>32768) throw new TypeError("source native finalization context is invalid");
  const root=path.resolve(rootInput),rootInfo=fs.lstatSync(root),realRoot=fs.realpathSync(root);
  if(!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new TypeError("source native finalization root is invalid");
  const result=reconcileSourceConnectorCrops({images:pageInput.images,shapes:pageInput.shapes,slideSize},image=>{
    const asset=safeAssetPath(image.assetPath);
    if(!asset.startsWith("assets/")) throw new TypeError("source connector asset is invalid");
    let file=root;
    for(const segment of asset.split("/")) {
      file=path.join(file,segment);
      const info=fs.lstatSync(file),relative=path.relative(realRoot,fs.realpathSync(file));
      if(info.isSymbolicLink() || relative===".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new TypeError("source connector asset escaped its root");
    }
    const info=fs.lstatSync(file);
    if(!info.isFile() || info.size<1 || info.size>8*1024*1024) throw new TypeError("source connector asset is invalid");
    return readPng(file,{maxFileBytes:8*1024*1024,maxPixels:262144,maxDimension:512});
  });
  return {...pageInput,images:result.images,shapes:orderSourceIconLayers(result.shapes,slideSize).shapes,
    ...(result.replacedCrops ? {source:{...(record(pageInput.source)?pageInput.source:{}),sourceGraphicOwnership:{
      provider:"source-connector-crop-contour-v1",replacedCrops:result.replacedCrops}}}: {})};
}
/** Canonical composition preserves crops until a rendered candidate transaction
 * accepts their replacement. Layer ordering itself does not erase source pixels.
 * @param {unknown} pageInput @param {unknown} slideSize @param {unknown} rootInput */
function finalizeSourceNativePage(pageInput,slideSize,rootInput) {
  if(!record(pageInput) || !Array.isArray(pageInput.shapes) || !Array.isArray(pageInput.images)
    || typeof rootInput!=="string" || !path.isAbsolute(rootInput)) throw new TypeError("source native finalization context is invalid");
  return {...pageInput,shapes:orderSourceIconLayers(pageInput.shapes,slideSize).shapes};
}
/** @param {unknown} deckInput @param {unknown} root */
function proposeNativeOwnedGraphics(deckInput,root) {
  if(!record(deckInput) || types.isProxy(deckInput.pages) || !Array.isArray(deckInput.pages) || deckInput.pages.length>20) throw new TypeError("source graphic candidate is invalid");
  let replacedCrops=0;
  const pages=[];
  for(let index=0;index<deckInput.pages.length;index++) {
    const property=Object.getOwnPropertyDescriptor(deckInput.pages,String(index));
    if(!property || !("value" in property)) throw new TypeError("source graphic page is invalid");
    const page=proposeSourceNativePage(property.value,deckInput.slideSize,root);
    const original=property.value;
    if(!record(original) || !Array.isArray(original.images)) throw new TypeError("source graphic page is invalid");
    replacedCrops+=original.images.length-page.images.length;
    pages.push(page);
  }
  return replacedCrops ? {deck:{...deckInput,pages},vectorizedImages:replacedCrops,nativeShapes:replacedCrops} : null;
}
module.exports={finalizeSourceNativePage,proposeSourceNativePage,proposeNativeOwnedGraphics,ungroupSourceNativeOverlays};
