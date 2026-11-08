// @ts-check
'use strict';
const {record,list,box:validBox}=require('./source-scene-group-containment');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{x:number,y:number}} Point */
/** Isolate measured ink around a complete multi-face source cage. This is a
 * separate representation from a single-hole ring; it does not relax ring
 * admission or infer missing dividers. Remote attached branches are excluded.
 * Input cells must already be observed on the caller's charged source window.
 * No returned data grants glyph, paint, port or group ownership.
 * @param {unknown} input @returns {{points:Point[],box:Box,holes:Box[]}|null} */
function isolateClosedSourceCage(input){
 if(!record(input)||Reflect.ownKeys(input).some(k=>typeof k!=='string'||!['bounds','hint','points'].includes(k))
  ||!validBox(input.bounds)||!validBox(input.hint)||!list(input.points)||input.points.length>262144)
  throw new TypeError('Closed cage input is invalid');
 const bounds=input.bounds,hint=input.hint;
 if([bounds,hint].some(b=>Reflect.ownKeys(b).some(k=>typeof k!=='string'||!['x','y','w','h'].includes(k))))
  throw new TypeError('Closed cage frame is invalid');
 if(![bounds.x,bounds.y,bounds.w,bounds.h].every(Number.isSafeInteger)||bounds.x+bounds.w>16384||bounds.y+bounds.h>16384
  ||hint.x+hint.w>16384||hint.y+hint.h>16384)throw new TypeError('Closed cage frame is invalid');
 const {w,h}=bounds,area=w*h;if(area>262144||!input.points.length)return null;
 const ink=new Uint8Array(area),seen=new Uint8Array(area),queue=new Int32Array(area);
 /** @type {Map<number,Point>} */const originals=new Map();
 for(const point of input.points){
  if(!record(point)||Reflect.ownKeys(point).some(k=>typeof k!=='string'||!['x','y'].includes(k))
   ||typeof point.x!=='number'||typeof point.y!=='number'||!Number.isSafeInteger(point.x)||!Number.isSafeInteger(point.y)
   ||point.x<bounds.x||point.y<bounds.y||point.x>=bounds.x+w||point.y>=bounds.y+h)throw new TypeError('Closed cage cell is invalid');
  const n=(point.y-bounds.y)*w+point.x-bounds.x;if(ink[n])throw new TypeError('Closed cage cell is duplicated');
  ink[n]=1;originals.set(n,{x:point.x,y:point.y});
 }
 /** @param {number} n */const nexts=n=>{const x=n%w,y=Math.floor(n/w);return [x?n-1:-1,x<w-1?n+1:-1,y?n-w:-1,y<h-1?n+w:-1];};
 /** @type {{cells:number[],box:Box}[]} */const holes=[];
 for(let seed=0;seed<area;seed++){
  if(ink[seed]||seen[seed])continue;seen[seed]=1;queue[0]=seed;
  let head=0,tail=1,touches=false,minX=w,minY=h,maxX=0,maxY=0;
  while(head<tail){const n=queue[head++];if(n===undefined)throw new TypeError('Closed cage traversal is invalid');
   const x=n%w,y=Math.floor(n/w);touches ||=x===0||y===0||x===w-1||y===h-1;
   minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   for(const next of nexts(n))if(next>=0&&!ink[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}
  }
  if(touches||tail<12||maxX-minX+1<hint.w*.1||maxY-minY+1<hint.h*.05)continue;
  if(holes.length>=16)return null;
  holes.push({cells:Array.from(queue.subarray(0,tail)),box:{x:bounds.x+minX,y:bounds.y+minY,w:maxX-minX+1,h:maxY-minY+1}});
 }
 if(holes.length<2)return null;
 const minX=Math.min(...holes.map(v=>v.box.x)),minY=Math.min(...holes.map(v=>v.box.y)),
  maxX=Math.max(...holes.map(v=>v.box.x+v.box.w)),maxY=Math.max(...holes.map(v=>v.box.y+v.box.h));
 if(maxX-minX<hint.w*.7||maxX-minX>hint.w*1.35||maxY-minY<hint.h*.55||maxY-minY>hint.h*1.6)return null;
 const seeds=new Set(),widths=[];
 for(const hole of holes)for(const n of hole.cells)for(const adjacent of nexts(n)){
  if(adjacent<0||!ink[adjacent])continue;seeds.add(adjacent);
  const dx=adjacent%w-n%w,dy=Math.floor(adjacent/w)-Math.floor(n/w);
  let length=0,x=adjacent%w,y=Math.floor(adjacent/w);
  while(x>=0&&y>=0&&x<w&&y<h&&ink[y*w+x]&&length<=8){length++;x+=dx;y+=dy;}
  if(length>0&&length<=8)widths.push(length);
 }
 if(widths.length<12)return null;widths.sort((a,b)=>a-b);const width=widths[Math.floor(widths.length/2)];if(!width)return null;
 const distance=new Uint8Array(area);let head=0,tail=0;
 for(const seed of seeds){queue[tail++]=seed;distance[seed]=1;}
 /** @type {Point[]} */const points=[];
 while(head<tail){const n=queue[head++];if(n===undefined)throw new TypeError('Closed cage traversal is invalid');
  const point=originals.get(n);if(!point)throw new TypeError('Closed cage ownership is invalid');points.push(point);
  if((distance[n]??0)>=width)continue;
  for(const next of nexts(n))if(next>=0&&ink[next]&&!distance[next]){distance[next]=(distance[n]??0)+1;queue[tail++]=next;}
 }
 // Require all holes to belong to one physically connected ink cage. Two
 // unrelated rings cannot acquire a shared silhouette or grouping receipt.
 const retained=new Set(points.map(p=>(p.y-bounds.y)*w+p.x-bounds.x)),first=retained.values().next().value;
 if(first===undefined)return null;const connected=[first];retained.delete(first);
 for(let i=0;i<connected.length;i++){const n=connected[i];if(n===undefined)throw new TypeError('Closed cage traversal is invalid');
  for(const next of nexts(n))if(next>=0&&retained.delete(next))connected.push(next);
 }
 if(retained.size)return null;
 let x=Infinity,y=Infinity,right=0,bottom=0;
 for(const point of points){x=Math.min(x,point.x);y=Math.min(y,point.y);right=Math.max(right,point.x);bottom=Math.max(bottom,point.y);}
 return {points,box:{x,y,w:right-x+1,h:bottom-y+1},holes:holes.map(v=>({...v.box}))};
}
module.exports={isolateClosedSourceCage};
