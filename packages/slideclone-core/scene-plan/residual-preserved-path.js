// @ts-check
"use strict";
const {types}=require("node:util");
const {hasClosedRingTopology}=require("./source-closed-ring");
const {readNativeFreeformSegments}=require("./native-freeform-path");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(property=>"value" in property);}
/** @param {unknown} value @param {number} maximum @returns {value is unknown[]} */
function list(value,maximum){return Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype
 &&value.length<=maximum&&Reflect.ownKeys(value).length===value.length+1
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(property=>"value" in property);}
/** A source-measured hollow fill owns its winding, while its interior remains
 * unowned. The downstream path eraser validates geometry and keeps its holes.
 * Preserve the old exclusion for rectangles, strokes, open/unknown paths and
 * unmeasured outlines. This predicate grants no box or source-pixel authority.
 * @param {unknown} value */
function canErasePreservedInteriorPath(value){
 if(!record(value)||value.type!=="freeform"||!record(value.source)||!record(value.style))return false;
 const source=value.source,style=value.style;
 if(source.detector!=="source-scene-outline"||source.nativeRebuild!==true||source.semanticNativeStructure!==true
  ||source.editable!==true||source.preserveResidualInterior!==true||source.residualBackgroundFill!==false
  ||source.sourcePerimeterSupport!==1||style.stroke!=="none"||typeof style.fill!=="string"
  ||!/^#[a-f0-9]{6}$/iu.test(style.fill))return false;
 const geometry=readNativeFreeformSegments(style);if(!list(geometry,120))return false;
 /** @type {import('./source-scene-band-geometry').Segments} */const segments=[];
 let vertices=0,open=false;
 for(const raw of geometry){
  if(!record(raw)||!list(raw.points,1))return false;
  if(raw.type==="close"){
   if(raw.points.length||!open||vertices<3)return false;open=false;vertices=0;segments.push({type:"close",points:[]});continue;
  }
  if(typeof raw.type!=="string"||!["moveTo","lnTo"].includes(raw.type)||raw.points.length!==1||!record(raw.points[0]))return false;
  const point=raw.points[0];
  if(![point.x,point.y].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1))return false;
  if(raw.type==="moveTo"){if(open)return false;open=true;vertices=1;}
  else {if(!open)return false;vertices++;}
  segments.push({type:raw.type==="moveTo"?"moveTo":"lnTo",points:[{x:Number(point.x),y:Number(point.y)}]});
 }
 return !open&&hasClosedRingTopology(segments);
}
module.exports={canErasePreservedInteriorPath};
