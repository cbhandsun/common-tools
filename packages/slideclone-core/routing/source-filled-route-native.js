// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {measuredSourceRouteGroupContext}=require('../scene-plan/source-scene-route');
const {sharedOutputWork,chargeSharedOutput,sharedRouteOutputSnapshot}=require('./source-shared-route-output-snapshot');
const {sourceRoutePolyline}=require('./source-route-polyline');
const {fitWholeRouteNativeConnector}=require('./whole-route-native-connector');
const {readNativeFreeformSegments,encodeNativeFreeformPath}=require('../scene-plan/native-freeform-path');
/** @typedef {import('./source-shared-route-output-paint').Item} Item */
/** @typedef {{fit:object,parts:Item[],snapshots:string[],template:Item,slideSize:{widthPt:number,heightPt:number},nodes:{id:string,box:import('../scene-plan/source-scene-plan').Box}[]}} Entry */
/** A compiler-local alternative for one COMPLETE measured filled relation.
 * It grants output geometry only, never source paint, erasure or grouping.
 * Original parts remain available until all source consumers have finished. */
/** @type {WeakMap<object,Entry>} */const outputs=new WeakMap();
/** @type {WeakMap<object,{entries:Entry[],sourceHash:unknown}>} */const receipts=new WeakMap();
/** @typedef {{parts:Item[],template:Item}} Candidate */
/** @type {WeakMap<object,{input:Record<string,unknown>,entry:Entry,hash:string,parts:Item[]}>} */const candidates=new WeakMap();
/** @type {WeakMap<object,{group:Candidate,hash:string}>} */const selections=new WeakMap();
const invalid=()=>new TypeError('Filled native route binding is invalid');
/** Rendering and relation identity survive portable provenance compaction.
 * @param {Item} part @param {{checks:number}} work */
function snapshot(part,work){
 if(!record(part)||!record(part.source)||!record(part.style))return null;
 const drawing={...part,source:{
  sceneRelationId:part.source.sceneRelationId,sceneInventoryId:part.source.sceneInventoryId,
  sceneRegionId:part.source.sceneRegionId,sourceNodeIds:part.source.sourceNodeIds}};
 // Validate and reserve the entire original drawing before decoding or copying
 // geometry. Only the reversible transport form may differ across consumers.
 const original=sharedRouteOutputSnapshot(drawing,work);if(original===null)return null;
 if(part.style.freeformPath===undefined&&part.style.freeformSegments===undefined)return original;
 let path;
 try{path=encodeNativeFreeformPath(readNativeFreeformSegments(part.style));}
 catch(error){if(error instanceof TypeError)return null;throw error;}
 const style={...part.style};delete style.freeformSegments;delete style.freeformPath;
 return sharedRouteOutputSnapshot({...drawing,style:{...style,freeformPath:path}},work);
}
/** Called only by the measured filled compiler, before its source output can
 * be copied/compacted. The template uses the COMPLETE private measured path.
 * @param {Parameters<typeof import('./source-filled-route-compiler').compileFilledSourceRoute>[0]} request
 * @param {Item[]} parts */
