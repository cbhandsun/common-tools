// @ts-check
"use strict";
const {types}=require('node:util');
const {isMeasuredSceneVisibleGap,measuredSceneVisibleGapCells}=require('./source-scene-visible-gap');
const {sceneGroupSnapshot}=require('./source-scene-group-snapshot');
const {sceneTextEndpointNativeAnchor}=require('./source-scene-text-endpoints');
/** @type {WeakMap<object,{fit:object,snapshot:string}>} */const outputs=new WeakMap();
/** Include source metadata as well as all rendering fields. A provider's
 * copied shape, edited anchor or changed relation cannot retain this receipt.
 * @param {unknown} item */
function paintSnapshot(item){
 if(!record(item)||!record(item.source)||!record(item.style))return null;
 return sceneGroupSnapshot({...item,style:{paint:item.style,source:item.source}});
}
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const record=v=>v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))
 &&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);
/** One actual connector binds visible source endpoints to external sites on
 * the REAL existing nodes. Their geometry/paint stay exact; no proxy, invisible
 * node or extra relation is emitted. Office scales sites with their owner.
 * @param {{fit:NonNullable<ReturnType<typeof import('./source-scene-visible-gap').measureSourceSceneVisibleGap>['fit']>,
 * relation:import('./source-scene-plan').Relation,fromId:string,toId:string,width:number,height:number,
 * slideSize:{widthPt:number,heightPt:number},fromTextEndpoint?:unknown,toTextEndpoint?:unknown}} request */
function compileSourceSceneVisibleGap(request){
 if(!record(request)||!record(request.relation)||!record(request.slideSize))throw new TypeError('Visible gap controls are invalid');
 const {fit,relation,fromId,toId,width,height,slideSize}=request;
 if(![relation.id,relation.regionId,relation.fromId,relation.toId].every(v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(v))
  ||![slideSize.widthPt,slideSize.heightPt].every(n=>Number.isFinite(n)&&n>0&&n<=100000))throw new TypeError('Visible gap controls are invalid');
 if(!isMeasuredSceneVisibleGap(fit,{fromId,toId,direction:relation.direction,width,height,visiblePath:relation.visiblePath,shaftBox:relation.shaftBox}))throw new TypeError('Visible gap proof is invalid');
 const sx=slideSize.widthPt/width,sy=slideSize.heightPt/height,siteOffsetKind=fit.diagonal?'source-visible-diagonal-gap':'source-visible-gap';
 const arrowSize=fit.sourcePath||fit.connectorType?'large':'medium';
 const output={id:`scene-${relation.id}`,type:'line',box:{x:fit.start.x*sx,y:fit.start.y*sy,w:(fit.end.x-fit.start.x)*sx,h:(fit.end.y-fit.start.y)*sy},
  style:{fill:'none',stroke:fit.color,strokeWidthPt:fit.widthPx*(sx+sy)/2,lineCap:'round',
   ...(fit.strokeDashPattern?{strokeDashPattern:fit.strokeDashPattern,lineCap:'flat'}:{}),
   ...(fit.connectorType?{connectorType:fit.connectorType}:{}),
   startAnchor:{elementId:fromId,side:fit.startSide,position:fit.startPosition,dxPt:fit.startOffset.x*sx,dyPt:fit.startOffset.y*sy,...(fit.startInternal?{}:{siteOffsetKind})},
   endAnchor:{elementId:toId,side:fit.endSide,position:fit.endPosition,dxPt:fit.endOffset.x*sx,dyPt:fit.endOffset.y*sy,...(fit.endInternal?{}:{siteOffsetKind})},
   ...(['backward','both'].includes(relation.direction)?{startArrow:'triangle',startArrowWidth:arrowSize,startArrowLength:arrowSize}:{}),
   ...(['forward','both'].includes(relation.direction)?{endArrow:'triangle',endArrowWidth:arrowSize,endArrowLength:arrowSize}:{})},
  source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,nativeComponentRole:'relationship',role:'relationship',
   detector:'source-scene-visible-gap',sceneRegionId:relation.regionId,sceneRelationId:relation.id,sourceNodeIds:[fromId,toId],
   sourceShaftSupport:fit.support,sourceAttachmentKind:fit.physical?'source-body-contact':'visible-gap-logical',sourcePhysicalAttachment:fit.physical===true,
   ...(fit.sourcePath?{sourceArrowGeometry:'filled-source-contour'}:{}),
   ...(fit.programMaxErrorPx!==undefined?{sourcePathProgramRefined:true,sourcePathMaxCenterlineErrorPx:fit.programMaxErrorPx}:{})}};
 for(const [token,id,point,side,key] of /** @type {[unknown,string,{x:number,y:number},string,'startAnchor'|'endAnchor'][]} */([
  [request.fromTextEndpoint,fromId,{x:fit.start.x*sx,y:fit.start.y*sy},fit.startSide,'startAnchor'],
  [request.toTextEndpoint,toId,{x:fit.end.x*sx,y:fit.end.y*sy},fit.endSide,'endAnchor']])){
  if(token===undefined)continue;
  const anchor=sceneTextEndpointNativeAnchor(token,id,{width,height,point,side});if(!anchor)throw new TypeError('Visible gap text anchor proof is invalid');
  output.style[key]=anchor;
 }
 const snapshot=paintSnapshot(output);if(snapshot===null)throw new TypeError('Visible gap output is invalid');
 outputs.set(output,{fit,snapshot});return output;
}
/** Only the actual unchanged output of this compiler can expose its already
 * measured source ink to a complete owner inventory. This does not grant
 * physical attachment, hidden line paint, opacity or exclusion of a whole box.
 * @param {unknown} image @param {unknown} item */
function measuredSceneVisibleGapPaint(image,item){
 const proof=item!==null&&typeof item==='object'?outputs.get(item):undefined;
 if(!proof||paintSnapshot(item)!==proof.snapshot)return null;
 return measuredSceneVisibleGapCells(image,proof.fit);
}
/** The existing census finalizer adds this one derived identity field. Bind
 * that exact mutation at its real boundary instead of ignoring metadata in a
 * snapshot or reissuing a receipt for arbitrary changes to the output.
 * @param {unknown} image @param {unknown} item @param {unknown} relationId */
function bindMeasuredSceneVisibleGapInventory(image,item,relationId){
 if(!record(item)||!record(item.source)||typeof relationId!=='string'||item.source.sceneRelationId!==relationId
  ||item.source.sceneInventoryId!==undefined&&item.source.sceneInventoryId!==relationId)return false;
 const proof=outputs.get(item);
 if(!proof||paintSnapshot(item)!==proof.snapshot||!measuredSceneVisibleGapCells(image,proof.fit))return false;
 item.source={...item.source,sceneInventoryId:relationId};
 const snapshot=paintSnapshot(item);if(snapshot===null)return false;
 outputs.set(item,{...proof,snapshot});return true;
}
module.exports={compileSourceSceneVisibleGap,measuredSceneVisibleGapPaint,bindMeasuredSceneVisibleGapInventory};
