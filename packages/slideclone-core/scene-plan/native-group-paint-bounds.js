// @ts-check
'use strict';
const {record}=require('./source-scene-group-containment');
const {parseNativeTextOutline}=require('../typography/native-text-outline');
const {wholeRouteCurves}=require('../routing/source-whole-route-geometry');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} value @param {number} low @param {number} high @returns {value is number} */
function finite(value,low,high){return typeof value==='number'&&Number.isFinite(value)&&value>=low&&value<=high;}
/** Conservative envelope for the exact effects supported by the writer.
 * Centered shadow scales <=1 cannot enlarge the base rotated envelope. Sum
 * glow, blur and shadow distance so effect composition cannot undercount paint.
 * Unknown effects grant no separation proof. This grants no source ownership.
 * @param {Record<string,unknown>} style @returns {number|null} */
function effectPadding(style){
 if(Object.keys(style).some(k=>['shadow','glow','reflection'].includes(k.toLowerCase())
  &&(k!==k.toLowerCase()||k==='reflection'&&style[k]!==undefined&&style[k]!==null)))return null;
 let padding=0;
 const glow=style.glow;
 if(glow!==undefined&&glow!==null){
  if(!record(glow)||Object.keys(glow).some(k=>!['radiusPt','alpha','color'].includes(k))
   ||!finite(glow.radiusPt,0,40)||!finite(glow.alpha,0,1)||typeof glow.color!=='string'||!/^#[a-f0-9]{6}$/iu.test(glow.color))return null;
  padding+=glow.radiusPt;
 }
 const shadow=style.shadow;
 if(shadow!==undefined&&shadow!==null){
  if(!record(shadow))return null;
  const blur=shadow.blurPt??4,distance=shadow.distancePt??1.5,angle=shadow.angleDeg??45;
  if(!finite(blur,0,100000)||!finite(distance,0,100000)||!finite(angle,-100000,100000)
   ||shadow.alpha!==undefined&&!finite(shadow.alpha,0,1)
   ||['scaleX','scaleY'].some(k=>shadow[k]!==undefined&&!finite(shadow[k],.00001,1))
   ||Object.keys(shadow).some(k=>['blurpt','distancept','angledeg','scalex','scaley'].includes(k.toLowerCase())
    &&!['blurPt','distancePt','angleDeg','scaleX','scaleY'].includes(k)))return null;
  padding+=blur+distance;
 }
 return padding;
}
/** Bounds are for paint-order proofs only. Null means no bounded proof is
 * available; callers must retain the existing order. Never omit native effects.
 * @param {unknown} item @returns {Box[]|null} */
function nativePaintRegions(item){
 if(!record(item)||!record(item.box))return null;
 // Preserve the established strict outline parser and its accessor rejection.
 const outline=parseNativeTextOutline(item.style);
 const box=item.box,style=record(item.style)?item.style:{},rotation=item.rotation??0;
 const signed=item.type==='line'?-100000:0;
 if(!finite(box.x,-100000,100000)||!finite(box.y,-100000,100000)||!finite(box.w,signed,100000)||!finite(box.h,signed,100000)
  ||!finite(rotation,-100000,100000))return null;
 /** @type {Box[]} */let regions=[{x:box.x,y:box.y,w:box.w,h:box.h}];
 const effect=effectPadding(style);if(effect===null)return null;
 // Match CreateOutline's native default and supported legacy width alias.
 // A missing width must not undercount a visible one-point stroke/arrow.
 const stroke=style.strokeWidthPt??style.strokeWidth??1;if(!finite(stroke,0,100000))return null;
 if(item.type==='line'){
  // Signed endpoint deltas are valid native lines. Presets can also leave
  // their endpoint box, so bound actual decoded vertices, never abs(w/h)
  // alone. Unsupported geometry keeps the original conservative rejection.
  if(rotation!==0||style.connectorType!==undefined&&style.connectorType!=='straight'&&style.connectorFrame===undefined)return null;
  let curves;
  // The writer's ordinary line style omits fill and can spell its default
  // preset as "straight". Canonicalize only those supported defaults.
  /** @type {Record<string,unknown>} */const lineStyle={...style,fill:style.fill??'none'};
  if(style.connectorType==='straight')delete lineStyle.connectorType;
  const base=regions[0];if(!base)return null;
  try{curves=wholeRouteCurves({type:'line',box:base,style:lineStyle});}
  catch(error){if(error instanceof TypeError)return null;throw error;}
  const points=curves.flat();if(!points.length)return null;
  regions=curves.map(curve=>{const xs=curve.map(p=>p.x),ys=curve.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys);
   return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y};});
  for(const [key,point]of /** @type {const} */([['startArrow',points[0]],['endArrow',points.at(-1)]])){
   const arrow=style[key];if(arrow===undefined||arrow==='none')continue;
   if(typeof arrow!=='string'||!['triangle','arrow','openarrow'].includes(arrow.toLowerCase())||!point
    ||['Width','Length'].some(s=>style[key+s]!==undefined&&(typeof style[key+s]!=='string'
     ||!['small','medium','large'].includes(String(style[key+s]).toLowerCase()))))return null;
   // The tip is the endpoint; the body extends back along the terminal
   // tangent. A symmetric endpoint square invents paint inside the target
   // node and can incorrectly reject its otherwise disjoint label group.
   const sizes=['Width','Length'].map(s=>String(style[key+s]??'medium').toLowerCase());
   const radius=stroke*(sizes.includes('large')?10:sizes.includes('medium')?6:4);
   const ordered=key==='startArrow'?points:[...points].reverse();
   const neighbor=ordered.find(p=>Math.hypot(p.x-point.x,p.y-point.y)>1e-10);if(!neighbor)return null;
   const length=Math.hypot(neighbor.x-point.x,neighbor.y-point.y),dx=(neighbor.x-point.x)/length,dy=(neighbor.y-point.y)/length;
   const body={x:point.x+dx*radius,y:point.y+dy*radius};
   const corners=[point,{x:body.x-dy*radius,y:body.y+dx*radius},{x:body.x+dy*radius,y:body.y-dx*radius}];
   const x=Math.min(...corners.map(p=>p.x)),y=Math.min(...corners.map(p=>p.y));
   regions.push({x,y,w:Math.max(...corners.map(p=>p.x))-x,h:Math.max(...corners.map(p=>p.y))-y});
  }
 }
 // Include frame/extent and effect-radius rounding to the writer's EMU grid.
 const padding=Math.max(stroke,outline?.widthPt??0)/2+effect+2/12700;
 return regions.map(b=>{const radians=rotation*Math.PI/180,w=Math.abs(Math.cos(radians))*b.w+Math.abs(Math.sin(radians))*b.h,
  h=Math.abs(Math.sin(radians))*b.w+Math.abs(Math.cos(radians))*b.h;
  return {x:b.x+(b.w-w)/2-padding,y:b.y+(b.h-h)/2-padding,w:w+2*padding,h:h+2*padding};});
}
/** @param {unknown} item @returns {Box|null} */
function nativeGroupPaintBounds(item){
 const regions=nativePaintRegions(item);if(!regions?.length)return null;
 const x=Math.min(...regions.map(b=>b.x)),y=Math.min(...regions.map(b=>b.y));
 return {x,y,w:Math.max(...regions.map(b=>b.x+b.w))-x,h:Math.max(...regions.map(b=>b.y+b.h))-y};
}
/** A connector's outer bbox can surround a label without touching it. Every
 * actual segment, arrow and effect must be separated before reordering.
 * @param {unknown} item @param {Box} box @param {{used:number,exhausted:boolean}} work */
function nativeLinePaintDisjoint(item,box,work){
 if(!record(item)||item.type!=='line')return false;
 const regions=nativePaintRegions(item);if(!regions?.length||work.exhausted)return false;
 if(work.used+regions.length>4000000){work.exhausted=true;return false;}
 work.used+=regions.length;
 return regions.every(b=>b.x+b.w<=box.x||box.x+box.w<=b.x||b.y+b.h<=box.y||box.y+box.h<=b.y);
}
module.exports={nativeGroupPaintBounds,nativeLinePaintDisjoint};
