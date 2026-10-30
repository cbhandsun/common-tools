// @ts-check
"use strict";
const {types}=require("node:util");
const {sourceRingDistance}=require('../routing/source-ring-distance');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==="object"&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>"value" in p);}
/** @param {unknown} v @returns {v is Box} */
function box(v){return record(v)&&[v.x,v.y,v.w,v.h].every(n=>typeof n==="number"&&Number.isFinite(n))
 &&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0;}
/** Recover only measured ink around a unique enclosed source hole. A
 * connector attached to the ring may leave the search band; its remote branch
 * cannot veto the independently closed hole or become part of the perimeter.
 * This uses cached component points, never source pixels or guessed geometry.
 * @param {unknown} input @returns {{points:Point[],box:Box}|null} */
function isolateClosedSourceRing(input){
 if(!record(input)||!box(input.bounds)||!box(input.hint)||!Array.isArray(input.points)||types.isProxy(input.points)
  ||input.points.length>262144||Reflect.ownKeys(input.points).length!==input.points.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(input.points)).some(p=>!("value" in p)))throw new TypeError("Closed ring input is invalid");
 const bounds=input.bounds,hint=input.hint,{w,h}=bounds,area=w*h;
 if(![bounds.x,bounds.y,w,h].every(Number.isSafeInteger)||bounds.x+w>16384||bounds.y+h>16384
  ||hint.x+hint.w>16384||hint.y+hint.h>16384)throw new TypeError("Closed ring frame is invalid");
 if(area>262144||!input.points.length)return null;
 const ink=new Uint8Array(area),seen=new Uint8Array(area),queue=new Int32Array(area);
 /** @type {Map<number,Point>} */const originals=new Map();
 for(const p of input.points){
  if(!record(p)||typeof p.x!=="number"||typeof p.y!=="number"||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)
   ||p.x<bounds.x||p.y<bounds.y||p.x>=bounds.x+w||p.y>=bounds.y+h)throw new TypeError("Closed ring point is invalid");
  const n=(p.y-bounds.y)*w+p.x-bounds.x;if(ink[n])throw new TypeError("Closed ring point is duplicated");ink[n]=1;originals.set(n,/** @type {Point} */(p));
 }
 /** @param {number} n */const nexts=n=>{const x=n%w,y=Math.floor(n/w);return [x?n-1:-1,x<w-1?n+1:-1,y?n-w:-1,y<h-1?n+w:-1];};
 /** @type {number[]|null} */let hole=null;
 for(let seed=0;seed<area;seed++){
  if(ink[seed]||seen[seed])continue;seen[seed]=1;queue[0]=seed;let head=0,tail=1,touches=false,minX=w,minY=h,maxX=0,maxY=0;
  while(head<tail){const n=queue[head++]??0,x=n%w,y=Math.floor(n/w);
   touches ||=x===0||y===0||x===w-1||y===h-1;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   for(const next of nexts(n))if(next>=0&&!ink[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}
  }
  const hw=maxX-minX+1,hh=maxY-minY+1;
  if(!touches&&hw>=hint.w*.7&&hw<=hint.w*1.35&&hh>=hint.h*.55&&hh<=hint.h*1.6){
   if(hole)return null;hole=Array.from(queue.subarray(0,tail));
  }
 }
 if(!hole)return null;
 const widths=[];
 for(const n of hole)for(const adjacent of nexts(n)){
  if(adjacent<0||!ink[adjacent])continue;
  const dx=adjacent%w-n%w,dy=Math.floor(adjacent/w)-Math.floor(n/w);let length=0,x=adjacent%w,y=Math.floor(adjacent/w);
  while(x>=0&&y>=0&&x<w&&y<h&&ink[y*w+x]&&length<=8){length++;x+=dx;y+=dy;}
  if(length>0&&length<=8)widths.push(length);
 }
 if(widths.length<12)return null;widths.sort((a,b)=>a-b);const width=widths[Math.floor(widths.length*.5)]??0;
 // Median observed stroke width is a physical distance. Manhattan growth
 // truncates oblique corners and leaves ring cells falsely attached to a
 // neighboring shaft. Select only ORIGINAL ink within the same Euclidean
 // width of the proven hole; no dilation into background is authorized.
 const distance=sourceRingDistance(w,h,hole),points=[];let minX=Infinity,minY=Infinity,maxX=0,maxY=0;
 for(const [n,p]of originals){if((distance[n]??Infinity)>width*width)continue;points.push(p);
  minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);
 }
 return {points,box:{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}};
}
/** Preserve every traced micro-hole; permit only one exterior and one large
 * opposite-winding interior. Source JPEG pinholes cannot veto a real ring.
 * @param {ReturnType<typeof import("./native-mask-contours").traceNativeMaskContours>} segments */
function hasClosedRingTopology(segments){
 if(!segments)return false;
 /** @type {Point[][]} */const loops=[];/** @type {Point[]} */let current=[];
 for(const segment of segments){if(segment.type==="close"){loops.push(current);current=[];}else{const p=segment.points[0];if(p)current.push(p);}}
 const geometry=loops.map(points=>{let area=0,minX=1,minY=1,maxX=0,maxY=0;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(!a||!b)continue;area+=a.x*b.y-b.x*a.y;minX=Math.min(minX,a.x);minY=Math.min(minY,a.y);maxX=Math.max(maxX,a.x);maxY=Math.max(maxY,a.y);}
  return {area,w:maxX-minX,h:maxY-minY};});
 return geometry.filter(g=>g.area>0).length===1&&geometry.filter(g=>g.area<0&&g.w>=.7&&g.h>=.55).length===1;
}
/** A skipped raster core is unknown, never a source hole. Any retained cell
 * adjoining that core has a censored edge; tracing it as closed invents ink
 * topology. Inspect cached cells only, without extending the raster scan.
 * @param {unknown} input @returns {boolean} */
function ringTouchesUnobservedCore(input){
 if(!record(input)||!record(input.window)||!Array.isArray(input.points)||types.isProxy(input.points)
  ||input.points.length>262144||Reflect.ownKeys(input.points).length!==input.points.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(input.points)).some(p=>!("value" in p)))throw new TypeError("Observed ring boundary is invalid");
 const {x0,y0,x1,y1,margin}=input.window;
 if(![x0,y0,x1,y1,margin].every(v=>typeof v==="number"&&Number.isSafeInteger(v))
  ||Number(x0)<0||Number(y0)<0||Number(x1)>16384||Number(y1)>16384||Number(x1)<=Number(x0)||Number(y1)<=Number(y0)
  ||Number(margin)<1||Number(margin)>28)throw new TypeError("Observed ring frame is invalid");
 const left=Number(x0)+2*Number(margin),right=Number(x1)-2*Number(margin),top=Number(y0)+2*Number(margin),bottom=Number(y1)-2*Number(margin);
 let censored=false;
 for(const p of input.points){
  if(!record(p)||typeof p.x!=="number"||typeof p.y!=="number"||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)
   ||p.x<Number(x0)||p.x>=Number(x1)||p.y<Number(y0)||p.y>=Number(y1))throw new TypeError("Observed ring cell is invalid");
  if(right>left&&bottom>top&&(p.y>=top&&p.y<bottom&&(p.x===left-1||p.x===right)
   ||p.x>=left&&p.x<right&&(p.y===top-1||p.y===bottom)))censored=true;
 }
 return censored;
}
module.exports={isolateClosedSourceRing,hasClosedRingTopology,ringTouchesUnobservedCore};
