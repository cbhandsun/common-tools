// @ts-check
"use strict";
const path=require("node:path");
const {readPng}=require("../png");
const {vectorizeDensePictorialIcon}=require("../archetypes/pictorial-icon-native-vectorization");
const {vectorizeVerifiedLineArtIcon}=require("../archetypes/sparse-icon-native-contours");
const {measureSceneIconDetailed,measureSceneNativeIconDetailed,materializeSceneIconDetailed,measureScenePictorialCropDetailed,materializeScenePictorialCropDetailed}=require('./source-scene-icon');
const {sceneParametricBackdropGeometry}=require('./source-scene-parametric-surface');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
const {record,list}=require('./source-scene-group-containment');
const {sourceIconPaletteShapes}=require('./source-icon-palette');
const {sourceIconPaintError}=require('./source-icon-paint-error');
const {encodeNativeFreeformPath}=require('./native-freeform-path');
const {createSceneInkPort}=require('./source-scene-ink-port');
const {createSceneIconPartPorts,sceneIconPartEndpoint,sceneIconPartNodes}=require('./source-scene-icon-part-ports');
const {createSceneIconRelationNodes:createRelationNodes}=require('./source-scene-icon-relation-nodes');
const {sceneIconSearchWindow}=require('./source-scene-icon-window');
/** Retry one clipped observation with a larger geometric search frame. The
 * seed, original pixels, text ownership and cumulative scan budget stay fixed.
 * Explicit caller frames remain hard bounds; a source-edge clip still fails.
 * @param {Parameters<typeof measureSceneIconDetailed>[0]} request
 * @param {typeof measureSceneIconDetailed} measure */
function measureCompleteIcon(request,measure){
 const detail=measure(request);
 if(detail.reason!=='icon-source-clipped-component'||request.searchBox!==undefined)return detail;
 const {image,box}=request,padding=2*Math.max(2,Math.ceil(Math.min(box.w,box.h)*.35));
 const x=Math.max(0,Math.floor(box.x-padding)),y=Math.max(0,Math.floor(box.y-padding));
 const frame={x,y,w:Math.min(image.width,Math.ceil(box.x+box.w+padding))-x,h:Math.min(image.height,Math.ceil(box.y+box.h+padding))-y};
 const original=sceneIconSearchWindow(image,box,undefined);
 if(frame.w*frame.h>262144||frame.x===original.x&&frame.y===original.y&&frame.w===original.w&&frame.h===original.h)return detail;
 return measure({...request,searchBox:frame});
}
/** @typedef {{id:string,regionId:string,parentObjectId:string,box:import('./source-scene-plan').Box,parts:ReturnType<typeof nativeSceneIconShapes>}} NativeBinding */
/** Only this measured compiler stage mints a native-icon membership receipt.
 * @type {WeakMap<object,{pixels:Uint8Array,width:number,height:number,binding:NativeBinding,snapshots:(string|null)[],partPorts?:object,node?:{id:string,box:import('./source-scene-plan').Box,portFrame:object}}>} */
const nativeBindings=new WeakMap();
/** Crop receipts authorize grouping only; they never authorize native ports,
 * raster erasure or editable-picture claims.
 * @type {WeakMap<object,{pixels:Uint8Array,width:number,height:number,id:string,regionId:string,parentObjectId:string,
 * icon:NonNullable<ReturnType<typeof measureSceneIconDetailed>['measurement']>['icon'],snapshot:string|null}>} */
const cropBindings=new WeakMap();
/** Compare the actual bounded transport tree, rather than shape count alone.
 * A local color improvement must not consume additional page structure. Both
 * representations retain their independent 32-part / 120-command limits.
 * @param {unknown} value @returns {number} */
function iconTransportNodes(value){
 if(!value||typeof value!=='object')return 1;
 return 1+Object.entries(value).reduce((sum,[key,child])=>sum+(key==='freeformSegments'
  ?(encodeNativeFreeformPath(child),1):iconTransportNodes(child)),0);
}
/** An independently isolated pictorial child becomes actual native paths.
 * Source isolation has already charged this crop to the compiler budget.
 * A failed vectorization returns no shapes, never an editable raster claim.
 * @param {NonNullable<ReturnType<typeof import('./source-scene-icon').materializeSceneIcon>>} icon
 * @param {string} root @param {string} parentObjectId @param {import('../png').PngImage} [measuredImage] @param {boolean} [relationEndpoint]
 * @param {boolean} [preserveStructureBudget] */
