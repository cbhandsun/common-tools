// @ts-check
'use strict';
const {record,fingerprint,identifier}=require('./approved-frame-application-input');
const {parseNativeLayerChangeInput}=require('./native-layer-change-input');
const {changedStyle,addedShape}=require('./native-layer-change-style');
/** Pure, bounded drawing proposal. No filesystem writes, private receipt,
 * human authorization, source measurement, erasure or acceptance is created.
 * The host must separately bind actual source/asset bytes and obtain approval
 * before applying a plan inside the existing rollback/final-seal lifecycle.
 * @param {unknown} input */
function buildPlan(input){
 const {page,shapes,images,texts,slideSize,review}=parseNativeLayerChangeInput(input);
 const invalid=()=>new TypeError('native-layer-plan-invalid'),binding=()=>new TypeError('native-layer-plan-binding');
 if(fingerprint(page)!==review.pageFingerprint)throw binding();
 const source=record(page.source),scene=record(source.sourceScene);if(scene.sourceHash!==review.sourceHash)throw binding();
 const ids=new Set([...shapes,...images,...texts].map(s=>s.id));
 const additions=review.added.map(raw=>{const shape=addedShape(raw,slideSize),id=identifier(shape.id);if(ids.has(id))throw invalid();ids.add(id);
  return {...shape,id,source:{nativeLayerProposal:true,strictSourceEquivalent:false,sourceErasureAuthority:false}};});
 /** @param {Record<string,unknown>[]} items @param {typeof review.shapeChanges} changes @param {boolean} text */
 const changed=(items,changes,text)=>{
  const replacements=new Map();
  for(const row of changes){const item=items.find(s=>s.id===row.id);if(!item)throw invalid();
   if(fingerprint(item)!==row.beforeFingerprint)throw binding();
   replacements.set(row.id,{...item,style:changedStyle(item,row.style,text)});}
  return items.map(item=>replacements.get(item.id)??item);
 };
 const updated=changed(shapes,review.shapeChanges,false),addedMap=new Map([...updated,...additions].map(s=>[s.id,s]));
 const originalShapeIds=new Set(shapes.map(s=>s.id));
 if(review.order.length!==updated.length+additions.length||review.order.some(id=>!addedMap.has(id))
  ||review.order.filter(id=>originalShapeIds.has(id)).some((id,index)=>id!==shapes[index]?.id))throw invalid();
 for(const id of review.removed){const image=images.find(i=>i.id===id);if(!image||record(image.source).protectedMinimumUnit===true)throw invalid();}
 for(const item of [...shapes,...texts]){const style=item.style===undefined?{}:record(item.style);
  for(const key of ['startAnchor','endAnchor'])if(style[key]!==undefined){const anchor=record(style[key]);
   if(review.removed.some(id=>id===(anchor.elementId??anchor.id)))throw invalid();}}
 const resultPage={...page,shapes:review.order.map(id=>addedMap.get(id)),
  images:review.removed.length?images.filter(i=>!review.removed.includes(String(i.id))):page.images,
  textBoxes:review.textChanges.length?changed(texts,review.textChanges,true):page.textBoxes};
 return {version:1,reviewId:review.reviewId,sourceHash:review.sourceHash,reviewFingerprint:fingerprint(review),page:resultPage,
  applicationAuthorized:false,sourceErasureAuthority:false,strictSourceEquivalent:false,
  changes:{addedShapes:additions.length,changedShapes:review.shapeChanges.length,removedImages:review.removed.length,changedTextStyles:review.textChanges.length}};
}
/** @param {unknown} input */
function planNativeLayerChanges(input){
 try{return buildPlan(input);}catch(error){
  if(error instanceof TypeError&&error.message==='native-layer-plan-binding')throw error;
  throw new TypeError('native-layer-plan-invalid',{cause:error});
 }
}
module.exports={planNativeLayerChanges};
