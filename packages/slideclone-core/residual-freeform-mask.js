// @ts-check
"use strict";
const {types}=require("node:util");
const {readNativeFreeformSegments}=require("./native-freeform-path");
const {cubicRowCrossings}=require('./residual-bezier-crossings');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==="object"&&!types.isProxy(v)&&!Array.isArray(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>"value" in p);}
/** @param {unknown} v @param {number} max @returns {unknown[]} */
function list(v,max){if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>max||Reflect.ownKeys(v).length!==v.length+1||Object.values(Object.getOwnPropertyDescriptors(v)).some(p=>!("value" in p)))throw new TypeError("Residual freeform collection is invalid");return v;}
/** @typedef {{x:number,y:number}} Point */
/** Convert native filled polygon ink into ordinary non-overlapping row masks.
 * Nonzero winding preserves native hollow paths without owning their boxes.
 * Existing residual mask counts and page scan budgets still apply.
 * @param {unknown} item @param {{width:number,height:number}} image
 * @param {{w:number,h:number}} slideSize
 * @returns {{kind:"rect",x:number,y:number,w:number,h:number}[]} */
function freeformResidualMasks(item,image,slideSize){
 if(!record(item)||!record(item.box)||!record(item.style)||!record(image)||!record(slideSize)
  ||![image.width,image.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||image.width*image.height>40000000
  ||![slideSize.w,slideSize.h].every(n=>Number.isFinite(n)&&n>0)||item.style.stroke!=="none"
  ||typeof item.style.fill!=="string"||!/^#[a-f0-9]{6}$/iu.test(item.style.fill))throw new TypeError("Residual freeform input is invalid");
 const {x,y,w,h}=item.box;
 if(typeof x!=="number"||typeof y!=="number"||typeof w!=="number"||typeof h!=="number"
  ||![x,y,w,h].every(Number.isFinite)||x<0||y<0||w<=0||h<=0||x+w>slideSize.w||y+h>slideSize.h)throw new TypeError("Residual freeform box is invalid");
 /** @typedef {{vertices:Point[],curves:Map<number,[Point,Point,Point,Point]>}} Loop */
 /** @type {Loop[]} */const loops=[];/** @type {Loop|null} */let current=null;
 const sx=image.width/slideSize.w,sy=image.height/slideSize.h;
 for(const raw of list(readNativeFreeformSegments(item.style),120)){
  if(!record(raw)||typeof raw.type!=="string")throw new TypeError("Residual freeform segment is invalid");
  const points=list(raw.points,3);
  if(raw.type==="close"){
   if(points.length||!current||current.vertices.length<3)throw new TypeError("Residual freeform loop is invalid");
   loops.push(current);current=null;continue;
  }
  if(!["moveTo","lnTo","cubicBezTo"].includes(raw.type)||points.length!==(raw.type==='cubicBezTo'?3:1))throw new TypeError("Residual freeform segment is invalid");
  const mapped=points.map(p=>{if(!record(p)||typeof p.x!=="number"||typeof p.y!=="number"||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw new TypeError("Residual freeform point is invalid");
   return {x:(x+p.x*w)*sx,y:(y+p.y*h)*sy};});
  const point=mapped[mapped.length-1];if(!point)throw new TypeError('Residual freeform point is invalid');
  if(raw.type==="moveTo"){if(current)throw new TypeError("Residual freeform loop is open");current={vertices:[point],curves:new Map()};}
  else {if(!current)throw new TypeError("Residual freeform loop is invalid");
   if(raw.type==='cubicBezTo'){const a=current.vertices[current.vertices.length-1],b=mapped[0],c=mapped[1];if(!a||!b||!c)throw new TypeError('Residual freeform curve is invalid');current.curves.set(current.vertices.length-1,[a,b,c,point]);}
   current.vertices.push(point);}
 }
 if(current||!loops.length)throw new TypeError("Residual freeform loop is open");
 /** @type {{kind:"rect",x:number,y:number,w:number,h:number}[]} */const masks=[];
 const from=Math.max(0,Math.floor(y*sy)),to=Math.min(image.height,Math.ceil((y+h)*sy));
 for(let row=from;row<to;row++){
  const center=row+.5,crossings=[];
  for(const loop of loops)for(let i=0;i<loop.vertices.length;i++){
   const curve=loop.curves.get(i);if(curve){crossings.push(...cubicRowCrossings(curve,center));continue;}
   const a=loop.vertices[i],b=loop.vertices[(i+1)%loop.vertices.length];if(!a||!b)throw new TypeError("Residual freeform loop is invalid");
   if(a.y<=center&&b.y>center||b.y<=center&&a.y>center)
    crossings.push({x:a.x+(center-a.y)*(b.x-a.x)/(b.y-a.y),delta:b.y>a.y?1:-1});
  }
  crossings.sort((a,b)=>a.x-b.x);let winding=0,start=0;
  for(const crossing of crossings){
   const before=winding;winding+=crossing.delta;
   if(before===0&&winding!==0)start=crossing.x;
   else if(before!==0&&winding===0){const left=Math.max(0,Math.ceil(start-.5)),right=Math.min(image.width,Math.ceil(crossing.x-.5));
    if(right>left){if(masks.length>=30000)throw new RangeError("Residual freeform mask count exceeds boundary");masks.push({kind:"rect",x:left,y:row,w:right-left,h:1});}}
  }
  if(winding!==0)throw new TypeError("Residual freeform winding is invalid");
 }
 return masks;
}
/** A native surface can have both a measured fill and a visible border. Its
 * background mask owns only matching fill pixels inside the closed winding;
 * the border never expands that mask. Projecting fill geometry does not mutate
 * the native object or its source/owner seal.
 * @param {unknown} item @param {{width:number,height:number}} image
 * @param {{w:number,h:number}} slideSize */
function freeformBackgroundResidualMasks(item,image,slideSize){
 if(!record(item)||!record(item.style)||!record(item.source)||item.source.residualBackgroundFill!==true
  ||typeof item.style.stroke!=='string'||!(item.style.stroke==='none'||/^#[a-f0-9]{6}$/iu.test(item.style.stroke)))
  throw new TypeError('Residual freeform background is invalid');
 const masks=freeformResidualMasks({...item,style:{...item.style,stroke:'none'}},image,slideSize);
 const fill=String(item.style.fill);
 return masks.map(mask=>({...mask,sourceFill:[1,3,5].map(index=>Number.parseInt(fill.slice(index,index+2),16))}));
}
module.exports={freeformResidualMasks,freeformBackgroundResidualMasks};