function nativeSceneIconShapes(icon,root,parentObjectId,measuredImage,relationEndpoint=false,preserveStructureBudget=false){
 if(typeof relationEndpoint!=='boolean'||typeof preserveStructureBudget!=='boolean')throw new TypeError('Scene icon endpoint control is invalid');
 const image=measuredImage??readPng(path.join(root,icon.assetPath),{maxFileBytes:12*1024*1024,maxPixels:262144});
 let shapes=vectorizeDensePictorialIcon({image,box:icon.box,idPrefix:icon.id});
 // Density is a representation choice after source isolation. Sparse strokes
 // retain their holes under the existing bounded line-art representation.
 // Keep dense successes exact; crops outside the line-art size cap still fail.
 if(!shapes.length&&image.width<=512&&image.height<=512)shapes=vectorizeVerifiedLineArtIcon({image,box:icon.box,idPrefix:icon.id,
  source:{editable:true,nativeRebuild:true,detector:'source-scene-line-art-native',nativeComponentRole:'pictorial',
   semanticPictorialNative:true,pictorialVectorized:true}});
 if(shapes.length){
  const palette=sourceIconPaletteShapes(image,icon.box,icon.id);
  if(palette.length&&(!preserveStructureBudget||iconTransportNodes(palette)<=iconTransportNodes(shapes))){
   const before=sourceIconPaintError(image,icon.box,shapes),after=sourceIconPaintError(image,icon.box,palette);
   if(before&&after&&(after.error<before.error||relationEndpoint&&after.error===before.error&&palette.length<shapes.length)
    &&after.missing<=before.missing&&after.extra<=before.extra)shapes=palette;
  }
 }
 for(const shape of shapes)shape.source={...shape.source,sceneRegionId:icon.source.sceneRegionId,sceneParentObjectId:parentObjectId};
 return shapes;
}
/** Keep icon source measurement and its requested representation in one stage.
 * Preflight measures without writing an asset; a failed native representation
 * retains its rejection rather than falling back to a raster claim.
 * @param {Parameters<typeof materializeSceneIconDetailed>[0]} request
 * @param {{preflight:boolean,nativePictorial:boolean,parentObjectId:string,relationEndpoint?:boolean,preferSourceCrop?:boolean,preserveStructureBudget?:boolean,boundaryPartition?:unknown,recoverSource?:()=>{glyphOcclusion?:unknown,backdrop?:unknown}}} options
 * @returns {{icon:NonNullable<ReturnType<typeof measureSceneIconDetailed>['measurement']>['icon']|null,shapes:ReturnType<typeof nativeSceneIconShapes>,failure:string|null,detailCode?:string}} */
