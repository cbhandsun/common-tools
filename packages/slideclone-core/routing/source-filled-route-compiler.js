// @ts-check
'use strict';
const {isMeasuredSourceRoute}=require('../scene-plan/source-scene-route');
const outputGroups=require('./source-route-output-groups').createSourceRouteOutputGroupRegistry();
const {captureFilledNativeRoute}=require('./source-filled-route-native');
/** @param {{fit:NonNullable<ReturnType<typeof import('../scene-plan/source-scene-route').measureSourceSceneRoute>['fit']>,
 * relation:import('../scene-plan/source-scene-plan').Relation,fromId:string,toId:string,widthPx:number,heightPx:number,
 * slideSize:{widthPt:number,heightPt:number}}} request */
function compileFilledSourceRoute(request){
 const {fit,relation,fromId,toId,widthPx,heightPx,slideSize}=request,body=fit.filledBody;
 if(!body||!isMeasuredSourceRoute(fit,{fromId,toId,direction:relation.direction,widthPx,heightPx}))throw new TypeError('Filled route proof is invalid');
 const sx=slideSize.widthPt/widthPx,sy=slideSize.heightPt/heightPx,prefix=`scene-${relation.id}`;
 const source={editable:true,nativeRebuild:true,semanticNativeStructure:true,detector:'source-scene-route',
  sceneRegionId:relation.regionId,sceneRelationId:relation.id,sceneInventoryId:relation.id,sourceNodeIds:[fromId,toId],sourceShaftSupport:fit.support,
  sourcePhysicalAttachment:true,sourceAttachmentKind:'measured-contour-physical',
  nativeComponentGroupId:`scene-route-${relation.id}`,
  sourceRouteParts:body.parts.length+body.links.length,nativeComponentRole:'relationship',role:'relationship'};
 const parts=body.parts.map((part,i)=>({id:`${prefix}-body-${i+1}`,type:'freeform',
  box:{x:part.box.x*sx,y:part.box.y*sy,w:part.box.w*sx,h:part.box.h*sy},
  style:{fill:part.color,stroke:'none',strokeWidthPt:0,freeformSegments:part.segments.map(s=>({type:s.type,points:s.points.map(p=>({...p}))}))},
  source:{...source,sourceRouteBodyIndex:i}}));
 /** @param {number} index @param {{x:number,y:number}} point */
 const anchor=(index,point)=>{
  if(index===-1)return {elementId:fromId,side:fit.startSide,position:fit.startPosition,
   dxPt:(fit.startOffset?.x??0)*sx,dyPt:(fit.startOffset?.y??0)*sy};
  if(index===-2)return {elementId:toId,side:fit.endSide,position:fit.endPosition,
   dxPt:(fit.endOffset?.x??0)*sx,dyPt:(fit.endOffset?.y??0)*sy};
  const part=body.parts[index];if(!part)throw new TypeError('Filled route body is invalid');
  const b=part.box,choices=[{side:'left',d:point.x-b.x},{side:'right',d:b.x+b.w-point.x},
   {side:'top',d:point.y-b.y},{side:'bottom',d:b.y+b.h-point.y}].sort((a,b)=>a.d-b.d),side=choices[0]?.side;
  if(!side||choices.some(c=>c.d<0))throw new TypeError('Filled route source site is invalid');
  const vertical=side==='left'||side==='right',position=vertical?(point.y-b.y)/b.h:(point.x-b.x)/b.w;
  return {elementId:`${prefix}-body-${index+1}`,side,position,
   dxPt:vertical?(point.x-(side==='left'?b.x:b.x+b.w))*sx:0,
   dyPt:vertical?0:(point.y-(side==='top'?b.y:b.y+b.h))*sy};
 };
 const lines=body.links.map((link,i)=>{
  const a=link.from===-1?fit.points[0]:link.a,b=link.to===-2?fit.points.at(-1):link.b;
  if(!a||!b)throw new TypeError('Filled route endpoints are invalid');
  return {id:i===0?prefix:`${prefix}-link-${i+1}`,type:'line',
   box:{x:a.x*sx,y:a.y*sy,w:(b.x-a.x)*sx,h:(b.y-a.y)*sy},
   style:{fill:'none',stroke:link.color,strokeWidthPt:(sx+sy)/2,lineCap:'round',
    startAnchor:anchor(link.from,a),endAnchor:anchor(link.to,b)},source:{...source,routeSegmentIndex:i}};
 });
 if(parts.length+lines.length>32)throw new RangeError('Filled route parts exceed the unit budget');
 const result=[...parts,...lines];
 captureFilledNativeRoute(request,result);
 if(!outputGroups.capture({fit,parts:result,slideSize}))for(const part of result)Reflect.deleteProperty(part.source,'nativeComponentGroupId');
 return result;
}
module.exports={compileFilledSourceRoute,sealMeasuredFilledRouteGroups:outputGroups.seal};
