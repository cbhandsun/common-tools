// @ts-check
'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {record,list,hash,identifier,snapshot,fingerprint}=require('./approved-frame-application-input');
const {traceNativeMaskContours}=require('./native-mask-contours');
const {encodeNativeFreeformPath,readNativeFreeformSegments}=require('./native-freeform-path');
const {applySourceOutlinePaint}=require('./source-outline-paint-shapes');
const {measureSourceOutlinePaint}=require('./source-outline-paint');
/** @typedef {NonNullable<ReturnType<typeof import('./source-scene-outline').measureOutlinedSceneContainer>>} Outline */
/** @typedef {{image:import('../png').PngImage,sourceHash:string,closed:boolean}} Scope */
/** @type {AsyncLocalStorage<Scope>} */const scopes=new AsyncLocalStorage();
/** @type {WeakMap<object,{scope:Scope,current:string,legacyPath:string,legacyFill:string,legacyPaint:import('./source-outline-paint').Paint|null}>} */const observations=new WeakMap();
/** @typedef {{id:string,sourceHash:string,current:string,legacyPath:string,legacyFill:string,legacyPaint:import('./source-outline-paint').Paint|null,expires:number,children:{item:Record<string,unknown>,value:string}[]}} Receipt */
/** @type {WeakMap<object,Receipt>} */const outputs=new WeakMap();
/** Source scope is opened by the verified compiler session, never by JSON.
 * @template T @param {import('../png').PngImage} image @param {string} sourceHash @param {()=>T} operation @returns {T} */
function withSourceMeasuredOutlineScope(image,sourceHash,operation){
 hash(sourceHash);const scope={image,sourceHash,closed:false};
 try{return scopes.run(scope,operation);}finally{scope.closed=true;}
}
/** Capture only the admitted ring, after all mandatory geometry/paint work.
 * Reconstruct its former 1.5px contour from the SAME source cells, spending
 * only the remaining original contour allowance. An optional failure grants
 * no compatibility and never changes the accepted outline or source pixels.
 * @param {import('./source-scene-fill-raster-cache').Raster} image @param {Outline} outline
 * @param {{checks:number,exhausted:boolean}} work
 * @param {{points:{x:number,y:number}[],colors:Map<number,number[]>,width:number}} [cachedPaint] */
function captureSourceOutlineAppearance(image,outline,work,cachedPaint){
 const scope=scopes.getStore();if(!scope||scope.closed||scope.image.rgba!==image.rgba||scope.image.width!==image.width
  ||scope.image.height!==image.height||!outline.paint?.disjoint)return;
 const tolerance=Math.min(1.5,Math.max(.5,Math.min(outline.box.w,outline.box.h)/100));
 const segments=tolerance===1.5?outline.segments:traceNativeMaskContours(outline.sourcePixels.map(n=>({x:n%image.width,y:Math.floor(n/image.width)})),outline.box,{tolerancePx:1.5,workState:work});
 if(!segments)return;
 const legacyPaint=cachedPaint?measureSourceOutlinePaint(cachedPaint,work):null;
 observations.set(outline,{scope,current:appearanceFingerprint(outline),legacyPath:encodeNativeFreeformPath(segments),legacyFill:outline.paint.baseColor,legacyPaint});
}
/** Bound only appearance, without serializing the source-cell list.
 * @param {Outline} outline */
function appearanceFingerprint(outline){return fingerprint({box:outline.box,segments:outline.segments,paint:outline.paint});}
/** Compare compact and expanded forms without losing any geometry precision.
 * @param {unknown} input @returns {Record<string,unknown>} */
function canonicalItem(input){
 snapshot(input);const item=record(input),style={...record(item.style)};
 const path=encodeNativeFreeformPath(readNativeFreeformSegments(style));
 delete style.freeformSegments;style.freeformPath=path;
 return {...item,style};
}
/** Admission later annotates source metadata (including pageImage). Bind every
 * drawing field privately; the COMPLETE original source/ownership metadata is
 * still checked against the old endpoint fingerprint at approval consumption.
 * Palette children retain their private identity and explicit owner selection.
 * This appearance capability never grants source-erasure or inventory rights.
 * @param {unknown} input */
function drawingFingerprint(input){const drawing=canonicalItem(input);delete drawing.source;return fingerprint(drawing);}
/** Register the actual final native style against this cache's private ring.
 * Every visible palette child must match the measured source paint and retain
 * its identity. The receipt authorizes no new member, erasure, or approval.
 * @param {unknown} measurement @param {unknown} output @param {unknown} candidates */
