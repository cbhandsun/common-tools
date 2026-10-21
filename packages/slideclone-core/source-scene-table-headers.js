// @ts-check
"use strict";
const {sceneHeaderObjectCapacity}=require('./source-scene-object-batches');
const {types}=require("node:util");
const {withSceneFillRasterCache}=require("./source-scene-fill-raster-cache");
const {hasTabularTextLayout}=require("./source-tabular-text-layout");
const {recoveryId}=require('./source-scene-inventory-materialization');
const {parseScenePaintParts}=require('./source-scene-paint-parts');
const {readNativeFreeformSegments,encodeNativeFreeformPath}=require('./native-freeform-path');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id:string,regionId:string,box:Box}} Header */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value'in p);}
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function list(value,maximum){if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype
 ||value.length>maximum||Reflect.ownKeys(value).length!==value.length+1||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!('value'in p)))
 throw new TypeError('Scene table collection is invalid');return value;}
/** @param {unknown} value @param {number} width @param {number} height @returns {value is Box} */
function box(value,width,height){return record(value)&&[value.x,value.y,value.w,value.h].every(n=>typeof n==='number'&&Number.isFinite(n))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0&&Number(value.x)+Number(value.w)<=width&&Number(value.y)+Number(value.h)<=height;}
/** OCR alignment proposes cell windows only. Each body must still pass the
 * original independent fill/color/connectivity/density/contour measurements.
 * Spend only unused object slots; a table cannot enlarge the 64-object cap.
 * @param {unknown} input @returns {Header[]} */
