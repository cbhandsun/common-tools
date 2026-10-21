// @ts-check
"use strict";
/** @typedef {{id?:string,box:{x:number,y:number,w:number,h:number},style?:Record<string,unknown>,source?:Record<string,unknown>,type?:string}} Shape */
/** Expand paint after physical text grouping has decided its safe draw order.
 * The complete ring's ID, frame and path remain the anchor. Each overlay shares
 * its whole physical frame and native group, including an existing text group.
 * @param {Shape[]} shapes @param {Map<string,import('./source-outline-paint').Paint>} paints */
function applySourceOutlinePaint(shapes,paints){
 const evidence={outlinePaintUnits:0,outlinePaintParts:0};
 /** @type {Map<Shape,Shape[]>} */const members=new Map();
 const result=shapes.flatMap(shape=>{
  const paint=shape.id?paints.get(shape.id):undefined;if(!paint||!shape.id){members.set(shape,[shape]);return [shape];}
  const group=shape.source?.nativeComponentGroupId??`scene-paint-${shape.id}`;
  const source={...shape.source,nativeComponentGroupId:group};
  const base={...shape,style:{...shape.style,fill:paint.baseColor},source};
  const overlays=paint.parts.map((part,index)=>({...shape,id:`${shape.id}-paint-${index}`,type:'freeform',
   style:{fill:part.color,stroke:'none',strokeWidthPt:0,freeformSegments:part.segments.map(segment=>({...segment,
    points:segment.points.map(p=>({x:(part.box.x+p.x*part.box.w-paint.box.x)/paint.box.w,
     y:(part.box.y+p.y*part.box.h-paint.box.y)/paint.box.h}))}))},
   source:{...source,sceneOutlinePaintOwnerId:shape.id}}));
  evidence.outlinePaintUnits++;evidence.outlinePaintParts+=overlays.length;
  const expanded=[base,...overlays];members.set(shape,expanded);return expanded;
 });
 return {shapes:result,evidence,members};
}
module.exports={applySourceOutlinePaint};
