// @ts-check
"use strict";
const {selectSceneInteriorTargets}=require('./source-scene-interior-targets');
const {measureSceneInterior}=require('./source-scene-interior-measurement');
const {sceneIconSearchWindow}=require('./source-scene-icon-window');
const {sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {vectorizeDensePictorialIcon}=require('../archetypes/pictorial-icon-native-vectorization');
const {vectorizeVerifiedLineArtIcon}=require('../archetypes/sparse-icon-native-contours');
const {recoveryId}=require('./source-scene-inventory-materialization');
const {sourceSceneTextBoxes}=require('./source-scene-text-frame');
const {patternedSceneParentMembers}=require('./source-scene-patterned-output');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id?:string,box:Box,source?:Record<string,unknown>,style?:Record<string,unknown>,type?:string}} Item */
/** @typedef {{parentId:string,parts:Item[],box:Box}} InteriorBinding */
/** Compilation receipts authorize only the actual emitted object references,
 * bound to this raster. Serialized source fields cannot grant membership.
 * @type {WeakMap<object,{pixels:Uint8Array,width:number,height:number,groups:InteriorBinding[]}>} */
const assemblies=new WeakMap();
/** @param {Box} a @param {Box} b */
function overlap(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
/** @param {unknown} color */
function chromatic(color){if(typeof color!=='string'||!/^#[0-9a-f]{6}$/iu.test(color))return false;
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));return Math.max(...rgb)-Math.min(...rgb)>=18;}
/** Compile source-isolated internal paint as bounded parts of an existing
 * object. Do not add scene objects, erase old paint, register ports, or remove
 * a parent's failed perimeter evidence. Ordinary compilation has priority.
 * @param {{image:import('../png').PngImage,plan:import('./source-scene-plan').ScenePlan,
 * root:string,slideSize:{widthPt:number,heightPt:number},textBoxes:({text:string}&Item)[],
 * shapes:Item[],images:Item[],budget:{used:number},capacity:number,representedParents?:string[],
 * physicalNodes?:{proposalId:string,node:{parentPaint?:unknown}}[],
 * recoverInteriorSource?:(seed:Box,parent:Box)=>{glyphOcclusion?:unknown,backdrop?:unknown}}} request */