function proposeSceneTableHeaders(input){
 if(!record(input)||!record(input.slideSize)||![input.widthPx,input.heightPx].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||Number(input.widthPx)*Number(input.heightPx)>40000000||![input.slideSize.widthPt,input.slideSize.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000)
  ||typeof input.capacity!=='number'||!Number.isSafeInteger(input.capacity)||input.capacity<0||input.capacity>64)throw new TypeError('Scene table frame is invalid');
 const width=Number(input.widthPx),height=Number(input.heightPx),widthPt=Number(input.slideSize.widthPt),heightPt=Number(input.slideSize.heightPt);
 const regions=list(input.regions,24).map(r=>{if(!record(r)||typeof r.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(r.id)
  ||typeof r.kind!=='string'||!box(r.box,width,height))throw new TypeError('Scene table region is invalid');return {id:r.id,kind:r.kind,box:{...r.box}};});
 const texts=list(input.textBoxes,10000).map(t=>{
  if(!record(t)||typeof t.text!=='string'||t.text.length>16000||!box(t.box,widthPt,heightPt)
   ||t.source!==undefined&&!record(t.source))throw new TypeError('Scene table text is invalid');
  const raw=record(t.source)&&t.source.evidenceBox!==undefined?t.source.evidenceBox:t.box;
  if(!box(raw,widthPt,heightPt))throw new TypeError('Scene table source text frame is invalid');
  return {visible:!!t.text.trim(),box:{x:raw.x*width/widthPt,y:raw.y*height/heightPt,w:raw.w*width/widthPt,h:raw.h*height/heightPt}};
 });
 /** @type {Header[]} */const headers=[];
 for(const [index,region]of regions.entries()){
  if(!['table','container','card','section'].includes(region.kind)||headers.length===input.capacity)continue;
  // The semantic page root is not a local tabular owner. Reusing its first
  // aligned row would steal headers from the actual enclosing child section.
  if(region.kind==='section'&&region.box.x===0&&region.box.y===0&&region.box.w===width&&region.box.h===height)continue;
  const r=region.box,candidates=texts.filter(t=>t.visible&&t.box.x>=r.x&&t.box.y>=r.y&&t.box.x+t.box.w<=r.x+r.w&&t.box.y+t.box.h<=r.y+r.h)
   .map(t=>t.box).sort((a,b)=>a.y-b.y||a.x-b.x),first=candidates[0];
  if(!first)continue;
  const row=candidates.filter(b=>Math.min(b.y+b.h,first.y+first.h)>Math.max(b.y,first.y)).sort((a,b)=>a.x-b.x);
  // Overlapping columns do not provide an unambiguous physical partition.
  if(row.length<2||row.some((b,i)=>i>0&&b.x<(row[i-1]?.x??0)+(row[i-1]?.w??0)))continue;
  if(region.kind!=='table'&&!hasTabularTextLayout(row,candidates,r))continue;
  for(const [column,b]of row.entries()){
   if(headers.length===input.capacity)break;
   const center=b.x+b.w/2,previous=row[column-1],next=row[column+1];
   const left=previous?(previous.x+previous.w/2+center)/2:next?center-(next.x+next.w/2-center)/2:center;
   const right=next?(center+next.x+next.w/2)/2:previous?center+(center-previous.x-previous.w/2)/2:center;
   const x=Math.max(r.x,left),y=Math.max(r.y,b.y-b.h*.3),w=Math.min(r.x+r.w,right)-x,h=Math.min(r.y+r.h,b.y+b.h*1.3)-y;
   if(w>=12&&h>=12)headers.push({id:`table-header-${index}-${column}`,regionId:region.id,box:{x,y,w,h}});
  }
 }
 return headers;
}
/** @param {Box} a @param {Box} b */
function overlap(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
/** Optional cells run after the original node/relation work. Reserve the whole
 * possible source window and lazy glyph work before any scan; no exception is
 * suppressed and every measurement uses the existing shared 4M ledger.
 * @param {{headers:Header[],image:import('./png').PngImage,budget:{used:number},
 * slideSize:{widthPt:number,heightPt:number},shapes:{id?:string,type?:string,box:Box,style?:Record<string,unknown>,source?:Record<string,unknown>}[],
 * measure:(hint:Box)=>ReturnType<typeof import('./source-scene-container').measureSceneContainer>,
 * glyphReserve:(window:Box)=>number,inventory?:boolean,isMeasuredBodyRepresented?:(header:Header)=>boolean}} input */
function appendSceneTableHeaderBackgrounds({headers,image,budget,slideSize,shapes,measure,glyphReserve,inventory=false,isMeasuredBodyRepresented}){
 if(isMeasuredBodyRepresented!==undefined&&typeof isMeasuredBodyRepresented!=='function')throw new TypeError('Scene table identity policy is invalid');
 let accepted=0,skippedBudget=0;
 /** @type {import('./source-scene-inventory-materialization').Recovery[]} */const inventoryUnits=[];
 for(const header of headers){
  const hint=header.box,margin=Math.ceil(Math.min(64,Math.max(8,Math.min(hint.w,hint.h)*.2)));
  const mx=Math.max(margin,Math.ceil(Math.min(64,hint.w*.175))),my=Math.max(margin,Math.ceil(Math.min(64,hint.h*.3)));
  const x=Math.max(0,Math.floor(hint.x-mx)),y=Math.max(0,Math.floor(hint.y-my));
  const window={x,y,w:Math.min(image.width,Math.ceil(hint.x+hint.w+mx))-x,h:Math.min(image.height,Math.ceil(hint.y+hint.h+my))-y};
  const area=window.w*window.h;
  if(area>262144||budget.used+area+2308+glyphReserve(window)>4000000){skippedBudget++;continue;}
  const fit=withSceneFillRasterCache(image,budget,()=>measure(hint));if(!fit)continue;
  // Independently observed seed colors can differ for the SAME physical body.
  // Only the compiler's private source-cell identity and surviving receipts
  // can suppress recovery. No source flag, box overlap or color grants it.
  if(isMeasuredBodyRepresented?.(header))continue;
  const box={x:fit.box.x*slideSize.widthPt/image.width,y:fit.box.y*slideSize.heightPt/image.height,
   w:fit.box.w*slideSize.widthPt/image.width,h:fit.box.h*slideSize.heightPt/image.height};
  // A fragmented fit has a union frame but no single drawable rectangle.
  // Validate all parts before mutation and keep the original source gaps.
  const fragmented=fit.parts!==undefined;
  const parts=fragmented?parseScenePaintParts(fit,image):[{box:fit.box,segments:fit.segments}];
  const nativeParts=parts.map(part=>({box:{x:part.box.x*slideSize.widthPt/image.width,y:part.box.y*slideSize.heightPt/image.height,
   w:part.box.w*slideSize.widthPt/image.width,h:part.box.h*slideSize.heightPt/image.height},segments:part.segments}));
  // Bounding overlap can skip an already represented single body; fragmented
  // paint requires every actual contour, rather than a coincident union box.
  if(fragmented?nativeParts.every(part=>shapes.some(s=>s.type==='freeform'&&s.style?.fill===fit.fill
   &&s.box.x===part.box.x&&s.box.y===part.box.y&&s.box.w===part.box.w&&s.box.h===part.box.h
   &&encodeNativeFreeformPath(readNativeFreeformSegments(s.style))===encodeNativeFreeformPath(part.segments)))
   :shapes.some(s=>s.style?.fill===fit.fill&&overlap(s.box,box)>=Math.max(s.box.w*s.box.h,box.w*box.h)*.85))continue;
  const key=`scene-${header.id}`;
  const members=nativeParts.map((part,index)=>({id:nativeParts.length===1?key:`${key}-part-${index}`,type:part.segments?'freeform':'rect',box:part.box,
   style:{fill:fit.fill,stroke:'none',strokeWidthPt:0,opacity:1,...(part.segments?{freeformSegments:part.segments}:{})},
   source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:'section-panel',detector:'source-scene-container',
    sceneRegionId:header.regionId,residualBackgroundFill:true,preserveResidualInterior:true,sourcePerimeterSupport:fit.support,
    ...(fragmented?{nativeComponentGroupId:key}:{})}}));
  shapes.push(...members);
  accepted++;
  if(inventory)inventoryUnits.push({id:recoveryId('table-header',key),key,origin:'table-header',
   kind:'container',regionId:header.regionId,members:members.map(s=>({type:'shape',id:s.id}))});
 }
 return {accepted,skippedBudget,...(inventory?{inventoryUnits}:{})};
}
module.exports={proposeSceneTableHeaders,appendSceneTableHeaderBackgrounds,sceneHeaderObjectCapacity};
