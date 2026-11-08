// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
const {isMeasuredSceneCaptionRoute}=require('./source-scene-caption-route');
/** Compile disconnected physical fragments of ONE logical relation. Interior
 * controls attach only to their own fragment: there is no connector across
 * the caption, no hidden semantic node and no cover-up rectangle.
 * @param {{fit:NonNullable<ReturnType<typeof import('./source-scene-caption-route').measureSourceSceneCaptionRoute>['fit']>,relation:import('./source-scene-plan').Relation,fromId:string,toId:string,width:number,height:number,slideSize:{widthPt:number,heightPt:number}}} request */
function compileSourceSceneCaptionRoute(request){
 if(!record(request)||!record(request.relation)||!record(request.slideSize)
  ||![request.relation.id,request.relation.regionId].every(v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(v))
  ||![request.slideSize.widthPt,request.slideSize.heightPt].every(n=>Number.isFinite(n)&&n>0&&n<=100000)
  ||!isMeasuredSceneCaptionRoute(request.fit,{from:request.fromId,to:request.toId,direction:request.relation.direction,width:request.width,height:request.height}))
  throw new TypeError('Caption route proof is invalid');
 const {fit,relation,slideSize}=request,sx=slideSize.widthPt/request.width,sy=slideSize.heightPt/request.height,parts=[];
 const prefix='scene-caption-'+relation.id;
 const source={editable:true,nativeRebuild:true,semanticNativeStructure:true,detector:'source-scene-caption-route',sceneRegionId:relation.regionId,
  sceneRelationId:relation.id,sourceNodeIds:[request.fromId,request.toId],sourceAttachmentKind:'caption-interrupted-logical',sourcePhysicalAttachment:false,
  sourceDirectionVerified:true,sourceCaptionBox:{...fit.caption},sourceRouteParts:fit.parts};
 for(const [index,fragment]of fit.fragments.entries()){
  const points=fragment.points.map(p=>({x:p.x*sx,y:p.y*sy})),stem=prefix+'-fragment-'+index;
  for(let i=1;i<points.length;i++){
   const p=points[i];if(!p)throw new TypeError('Caption route point is invalid');
   parts.push({id:stem+'-joint-'+i,type:'rect',box:{x:p.x-.05,y:p.y-.05,w:.1,h:.1},style:{fill:'none',stroke:'none',strokeWidthPt:0},
    source:{...source,nativeComponentRole:'relationship-route-control',routeControl:true}});
  }
  for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1];if(!a||!b)throw new TypeError('Caption route point is invalid');
   const contact=fragment.contact;
   const startAnchor=i===0?{elementId:index===0?request.fromId:request.toId,side:contact.side,position:contact.position,
    ...(Math.abs(contact.offset.x)+Math.abs(contact.offset.y)>1e-9?{dxPt:contact.offset.x*sx,dyPt:contact.offset.y*sy}:{})}
    :{elementId:stem+'-joint-'+i,side:'right',position:.5};
   const endAnchor={elementId:stem+'-joint-'+(i+1),side:'left',position:.5};
   parts.push({id:stem+'-segment-'+i,type:'line',box:{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},style:{fill:'none',stroke:fragment.color,
    strokeWidthPt:fragment.widthPx*(sx+sy)/2,lineCap:'round',startAnchor,endAnchor,
    ...(i===0&&fragment.arrow?{startArrow:'triangle',startArrowWidth:'medium',startArrowLength:'medium'}:{})},
    source:{...source,nativeComponentRole:'relationship',role:'relationship',sourceShaftSupport:fragment.support,sourceRouteFragmentIndex:index}});
  }
 }
 if(parts.length!==fit.parts||parts.length>32)throw new RangeError('Caption route parts exceed the unit budget');
 return parts;
}
module.exports={compileSourceSceneCaptionRoute};
