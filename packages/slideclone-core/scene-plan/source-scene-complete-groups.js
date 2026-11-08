// @ts-check
"use strict";
const {sceneInteriorBindings}=require('./source-scene-interior-parts');
const {measuredSceneContainsGroup,measuredSceneGroupBounds}=require('./source-scene-port-evidence');
const {paintConflict}=require('./source-scene-physical-groups');
const {record,list,sourceGroupTextPolygon}=require('./source-scene-group-containment');
const {measuredSceneGroupOwner}=require('./source-scene-group-owner');
const {nativeSceneGroupBindings,measuredSceneParentPaintMembers}=require('./source-scene-native-icon-groups');
const {sealMeasuredSceneGroups}=require('./source-scene-group-retention');
const {groupId,textGroupId,paintOrder}=require('./source-scene-group-paint');
const {groupedSceneBackgroundMembers}=require('./source-scene-background-members');
const {measuredSceneParentMembers:patternedSceneParentMembers}=require('./source-scene-parent-members');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id?:string,type?:string,box:Box,source?:Record<string,unknown>,style?:Record<string,unknown>,rotation?:number,text?:string}} Item */
/** Complete already measured physical units after optional interior discovery.
 * Does not alter paint, source claims, scan allowance or failed topology.
 * @template {Item} T
 * @param {{image:import('../png').PngImage,slideSize:{widthPt:number,heightPt:number},shapes:Item[],images:Item[],textBoxes:T[],
 * physicalNodes:{proposalId:string,node:{box:Box,portFrame:object|null,parentPaint?:unknown}}[],interior:unknown,geometryChecks:number,
 * nativeIcons?:unknown[],plan?:import('./source-scene-plan').ScenePlan,cropPaintToken?:unknown}} request */
