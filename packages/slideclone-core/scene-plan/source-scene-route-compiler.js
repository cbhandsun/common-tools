// @ts-check
"use strict";
const {isMeasuredSourceRoute}=require('./source-scene-route');
const {sourceRouteSegmentGradient}=require('../routing/source-route-paint');
const {types}=require('node:util');
const {compileFilledSourceRoute}=require('../routing/source-filled-route-compiler');
const {sceneRouteWithinAnchor}=require('./source-scene-relation-identity');
const {orthogonalSourceRoute,nativeElbowConnector,nativeElbowVertices}=require('../routing/source-route-native-elbow');
const {parseConnectorCornerMode,roundedSourceRoute}=require('../routing/source-route-corner-mode');
const {nativeSourceRouteGradient,sourceRouteGradientInFrame}=require('../routing/source-route-native-gradient');
const {SOURCE_ROUTE_PART_LIMIT}=require('../routing/source-route-centerline');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
const record=v=>v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v))
 &&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);
/** Compile ONE admitted relation into explicit connected parts. Controls are
 * declared native parts, never extra scene objects or hidden relations. Both
 * external ends reference the measured physical nodes; each interior joint is
 * also a real Office connector attachment. Keep the 32-part unit limit.
 * @param {{fit:NonNullable<ReturnType<typeof import('./source-scene-route').measureSourceSceneRoute>['fit']>,
 * relation:import('./source-scene-plan').Relation,fromId:string,toId:string,
 * widthPx:number,heightPx:number,slideSize:{widthPt:number,heightPt:number},connectorCornerMode?:import('../routing/source-route-corner-mode').ConnectorCornerMode}} request */
function compileSourceSceneRoute(request){
 if(!record(request)||!record(request.relation)||!record(request.slideSize))throw new TypeError('Scene route controls are invalid');
 const mode=parseConnectorCornerMode(request.connectorCornerMode);
 const {fit,relation,fromId,toId,widthPx,heightPx,slideSize}=request;
 if(![relation.id,relation.regionId,relation.fromId,relation.toId].every(v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(v))
  ||![slideSize.widthPt,slideSize.heightPt].every(n=>Number.isFinite(n)&&n>0&&n<=100000))throw new TypeError('Scene route controls are invalid');
 if(!isMeasuredSourceRoute(fit,{fromId,toId,direction:relation.direction,widthPx,heightPx}))throw new TypeError('Scene route proof is invalid');
 if(!sceneRouteWithinAnchor(relation,fit.points))throw new TypeError('Scene route source anchor is invalid');
 const sx=slideSize.widthPt/widthPx,sy=slideSize.heightPt/heightPx,prefix=`scene-${relation.id}`;
 const arrowSize=fit.filledTerminals?'large':'medium';
 // A filled footprint was selected because a calibrated stroke could not
 // represent all its source paint. Geometry-only orthogonal regularization
 // cannot override that source decision or invent a replacement arrow.
 if(fit.filledBody)return compileFilledSourceRoute(request);
 // The partitioned-head proof fixes its cut vertices and exact head chords.
 // Orthogonal snapping/rounding would replace those certified segments.
 const native=fit.fixedHeadCuts?null:nativeSceneRoute(fit,relation,fromId,toId,sx,sy,arrowSize,mode);
 if(native)return [native];
 const points=fit.points.map(p=>({x:p.x*sx,y:p.y*sy})),parts=[];
 const source={editable:true,nativeRebuild:true,semanticNativeStructure:true,detector:'source-scene-route',
  sceneRegionId:relation.regionId,sceneRelationId:relation.id,sourceNodeIds:[fromId,toId],sourceShaftSupport:fit.support,
  ...(fit.startOffset||fit.endOffset?{sourceAttachmentKind:'measured-contour-physical',sourcePhysicalAttachment:true}:{}),
  ...(fit.fixedHeadCuts?{sourceFixedHeadCuts:true}:{}),sourceRouteParts:points.length*2-3};
 for(let i=1;i<points.length-1;i++){
  const p=points[i];if(!p)throw new TypeError('Scene route point is invalid');
  parts.push({id:`${prefix}-joint-${i}`,type:'rect',box:{x:p.x-.05,y:p.y-.05,w:.1,h:.1},style:{fill:'none',stroke:'none',strokeWidthPt:0},
   source:{...source,nativeComponentRole:'relationship-route-control',routeControl:true}});
 }
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1];if(!a||!b)throw new TypeError('Scene route point is invalid');
  const first=i===0,last=i===points.length-2;
  const startAnchor=first?{elementId:fromId,side:fit.startSide,position:fit.startPosition,
   ...(fit.startOffset?{dxPt:fit.startOffset.x*sx,dyPt:fit.startOffset.y*sy}:{})}:{elementId:`${prefix}-joint-${i}`,side:'right',position:.5};
  const endAnchor=last?{elementId:toId,side:fit.endSide,position:fit.endPosition,
   ...(fit.endOffset?{dxPt:fit.endOffset.x*sx,dyPt:fit.endOffset.y*sy}:{})}:{elementId:`${prefix}-joint-${i+1}`,side:'left',position:.5};
  parts.push({id:i===0?prefix:`${prefix}-segment-${i+1}`,type:'line',box:{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},
   style:{fill:'none',stroke:fit.color,strokeWidthPt:fit.widthPx*(sx+sy)/2,lineCap:'round',startAnchor,endAnchor,
    ...(fit.paint?{strokeGradient:sourceRouteSegmentGradient(fit.paint.stops,fit.paint.positions[i]??NaN,fit.paint.positions[i+1]??NaN,Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI)}:{}),
    ...(first&&['backward','both'].includes(relation.direction)?{startArrow:'triangle',startArrowWidth:arrowSize,startArrowLength:arrowSize}:{}),
    ...(last&&['forward','both'].includes(relation.direction)?{endArrow:'triangle',endArrowWidth:arrowSize,endArrowLength:arrowSize}:{})},
   source:{...source,nativeComponentRole:'relationship',role:'relationship',routeSegmentIndex:i,sourceRouteVertexCount:points.length}});
 }
 if(parts.length>SOURCE_ROUTE_PART_LIMIT)throw new RangeError('Scene route parts exceed the unit budget');
 return parts;
}
/** One measured route as ONE native Office connector when it regularizes to
 * orthogonal legs (rounded corners included). Both ends keep the measured
 * physical attachments; Office re-routes the elbow when a node moves.
 * @param {NonNullable<ReturnType<typeof import('./source-scene-route').measureSourceSceneRoute>['fit']>} fit
 * @param {import('./source-scene-plan').Relation} relation @param {string} fromId @param {string} toId
 * @param {number} sx @param {number} sy @param {string} arrowSize
 * @param {import('../routing/source-route-corner-mode').ConnectorCornerMode} mode */
