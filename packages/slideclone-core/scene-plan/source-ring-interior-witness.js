// @ts-check
"use strict";
const {types}=require('node:util');
const {record,list}=require('./source-scene-group-containment');
/** A thick source ring may have a small inner diameter. Prove its enclosed
 * colored face from already charged source cells instead of weakening the
 * legacy diameter test. No dilation, missing cells or glyph ownership.
 * @param {unknown} input */
function sourceRingInteriorWitness(input){
 return measureSourceRingInteriorWitness(input)!==null;
}
/** @param {unknown} input */
function measureSourceRingInteriorWitness(input){
 if(!record(input)||!record(input.raster)||!record(input.window)||!record(input.box)
  ||!list(input.points)||input.points.length>262144||!list(input.colors)||input.colors.length<1||input.colors.length>16
  ||!list(input.textMasks)||input.textMasks.length>10000)throw new TypeError('Ring interior witness controls are invalid');
 const {raster,window,box,points,colors,textMasks}=input;
 if(![raster.width,raster.height,window.x,window.y,box.x,box.y,box.w,box.h].every(v=>typeof v==='number'&&Number.isSafeInteger(v))
  ||Number(raster.width)<1||Number(raster.height)<1||Number(raster.width)*Number(raster.height)>262144
  ||Number(window.x)<0||Number(window.y)<0||Number(box.w)<1||Number(box.h)<1||Number(box.w)*Number(box.h)>262144
  ||Number(window.x)+Number(raster.width)>16384||Number(window.y)+Number(raster.height)>16384
  ||Number(box.x)<Number(window.x)||Number(box.y)<Number(window.y)
  ||Number(box.x)+Number(box.w)>Number(window.x)+Number(raster.width)
  ||Number(box.y)+Number(box.h)>Number(window.y)+Number(raster.height)
  ||types.isProxy(raster.rgba)||!types.isUint8Array(raster.rgba))throw new TypeError('Ring interior witness frame is invalid');
 const bytes=/** @type {Uint8Array} */(raster.rgba),proto=Object.getPrototypeOf(Uint8Array.prototype);
 const buffer=Reflect.get(proto,'buffer',bytes),length=Reflect.get(proto,'length',bytes);
 if(!types.isArrayBuffer(buffer)||length!==Number(raster.width)*Number(raster.height)*4
  ||colors.some(c=>!list(c)||c.length!==3||c.some(v=>typeof v!=='number'||!Number.isInteger(v)||v<0||v>255))
  ||textMasks.some(m=>!record(m)||![m.x,m.y,m.w,m.h].every(v=>typeof v==='number'&&Number.isFinite(v))
   ||Number(m.x)<0||Number(m.y)<0||Number(m.w)<=0||Number(m.h)<=0))throw new TypeError('Ring interior witness cells are invalid');
 const x=Number(box.x),y=Number(box.y),w=Number(box.w),h=Number(box.h),area=w*h;
 const relevant=textMasks.filter(m=>record(m)&&Number(m.x)<x+w&&Number(m.y)<y+h&&Number(m.x)+Number(m.w)>x&&Number(m.y)+Number(m.h)>y);
 if(relevant.length*area>2000000)return null;
 const wall=new Uint8Array(area),seen=new Uint8Array(area),queue=new Uint32Array(area);
 for(const p of points){
  if(!record(p)||typeof p.x!=='number'||typeof p.y!=='number'||!Number.isSafeInteger(p.x)||!Number.isSafeInteger(p.y)
   ||p.x<x||p.x>=x+w||p.y<y||p.y>=y+h)throw new TypeError('Ring interior witness point is invalid');
  const n=(p.y-y)*w+p.x-x;if(wall[n])throw new TypeError('Ring interior witness point is duplicated');wall[n]=1;
 }
 if(!points.length)return null;
 let holes=0;
 /** @type {number[]} */let enclosed=[];
 for(let seed=0;seed<area;seed++){
  if(wall[seed]||seen[seed])continue;
  let head=0,tail=1,touches=false,supported=0,owned=false;queue[0]=seed;seen[seed]=1;
  while(head<tail){
   const n=queue[head++];if(n===undefined)throw new TypeError('Ring interior witness traversal is invalid');
   const dx=n%w,dy=Math.floor(n/w),sx=x+dx,sy=y+dy;
   touches ||= dx===0||dy===0||dx===w-1||dy===h-1;
   owned ||= relevant.some(m=>record(m)&&sx>=Number(m.x)&&sx<Number(m.x)+Number(m.w)&&sy>=Number(m.y)&&sy<Number(m.y)+Number(m.h));
   const offset=((sy-Number(window.y))*Number(raster.width)+sx-Number(window.x))*4;
   if((bytes[offset+3]??0)>=240&&colors.some(c=>Array.isArray(c)&&c.every((v,k)=>Math.abs(Number(v)-(bytes[offset+k]??0))<=18)))supported++;
   for(const next of [dx?n-1:-1,dx<w-1?n+1:-1,dy?n-w:-1,dy<h-1?n+w:-1]){
    if(next<0||wall[next]||seen[next])continue;seen[next]=1;queue[tail++]=next;
   }
  }
  if(touches||tail<12)continue; // Preserve microholes in the original contour.
  if(owned||supported/tail<.82||++holes>1)return null;
  enclosed=Array.from(queue.subarray(0,tail));
 }
 if(holes!==1)return null;
 const cells=enclosed.map(n=>{const px=x+n%w,py=y+Math.floor(n/w),offset=((py-Number(window.y))*Number(raster.width)+px-Number(window.x))*4;
  return {x:px,y:py,alpha:bytes[offset+3]??0,rgb:[bytes[offset]??0,bytes[offset+1]??0,bytes[offset+2]??0]};});
 const rgb=[0,1,2].map(k=>cells.map(p=>p.rgb[k]??0).sort((a,b)=>a-b)[Math.floor(cells.length/2)]??0);
 const uniform=cells.every(p=>p.alpha>=240)&&cells.filter(p=>p.rgb.every((v,k)=>Math.abs(v-(rgb[k]??0))<=18)).length/cells.length>=.82;
 let left=Infinity,top=Infinity,right=0,bottom=0;for(const p of cells){left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}
 return {face:uniform?{points:cells.map(({x,y})=>({x,y})),box:{x:left,y:top,w:right-left+1,h:bottom-top+1},
  color:'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('')}:null};
}
module.exports={sourceRingInteriorWitness,measureSourceRingInteriorWitness};