function compileSceneIcon(request,{preflight,nativePictorial,parentObjectId,relationEndpoint=false,preferSourceCrop=false,preserveStructureBudget=true,recoverSource,boundaryPartition}){
 if(typeof relationEndpoint!=='boolean'||typeof preferSourceCrop!=='boolean'||typeof preserveStructureBudget!=='boolean')throw new TypeError('Scene icon endpoint control is invalid');
 if(boundaryPartition!==undefined)request={...request,boundaryPartition};
 // Source-isolated pictorial assets may stay at their original pixel resolution.
 // A relation endpoint still requires native attachment geometry. Neither this
 // preference nor a failed crop can bypass the existing source/text admission.
 if(preferSourceCrop&&!relationEndpoint){
  const crop=measureCompleteIcon(request,preflight?measureScenePictorialCropDetailed:materializeScenePictorialCropDetailed);
  if(crop.measurement){
   const icon=crop.measurement.icon,result={icon,shapes:/** @type {ReturnType<typeof nativeSceneIconShapes>} */([]),failure:/** @type {null} */(null)};
   cropBindings.set(result,{pixels:request.image.rgba,width:request.image.width,height:request.image.height,
    id:request.id,regionId:request.regionId,parentObjectId,icon,snapshot:sceneGroupSnapshot(icon)});
   return result;
  }
 }
 let detail=measureCompleteIcon(request,nativePictorial?measureSceneNativeIconDetailed:preflight?measureSceneIconDetailed:materializeSceneIconDetailed);
 /** @type {{glyphOcclusion?:unknown,backdrop?:unknown}|undefined} */let controls;
 if(!detail.measurement&&!preflight&&recoverSource&&['icon-source-text','icon-source-clipped-component','icon-source-fringe-boundary'].includes(detail.reason)){
  controls=recoverSource();detail=measureCompleteIcon({...request,...controls},measureSceneNativeIconDetailed);
 }
 const measured=detail.measurement,icon=measured?.icon;
 if(!icon)return {icon:null,shapes:[],failure:'icon-isolation',detailCode:detail.reason};
 if(!nativePictorial&&!controls)return {icon,shapes:[],failure:null};
 // Ordinary palette refinement keeps its baseline cost. A source-proven glyph
 // may require a fuller representation; the 32-part/120-command and final page
 // ceilings still apply, followed by independent rendered glyph verification.
 const shapes=nativeSceneIconShapes(icon,request.root,parentObjectId,measured?.image,relationEndpoint,preserveStructureBudget);
 if(controls)for(const shape of shapes)shape.source={...shape.source,nativeComponentGroupId:`scene-icon-${request.id}`};
 const backdrop=controls?.backdrop===undefined?null:sceneParametricBackdropGeometry(controls.backdrop,request.image,request.budget??{used:0});
 // Recover a full native pictorial unit and its source-proven body together.
 // A failed vectorization never publishes the body alone or an editable raster.
 if(shapes.length&&backdrop){
  if(shapes.length+1>32)return {icon:null,shapes:[],failure:'icon-native-representation'};
  const b=backdrop.box,{image,slideSize}=request;
  shapes.unshift({id:`scene-icon-backdrop-${request.id}`,type:backdrop.segments?'freeform':'rect',box:{x:b.x*slideSize.widthPt/image.width,y:b.y*slideSize.heightPt/image.height,
   w:b.w*slideSize.widthPt/image.width,h:b.h*slideSize.heightPt/image.height},
   style:{fill:backdrop.fill,stroke:'none',strokeWidthPt:0,opacity:1,...(backdrop.gradient?{gradient:backdrop.gradient}:{}),...(backdrop.segments?{freeformSegments:backdrop.segments}:{})},
   source:{editable:true,nativeRebuild:true,detector:'source-scene-icon-backdrop',nativeComponentRole:'section-panel',
    sceneRegionId:request.regionId,sceneParentObjectId:parentObjectId,nativeComponentGroupId:`scene-icon-${request.id}`,
    residualBackgroundFill:true,preserveResidualInterior:true}});
 }
 if(!shapes.length)return {icon:null,shapes:[],failure:'icon-native-representation'};
 const result={icon,shapes,failure:/** @type {null} */(null)};
 // One actual shape must carry the WHOLE pictorial unit. Multi-part pictures
 // need a verified group endpoint; never attach the whole icon to one patch.
 const part=shapes.length===1?shapes[0]:undefined;
 const b=part?.box,sx=request.image.width/request.slideSize.widthPt,sy=request.image.height/request.slideSize.heightPt;
 // Native points came from this source grid. Canonicalize only binary ULPs
 // around integral edges; a genuinely fractional envelope is never enlarged.
 /** @param {number} n @param {number} scale @param {number} limit */
 const pixelEdge=(n,scale,limit)=>{const value=n*scale,nearest=Math.round(value);return Math.abs(value-nearest)<=4*Number.EPSILON*limit?nearest:value;};
 const x=b?pixelEdge(b.x,sx,request.image.width):0,y=b?pixelEdge(b.y,sy,request.image.height):0;
 const box=b?{x,y,w:pixelEdge(b.x+b.w,sx,request.image.width)-x,h:pixelEdge(b.y+b.h,sy,request.image.height)-y}:undefined;
 const portFrame=box&&measured?createSceneInkPort(request.image,measured.image,measured.pixelBox,box):null;
 const partPorts=relationEndpoint&&shapes.length>1&&measured&&!backdrop
  ?createSceneIconPartPorts(request.image,measured.image,measured.pixelBox,icon.box,shapes,request.slideSize):null;
 nativeBindings.set(result,{pixels:request.image.rgba,width:request.image.width,height:request.image.height,
  binding:{id:request.id,regionId:request.regionId,parentObjectId,box:{...icon.box},parts:shapes.slice()},snapshots:shapes.map(sceneGroupSnapshot),
  ...(part&&box&&portFrame?{node:{id:part.id,box,portFrame}}:{}),...(partPorts?{partPorts}:{})});
 return result;
}
/** Serialized, copied and cross-source output cannot grant group membership.
 * @param {import('../png').PngImage} image @param {unknown} result */
