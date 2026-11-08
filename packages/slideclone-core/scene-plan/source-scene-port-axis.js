// @ts-check
"use strict";
const {hasMeasuredScenePortFrame}=require('./source-scene-port-evidence');
const {hasSceneTextEndpoint}=require('./source-scene-text-endpoints');
/** One bounded observation hypothesis for already validated, measured nodes.
 * Centers do not determine physical attachment sites. A shared transverse
 * interval or an admitted location proposal nominates one axis; neither
 * grants shaft or attachment authority. The proposal must span the gap center.
 * The caller must retain the original five probes and verify both ports.
 * @param {Pick<Parameters<typeof import('./source-scene-relation').measureSceneRelationDetailed>[0],'image'|'from'|'to'|'shaftBox'>} input
 * @returns {{horizontal:boolean,axis:number}|null} */
function measuredScenePortAxis({image,from,to,shaftBox}){
 const a=from.box,b=to.box;
 if(!(hasMeasuredScenePortFrame(image,from.portFrame,a)||hasSceneTextEndpoint(image,from.portFrame,a))
  ||!(hasMeasuredScenePortFrame(image,to.portFrame,b)||hasSceneTextEndpoint(image,to.portFrame,b)))return null;
 const x0=Math.max(a.x,b.x),x1=Math.min(a.x+a.w,b.x+b.w);
 const y0=Math.max(a.y,b.y),y1=Math.min(a.y+a.h,b.y+b.h);
 const horizontal=(a.x+a.w<b.x||b.x+b.w<a.x)&&y1>y0;
 const vertical=(a.y+a.h<b.y||b.y+b.h<a.y)&&x1>x0;
 if(horizontal===vertical)return null;
 if(shaftBox){
  const axis=horizontal?shaftBox.y+shaftBox.h/2:shaftBox.x+shaftBox.w/2;
  const gap=horizontal?(a.x<b.x?(a.x+a.w+b.x)/2:(b.x+b.w+a.x)/2):(a.y<b.y?(a.y+a.h+b.y)/2:(b.y+b.h+a.y)/2);
  if(axis<(horizontal?y0:x0)||axis>(horizontal?y1:x1)
   ||gap<(horizontal?shaftBox.x:shaftBox.y)||gap>(horizontal?shaftBox.x+shaftBox.w:shaftBox.y+shaftBox.h))return null;
  return {horizontal,axis};
 }
 return {horizontal,axis:horizontal?(y0+y1)/2:(x0+x1)/2};
}
module.exports={measuredScenePortAxis};
