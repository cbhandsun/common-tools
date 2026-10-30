// @ts-check
'use strict';
const {record}=require('../scene-plan/source-scene-group-containment');
const {observeSegmentedSourceRoute}=require('./source-segmented-route-observation');
const {certifySegmentedRouteChain}=require('./source-segmented-route-chain');
const {traceNativeMaskContours}=require('../scene-plan/native-mask-contours');
/** A complete graphic proposal for source-visible dashed route ink. No line is
 * drawn in a gap. This explicitly does NOT grant direction, physical endpoint
 * attachment or a resolved relation; those require separate joint admission.
 * Observe again under the same source session: serialized component lists
 * cannot become source-authorized paths. No text/image/node is changed.
 * @param {unknown} input */
function proposeSegmentedRouteGraphic(input){
 if(!record(input)||!record(input.relation)||!record(input.slideSize)||!record(input.image)||!Buffer.isBuffer(input.image.rgba)
  ||![input.relation.id,input.relation.regionId].every(v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(v))
  ||![input.slideSize.widthPt,input.slideSize.heightPt].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=100000))throw new TypeError('Segmented graphic controls are invalid');
 const observed=observeSegmentedSourceRoute(input);
 if(observed.failure!==null||!observed.components)return {failure:observed.failure??'segmented-source-observation'};
 const chain=certifySegmentedRouteChain(observed);
 if(chain.failure!==null||!chain.order)return {failure:chain.failure??'segmented-chain'};
 const sx=Number(input.slideSize.widthPt)/Number(input.image.width),sy=Number(input.slideSize.heightPt)/Number(input.image.height);
 const checks=(chain.checks??0)+(observed.workChecks??0);if(checks>4000000)return {failure:'segmented-geometry-budget'};
 const rgba=input.image.rgba,width=Number(input.image.width),work={checks,exhausted:false};
 /** @type {{id:string,type:string,box:import('../scene-plan/source-scene-plan').Box,style:{fill:string,stroke:string,strokeWidthPt:number,freeformSegments:NonNullable<ReturnType<typeof traceNativeMaskContours>>},source:Record<string,unknown>}[]} */const shapes=[];
 /** @type {number[][]} */const paints=[];
 for(const [index,id]of chain.order.entries()){
  const component=observed.components[id];if(!component)throw new TypeError('Segmented graphic binding is invalid');
  work.checks+=component.cells.length*32;if(work.checks>4000000)return {failure:'segmented-geometry-budget'};
  // Require corroborated actual opaque cores, not a provider color or one dark
  // outlier. The selected core fraction retains the original 18/.9 bounds.
  const colors=component.cells.map(p=>{const at=(p.y*width+p.x)*4;return [rgba[at]??0,rgba[at+1]??0,rgba[at+2]??0];})
   .sort((a,b)=>Math.max(...a)-Math.max(...b));
  const core=colors.slice(0,Math.max(4,Math.ceil(colors.length*.25))),paint=[0,1,2].map(c=>core.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(core.length/2)]??0);
  if(core.filter(p=>p.every((v,c)=>Math.abs(v-(paint[c]??0))<=18)).length/core.length<.9)return {failure:'segmented-core-paint'};
  paints.push(paint);
  const segments=traceNativeMaskContours(component.cells,component.box,{curveFallback:true,workState:work});
  if(!segments||work.exhausted)return {failure:'segmented-native-contour'};
  const color='#'+paint.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase(),b=component.box;
  shapes.push({id:`scene-segmented-${input.relation.id}-${index}`,type:'freeform',box:{x:b.x*sx,y:b.y*sy,w:b.w*sx,h:b.h*sy},
   style:{fill:color,stroke:'none',strokeWidthPt:0,freeformSegments:segments},
   source:{editable:true,nativeRebuild:true,semanticNativeStructure:true,detector:'source-segmented-route-graphic',nativeComponentRole:'relationship-route-observed',
    sceneRegionId:input.relation.regionId,sceneRelationCandidateId:input.relation.id,sourceAttachmentKind:'observed-segmented-graphic',
    sourcePhysicalAttachment:false,sourceDirectionVerified:false,sourceSegmentCount:chain.order.length,sourceObservedInkPixels:component.cells.length}});
 }
 const first=paints[0];if(!first||paints.some(p=>p.some((v,c)=>Math.abs(v-(first[c]??0))>18)))return {failure:'segmented-paint-transition'};
 return {failure:/** @type {null} */(null),shapes,sourceDirectionVerified:false,relationResolved:false,gapLimit:chain.gapLimit};
}
module.exports={proposeSegmentedRouteGraphic};