function sceneNativeIconBinding(image,result){
 const receipt=result!==null&&typeof result==='object'?nativeBindings.get(result):undefined;
 return receipt&&record(image)&&receipt.pixels===image.rgba&&receipt.width===image.width&&receipt.height===image.height
  &&receipt.snapshots.every((snapshot,i)=>snapshot!==null&&sceneGroupSnapshot(receipt.binding.parts[i])===snapshot)
  ?{...receipt.binding,box:{...receipt.binding.box},parts:receipt.binding.parts.slice()}:null;
}
/** Resolve unchanged isolated pictures for complete-card grouping only.
 * @param {import('../png').PngImage} image @param {unknown} result */
function sceneGroupIconBinding(image,result){
 const native=sceneNativeIconBinding(image,result);if(native)return {...native,picture:false};
 const receipt=result!==null&&typeof result==='object'?cropBindings.get(result):undefined;
 if(!receipt||!record(image)||receipt.pixels!==image.rgba||receipt.width!==image.width||receipt.height!==image.height
  ||!record(result)||result.icon!==receipt.icon||!list(result.shapes)||result.shapes.length!==0
  ||!receipt.parentObjectId||receipt.snapshot===null||sceneGroupSnapshot(receipt.icon)!==receipt.snapshot)return null;
 return {id:receipt.id,regionId:receipt.regionId,parentObjectId:receipt.parentObjectId,box:{...receipt.icon.box},parts:[receipt.icon],picture:true};
}
/** Only the unchanged complete compiler output can nominate a native endpoint.
 * @param {import('../png').PngImage} image @param {unknown} result */
function sceneNativeIconNode(image,result){
 if(!sceneNativeIconBinding(image,result))return null;
 const receipt=result!==null&&typeof result==='object'?nativeBindings.get(result):undefined,node=receipt?.node;
 if(!receipt||receipt.binding.parentObjectId||!record(result)||!list(result.shapes)||result.shapes.length!==receipt.binding.parts.length
  ||result.shapes.some((part,i)=>part!==receipt.binding.parts[i]))return null;
 return node?{...node,box:{...node.box}}:null;
}
/** Resolve a multi-part unit to its actually contacted native member. The
 * complete unchanged receipt is required on every use, not only creation.
 * @param {import('../png').PngImage} image @param {unknown} result
 * @param {number} axis @param {string} side */
function sceneNativeIconEndpoint(image,result,axis,side){
 if(!Number.isFinite(axis)||!['left','right','top','bottom'].includes(side))return null;
 const single=sceneNativeIconNode(image,result);if(single)return single;
 if(!sceneNativeIconBinding(image,result)||!record(result)||!list(result.shapes))return null;
 const receipt=nativeBindings.get(result);
 if(!receipt||receipt.binding.parentObjectId||result.shapes.length!==receipt.binding.parts.length
  ||result.shapes.some((part,i)=>part!==receipt.binding.parts[i]))return null;
 return sceneIconPartEndpoint(image,receipt.partPorts,axis,side);
}
/** Keep the private membership checks at this module's composition boundary.
 * @param {Omit<Parameters<typeof createRelationNodes>[0],'binding'|'endpoint'>} input */
function createSceneIconRelationNodes(input){return createRelationNodes({...input,binding:sceneNativeIconBinding,endpoint:sceneNativeIconEndpoint});}
/** @param {import('../png').PngImage} image @param {unknown} result */
function sceneNativeIconNodes(image,result){
 const single=sceneNativeIconNode(image,result);if(single)return [single];
 if(!sceneNativeIconBinding(image,result)||!record(result)||!list(result.shapes))return [];
 const receipt=nativeBindings.get(result);
 if(!receipt||receipt.binding.parentObjectId||result.shapes.length!==receipt.binding.parts.length
  ||result.shapes.some((part,i)=>part!==receipt.binding.parts[i]))return [];
 return sceneIconPartNodes(image,receipt.partPorts);
}
module.exports={nativeSceneIconShapes,compileSceneIcon,sceneNativeIconBinding,sceneGroupIconBinding,sceneNativeIconNode,sceneNativeIconEndpoint,sceneNativeIconNodes,createSceneIconRelationNodes};
