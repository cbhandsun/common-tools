// @ts-check
'use strict';
const {parseBandBackground,insidePolygon}=require('./source-scene-band-geometry');
const {parseSceneNativeGeometry,constructSceneNativeGeometry}=require('./source-scene-native-geometry');
const {observeSceneSourceCage}=require('./source-scene-cage-observation');
const {traceNativeMaskContours}=require('./native-mask-contours');
const {measuredGroupVertices,record,list}=require('./source-scene-group-containment');
const {vectorizeVerifiedLineArtIcon}=require('./sparse-icon-native-contours');
const {createMeasuredScenePortFrame}=require('./source-scene-port-evidence');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
/** @typedef {import('./source-scene-primitive-candidate').Point} Point */
/** @typedef {import('./source-scene-primitive-candidate').Box} Box */
/** @typedef {Omit<ReturnType<typeof vectorizeVerifiedLineArtIcon>[number],'source'> & {source:Record<string,unknown>}} Shape */
/** @typedef {{constructed:number,failure:null,shapes:Shape[],anchorId:string,parentPaint:object,portFrame:object|null,
 * measurement:{box:Box,fill:string,segments:NonNullable<ReturnType<typeof traceNativeMaskContours>>,perimeterPixels:number[]}}} Success */
/** @type {WeakMap<object,{pixels:Uint8Array,width:number,height:number,id:string,members:Success['shapes'],snapshots:(string|null)[]}>} */const receipts=new WeakMap();
/** @param {Success['shapes'][number]} shape */
function snapshot(shape){
 if(!record(shape.source))return null;
 const source=Object.fromEntries(Object.entries(shape.source).filter(([key])=>key!=='nativeComponentGroupId'));
 return sceneGroupSnapshot({...shape,style:{paint:shape.style,source}});
}
/** Require a distinct actual native interior path for every closed source face.
 * A large single path or neighboring face cannot satisfy multiple obligations.
 * @param {Box[]} holes @param {Shape[]} shapes @param {number} sx @param {number} sy */
function completeFaces(holes,shapes,sx,sy){
 const choices=holes.map(hole=>shapes.flatMap((shape,index)=>shape.source.iconPart==='interior-contour'
  &&shape.box.w>=hole.w*sx*.7&&shape.box.h>=hole.h*sy*.55
  &&shape.box.x<(hole.x+hole.w)*sx&&shape.box.y<(hole.y+hole.h)*sy
  &&shape.box.x+shape.box.w>hole.x*sx&&shape.box.y+shape.box.h>hole.y*sy?[index]:[]));
 const assigned=new Map();
 /** @param {number} hole @param {Set<number>} visited @returns {boolean} */
 const assign=(hole,visited)=>{
  for(const shape of choices[hole]??[]){if(visited.has(shape))continue;visited.add(shape);const previous=assigned.get(shape);
   if(previous===undefined||assign(previous,visited)){assigned.set(shape,hole);return true;}
  }return false;
 };
 return holes.every((_,index)=>assign(index,new Set()));
}
/** A complete source-measured alternative to regular cylinder geometry.
 * The declared topology must still match every observed face. No serialized
 * cage/flags/crop can acquire paint, perimeter or grouping capabilities.
 * @param {Parameters<typeof import('./source-scene-primitive-program').compileScenePrimitiveProgram>[0]} input
 * @returns {Success|{constructed:number,failure:string,observedFaces?:number}|null} */
