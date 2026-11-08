// @ts-check
'use strict';
const {record,list,hash,identifier,fingerprint}=require('./approved-frame-application-input');
/** @param {Record<string,unknown>} value @param {string[]} keys */
function exact(value,keys){if(Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))throw new TypeError('approved-opaque-fields-invalid');}
/** @param {unknown} value @param {number} max */
function integer(value,max){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>max)throw new TypeError('approved-opaque-number-invalid');return value;}
/** Bind all existing native drawing data. Source annotations and measured
 * grouping controls can evolve independently; this service never changes them.
 * @param {unknown} deckInput @param {unknown} pageInput */
function opaqueBackdropDrawingFingerprint(deckInput,pageInput){
 const deck=record(deckInput),page=record(pageInput);
 const drawing=(/** @type {unknown} */value)=>{const item={...record(value)};delete item.source;return item;};
 return fingerprint({slideSize:deck.slideSize,shapes:list(page.shapes,20000).map(drawing),textBoxes:list(page.textBoxes,20000).map(drawing)});
}
/** An independent host-installed exact replacement policy. The transparent
 * pixel parser remains unchanged and cannot consume this opaque manifest.
 * No runtime sampling, new coordinates, colors, or source ownership is issued.
 * @param {unknown} input */
function parseApprovedOpaqueBackdrop(input){
 const data=record(input);exact(data,['approvalId','source','asset','drawingFingerprint','protectedCells','pixels','scopeFingerprint']);
 const raw=record(data.source);exact(raw,['width','height','sha256']);
 const width=integer(raw.width,16384),height=integer(raw.height,16384);
 if(!width||!height||width*height>40000000)throw new TypeError('approved-opaque-source-size');
 const source=Object.freeze({width,height,sha256:hash(raw.sha256)}),rawAsset=record(data.asset);
 exact(rawAsset,['imageId','beforeSha256','imageFingerprint']);
 const asset=Object.freeze({imageId:identifier(rawAsset.imageId),beforeSha256:hash(rawAsset.beforeSha256),imageFingerprint:hash(rawAsset.imageFingerprint)});
 let previous=-1;
 const protectedCells=list(data.protectedCells,10000).map(value=>{const cell=integer(value,width*height-1);
  if(cell<=previous)throw new TypeError('approved-opaque-protected-order');previous=cell;return cell;});
 const protectedSet=new Set(protectedCells);previous=-1;
 const pixels=list(data.pixels,10000).map(value=>{
  const row=record(value);exact(row,['cell','before','color']);const cell=integer(row.cell,width*height-1);
  if(cell<=previous||protectedSet.has(cell))throw new TypeError('approved-opaque-pixel-scope');previous=cell;
  const before=list(row.before,4).map(n=>integer(n,255)),color=list(row.color,3).map(n=>integer(n,255));
  if(before.length!==4||before[3]!==255||color.length!==3||before.slice(0,3).every((n,i)=>n===color[i]))throw new TypeError('approved-opaque-pixel-invalid');
  return Object.freeze({cell,before:Object.freeze(before),color:Object.freeze(color)});
 });
 if(!pixels.length)throw new TypeError('approved-opaque-pixels-empty');
 const drawingFingerprint=hash(data.drawingFingerprint),scopeFingerprint=hash(data.scopeFingerprint);
 if(fingerprint({source,asset,drawingFingerprint,protectedCells,pixels})!==scopeFingerprint)throw new TypeError('approved-opaque-scope-binding');
 return Object.freeze({approvalId:identifier(data.approvalId),source,asset,drawingFingerprint,protectedCells:Object.freeze(protectedCells),
  pixels:Object.freeze(pixels),scopeFingerprint,validationChecks:pixels.length*9+protectedCells.length+6});
}
module.exports={parseApprovedOpaqueBackdrop,opaqueBackdropDrawingFingerprint};