function registerSourceMeasuredOutlineStyle(measurement,output,candidates){
 try{
  const scope=scopes.getStore(),proof=measurement&&typeof measurement==='object'?observations.get(measurement):null;
  if(!scope||scope.closed||!proof||proof.scope!==scope)return false;
  const outline=/** @type {Outline} */(measurement);if(proof.current!==appearanceFingerprint(outline))return false;
  const item=canonicalItem(output),style=record(item.style),box=record(item.box);
  if(item.type!=='freeform'||style.fill!=='none'||style.freeformPath!==encodeNativeFreeformPath(outline.segments)
   ||Object.keys(box).length!==4||![box.x,box.y,box.w,box.h].every(n=>typeof n==='number'&&Number.isFinite(n))
   ||Number(box.w)<=0||Number(box.h)<=0)return false;
  const original=record(output),items=list(candidates,10000).map(record),id=identifier(item.id);
  if(items.filter(s=>s.id===id).length!==1||!items.includes(original)||!outline.paint)return false;
  const expected=applySourceOutlinePaint([/** @type {Parameters<typeof applySourceOutlinePaint>[0][number]} */(original)],new Map([[id,outline.paint]])).shapes.slice(1);
  const children=items.filter(s=>s.source!==undefined&&record(s.source).sceneOutlinePaintOwnerId===id);
  if(children.length!==expected.length||expected.some(part=>children.filter(child=>child.id===part.id
   &&fingerprint(canonicalItem(child))===fingerprint(canonicalItem(part))).length!==1))return false;
  outputs.set(record(original.style),{id,sourceHash:scope.sourceHash,current:drawingFingerprint(item),legacyPath:proof.legacyPath,legacyFill:proof.legacyFill,legacyPaint:proof.legacyPaint,
   expires:Date.now()+30*60*1000,children:children.map(child=>({item:child,value:drawingFingerprint(child)}))});return true;
 }catch{return false;}
}
/** Reconstruct the ENTIRE old approved endpoint, replacing only the two
 * privately measured appearance fields. Geometry/ports/source/ownership must
 * match the original review exactly. Copies, mutations, stale/cross-source
 * receipts and missing/replaced paint children cannot reuse the approval.
 * @param {unknown} input @param {unknown} expected @param {unknown} sourceHash @param {unknown} candidates */
function sourceMeasuredOutlineAncestor(input,expected,sourceHash,candidates){
 try{
  hash(expected);hash(sourceHash);const original=record(input),style=record(original.style),proof=outputs.get(style);
  if(!proof||proof.id!==original.id||proof.sourceHash!==sourceHash||Date.now()>proof.expires)return null;
  if(drawingFingerprint(original)!==proof.current)return null;
  const items=list(candidates,10000).map(record),children=items.filter(s=>s.source!==undefined&&record(s.source).sceneOutlinePaintOwnerId===original.id);
  if(children.length!==proof.children.length||proof.children.some(row=>!children.includes(row.item)
   ||drawingFingerprint(row.item)!==row.value))return null;
  /** @type {Record<string,unknown>} */const legacyStyle={...style,fill:proof.legacyFill};
  if(style.freeformPath!==undefined)legacyStyle.freeformPath=proof.legacyPath;
  else legacyStyle.freeformSegments=readNativeFreeformSegments({freeformPath:proof.legacyPath});
  if(fingerprint({...original,style:legacyStyle})!==expected)return null;
  return {id:proof.id,field:'style.outlinePaint',originalFingerprint:String(expected),measuredFingerprint:fingerprint(original),sourceSha256:String(sourceHash)};
 }catch{return null;}
}
/** Admit the COMPLETE current paint family only after reconstructing EVERY
 * historical reviewed member exactly, from the same cached ring colors and
 * original work allowance. An anchor-only proof never authorizes its children.
 * No new pixels, source reads, approvals, erasure or region completion rights.
 * @param {unknown} input @param {unknown} expectedMembers @param {unknown} sourceHash @param {unknown} candidates */
function sourceMeasuredOutlineFamily(input,expectedMembers,sourceHash,candidates){
 try{
  const anchor=record(input),proof=outputs.get(record(anchor.style));if(!proof?.legacyPaint)return null;
  const reviewed=list(expectedMembers,10000).map(record),expected=reviewed.find(row=>row.id===anchor.id);
  if(!expected||!sourceMeasuredOutlineAncestor(anchor,expected.fingerprint,sourceHash,candidates))return null;
  const items=list(candidates,10000).map(record);
  if(items.filter(item=>item.id===anchor.id).length!==1||!items.includes(anchor))return null;
  for(const row of proof.children)if(items.filter(item=>item.id===row.item.id).length!==1
   ||fingerprint(row.item.source)!==fingerprint({...record(anchor.source),sceneOutlinePaintOwnerId:proof.id}))return null;
  /** @type {Record<string,unknown>} */const legacyStyle={...record(anchor.style),fill:proof.legacyFill};
  delete legacyStyle.freeformPath;legacyStyle.freeformSegments=readNativeFreeformSegments({freeformPath:proof.legacyPath});
  const b=record(anchor.box),legacyAnchor={...anchor,id:proof.id,box:{x:Number(b.x),y:Number(b.y),w:Number(b.w),h:Number(b.h)},style:legacyStyle};
  const legacy=applySourceOutlinePaint([legacyAnchor],new Map([[proof.id,proof.legacyPaint]])).shapes;
  for(const shape of legacy){
   const row=reviewed.filter(entry=>entry.id===shape.id);if(row.length!==1)return null;
   const current=items.filter(item=>item.id===shape.id);if(current.length!==1)return null;
   const candidate={...shape,style:{...shape.style}};
   if(record(current[0]?.style).freeformPath!==undefined){delete candidate.style.freeformSegments;candidate.style.freeformPath=record(canonicalItem(shape).style).freeformPath;}
   if(fingerprint(candidate)!==row[0]?.fingerprint)return null;
  }
  const prefix=proof.id+'-paint-';
  if(reviewed.some(row=>typeof row.id==='string'&&row.id.startsWith(prefix)&&!legacy.some(shape=>shape.id===row.id)))return null;
  return {memberIds:[proof.id,...proof.children.map(row=>String(row.item.id))],originalMemberIds:legacy.map(shape=>String(shape.id)),
   originalFingerprints:legacy.map(shape=>({id:String(shape.id),fingerprint:String(reviewed.find(row=>row.id===shape.id)?.fingerprint)})),sourceSha256:String(sourceHash)};
 }catch{return null;}
}
module.exports={withSourceMeasuredOutlineScope,captureSourceOutlineAppearance,registerSourceMeasuredOutlineStyle,sourceMeasuredOutlineAncestor,sourceMeasuredOutlineFamily};
