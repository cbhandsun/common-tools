// @ts-check
"use strict";
const {types}=require("node:util");
const {traceNativeMaskContours}=require("./native-mask-contours");
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{checks:number,exhausted:boolean}} WorkState */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(property=>"value" in property);}
/** @param {unknown} value @returns {value is Box} */
function box(value){return record(value)&&[value.x,value.y,value.w,value.h].every(Number.isSafeInteger)
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0
 &&Number(value.x)+Number(value.w)<=16384&&Number(value.y)+Number(value.h)<=16384;}
/** An already measured background may partition its outer silhouette into
 * several editable paths. This grants no source ownership and samples no new
 * pixels. Like outerOnly, enclosed foreground holes are underpainted; foreground
 * layers must remain above it. All initial/partition fits share the original
 * 4M contour allowance and every path retains the original 120-segment bound.
 * @param {unknown} input @param {WorkState} state */
function splitNativeBackground(input,state){
 if(!record(input)||!box(input.box)||!Array.isArray(input.points)||types.isProxy(input.points)
  ||input.box.w*input.box.h>262144||input.points.length>262144
  ||Reflect.ownKeys(input.points).length!==input.points.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(input.points)).some(property=>!("value" in property)))
  throw new TypeError("Native background partition input is invalid");
 if(!record(state)||!Number.isSafeInteger(state.checks)||state.checks<0||state.checks>4000001||typeof state.exhausted!=="boolean")
  throw new TypeError("Native background partition work state is invalid");
 const bounds=input.box;
 /** @type {Point[]} */const points=[];
 for(const point of input.points){
  if(!record(point)||!Number.isSafeInteger(point.x)||!Number.isSafeInteger(point.y)
   ||Number(point.x)<bounds.x||Number(point.y)<bounds.y||Number(point.x)>=bounds.x+bounds.w||Number(point.y)>=bounds.y+bounds.h)
   throw new TypeError("Native background partition point is invalid");
  points.push({x:Number(point.x),y:Number(point.y)});
 }
 if(!points.length||state.exhausted||state.checks>=4000000)return null;
 const spend=()=>{if(++state.checks>4000000){state.exhausted=true;return false;}return true;};
 const area=bounds.w*bounds.h,mask=new Uint8Array(area),outside=new Uint8Array(area),queue=new Uint32Array(area);
 for(const point of points){if(!spend())return null;mask[(point.y-bounds.y)*bounds.w+point.x-bounds.x]=1;}
 let head=0,tail=0;
 /** @param {number} n */const add=n=>{if(mask[n]||outside[n])return;outside[n]=1;queue[tail++]=n;};
 for(let x=0;x<bounds.w;x++){add(x);add((bounds.h-1)*bounds.w+x);}
 for(let y=1;y<bounds.h-1;y++){add(y*bounds.w);add(y*bounds.w+bounds.w-1);}
 while(head<tail){
  if(!spend())return null;
  const n=queue[head++]??0,x=n%bounds.w,y=Math.floor(n/bounds.w);
  if(x)add(n-1);if(x<bounds.w-1)add(n+1);if(y)add(n-bounds.w);if(y<bounds.h-1)add(n+bounds.w);
 }
 for(let n=0;n<area;n++){if(!spend())return null;if(!outside[n])mask[n]=1;}
 const pending=[{box:bounds,depth:0}];
 /** @type {{box:Box,segments:NonNullable<ReturnType<typeof traceNativeMaskContours>>}[]} */const parts=[];
 while(pending.length){
  const item=pending.pop();if(!item)break;
  const frame=item.box;
  /** @type {Point[]} */const cells=[];
  for(let y=frame.y;y<frame.y+frame.h;y++)for(let x=frame.x;x<frame.x+frame.w;x++){
   if(!spend())return null;if(mask[(y-bounds.y)*bounds.w+x-bounds.x])cells.push({x,y});
  }
  if(!cells.length)continue;
  const segments=traceNativeMaskContours(cells,frame,{outerOnly:false,curveFallback:true,workState:state,fastFail:true});
  if(state.exhausted)return null;
  if(segments){parts.push({box:frame,segments});continue;}
  if(item.depth>=8||parts.length+pending.length+2>32)return null;
  const horizontal=frame.w>=frame.h,half=Math.floor((horizontal?frame.w:frame.h)/2);if(!half)return null;
  pending.push({depth:item.depth+1,box:horizontal?{...frame,x:frame.x+half,w:frame.w-half}:{...frame,y:frame.y+half,h:frame.h-half}},
   {depth:item.depth+1,box:horizontal?{...frame,w:half}:{...frame,h:half}});
 }
 return parts.length?parts:null;
}
module.exports={splitNativeBackground};
