// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('./source-scene-group-containment');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{used:number,exhausted:boolean}} Work */
/** @param {unknown} value @returns {value is Box} */
function axisBox(value){return record(value)&&[value.x,value.y,value.w,value.h].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100000);}
/** Inspect only an unbound legacy visual axis against ONE already measured
 * closed source ring. The entire shaft must have ring support within its own
 * existing half-stroke envelope; unlike the older detector no gaps are allowed.
 * This proves native-fragment replacement, never source-pixel erasure, node
 * ownership, relation identity, or permission to remove a protected member.
 * The compiler supplies the measured ring; JSON/provider boxes cannot reach
 * this branch without that independent source measurement.
 * @param {unknown} input @param {unknown} measured @param {unknown} width
 * @param {unknown} scaleInput @param {unknown} context */
function visualAxisOwnedBySourceOutline(input,measured,width,scaleInput,context){
 if(!record(input)||input.type!=='line'||!axisBox(input.box)||!record(input.source)||!record(input.style)
  ||Object.keys(input).some(k=>!['id','type','box','source','style','rotation'].includes(k))
  ||input.rotation!==undefined&&input.rotation!==0||typeof input.id!=='string'||!/^[-A-Za-z0-9_]{1,128}$/u.test(input.id))return false;
 const {box,source,style}=input;
 if(source.detector!=='visual-atom-native-connector'||source.nativeRebuild!==true||source.nativeComponentPart!=='connector'
  ||source.semanticNativeStructure===true||source.sceneRelationId!==undefined||source.sceneInventoryId!==undefined)return false;
 if(Object.keys(style).some(k=>!['stroke','strokeWidthPt','connectorType','opacity'].includes(k))
  ||typeof style.stroke!=='string'||!/^#[a-f0-9]{6}$/iu.test(style.stroke)
  ||style.connectorType!==undefined&&style.connectorType!=='straight'||style.opacity!==undefined&&style.opacity!==1
  ||typeof style.strokeWidthPt!=='number'||!Number.isFinite(style.strokeWidthPt)||style.strokeWidthPt<=0)return false;
 if(typeof width!=='number'||!Number.isSafeInteger(width)||width<1||width>16384||!record(scaleInput)
  ||typeof scaleInput.x!=='number'||typeof scaleInput.y!=='number'||![scaleInput.x,scaleInput.y].every(n=>Number.isFinite(n)&&n>0)
  ||box.w!==0&&box.h!==0)return false;
 const x0=box.x*scaleInput.x,y0=box.y*scaleInput.y,x1=(box.x+box.w)*scaleInput.x,y1=(box.y+box.h)*scaleInput.y;
 if(![x0,y0,x1,y1].every(Number.isFinite)||x1>=width||y1>=16384)return false;
 const length=Math.hypot(x1-x0,y1-y0),steps=Math.ceil(length),radius=Math.ceil(style.strokeWidthPt*Math.max(scaleInput.x,scaleInput.y)/2);
 if(length<12||length>32768||radius<1||radius>8||!record(measured)||!axisBox(measured.box)||measured.box.w<=0||measured.box.h<=0
  ||!list(measured.sourcePixels)||!measured.sourcePixels.length||measured.sourcePixels.length>262144)return false;
 const frame=measured.box;
 if(x1<frame.x-radius||x0>frame.x+frame.w+radius||y1<frame.y-radius||y0>frame.y+frame.h+radius)return false;
 if(!record(context)||!list(context.shapes)||context.shapes.length>10000||!record(context.work)
  ||types.isProxy(context.protectedMembers)||!(context.protectedMembers instanceof Set)
  ||Object.getPrototypeOf(context.protectedMembers)!==Set.prototype)return false;
 const work=context.work;
 if(!Number.isSafeInteger(work.used)||Number(work.used)<0||Number(work.used)>4000000||typeof work.exhausted!=='boolean'
  ||!Object.getOwnPropertyDescriptor(work,'used')?.writable||!Object.getOwnPropertyDescriptor(work,'exhausted')?.writable)return false;
 /** @param {number} count */
 const spend=count=>{if(work.exhausted)return false;if(Number(work.used)+count>4000000){work.exhausted=true;return false;}work.used=Number(work.used)+count;return true;};
 if(!spend(1)||Set.prototype.has.call(context.protectedMembers,input))return false;
 let matches=0;
 for(const candidate of context.shapes){
  if(!spend(1)||!record(candidate)||candidate.style!==undefined&&!record(candidate.style))return false;
  if(candidate===input)matches++;
  else if(candidate.id===input.id)return false;
  const candidateStyle=candidate.style;
  if(record(candidateStyle))for(const key of ['startAnchor','endAnchor']){
   const anchor=candidateStyle[key];if(anchor===undefined)continue;
   if(!record(anchor)||anchor.elementId===input.id)return false;
  }
 }
 if(matches!==1)return false;
 /** @type {Set<number>} */const pixels=new Set();
 for(const value of measured.sourcePixels){
  if(!spend(1)||typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>=width*16384)return false;
  const x=value%width,y=Math.floor(value/width);
  if(x<frame.x||x>=frame.x+frame.w||y<frame.y||y>=frame.y+frame.h)return false;
  pixels.add(value);
 }
 for(let n=0;n<=steps;n++){
  const x=Math.round(x0+(x1-x0)*n/steps),y=Math.round(y0+(y1-y0)*n/steps);let hit=false;
  for(let d=-radius;d<=radius;d++){
   if(!spend(1))return false;
   const xx=box.w===0?x+d:x,yy=box.w===0?y:y+d;
   if(xx>=0&&xx<width&&yy>=0&&yy<16384&&pixels.has(yy*width+xx)){hit=true;break;}
  }
  if(!hit)return false;
 }
 return true;
}
module.exports={visualAxisOwnedBySourceOutline};