function captureFilledNativeRoute(request,parts){
 const {fit,relation,fromId,toId,slideSize}=request,context=measuredSourceRouteGroupContext(fit);
 if(!context||!fit.filledBody||parts.length<2||parts.length>32)return;
 const work={checks:context.checks},sx=slideSize.widthPt/context.widthPx,sy=slideSize.heightPt/context.heightPx;
 const path=sourceRoutePolyline({points:fit.points,sx,sy});if(!path)return;
 const first=parts[0];if(!first?.source)return;
 const starts=parts.filter(p=>p.style?.startAnchor&&record(p.style.startAnchor)&&p.style.startAnchor.elementId===fromId);
 const ends=parts.filter(p=>p.style?.endAnchor&&record(p.style.endAnchor)&&p.style.endAnchor.elementId===toId);
 if(starts.length!==1||ends.length!==1)return;
 /** @type {Record<string,unknown>} */const source={...first.source,nativeFilledRoute:true,sourceRouteParts:1,sourceFootprintVerified:false,sourceErasure:false};
 delete source.sourceRouteBodyIndex;delete source.nativeComponentGroupId;
 /** @type {Item} */const template={id:`scene-${relation.id}`,type:'freeform',box:path.box,source,
  style:{...path.style,fill:'none',stroke:fit.color,strokeWidthPt:fit.widthPx*(sx+sy)/2,lineCap:'round',
   startAnchor:starts[0]?.style?.startAnchor,endAnchor:ends[0]?.style?.endAnchor,
   ...(['backward','both'].includes(relation.direction)?{startArrow:'triangle',startArrowWidth:'medium',startArrowLength:'medium'}:{}),
   ...(['forward','both'].includes(relation.direction)?{endArrow:'triangle',endArrowWidth:'medium',endArrowLength:'medium'}:{})}};
 const snapshots=parts.map(p=>snapshot(p,work));if(snapshots.some(s=>s===null)||!snapshot(template,work))return;
 const entry={fit,parts:parts.slice(),snapshots:/** @type {string[]} */(snapshots),template,slideSize:{...slideSize},
  nodes:context.nodes.map(n=>({id:n.id,box:{x:n.box.x*sx,y:n.box.y*sy,w:n.box.w*sx,h:n.box.h*sy}}))};
 for(const part of parts)outputs.set(part,entry);
}
/** @param {unknown} page */
function sealFilledNativeRoutes(page){
 if(!record(page)||!list(page.shapes)||page.shapes.length>10000||!page.shapes.every(record))throw invalid();
 const entries=[...new Set(page.shapes.flatMap(p=>{const entry=outputs.get(p);return entry?[entry]:[];}))];
 const sourceHash=record(page.source)&&record(page.source.sourceScene)?page.source.sourceScene.sourceHash:undefined;
 const token=Object.freeze(Object.create(null));receipts.set(token,{entries,sourceHash});return token;
}
/** No detached census or fabricated path can nominate a replacement. Every
 * original drawing, external node and outside reference is checked together.
 * @param {unknown} input @returns {{status:'absent'|'invalid'|'verified',reason?:string,groups:{parts:Item[],template:Item}[]}} */
function readFilledNativeRoutes(input){
 if(!record(input)||!record(input.page)||!record(input.slideSize)||!sharedOutputWork(input.work))throw invalid();
 const {page,slideSize,work}=input;
 if(![page.shapes,page.images,page.textBoxes].every(a=>list(a)&&a.length<=10000&&a.every(record)))throw invalid();
 const state=input.receipt&&typeof input.receipt==='object'&&!types.isProxy(input.receipt)?receipts.get(input.receipt):undefined;
 if(!state)return {status:'absent',groups:[]};
 const shapes=/** @type {Item[]} */(page.shapes);
 const all=[...shapes,.../** @type {Item[]} */(page.images),.../** @type {Item[]} */(page.textBoxes)];
 if(all.length>10000||!chargeSharedOutput(work,all.length*4))return {status:'invalid',groups:[]};
 if(all.some(p=>p.source!==undefined&&!record(p.source)||p.style!==undefined&&!record(p.style)||!record(p.box)))throw invalid();
 const sourceHash=record(page.source)&&record(page.source.sourceScene)?page.source.sourceScene.sourceHash:undefined;
 if(sourceHash!==state.sourceHash)return {status:'invalid',reason:'source-hash-changed',groups:[]};
 /** @type {Map<string,Item[]>} */const byId=new Map();
 for(const part of all){if(typeof part.id!=='string')continue;
  const rows=byId.get(part.id)??[];rows.push(part);byId.set(part.id,rows);}
 const groups=[];
 for(const entry of state.entries){
  if(!measuredSourceRouteGroupContext(entry.fit))return {status:'invalid',reason:'source-measurement-changed',groups:[]};
  if(slideSize.widthPt!==entry.slideSize.widthPt||slideSize.heightPt!==entry.slideSize.heightPt)return {status:'invalid',reason:'slide-size-changed',groups:[]};
  const ids=new Set(entry.parts.map(p=>p.id)),relationId=entry.template.source?.sceneRelationId;
  const parts=entry.parts.map(p=>byId.get(p.id??'')?.[0]);
  if(parts.some((p,i)=>!p||byId.get(p.id??'')?.length!==1||!shapes.includes(p)||snapshot(p,work)!==entry.snapshots[i])
   ||all.some(p=>p.source?.sceneRelationId===relationId&&!ids.has(p.id)))return {status:'invalid',reason:'source-members-changed',groups:[]};
  for(const node of entry.nodes){const matches=all.filter(p=>p.id===node.id),actual=matches[0];
   if(!chargeSharedOutput(work,all.length*2)||matches.length!==1||!actual||!record(actual.box)
    ||['x','y','w','h'].some(k=>{const key=/** @type {'x'|'y'|'w'|'h'} */(k);return typeof actual.box[key]!=='number'||!Number.isFinite(actual.box[key])||Math.abs(actual.box[key]-node.box[key])>1e-6;}))return {status:'invalid',reason:'endpoint-frame-changed',groups:[]};
  }
  for(const p of all){if(!chargeSharedOutput(work,2))return {status:'invalid',groups:[]};
   if(ids.has(p.id))continue;
   if(['startAnchor','endAnchor'].some(k=>{const anchor=p.style?.[k];return record(anchor)&&typeof anchor.elementId==='string'&&ids.has(anchor.elementId);} ))return {status:'invalid',reason:'external-member-reference',groups:[]};
  }
  const ordered=shapes.filter(p=>ids.has(p.id)),positions=ordered.map(p=>shapes.indexOf(p));
  if(ordered.some((p,i)=>p!==parts[i])||positions.some((n,i)=>n!==(positions[0]??0)+i))return {status:'invalid',reason:'source-paint-order-changed',groups:[]};
  const group={parts:/** @type {Item[]} */(parts),template:structuredClone(entry.template)},hash=sharedRouteOutputSnapshot(group.template,work);
  if(hash===null)return {status:'invalid',groups:[]};
  candidates.set(group,{input:{...input},entry,hash,parts:group.parts});groups.push(group);
 }
 return {status:'verified',groups};
}
/** Only a private, unchanged measured candidate may create a final selector.
 * Public metadata and detached candidate clones grant no audit capability.
 * @param {Candidate} group @param {{checks:number}} work */
