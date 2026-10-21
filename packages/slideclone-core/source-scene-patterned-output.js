// @ts-check
"use strict";
const {patternedSceneFrameGeometry}=require('./source-scene-patterned-frame');
const {record,list}=require('./source-scene-group-containment');
const {sceneFillPaintMeasurement}=require('./source-scene-fill-window');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
/** @typedef {import('./source-scene-complete-groups').Item} Item */
/** @type {WeakMap<object,{pixels:Uint8Array,width:number,height:number,id:string,members:Item[],snapshots:(string|null)[],groups:unknown[]}>} */
const receipts=new WeakMap();
/** @param {Item} item */
function parentSnapshot(item){
 const paint=sceneGroupSnapshot(item);if(paint===null||!record(item.source))return null;
 const source=Object.fromEntries(Object.entries(item.source).filter(([key])=>key!=='nativeComponentGroupId'));
 const metadata=sceneGroupSnapshot({source:{},style:source});return metadata===null?null:paint+metadata;
}
/** Only this source scanner's opaque measurement may emit a native enclosure.
 * Every path contains observed paint; the inferred enclosure is never drawn.
 * @param {{image:import('./png').PngImage,measurement:NonNullable<ReturnType<typeof import('./source-scene-patterned-frame').measurePatternedSceneFrame>>,
 * id:string,regionId:string,inventory:boolean,slideSize:{widthPt:number,heightPt:number},background?:unknown}} input */
function nativePatternedSceneOutput(input){
 if(!record(input)||!record(input.image)||!record(input.slideSize))throw new TypeError('Patterned scene output is invalid');
 const {image,measurement,id,regionId,inventory,slideSize}=input;
 if(!patternedSceneFrameGeometry(measurement,image)||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(id)
  ||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(regionId)||typeof inventory!=='boolean'
  ||![slideSize.widthPt,slideSize.heightPt].every(n=>Number.isFinite(n)&&n>0))throw new TypeError('Patterned scene output is invalid');
 const box={x:measurement.box.x*slideSize.widthPt/image.width,y:measurement.box.y*slideSize.heightPt/image.height,
  w:measurement.box.w*slideSize.widthPt/image.width,h:measurement.box.h*slideSize.heightPt/image.height};
 const background=input.background===undefined?null:sceneFillPaintMeasurement(input.background,image);
 if(input.background!==undefined&&(!background||!background.parts))throw new TypeError('Patterned scene background is not measured');
 const fillParts=background?.parts??[],paint=measurement.paint;
 if(fillParts.length+measurement.parts.length+(paint?.parts.length??0)>32)return null;
 const source={editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:'section-panel-outline',
  detector:'source-scene-outline',sceneRegionId:regionId,nativeComponentGroupId:`scene-pattern-${id}`,residualBackgroundFill:false,
  ...(inventory?{sceneInventoryId:id}:{})};
 const outlines=measurement.parts.map((segments,index)=>({id:`scene-pattern-${id}-part-${index}`,type:'freeform',box:{...box},
  style:{fill:paint?.baseColor??measurement.color,stroke:'none',strokeWidthPt:0,opacity:1,freeformSegments:structuredClone(segments)},
  source:{...source}}));
 const overlays=paint?.parts.map((part,index)=>({id:`scene-pattern-${id}-paint-${index}`,type:'freeform',box:{...box},
  style:{fill:part.color,stroke:'none',strokeWidthPt:0,opacity:1,freeformSegments:part.segments.map(s=>({...s,
   points:s.points.map(p=>({x:(part.box.x+p.x*part.box.w-measurement.box.x)/measurement.box.w,
    y:(part.box.y+p.y*part.box.h-measurement.box.y)/measurement.box.h}))}))},source:{...source}}))??[];
 const backgrounds=fillParts.map((part,index)=>({id:`scene-container-${id}-part-${index}`,type:'freeform',
  box:{x:part.box.x*slideSize.widthPt/image.width,y:part.box.y*slideSize.heightPt/image.height,
   w:part.box.w*slideSize.widthPt/image.width,h:part.box.h*slideSize.heightPt/image.height},
  style:{fill:background?.fill,stroke:'none',strokeWidthPt:0,opacity:1,freeformSegments:structuredClone(part.segments)},
  source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,
   detector:'source-scene-container',sceneRegionId:regionId,nativeComponentRole:'section-panel',
   nativeComponentGroupId:`scene-container-${id}`,residualBackgroundFill:true,preserveResidualInterior:true,
   sourcePerimeterSupport:background?.support,
   ...(background?.glyphOcclusionPixels?{sourcePaintSupport:background.paintSupport,sourceGlyphOcclusionPixels:background.glyphOcclusionPixels}:{}),
   ...(inventory?{sceneInventoryId:id}:{})}}));
 const members=[...backgrounds,...outlines,...overlays];
 receipts.set(members,{pixels:image.rgba,width:image.width,height:image.height,id,members:members.slice(),
  snapshots:members.map(parentSnapshot),groups:members.map(p=>p.source.nativeComponentGroupId)});
 return members;
}
/** Complete parent membership comes from an actual emitted paint receipt,
 * including its preserved background. Serialized IDs never supply members.
 * @param {import('./png').PngImage} image @param {unknown} token @param {string} id @param {Item[]} shapes */
function patternedSceneParentMembers(image,token,id,shapes){
 const proof=token!==null&&typeof token==='object'?receipts.get(token):undefined;
 if(!proof||!record(image)||!list(shapes)||!shapes.every(record)||proof.id!==id
  ||proof.pixels!==image.rgba||proof.width!==image.width||proof.height!==image.height)return null;
 return proof.members.every((p,i)=>shapes.filter(s=>s===p).length===1&&shapes.filter(s=>s.id===p.id).length===1
  &&proof.snapshots[i]!==null&&parentSnapshot(p)===proof.snapshots[i]&&p.source?.nativeComponentGroupId===proof.groups[i])?proof.members.slice():null;
}
/** Only a paint-preserving grouping copy may carry the receipt forward.
 * @param {import('./png').PngImage} image @param {unknown} token @param {string} id @param {Item[]} before @param {Item[]} after */
function rebindPatternedSceneParentMembers(image,token,id,before,after){
 const members=patternedSceneParentMembers(image,token,id,before);
 const proof=token!==null&&typeof token==='object'?receipts.get(token):undefined;
 if(!members||!proof||!list(after)||!after.every(record)||before.length!==after.length)return false;
 const next=members.map(p=>after[before.indexOf(p)]);
 if(next.some((p,i)=>!p||parentSnapshot(p)!==proof.snapshots[i]
  ||p.source?.nativeComponentGroupId!==members[i]?.source?.nativeComponentGroupId&&p.source?.nativeComponentGroupId!==`scene-unit-${id}`))return false;
 proof.members=/** @type {Item[]} */(next);proof.groups=next.map(p=>p?.source?.nativeComponentGroupId);return true;
}
module.exports={nativePatternedSceneOutput,patternedSceneParentMembers,rebindPatternedSceneParentMembers};
