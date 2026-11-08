// @ts-check
'use strict';
const {record,fingerprint}=require('./approved-frame-application-input');
const {parseApprovedCardBackdrop}=require('./approved-card-backdrop-input');
const {sourceMeasuredFillGradientAncestor}=require('./source-measured-fill-compatibility');
const {sourceMeasuredOutlineFamily}=require('./source-measured-outline-compatibility');
const {sourceMeasuredTextAncestor}=require('../typography/source-measured-text-compatibility');
const GROUP='approved-card-region-n10',BACKDROP='approved-card-backdrop-region-n10';
/** Prepare only from the explicitly installed host policy. It does not edit
 * pixels, delete drawings or claim recovery of the unknown hidden background.
 * The backdrop remains OUTSIDE the card's native movement group.
 * @param {NonNullable<ReturnType<typeof parseApprovedCardBackdrop>>} policy
 * @param {{deck:Record<string,unknown>,page:Record<string,unknown>,shapes:unknown[],images:unknown[],texts:unknown[],textAncestors?:ReadonlyMap<string,Record<string,unknown>>}} input */
function prepareApprovedCardBackdrop(policy,{deck,page,shapes,images,texts,textAncestors}){
 const slide=record(deck.slideSize),sx=Number(slide.widthPt)/policy.source.width,sy=Number(slide.heightPt)/policy.source.height;
 if(![slide.widthPt,slide.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000)||record(page.background).fill!==policy.color)
  throw new TypeError('approved-card-backdrop-page-invalid');
 const all=[...shapes,...images,...texts],members=new Set(policy.members.map(m=>m.id)),matched=[];
 const outlineFamilies=shapes.flatMap(raw=>{const item=record(raw),expected=policy.members.find(m=>m.id===item.id);
  if(!expected||fingerprint(item)===expected.fingerprint)return [];
  const family=sourceMeasuredOutlineFamily(item,policy.members,policy.source.sha256,shapes);return family?[family]:[];
 });
 const familyIds=new Set(outlineFamilies.flatMap(f=>f.memberIds));for(const id of familyIds)members.add(id);
 const sourceAppearanceRevisions=[];
 for(const raw of all){const item=record(raw),source=item.source===undefined?{}:record(item.source),style=item.style===undefined?{}:record(item.style);
  if(item.id===BACKDROP||item.id===GROUP||source.nativeComponentGroupId===GROUP||style.nativeComponentGroupId===GROUP)
   throw new TypeError('approved-card-backdrop-id-conflict');
  if(members.has(String(source.sceneOutlinePaintOwnerId))&&!members.has(String(item.id)))throw new TypeError('approved-card-backdrop-member-binding');
  if(members.has(/** @type {string} */(item.id))){
   const expected=policy.members.find(m=>m.id===item.id),b=record(item.box),current=fingerprint(item);
   const revision=expected&&current!==expected.fingerprint?(sourceMeasuredFillGradientAncestor(item,expected.fingerprint,policy.source.sha256)
    ??sourceMeasuredTextAncestor(item,textAncestors?.get(String(item.id)),expected.fingerprint,policy.source.sha256)):null;
   if(((!expected||current!==expected.fingerprint&&!revision)&&!familyIds.has(String(item.id)))||source.sceneRegionId!=='region-n10'||source.preserveResidualInterior===true
    ||![b.x,b.y,b.w,b.h].every(n=>typeof n==='number'&&Number.isFinite(n))||Number(b.w)<=0||Number(b.h)<=0
    ||Number(b.x)/sx<379-.02||Number(b.y)/sy<1046-.02||Number(b.x)/sx+Number(b.w)/sx>709+.02||Number(b.y)/sy+Number(b.h)/sy>1365+.02)
    throw new TypeError('approved-card-backdrop-member-binding');
   if(revision)sourceAppearanceRevisions.push(revision);
   matched.push(item.id);
  }
  if(item.type==='line')for(const key of ['startAnchor','endAnchor']){
   const rawAnchor=style[key];if(rawAnchor===undefined)continue;const anchor=record(rawAnchor),target=anchor.elementId??anchor.id;
   if(members.has(/** @type {string} */(item.id))!==members.has(/** @type {string} */(target)))throw new TypeError('approved-card-backdrop-external-connection');
  }
 }
 if(matched.length!==members.size||new Set(matched).size!==members.size)throw new TypeError('approved-card-backdrop-members-incomplete');
 const b=policy.geometryBoundsPx;
 const shape={id:BACKDROP,type:'rect',box:{x:Number(b.x)*sx,y:Number(b.y)*sy,w:Number(b.w)*sx,h:Number(b.h)*sy},style:{fill:policy.color,stroke:'none',strokeWidthPt:0,opacity:1},
  source:{editable:true,nativeRebuild:true,approximateCardBackdrop:{policy:policy.policy,approvalId:policy.approvalId,regionId:policy.regionId,reviewFingerprint:policy.reviewFingerprint,
   sourceSha256:policy.source.sha256,strictMeasurement:false,sourceFootprint:false,sourceErasure:false}}};
 /** Clone only the approved member's grouping fields. Its drawing data and
  * original assets remain intact; the current transaction owns publication.
  * @param {unknown} raw */const group=raw=>{
  const item=record(raw);if(!members.has(/** @type {string} */(item.id)))return raw;
  const source=item.source===undefined?{}:record(item.source),style=item.style===undefined?undefined:record(item.style);
  return {...item,source:{...source,nativeComponentGroupId:GROUP},...(style?.nativeComponentGroupId===undefined?{}:{style:{...style,nativeComponentGroupId:GROUP}})};
 };
 const report={policy:policy.policy,approvalId:policy.approvalId,regionId:policy.regionId,reviewFingerprint:policy.reviewFingerprint,sourceSha256:policy.source.sha256,
  geometryBoundsPx:policy.geometryBoundsPx,impactBoundsPx:policy.impactBoundsPx,color:policy.color,memberIds:[...members],originalMemberIds:policy.members.map(m=>m.id),outlineFamilies,groupId:GROUP,backdropId:BACKDROP,
  approximation:'existing-page-color-over-unknown-hidden-background',strictBaselineUnchanged:true,strictMeasurement:false,sourceFootprint:false,sourceErasure:false,
  sourceAppearanceRevisions,originalAssetsPreserved:true,wholeCardMoveVerified:false,noGhostVerified:false,impactVerified:false,wholeProductAcceptance:false,appliedBeforeFinalSeal:true};
 return {shape,group,report};
}
/** The absence of this host option retains the existing frame application.
 * @param {unknown} options @param {{width:number,height:number,sha256:string}} source */
function approvedCardBackdropOption(options,source){
 if(options===undefined)return null;const value=record(options);
 if(Object.keys(value).some(k=>!['cardBackdrop','nativeRoute'].includes(k)))throw new TypeError('approved-card-backdrop-option-invalid');
 return value.cardBackdrop===undefined?null:parseApprovedCardBackdrop(value.cardBackdrop,source);
}
module.exports={approvedCardBackdropOption,prepareApprovedCardBackdrop};