function selectFilledNativeRoute(group,work){
 if(!sharedOutputWork(work))throw invalid();
 const saved=record(group)?candidates.get(group):undefined;
 if(!saved||group.parts!==saved.parts||sharedRouteOutputSnapshot(group.template,work)!==saved.hash)throw invalid();
 const checked=readFilledNativeRoutes({...saved.input,work});
 if(checked.status!=='verified'||!checked.groups.some(g=>g.parts.length===group.parts.length&&g.parts.every((p,i)=>p===group.parts[i])))throw invalid();
 const fit=fitWholeRouteNativeConnector({part:group.template,work});if(!fit)return null;
 const part=group.template;
 /** @type {Record<string,unknown>} */const style={...part.style,...fit.connector};
 for(const key of ['freeformPath','freeformSegments','connectorPath','closed'])delete style[key];
 const output={...part,type:'line',box:fit.box,style,source:{...part.source,connectorCornerMode:'reroutable-elbow',nativeConnectorRoute:true,
  nativePathGeometry:'office-preset-v1',sourceRouteParts:1,nativeRoutePoints:fit.points,outputGeometryApproximation:'standard-office-connector',
  sourceFootprintVerified:false,officeNodeFollowingVerified:false}};
 const selection={parts:group.parts,output},hash=sharedRouteOutputSnapshot(output,work);if(hash===null)throw invalid();
 selections.set(selection,{group,hash});return selection;
}
/** @param {unknown} selection @param {{checks:number}} work @param {unknown} page */
function isMeasuredFilledNativeSelection(selection,work,page){
 if(!record(selection)||!sharedOutputWork(work))return false;
 const saved=selections.get(selection),candidate=saved&&candidates.get(saved.group);
 if(!saved||!candidate||candidate.input.page!==page||selection.parts!==candidate.parts||!record(selection.output)||sharedRouteOutputSnapshot(selection.output,work)!==saved.hash)return false;
 const checked=readFilledNativeRoutes({...candidate.input,work});
 return checked.status==='verified'&&checked.groups.some(g=>g.parts.length===candidate.parts.length&&g.parts.every((p,i)=>p===candidate.parts[i]));
}
module.exports={captureFilledNativeRoute,sealFilledNativeRoutes,readFilledNativeRoutes,selectFilledNativeRoute,isMeasuredFilledNativeSelection};
