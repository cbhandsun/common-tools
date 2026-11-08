// @ts-check
'use strict';
const {record}=require('../scene-plan/source-scene-group-containment');
const {decodeNativeFreeformPath,encodeNativeFreeformPath,readNativeFreeformSegments}=require('../scene-plan/native-freeform-path');
/** @param {unknown} value @returns {value is {x:number,y:number,w:number,h:number}} */
const box=value=>record(value)&&[value.x,value.y,value.w,value.h].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=100000)
 &&Number(value.w)>0&&Number(value.h)>0;
/** Prove an open, unfilled, stroked native path and its actual endpoint
 * geometry. Flags, detector names and mode labels supply no editability.
 * This proves PATH editing only; a freeform does not move with its nodes.
 * @param {unknown} shape @param {Map<string,unknown[]>} objects */
function isNativeRelationshipPath(shape,objects){
 if(!record(shape)||shape.type!=='freeform'||!box(shape.box)||!record(shape.style)||typeof shape.id!=='string')return false;
 const style=shape.style,bounds=shape.box;
 if(style.closed!==false||style.fill!=='none'||typeof style.stroke!=='string'||!/^#[a-f0-9]{6}$/iu.test(style.stroke)
  ||typeof style.strokeWidthPt!=='number'||!Number.isFinite(style.strokeWidthPt)||style.strokeWidthPt<=0||style.strokeWidthPt>100
  ||[style.rotationDeg,style.rotation,style.flipH,style.flipV,style.connectorFrame].some(v=>v!==undefined))return false;
 /** @type {import('../scene-plan/native-freeform-path').Segment[]} */let segments;
 try{segments=decodeNativeFreeformPath(encodeNativeFreeformPath(readNativeFreeformSegments(style)));}
 catch(error){if(error instanceof TypeError)return false;throw error;}
 if(segments.length<2||segments[0]?.type!=='moveTo'||segments.slice(1).some(s=>!['lnTo','cubicBezTo'].includes(s.type)))return false;
 const first=segments[0]?.points[0],last=segments.at(-1)?.points.at(-1);if(!first||!last)return false;
 if(Math.hypot((first.x-last.x)*bounds.w,(first.y-last.y)*bounds.h)<1e-6)return false;
 /** @param {unknown} raw @param {{x:number,y:number}} point */
 const attaches=(raw,point)=>{
  if(!record(raw)||typeof raw.elementId!=='string'||raw.elementId===shape.id||typeof raw.side!=='string'||!['top','bottom','left','right'].includes(raw.side)
   ||typeof raw.position!=='number'||!Number.isFinite(raw.position)||raw.position<0||raw.position>1
   ||[raw.dxPt,raw.dyPt].some(v=>v!==undefined&&(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000)))return false;
  const candidates=objects.get(raw.elementId),target=candidates?.[0];if(candidates?.length!==1||!record(target)||!box(target.box))return false;
  const b=target.box,horizontal=raw.side==='top'||raw.side==='bottom';
  const x=b.x+(horizontal?b.w*raw.position:raw.side==='right'?b.w:0)+Number(raw.dxPt??0);
  const y=b.y+(horizontal?(raw.side==='bottom'?b.h:0):b.h*raw.position)+Number(raw.dyPt??0);
  return Math.hypot(bounds.x+point.x*bounds.w-x,bounds.y+point.y*bounds.h-y)<=1e-4;
 };
 return attaches(style.startAnchor,first)&&attaches(style.endAnchor,last);
}
module.exports={isNativeRelationshipPath};
