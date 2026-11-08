// @ts-check
"use strict";
const {record}=require('./source-scene-group-containment');
const {readNativeFreeformSegments,encodeNativeFreeformPath,decodeNativeFreeformPath}=require('./native-freeform-path');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{used:number,exhausted:boolean}} Work */
/** @param {unknown} value @returns {value is Box} */
function finiteBox(value){return record(value)&&[value.x,value.y,value.w,value.h].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)
 &&Number(value.w)>0&&Number(value.h)>0;}
/** @param {unknown} value @returns {asserts value is Work} */
function validateWork(value){
 if(!record(value)||!Number.isSafeInteger(value.used)||Number(value.used)<0||Number(value.used)>4000000||typeof value.exhausted!=='boolean'
  ||!Object.getOwnPropertyDescriptor(value,'used')?.writable||!Object.getOwnPropertyDescriptor(value,'exhausted')?.writable)
  throw new TypeError('Native paint geometry budget is invalid');
}
/** This spends the caller's existing derived-geometry allowance, never source pixels.
 * @param {Work} work @param {number} count */
function charge(work,count){if(work.exhausted)return false;if(work.used+count>4000000){work.exhausted=true;return false;}work.used+=count;return true;}
/** A positive result proves that a closed native surface cannot paint this box.
 * Unknown paint effects, strokes, rotation and open paths grant no proof.
 * A Bezier and its endpoint chord are homotopic inside their control hull.
 * When that entire hull is disjoint from the query, replacing the curve by
 * its chord preserves the winding at every query point, without sampling or
 * root-finding. Boundary uncertainty always rejects. Office uses nonzero fill.
 * This proves paint separation only; it never grants pixel or node ownership.
 * @param {unknown} item @param {unknown} query @param {unknown} budget */
function nativeFilledPathDisjoint(item,query,budget){
 validateWork(budget);
 if(!charge(budget,32))return false;
 if(!record(item)||item.type!=='freeform'||!finiteBox(item.box)||!finiteBox(query)
  ||item.rotation!==undefined&&item.rotation!==0||!record(item.style))return false;
 if(Object.keys(item).some(k=>!['id','type','box','style','source','rotation'].includes(k)))return false;
 const style=item.style;
 if(Object.keys(style).some(k=>!['fill','stroke','strokeWidthPt','opacity','freeformSegments','freeformPath'].includes(k))
  ||typeof style.fill!=='string'||style.fill!=='none'&&!/^#[0-9a-f]{6}$/iu.test(style.fill)||style.stroke!=='none'||style.strokeWidthPt!==0
  ||style.opacity!==undefined&&(typeof style.opacity!=='number'||!Number.isFinite(style.opacity)||style.opacity<0||style.opacity>1))return false;
 const raw=readNativeFreeformSegments(style);if(raw===undefined)return false;
 const segments=decodeNativeFreeformPath(encodeNativeFreeformPath(raw));
 if(!charge(budget,segments.reduce((sum,s)=>sum+8*(s.points.length+1),0)))return false;
 // An explicitly unfilled, unstroked anchor retains its path and attachments
 // but contributes no paint. Still validate every loop and debit its geometry;
 // unknown effects and malformed/open paths cannot acquire this proof.
 const visible=style.fill!=='none';
 const box=item.box,left=(query.x-box.x)/box.w,right=(query.x+query.w-box.x)/box.w,
  top=(query.y-box.y)/box.h,bottom=(query.y+query.h-box.y)/box.h;
 if(![left,right,top,bottom].every(Number.isFinite))return false;
 // The writer rounds every control coordinate onto a 21,600-unit path grid,
 // and rounds both the frame offset and extent onto 12,700 EMU per point.
 // Their worst-case errors add: half a path cell plus one EMU per axis.
 // Inflate the query by this bound before testing raw control hulls. A gap
 // in floating IR alone cannot prove separation in the emitted native shape.
 const epsilonX=1/43200+1/(12700*box.w)+1e-9,
  epsilonY=1/43200+1/(12700*box.h)+1e-9,cx=(left+right)/2,cy=(top+bottom)/2;
 /** @type {Point|null} */let first=null,current=null;
 let drawn=0,closed=0,winding=0;
 /** @param {Point[]} hull */
 const separated=hull=>Math.max(...hull.map(p=>p.x))<left-epsilonX||Math.min(...hull.map(p=>p.x))>right+epsilonX
  ||Math.max(...hull.map(p=>p.y))<top-epsilonY||Math.min(...hull.map(p=>p.y))>bottom+epsilonY;
 /** @param {Point} a @param {Point} b */
 const cross=(a,b)=>{
  if(!(a.y<=cy&&b.y>cy||b.y<=cy&&a.y>cy))return;
  const x=a.x+(cy-a.y)*(b.x-a.x)/(b.y-a.y);
  if(x>cx)winding+=b.y>a.y?1:-1;
 };
 for(const segment of segments){
  if(segment.type==='moveTo'){
   if(current)return false;first=segment.points[0]??null;current=first;drawn=0;continue;
  }
  if(!first||!current)return false;
  if(segment.type==='close'){
   if(drawn<2||visible&&!separated([current,first]))return false;
   if(visible)cross(current,first);first=null;current=null;closed++;continue;
  }
  const end=segment.points.at(-1);
  if(!end||visible&&!separated([current,...segment.points]))return false;
  if(visible)cross(current,end);current=end;drawn++;
 }
 return current===null&&closed>0&&winding===0;
}
module.exports={nativeFilledPathDisjoint};