function compileSceneCageProgram(input){
 if(!record(input)||!record(input.object)||!record(input.slideSize))throw new TypeError('Cage program input is invalid');
 const {object,slideSize}=input,geometry=parseSceneNativeGeometry(object.nativeGeometry);
 if(!geometry||geometry.kind!=='cylinder')return null;
 if(object.kind!=='container'||typeof object.id!=='string'||typeof object.regionId!=='string'
  ||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(object.id)||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(object.regionId))
  throw new TypeError('Cage program owner is invalid');
 const {image,budget,textMasks}=parseBandBackground({image:input.image,hint:object.box,textMasks:input.textMasks,budget:input.budget,owners:[]});
 const constructed=constructSceneNativeGeometry(object,{widthPx:image.width,heightPx:image.height,widthPt:slideSize.widthPt,heightPt:slideSize.heightPt});
 if(!constructed)throw new TypeError('Cage program construction is unavailable');
 const count=constructed.shapes.length,observed=observeSceneSourceCage({image,hint:object.box,textMasks,budget,owners:[]});
 if(observed.failure!==null||!observed.cage||!observed.raster)return {constructed:count,failure:observed.failure??'cage-source-isolation'};
 const {cage,raster}=observed;
 if(cage.holes.length!==geometry.seams.length+2)return {constructed:count,failure:'cage-topology-mismatch',observedFaces:cage.holes.length};
 if(textMasks.some(m=>m.x<cage.box.x+cage.box.w&&m.y<cage.box.y+cage.box.h&&m.x+m.w>cage.box.x&&m.y+m.h>cage.box.y))
  return {constructed:count,failure:'cage-source-text'};
 const segments=traceNativeMaskContours(cage.points,cage.box,{outerOnly:true,curveFallback:true}),vertices=segments?measuredGroupVertices({box:cage.box,segments}):null;
 if(!segments||!vertices)return {constructed:count,failure:'cage-source-contour'};
 const b=cage.box,margin=8,width=b.w+16,height=b.h+16;
 if(width>512||height>512)return {constructed:count,failure:'cage-native-capacity'};
 const local={width,height,rgba:Buffer.alloc(width*height*4)};
 for(let yy=b.y;yy<b.y+b.h;yy++)for(let xx=b.x;xx<b.x+b.w;xx++){
  if(!insidePolygon({x:xx+.5,y:yy+.5},vertices))continue;const c=raster.pixel(xx,yy);if(!c)return {constructed:count,failure:'cage-source-alpha'};
  local.rgba.set([...c,255],((yy-b.y+margin)*local.width+xx-b.x+margin)*4);
 }
 const sx=slideSize.widthPt/image.width,sy=slideSize.heightPt/image.height,box={x:(b.x-margin)*sx,y:(b.y-margin)*sy,w:local.width*sx,h:local.height*sy};
 /** @type {Shape[]} */const shapes=vectorizeVerifiedLineArtIcon({image:local,box,idPrefix:'scene-cage-'+object.id,source:{editable:true,nativeRebuild:true,
  semanticNativeStructure:true,nativeComponentRole:'section-panel',detector:'source-scene-cage-program',sceneRegionId:object.regionId,
  ...(object.id!==object.regionId?{sceneInventoryId:object.id}:{}),
  nativeComponentGroupId:'scene-primitive-'+object.id,preserveResidualInterior:true,residualBackgroundFill:true}});
 const anchor=shapes.find(s=>s.source.iconPart==='outline-contour');
 if(!shapes.length||!anchor)return {constructed:count,failure:'cage-native-representation'};
 // Every independently closed face must survive as a native interior path.
 if(!completeFaces(cage.holes,shapes,sx,sy))
  return {constructed:count,failure:'cage-missing-native-face'};
 const fill=shapes.find(s=>s.source.iconPart==='interior-contour')?.style.fill;
 if(typeof fill!=='string')return {constructed:count,failure:'cage-native-paint'};
 const measurement={box:{...b},fill,segments,perimeterPixels:cage.points.map(p=>p.y*image.width+p.x)},token=Object.freeze({});
 receipts.set(token,{pixels:input.image.rgba,width:image.width,height:image.height,id:object.id,members:shapes,snapshots:shapes.map(snapshot)});
 return {constructed:count,failure:null,shapes,measurement,parentPaint:token,anchorId:anchor.id,portFrame:createMeasuredScenePortFrame(input.image,measurement)};
}
/** @param {import('./png').PngImage} image @param {unknown} token @param {string} id
 * @param {import('./source-scene-complete-groups').Item[]} shapes */
function cageSceneParentMembers(image,token,id,shapes){
 const proof=token!==null&&typeof token==='object'?receipts.get(token):undefined;
 if(!proof||!record(image)||!list(shapes)||!shapes.every(record)||proof.pixels!==image.rgba||proof.width!==image.width||proof.height!==image.height||proof.id!==id)return null;
 return proof.members.every((s,i)=>shapes.filter(p=>p===s).length===1&&shapes.filter(p=>p.id===s.id).length===1&&snapshot(s)===proof.snapshots[i])?proof.members.slice():null;
}
/** @param {import('./png').PngImage} image @param {unknown} token @param {string} id
 * @param {import('./source-scene-complete-groups').Item[]} before @param {import('./source-scene-complete-groups').Item[]} after */
function rebindCageSceneParentMembers(image,token,id,before,after){
 const members=cageSceneParentMembers(image,token,id,before),proof=token!==null&&typeof token==='object'?receipts.get(token):undefined;
 if(!members||!proof||!list(after)||!after.every(record)||before.length!==after.length)return false;
 const next=members.map(p=>after[before.indexOf(p)]);
 if(next.some((p,i)=>!p||snapshot(/** @type {Success['shapes'][number]} */(p))!==proof.snapshots[i]
  ||p.source?.nativeComponentGroupId!==members[i]?.source.nativeComponentGroupId&&p.source?.nativeComponentGroupId!=='scene-unit-'+id))return false;
 proof.members=/** @type {Success['shapes']} */(next);return true;
}
module.exports={compileSceneCageProgram,cageSceneParentMembers,rebindCageSceneParentMembers};
