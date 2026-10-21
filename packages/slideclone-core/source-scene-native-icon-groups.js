// @ts-check
"use strict";
const {sceneNativeIconBinding}=require('./source-scene-native-icon');
const {measuredSceneGroupOwner}=require('./source-scene-group-owner');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id?:string,type?:string,box:Box,source?:Record<string,unknown>,style?:Record<string,unknown>,rotation?:number}} Item */
/** @typedef {{parentId:string,parts:Item[],box:Box,nativeIds:string[]}} Binding */
/** Resolve measured native children as whole units before grouping. An icon
 * proposal or failed representation cannot suppress recovery or prove a parent.
 * @param {{image:import('./png').PngImage,slideSize:{widthPt:number,heightPt:number},shapes:Item[],
 * physicalNodes:{proposalId:string,node:{box:Box,portFrame:object|null}}[],nativeIcons:unknown[],
 * plan:import('./source-scene-plan').ScenePlan,work:{used:number,exhausted:boolean}}} input */
function nativeSceneGroupBindings({image,slideSize,shapes,physicalNodes,nativeIcons,plan,work}){
 /** @type {Map<string,Binding>} */const groups=new Map();
 /** @type {{id:string,reason:string}[]} */const rejected=[];
 const sx=image.width/slideSize.widthPt,sy=image.height/slideSize.heightPt;
 for(const receipt of nativeIcons){
  const binding=sceneNativeIconBinding(image,receipt);if(!binding)continue;
  const {id,regionId,parentObjectId,parts,box:b}=binding;
  const decline=(/** @type {string} */reason)=>rejected.push({id,reason});
  if(!parts.length||parts.length>32||new Set(parts).size!==parts.length
   ||parts.some(p=>shapes.filter(s=>s===p).length!==1||shapes.filter(s=>s.id===p.id).length!==1)){
   decline('native-membership');continue;
  }
  const proposal=plan.objects.find(o=>o.id===id&&o.kind==='icon'&&o.regionId===regionId);
  if(!proposal||proposal.parentObjectId!==undefined&&proposal.parentObjectId!==parentObjectId){decline('native-proposal');continue;}
  const candidates=physicalNodes.filter(n=>plan.objects.some(o=>o.id===n.proposalId&&o.kind==='container'&&o.regionId===regionId));
  const polygon=[{x:b.x*sx,y:b.y*sy},{x:(b.x+b.w)*sx,y:b.y*sy},
   {x:(b.x+b.w)*sx,y:(b.y+b.h)*sy},{x:b.x*sx,y:(b.y+b.h)*sy}];
  const owner=measuredSceneGroupOwner(image,candidates,polygon,work);
  if(!owner||parentObjectId&&owner.proposalId!==parentObjectId){decline(work.exhausted?'geometry-budget':'source-parent');continue;}
  const previous=groups.get(owner.proposalId);
  if(previous){
   const x=Math.min(previous.box.x,b.x),y=Math.min(previous.box.y,b.y);
   previous.box={x,y,w:Math.max(previous.box.x+previous.box.w,b.x+b.w)-x,h:Math.max(previous.box.y+previous.box.h,b.y+b.h)-y};
   previous.parts.push(...parts);previous.nativeIds.push(id);
  }else groups.set(owner.proposalId,{parentId:owner.proposalId,parts:parts.slice(),box:{...b},nativeIds:[id]});
 }
 return {bindings:[...groups.values()],rejected};
}
/** Same-paint inner rectangles are existing parts of this measured parent.
 * This supplies grouping only, never new paint, erasure or source authority.
 * @param {Parameters<typeof nativeSceneGroupBindings>[0]} input @param {Item[]} parent */
function measuredSceneParentPaintMembers(input,parent){
 const body=parent.find(p=>['rect','freeform'].includes(p.type??'')&&typeof p.style?.fill==='string'&&/^#[0-9a-f]{6}$/iu.test(p.style.fill)
  &&(p.style.opacity??1)===1&&(p.rotation??0)===0&&p.style.gradient===undefined);
 if(!body)return [];
 const id=parent[0]?.id?.replace(/^scene-(?:container|outline)-/u,''),sx=input.image.width/input.slideSize.widthPt,sy=input.image.height/input.slideSize.heightPt;
 return input.shapes.filter(p=>!parent.includes(p)&&p.type==='rect'&&p.source?.nativeComponentGroupId===undefined
  &&p.style?.fill===body.style?.fill&&(p.style?.opacity??1)===1&&(p.rotation??0)===0
  &&(p.style?.stroke===undefined||p.style.stroke==='none')&&(p.style?.strokeWidthPt??0)===0
  &&p.style?.gradient===undefined&&p.style?.freeformSegments===undefined
  &&measuredSceneGroupOwner(input.image,input.physicalNodes,[{x:p.box.x*sx,y:p.box.y*sy},
   {x:(p.box.x+p.box.w)*sx,y:p.box.y*sy},{x:(p.box.x+p.box.w)*sx,y:(p.box.y+p.box.h)*sy},
   {x:p.box.x*sx,y:(p.box.y+p.box.h)*sy}],input.work)?.proposalId===id);
}
module.exports={nativeSceneGroupBindings,measuredSceneParentPaintMembers};