function compileSceneInteriorParts({image,plan,root,slideSize,textBoxes,shapes,images,budget,capacity,representedParents=[],physicalNodes=[],recoverInteriorSource}){
 if(recoverInteriorSource!==undefined&&typeof recoverInteriorSource!=='function')throw new TypeError('Scene interior source recovery is invalid');
 const sourceTexts=sourceSceneTextBoxes(textBoxes,image,slideSize);
 const texts=sourceTexts.map(t=>({x:t.box.x*image.width/slideSize.widthPt,y:t.box.y*image.height/slideSize.heightPt,
  w:t.box.w*image.width/slideSize.widthPt,h:t.box.h*image.height/slideSize.heightPt}));
 const sourceDriven=recoverInteriorSource!==undefined;
 const targets=selectSceneInteriorTargets(plan,texts,capacity,representedParents,sourceDriven);
 const legacy=sourceDriven?selectSceneInteriorTargets(plan,texts,32,representedParents):[];
 /** @type {Item[]} */const parts=[];
 /** @type {import('./source-scene-inventory-materialization').Recovery[]} */const inventoryUnits=[];
 /** @type {InteriorBinding[]} */const groups=[];
 const evidence={interiorTargets:targets.length,interiorGroups:0,interiorParts:0,interiorSkippedBudget:0,
  interiorRejected:/** @type {{id:string,reason:string}[]} */([])};
 for(const {parent,seed} of targets){
  const decline=(/** @type {string} */reason)=>evidence.interiorRejected.push({id:parent.id,reason});
  const x=Math.floor(parent.box.x),y=Math.floor(parent.box.y),w=Math.ceil(parent.box.x+parent.box.w)-x,h=Math.ceil(parent.box.y+parent.box.h)-y;
  if(w*h>262144){evidence.interiorSkippedBudget++;continue;}
  const searchBox=sceneIconSearchWindow(image,seed,{x,y,w,h});
  // Earlier region measurements may already own every source byte. Reserve
  // only unread cells; the scanner still rechecks and debits the shared cap.
  if(budget.used+w*h>4000000&&budget.used+sceneFillRasterReadCost(image,searchBox,budget)>4000000){evidence.interiorSkippedBudget++;continue;}
  const legacySeed=legacy.slice().reverse().find(t=>t.parent.id===parent.id)?.seed;
  const measured=measureSceneInterior({image,box:seed,searchBox,id:parent.id,regionId:parent.regionId,root,slideSize,textBoxes,budget},
   {textMasks:texts,sourceDriven:sourceDriven&&parent.pictorialContent==='present',...(legacySeed?{legacySeed}:{}),
    ...(recoverInteriorSource?{recoverSource:recoverInteriorSource}:{})});
  if(!measured){decline('source-isolation');continue;}
  const {box}=measured.icon;
  const existing=[...images,...parts,...shapes.filter(s=>s.source?.semanticPictorialNative===true||s.source?.pictorialVectorized===true||s.source?.sceneInteriorParentId!==undefined)];
  if(existing.some(s=>overlap(s.box,box)>=Math.min(s.box.w*s.box.h,box.w*box.h)*.85)){decline('existing-pictorial');continue;}
  const prefix=`scene-interior-${parent.id}`;
  if(shapes.some(s=>s.id===prefix||s.id?.startsWith(prefix+'-'))){decline('existing-identity');continue;}
  const dense=vectorizeDensePictorialIcon({image:measured.image,box,idPrefix:prefix});
  const found=dense.length?dense:measured.image.width<=512&&measured.image.height<=512
   ?vectorizeVerifiedLineArtIcon({image:measured.image,box,idPrefix:prefix}):[];
  if(!found.length){decline('native-representation');continue;}
  // Monochrome dots and unrecognized punctuation are not pictorial evidence.
  if(!found.some(s=>chromatic(s.style.fill))){decline('non-pictorial-paint');continue;}
  const node=physicalNodes.find(p=>p.proposalId===parent.id)?.node;
  const measuredParent=node?.parentPaint===undefined?null:patternedSceneParentMembers(image,node.parentPaint,parent.id,shapes);
  if(node?.parentPaint!==undefined&&!measuredParent){decline('parent-membership');continue;}
  const parentParts=measuredParent?.length??shapes.filter(s=>s.id===`scene-container-${parent.id}`||s.id===`scene-outline-${parent.id}`
   ||s.id?.startsWith(`scene-container-${parent.id}-part-`)||s.source?.sceneInteriorParentId===parent.id
   ||s.source?.sceneOutlinePaintOwnerId===`scene-container-${parent.id}`||s.source?.sceneOutlinePaintOwnerId===`scene-outline-${parent.id}`).length;
  if(found.length+parentParts>32||found.some(s=>!Array.isArray(s.style.freeformSegments)||s.style.freeformSegments.length>120)){decline('parent-parts-budget');continue;}
  const start=parts.length;
  for(const s of found)parts.push({...s,source:{...s.source,editable:true,nativeRebuild:true,semanticPictorialNative:true,
   nativeComponentRole:'pictorial',detector:'source-scene-interior',sceneRegionId:parent.regionId,sceneInteriorParentId:parent.id,
   sourceIconBox:{...box},nativeComponentGroupId:prefix}});
  groups.push({parentId:parent.id,parts:parts.slice(start),box:{...box}});
  if(plan.observedInventory)inventoryUnits.push({id:recoveryId('interior',prefix),key:prefix,origin:'interior',kind:'icon',
   regionId:parent.regionId,parentObjectId:parent.id,members:found.map(s=>({type:'shape',id:s.id}))});
  evidence.interiorGroups++;evidence.interiorParts+=found.length;
 }
 const result={parts,evidence,...(plan.observedInventory?{inventoryUnits}:{})};
 assemblies.set(result,{pixels:image.rgba,width:image.width,height:image.height,groups});
 return result;
}
/** No copied/provider receipt or cross-source compilation grants membership.
 * @param {import('../png').PngImage} image @param {unknown} result */
function sceneInteriorBindings(image,result){
 const receipt=result!==null&&typeof result==='object'?assemblies.get(result):undefined;
 return receipt&&receipt.pixels===image.rgba&&receipt.width===image.width&&receipt.height===image.height
  ?receipt.groups.map(g=>({...g,box:{...g.box},parts:g.parts.slice()})):[];
}
module.exports={compileSceneInteriorParts,sceneInteriorBindings};
