// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {parseConnectorCornerMode}=require('../routing/source-route-corner-mode');
const {isNativeRelationshipPath}=require('../quality/native-relationship-path');
/** @param {unknown} value @param {number} limit @returns {value is string} */
const identity=(value,limit)=>typeof value==='string'&&value.length<=limit&&/^[A-Za-z][A-Za-z0-9_-]*$/u.test(value);
/** Describe final compiled IR, independently of source flags and requested
 * strategy. These diagnostics grant no source rights, quality acceptance or
 * Office behaviour verification. Shared physical parts may occur in several
 * logical rows, so row counts must not be summed as unique shape counts.
 * @param {unknown} input */
function summarizeSceneRouteRepresentations(input){
 const invalid=()=>new TypeError('Scene route representation controls are invalid');
 if(!record(input)||!record(input.page))throw invalid();
 const requestedMode=parseConnectorCornerMode(input.connectorCornerMode),page=input.page,relations=input.relations;
 const collections=[page.shapes,page.images,page.textBoxes];
 if(!list(relations)||relations.length>1024||collections.some(a=>!list(a)||a.length>10000||!a.every(record)))throw invalid();
 const objects=collections.flatMap(a=>/** @type {Record<string,unknown>[]} */(a));
 if(objects.length>10000)throw invalid();
 /** @type {Map<string,Record<string,unknown>[]>} */const indexed=new Map();
 for(const object of objects)if(identity(object.id,256)){
  const matches=indexed.get(object.id)??[];matches.push(object);indexed.set(object.id,matches);
 }
 const seen=new Set();
 const rows=relations.map(raw=>{
  if(!record(raw)||!identity(raw.relationId,64)||seen.has(raw.relationId)||!list(raw.memberIds)
   ||raw.memberIds.length>256||!raw.memberIds.every(id=>identity(id,256)))throw invalid();
  seen.add(raw.relationId);
  const members=/** @type {string[]} */(raw.memberIds),unique=[...new Set(members)];
  let lineParts=0,boundConnectorParts=0,fixedPathParts=0,filledPathParts=0,controlParts=0,unsupportedParts=0,missingOrAmbiguousParts=0,nativePathParts=0;
  /** @param {unknown} anchor @param {string} self */
  const bound=(anchor,self)=>record(anchor)&&identity(anchor.elementId,256)&&anchor.elementId!==self
   &&indexed.get(anchor.elementId)?.length===1&&typeof anchor.side==='string'&&['left','right','top','bottom'].includes(anchor.side)
   &&typeof anchor.position==='number'&&Number.isFinite(anchor.position)&&anchor.position>=0&&anchor.position<=1
   &&[anchor.dxPt,anchor.dyPt].every(v=>v===undefined||typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000);
  for(const id of unique){
   const matches=indexed.get(id),part=matches?.[0];
   if(matches?.length!==1||!part){missingOrAmbiguousParts++;continue;}
   const style=part.style;
   if(part.type==='freeform'){
    fixedPathParts++;if(record(style)&&typeof style.fill==='string'&&style.fill!=='none')filledPathParts++;
    if(isNativeRelationshipPath(part,indexed))nativePathParts++;
   }else if(part.type==='line'){
    lineParts++;
    if(record(style)&&style.fill==='none'&&typeof style.stroke==='string'&&/^#[a-f0-9]{6}$/iu.test(style.stroke)
     &&typeof style.strokeWidthPt==='number'&&Number.isFinite(style.strokeWidthPt)&&style.strokeWidthPt>0&&style.strokeWidthPt<=100
     &&(style.connectorType===undefined||typeof style.connectorType==='string'&&/^(?:line|elbow(?:-[2-5])?|curved-[2-5])$/u.test(style.connectorType))
     &&[style.freeformPath,style.freeformSegments,style.connectorPath].every(v=>v===undefined)
     &&bound(style.startAnchor,id)&&bound(style.endAnchor,id))boundConnectorParts++;
   }else if(part.type==='rect'&&record(style)&&style.fill==='none'&&style.stroke==='none'&&style.strokeWidthPt===0)controlParts++;
   else unsupportedParts++;
  }
  const duplicateMemberParts=members.length-unique.length,unboundLineParts=lineParts-boundConnectorParts;
  const available=members.length>0&&!missingOrAmbiguousParts&&!duplicateMemberParts&&!unsupportedParts&&!unboundLineParts;
  const representation=!available||!boundConnectorParts&&!fixedPathParts?'unavailable'
   :fixedPathParts?boundConnectorParts?'mixed-fixed-and-connectors':'fixed-paths':'native-connectors';
  const wholeNativeObject=available&&controlParts===0&&lineParts+fixedPathParts===1&&boundConnectorParts+nativePathParts===1;
  const objectStructure=!available?'unavailable':!wholeNativeObject?'segmented-route'
   :boundConnectorParts===1?'single-native-connector':'single-native-path';
  const requestedNativeModeUnmet=requestedMode==='reroutable-elbow'&&objectStructure!=='single-native-connector';
  return {relationId:raw.relationId,representation,lineParts,boundConnectorParts,fixedPathParts,filledPathParts,controlParts,
   unsupportedParts,unboundLineParts,missingOrAmbiguousParts,duplicateMemberParts,wholeNativeObject,objectStructure,requestedNativeModeUnmet};
 });
 return {version:1,basis:'compiled-ir-structure-only',requestedMode,nodeFollowingVerification:'not-assessed',relations:rows,
  nativeModeUnmetRelationIds:rows.filter(row=>row.requestedNativeModeUnmet).map(row=>row.relationId),
  wholeObjectUnmetRelationIds:rows.filter(row=>!row.wholeNativeObject).map(row=>row.relationId)};
}
module.exports={summarizeSceneRouteRepresentations};