function assembleSourceSceneCompleteGroups(request){
 if(!record(request)||!record(request.slideSize))throw new TypeError('Scene complete group input is invalid');
 const {image,slideSize,shapes,images,textBoxes,physicalNodes,interior,geometryChecks}=request;
 if(!record(image)||!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<=0||image.height<=0
  ||image.width*image.height>40000000||!ArrayBuffer.isView(image.rgba)||!(image.rgba instanceof Uint8Array)
  ||image.rgba.byteLength!==image.width*image.height*4||![shapes,images,textBoxes,physicalNodes].every(a=>list(a)&&a.every(record))
  ||![slideSize.widthPt,slideSize.heightPt].every(n=>Number.isFinite(n)&&n>0)
  ||!Number.isSafeInteger(geometryChecks)||geometryChecks<0||geometryChecks>4000000
  ||[...shapes,...images,...textBoxes].some(p=>!record(p.box)||![p.box.x,p.box.y,p.box.w,p.box.h].every(Number.isFinite)
   ||p.source!==undefined&&!record(p.source)||p.style!==undefined&&!record(p.style))
  ||physicalNodes.some(p=>!record(p.node))||new Set([...shapes,...images,...textBoxes]).size!==shapes.length+images.length+textBoxes.length
  ||request.nativeIcons!==undefined&&(!list(request.nativeIcons)||request.nativeIcons.length>96)
  ||request.plan!==undefined&&(!record(request.plan)||!list(request.plan.objects)||request.plan.objects.length>96||request.plan.objects.some(o=>!record(o))))
  throw new TypeError('Scene complete group input is invalid');
 const work={used:geometryChecks,exhausted:false},result=shapes.slice(),pictures=images.slice(),labels=textBoxes.slice(),completedParents=new Set();
 const evidence={assembledInteriorGroups:0,assembledInteriorParts:0,
  interiorAssemblyRejected:/** @type {{id:string,reason:string}[]} */([]),
  interiorAssemblyPaintConflicts:/** @type {{id:string,moved:string,other:string}[]} */([]),physicalGroupGeometryChecks:geometryChecks};
 const sx=image.width/slideSize.widthPt,sy=image.height/slideSize.heightPt;
 const native=request.plan&&request.nativeIcons?nativeSceneGroupBindings({...request,plan:request.plan,nativeIcons:request.nativeIcons,work}):{bindings:[],rejected:[]};
 for(const binding of [...native.bindings,...sceneInteriorBindings(image,interior)]){
  const isNative='nativeIds' in binding;
  const id=binding.parentId,prefix=`scene-interior-${id}`,unit=`scene-unit-${id}`;
  const decline=(/** @type {string} */reason)=>evidence.interiorAssemblyRejected.push({id,reason});
  const parts=new Set(binding.parts),all=[...result,...pictures,...labels];
  if(!/^[A-Za-z0-9_-]{1,96}$/u.test(id)||parts.size!==binding.parts.length||!parts.size||parts.size>32
   ||binding.parts.some(p=>!result.includes(p)&&(!isNative||!pictures.includes(p))||!isNative&&groupId(p)!==prefix)
   ||!isNative&&([...result,...images].some(p=>groupId(p)===prefix&&!parts.has(p))||labels.some(p=>textGroupId(p)===prefix))){
   decline('interior-membership');continue;
  }
  if(isNative){
   const childGroups=new Set(binding.parts.map(groupId).filter(g=>g!==undefined));
   if([...result,...pictures].some(p=>childGroups.has(groupId(p)??'')&&!parts.has(p))||labels.some(p=>childGroups.has(textGroupId(p)??''))){
    decline('native-membership');continue;
   }
  }
  const owner=physicalNodes.filter(p=>p.proposalId===id);
  const node=owner.length===1?owner[0]?.node:undefined;
  const bounds=node?measuredSceneGroupBounds(image,node.portFrame):null;
  if(!node||!bounds){decline('physical-parent');continue;}
  const measuredParent=node.parentPaint===undefined?null:patternedSceneParentMembers(image,node.parentPaint,id,result);
  if(node.parentPaint!==undefined&&!measuredParent){decline('parent-membership');continue;}
  const parent=measuredParent??result.filter(p=>p.id===`scene-container-${id}`||p.id===`scene-outline-${id}`
   ||p.source?.sceneOutlinePaintOwnerId===`scene-container-${id}`||p.source?.sceneOutlinePaintOwnerId===`scene-outline-${id}`);
  if(!measuredParent&&isNative&&request.plan)parent.push(...measuredSceneParentPaintMembers({...request,shapes:result,nativeIcons:request.nativeIcons??[],plan:request.plan,work},parent));
  for(const background of groupedSceneBackgroundMembers(image,result,id,work))if(!parent.includes(background))parent.push(background);
  const allowed=new Set([unit,`scene-paint-scene-container-${id}`,`scene-paint-scene-outline-${id}`,
   ...(measuredParent?measuredParent.map(groupId):[]),...(isNative?[undefined]:[])]);
  if(!parent.length||parent.length+parts.size>32||parent.some(p=>!allowed.has(groupId(p)))){decline('parent-membership');continue;}
  const parentGroups=new Set(parent.map(groupId).filter(g=>g!==undefined)),members=new Set([...parent,...binding.parts]);
  // A complete existing subgroup must belong to this parent. Never capture an
  // arbitrary group, existing image or foreign shape by its serialized ID.
  if(result.some(p=>parentGroups.has(groupId(p)??'')&&!members.has(p))||pictures.some(p=>parentGroups.has(groupId(p)??'')&&!members.has(p))
   ||labels.some(p=>parentGroups.has(textGroupId(p)??'')&&textGroupId(p)!==unit)){decline('foreign-parent-member');continue;}
  for(const text of labels){
   if(textGroupId(text)===unit){members.add(text);continue;}
   if(!isNative||textGroupId(text)!==undefined||!record(text.source))continue;
   const polygon=sourceGroupTextPolygon(text.source,sx,sy);
   if(polygon&&measuredSceneGroupOwner(image,physicalNodes,polygon,work)?.proposalId===id)members.add(text);
  }
  const b=binding.box,polygon=[{x:b.x*sx,y:b.y*sy},{x:(b.x+b.w)*sx,y:b.y*sy},
   {x:(b.x+b.w)*sx,y:(b.y+b.h)*sy},{x:b.x*sx,y:(b.y+b.h)*sy}];
  if(!measuredSceneContainsGroup(image,node.portFrame,bounds,polygon,work)){decline(work.exhausted?'geometry-budget':'source-containment');continue;}
  // Every native part must remain inside the complete measured picture.
  if(binding.parts.some(p=>!record(p.box)||![p.box.x,p.box.y,p.box.w,p.box.h].every(Number.isFinite)
   ||p.box.w<=0||p.box.h<=0||p.box.x<b.x||p.box.y<b.y||p.box.x+p.box.w>b.x+b.w+1e-9||p.box.y+p.box.h>b.y+b.h+1e-9)){
   decline('part-containment');continue;
  }
  const overrides=new Map([...members].map(p=>[p,unit])),before=paintOrder(result,pictures,labels),after=paintOrder(result,pictures,labels,overrides);
  let conflict=false;
  for(const moved of members){
   for(const other of all){
    if(work.used>=4000000){work.exhausted=true;conflict=true;break;}work.used++;
    if(moved===other)continue;
    const old=(before.get(moved)??-1)-(before.get(other)??-1),next=(after.get(moved)??-1)-(after.get(other)??-1);
    if(Math.sign(old)!==Math.sign(next)&&paintConflict(moved,other,work,request.cropPaintToken)){
     evidence.interiorAssemblyPaintConflicts.push({id,moved:moved.id??'',other:other.id??''});conflict=true;break;
    }
   }
   if(conflict||work.exhausted)break;
  }
  if(conflict||work.exhausted){decline(work.exhausted?'geometry-budget':'paint-order');continue;}
  for(let i=0;i<result.length;i++){const p=result[i];if(p&&members.has(p))result[i]={...p,source:{...p.source,nativeComponentGroupId:unit,
   ...(isNative&&parts.has(p)?{sceneParentObjectId:id}:{})}};}
  for(let i=0;i<labels.length;i++){const p=labels[i];if(p&&members.has(p))labels[i]={...p,source:{...p.source,nativeComponentGroupId:unit}};}
  for(let i=0;i<pictures.length;i++){const p=pictures[i];if(p&&members.has(p))pictures[i]={...p,source:{...p.source,nativeComponentGroupId:unit}};}
  completedParents.add(id);
  evidence.assembledInteriorGroups++;evidence.assembledInteriorParts+=parts.size;
 }
 evidence.physicalGroupGeometryChecks=work.used;
 const groups=[...completedParents].map(id=>{const unit='scene-unit-'+id;
  return {id:unit,members:[...result.filter(p=>groupId(p)===unit),...pictures.filter(p=>groupId(p)===unit),...labels.filter(p=>textGroupId(p)===unit)]};});
 return {shapes:result,images:pictures,textBoxes:labels,completedParents,evidence:{...evidence,nativeIconBindingRejected:native.rejected},
  sealGroups:(/** @type {{shapes:Item[],images:Item[],textBoxes:Item[]}} */page)=>sealMeasuredSceneGroups(page,groups,work.used,request.cropPaintToken)};
}
module.exports={assembleSourceSceneCompleteGroups,paintOrder};
