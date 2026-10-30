// @ts-check
'use strict';
const {record,list,snapshot,hash,identifier}=require('./approved-frame-application-input');
const {finite,keys}=require('./native-layer-change-style');
const invalid=()=>new TypeError('native-layer-plan-invalid');
/** Parse a bounded JSON proposal without invoking getters, proxies or hooks.
 * A review ID and digest in JSON never assert human approval or source rights.
 * @param {unknown} input */
function parseNativeLayerChangeInput(input){
 try{
  const data=record(input);keys(data,['page','slideSize','review']);
  const page=record(data.page),size=record(data.slideSize);keys(size,['widthPt','heightPt']);
  if(!finite(size.widthPt,1,100000)||!finite(size.heightPt,1,100000))throw invalid();
  // Validate the entire provider graph before reading or copying nested data.
  const review=record(JSON.parse(snapshot(data.review)));keys(review,['version','reviewId','sourceHash','pageFingerprint','addedShapes','shapeOrder','shapeChanges','removedImageIds','textChanges']);
  snapshot(page);
  if(review.version!==1)throw invalid();
  const shapes=list(page.shapes,10000).map(record),images=list(page.images,10000).map(record),texts=list(page.textBoxes,10000).map(record);
  if(shapes.length+images.length+texts.length>10000)throw invalid();
  const ids=[...shapes,...images,...texts].map(item=>identifier(item.id));if(new Set(ids).size!==ids.length)throw invalid();
  const changes=(/** @type {unknown} */ values)=>list(values,512).map(raw=>{const row=record(raw);keys(row,['id','beforeFingerprint','style']);
   return {id:identifier(row.id),beforeFingerprint:hash(row.beforeFingerprint),style:record(row.style)};});
  const added=list(review.addedShapes,512),order=list(review.shapeOrder,10000).map(identifier),removed=list(review.removedImageIds,512).map(identifier);
  const shapeChanges=changes(review.shapeChanges),textChanges=changes(review.textChanges);
  if(shapes.length+images.length+texts.length+added.length-removed.length>10000)throw invalid();
  if(!added.length&&!removed.length&&!shapeChanges.length&&!textChanges.length)throw invalid();
  for(const values of [order,removed,shapeChanges.map(r=>r.id),textChanges.map(r=>r.id)])if(new Set(values).size!==values.length)throw invalid();
  return {page,shapes,images,texts,slideSize:{widthPt:size.widthPt,heightPt:size.heightPt},review:{reviewId:identifier(review.reviewId),
   sourceHash:hash(review.sourceHash),pageFingerprint:hash(review.pageFingerprint),added,order,removed,shapeChanges,textChanges}};
 }catch{throw invalid();}
}
module.exports={parseNativeLayerChangeInput};