function nativeSceneRoute(fit,relation,fromId,toId,sx,sy,arrowSize,mode){
 const route=orthogonalSourceRoute(fit.points,{widthPx:fit.widthPx});if(!route)return null;
 const pts=route.map(p=>({x:p.x*sx,y:p.y*sy})),connector=nativeElbowConnector(pts);if(!connector)return null;
 const a=/** @type {{x:number,y:number}} */(pts[0]),b=/** @type {{x:number,y:number}} */(pts[pts.length-1]),prefix=`scene-${relation.id}`;
 const rounded=roundedSourceRoute({measured:fit.points,route,sx,sy,mode});
 const drawing=rounded?[{x:rounded.box.x/sx,y:rounded.box.y/sy},{x:(rounded.box.x+rounded.box.w)/sx,y:(rounded.box.y+rounded.box.h)/sy}]
  :nativeElbowVertices(connector).map(p=>({x:p.x/sx,y:p.y/sy}));
 const gradient=nativeSourceRouteGradient(fit.points,fit.paint,drawing);
 // Preserve a proven non-spatial paint model through the segmented writer.
 if(fit.paint&&!gradient)return null;
 const startAnchor={elementId:fromId,side:fit.startSide,position:fit.startPosition,...(fit.startOffset?{dxPt:fit.startOffset.x*sx,dyPt:fit.startOffset.y*sy}:{})};
 const endAnchor={elementId:toId,side:fit.endSide,position:fit.endPosition,...(fit.endOffset?{dxPt:fit.endOffset.x*sx,dyPt:fit.endOffset.y*sy}:{})};
 return {id:prefix,type:rounded?'freeform':'line',box:rounded?.box??{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},
  style:{fill:'none',stroke:fit.color,strokeWidthPt:fit.widthPx*(sx+sy)/2,lineCap:'round',...connector,
   ...(gradient?{strokeGradient:sourceRouteGradientInFrame(gradient,connector.connectorFrame)}:{}),
   startAnchor,endAnchor,
   ...(['backward','both'].includes(relation.direction)?{startArrow:'triangle',startArrowWidth:arrowSize,startArrowLength:arrowSize}:{}),
   ...(['forward','both'].includes(relation.direction)?{endArrow:'triangle',endArrowWidth:arrowSize,endArrowLength:arrowSize}:{})},
  source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,detector:'source-scene-route',
   sceneRegionId:relation.regionId,sceneRelationId:relation.id,sourceNodeIds:[fromId,toId],sourceShaftSupport:fit.support,
   ...(fit.startOffset||fit.endOffset?{sourceAttachmentKind:'measured-contour-physical',sourcePhysicalAttachment:true}:{}),
   sourceRouteParts:1,nativeComponentRole:'relationship',role:'relationship',connector:true,connectorCornerMode:rounded?'rounded-freeform':'reroutable-elbow',
   nativeConnectorRoute:!rounded,nativeRoutePoints:pts,sourceRouteVertexCount:fit.points.length},
  ...(rounded?{style:{fill:'none',stroke:fit.color,strokeWidthPt:fit.widthPx*(sx+sy)/2,lineCap:'round',...rounded.style,
   startAnchor,endAnchor,
   ...(gradient?{strokeGradient:gradient}:{}),
   ...(['backward','both'].includes(relation.direction)?{startArrow:'triangle',startArrowWidth:arrowSize,startArrowLength:arrowSize}:{}),
   ...(['forward','both'].includes(relation.direction)?{endArrow:'triangle',endArrowWidth:arrowSize,endArrowLength:arrowSize}:{})}}:{})};
}
module.exports={compileSourceSceneRoute};
