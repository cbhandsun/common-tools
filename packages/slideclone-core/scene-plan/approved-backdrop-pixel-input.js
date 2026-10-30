// @ts-check
'use strict';
const {record,list,hash,identifier,fingerprint}=require('./approved-frame-application-input');
/** @param {Record<string,unknown>} value @param {string[]} keys */
function exact(value,keys){if(Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))throw new TypeError('approved-backdrop-fields-invalid');}
/** @param {unknown} value @param {number} minimum @param {number} maximum */
function integer(value,minimum,maximum){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<minimum||value>maximum)throw new TypeError('approved-backdrop-number-invalid');return value;}
/** Asset paths are transaction-local; every other image field is bound.
 * @param {unknown} value */
function backdropImageFingerprint(value){
 const image=record(value),style=image.style===undefined?undefined:record(image.style);
 return fingerprint({...image,assetPath:undefined,...(style?{style:{...style,assetPath:undefined}}:{})});
}
/** @param {Record<string,unknown>} deck @param {Record<string,unknown>} page */
function backdropPageFingerprint(deck,page){
 return fingerprint({slideSize:deck.slideSize,shapes:page.shapes,textBoxes:page.textBoxes,
  images:list(page.images,10000).map(backdropImageFingerprint)});
}
/** Host-only exact reviewed pixel manifest. The factory is installed as a
 * dependency; approval strings or reports in job metadata grant no authority.
 * No coordinate, source identity, asset ID or color is screenshot-specific.
 * @param {unknown} input */
function parseApprovedBackdropPixels(input){
 const data=record(input);exact(data,['approvalId','source','scopeFingerprint','pageFingerprint','pixels','assets']);
 const approvalId=identifier(data.approvalId),rawSource=record(data.source);exact(rawSource,['width','height','sha256']);
 const width=integer(rawSource.width,1,16384),height=integer(rawSource.height,1,16384);
 if(width*height>40000000)throw new TypeError('approved-backdrop-source-size');
 const source=Object.freeze({width,height,sha256:hash(rawSource.sha256)});let previous=-1,validationChecks=0;
 const pixels=list(data.pixels,10000).map(value=>{
  const row=record(value);exact(row,['cell','color','kind']);const cell=integer(row.cell,0,width*height-1);
  if(cell<=previous)throw new TypeError('approved-backdrop-pixels-not-unique-and-ordered');previous=cell;
  const color=list(row.color,3).map(channel=>integer(channel,0,255));
  if(color.length!==3||!['source-interpolation','neighbor-inference'].includes(/** @type {string} */(row.kind)))throw new TypeError('approved-backdrop-pixel-invalid');
  validationChecks+=4;return Object.freeze({cell,color:Object.freeze(color),kind:/** @type {string} */(row.kind)});
 });
 if(!pixels.length)throw new TypeError('approved-backdrop-pixels-empty');Object.freeze(pixels);
 const scopeFingerprint=hash(data.scopeFingerprint);
 if(fingerprint({source,pixels})!==scopeFingerprint)throw new TypeError('approved-backdrop-scope-binding');
 const assets=list(data.assets,64).map(value=>{
  const row=record(value);exact(row,['imageId','beforeSha256','imageFingerprint']);validationChecks+=3;
  return Object.freeze({imageId:identifier(row.imageId),beforeSha256:hash(row.beforeSha256),imageFingerprint:hash(row.imageFingerprint)});
 });
 if(!assets.length||new Set(assets.map(row=>row.imageId)).size!==assets.length)throw new TypeError('approved-backdrop-assets-invalid');Object.freeze(assets);
 return Object.freeze({approvalId,source,pixels,assets,scopeFingerprint,pageFingerprint:hash(data.pageFingerprint),validationChecks});
}
module.exports={parseApprovedBackdropPixels,backdropImageFingerprint,backdropPageFingerprint};
