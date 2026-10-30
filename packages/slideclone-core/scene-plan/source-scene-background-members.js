// @ts-check
'use strict';
const {record,list,box:validBox}=require('./source-scene-group-containment');
const {measuredSceneBackgroundOwner}=require('./source-scene-background-owner');
const {measuredSceneParentMembers}=require('./source-scene-parent-members');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
/** @typedef {import('./source-scene-complete-groups').Item} Item */
/** @typedef {{pixels:Uint8Array,parentId:string,snapshot:string}} Binding */
/** @type {WeakMap<object,Binding>} */const bindings=new WeakMap();
/** @type {WeakMap<object,Binding>} */const groupedBindings=new WeakMap();
/** Resolve existing plain background paint to its unique measured body.
 * Eligibility flags never prove ownership: only the private source perimeter
 * can contain the complete rectangle. This changes grouping only, and grants
 * neither new drawing, source erasure nor permission to capture other groups.
 * @param {{image:import('../png').PngImage,slideSize:{widthPt:number,heightPt:number},shapes:Item[],
 * physicalNodes:{proposalId:string,node:{portFrame:object|null,parentPaint?:unknown}}[],
 * work:{used:number,exhausted:boolean}}} input
 * @returns {Map<string,Item[]>} */
function measuredSceneBackgroundMembers(input){
 if(!record(input)||!record(input.image)||!record(input.slideSize)||!record(input.work)
  ||![input.shapes,input.physicalNodes].every(a=>list(a)&&a.length<=20000&&a.every(record))||input.physicalNodes.length>96
  ||!Number.isSafeInteger(input.image.width)||!Number.isSafeInteger(input.image.height)
  ||input.image.width<=0||input.image.height<=0||input.image.width*input.image.height>40000000
  ||!ArrayBuffer.isView(input.image.rgba)||!(input.image.rgba instanceof Uint8Array)||input.image.rgba.byteLength!==input.image.width*input.image.height*4
  ||![input.slideSize.widthPt,input.slideSize.heightPt].every(n=>Number.isFinite(n)&&n>0)
  ||!Number.isSafeInteger(input.work.used)||input.work.used<0||typeof input.work.exhausted!=='boolean'
  ||input.physicalNodes.some(p=>typeof p.proposalId!=='string'||!record(p.node)))
  throw new TypeError('Scene background group input is invalid');
 /** @type {Map<string,Item[]>} */const groups=new Map();const {image,shapes,physicalNodes,work}=input;
 if(work.exhausted||work.used>=4000000)return groups;
 const sx=image.width/input.slideSize.widthPt,sy=image.height/input.slideSize.heightPt;
 for(const item of shapes){
  if(++work.used>4000000){work.exhausted=true;return new Map();}
  if(item.type!=='rect'||!validBox(item.box)||!record(item.source)||!record(item.style))continue;
  const s=item.source,style=item.style;
  if(s.detector!=='solid-region-native-background'||s.residualBackgroundFill!==true
   ||s.nativeComponentGroupId!==undefined||s.sceneInventoryId!==undefined||s.sceneRelationId!==undefined||s.role!==undefined
   ||(item.rotation??0)!==0||Object.keys(style).some(key=>!['fill','stroke','strokeWidthPt','opacity'].includes(key))
   ||typeof style.fill!=='string'||!/^#[0-9a-f]{6}$/iu.test(style.fill)||(style.opacity??1)!==1
   ||style.stroke!==undefined&&style.stroke!=='none'||(style.strokeWidthPt??0)!==0)continue;
  const b=item.box,polygon=[{x:b.x*sx,y:b.y*sy},{x:(b.x+b.w)*sx,y:b.y*sy},
   {x:(b.x+b.w)*sx,y:(b.y+b.h)*sy},{x:b.x*sx,y:(b.y+b.h)*sy}];
  const owner=measuredSceneBackgroundOwner(image,physicalNodes,polygon,work);
  if(work.exhausted)return new Map();
  // A multi-face parent must also retain its separate exact member receipt.
  // The existing members remain required; only this independently contained
  // background can be added to their physical editing unit.
  if(!owner||owner.node.parentPaint!==undefined&&!measuredSceneParentMembers(image,owner.node.parentPaint,owner.proposalId,shapes))continue;
  const snapshot=sceneGroupSnapshot(item);if(snapshot===null)continue;
  bindings.set(item,{pixels:image.rgba,parentId:owner.proposalId,snapshot});
  const members=groups.get(owner.proposalId)??[];members.push(item);groups.set(owner.proposalId,members);
 }
 return groups;
}
/** Carry an independently measured member across the binder's grouping copy.
 * A copied provider flag or group ID cannot issue this transient binding.
 * @param {import('../png').PngImage} image @param {Item} before @param {Item} after @param {string} parentId */
function rebindSceneBackgroundMember(image,before,after,parentId){
 const proof=bindings.get(before);
 if(!proof||proof.pixels!==image.rgba||proof.parentId!==parentId||sceneGroupSnapshot(before)!==proof.snapshot
  ||sceneGroupSnapshot(after)!==proof.snapshot||after.source?.nativeComponentGroupId!==`scene-unit-${parentId}`)return false;
 groupedBindings.set(after,proof);return true;
}
/** Existing complete-group assembly must keep this exact background when it
 * later adds a privately measured icon; it cannot rediscover it from group IDs.
 * @param {import('../png').PngImage} image @param {Item[]} shapes @param {string} parentId
 * @param {{used:number,exhausted:boolean}} work */
function groupedSceneBackgroundMembers(image,shapes,parentId,work){
 /** @type {Item[]} */const members=[];
 if(work.exhausted||work.used+shapes.length>4000000){work.exhausted=true;return members;}
 work.used+=shapes.length;
 for(const item of shapes){
  const proof=groupedBindings.get(item);
  if(proof?.pixels===image.rgba&&proof.parentId===parentId&&sceneGroupSnapshot(item)===proof.snapshot
   &&item.source?.nativeComponentGroupId===`scene-unit-${parentId}`)members.push(item);
 }
 return members;
}
module.exports={measuredSceneBackgroundMembers,rebindSceneBackgroundMember,groupedSceneBackgroundMembers};
