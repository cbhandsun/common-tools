// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('./source-scene-group-containment');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** A local dark ridge supplies an alternative source observation where a
 * single global background color loses a faint stroke. It grants no corner,
 * enclosure, fill, port or erasure authority. The caller must still certify
 * complete components, four rails, all turns, bounded gaps and OCR ownership.
 * Only the already charged, observed raster strips can supply pixels.
 * @param {unknown} input */
function createSourceFrameLocalRidge(input){
 const invalid=()=>{throw new TypeError('Scene frame ridge controls are invalid');};
 if(!record(input)||!record(input.hint)||!record(input.work)||types.isProxy(input.strips)||!Array.isArray(input.strips)
  ||input.strips.length<1||input.strips.length>4||!list(input.strips)
  ||![input.hint.x,input.hint.y,input.hint.w,input.hint.h].every(n=>typeof n==='number'&&Number.isFinite(n))
  ||Number(input.hint.x)<0||Number(input.hint.y)<0||Number(input.hint.w)<=0||Number(input.hint.h)<=0
  ||Number(input.hint.x)+Number(input.hint.w)>16384||Number(input.hint.y)+Number(input.hint.h)>16384
  ||typeof input.margin!=='number'||!Number.isInteger(input.margin)||input.margin<8||input.margin>28
  ||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0||Number(input.work.checks)>4000001
  ||typeof input.work.exhausted!=='boolean'||!['checks','exhausted'].every(k=>Object.getOwnPropertyDescriptor(input.work,k)?.writable===true))return invalid();
 const hint=/** @type {Box} */({...input.hint}),margin=input.margin;
 const work=/** @type {{checks:number,exhausted:boolean}} */(input.work),proto=Object.getPrototypeOf(Uint8Array.prototype);
 const strips=input.strips.map(row=>{
  if(!record(row)||!record(row.window)||!record(row.raster))return invalid();
  const b=row.window,r=row.raster;
  if(!['x','y','w','h'].every(k=>typeof b[k]==='number'&&Number.isSafeInteger(b[k]))
   ||Number(b.x)<0||Number(b.y)<0||Number(b.w)<=0||Number(b.h)<=0||Number(b.x)+Number(b.w)>16384||Number(b.y)+Number(b.h)>16384
   ||r.width!==b.w||r.height!==b.h||types.isProxy(r.rgba)||!types.isUint8Array(r.rgba))return invalid();
  const buffer=Reflect.get(proto,'buffer',r.rgba),offset=Reflect.get(proto,'byteOffset',r.rgba),length=Reflect.get(proto,'length',r.rgba);
  if(!types.isArrayBuffer(buffer)||length!==Number(b.w)*Number(b.h)*4||Number(b.w)*Number(b.h)>262144)return invalid();
  return {box:/** @type {Box} */({...b}),rgba:new Uint8Array(buffer,offset,length)};
 });
 if(strips.reduce((n,s)=>n+s.box.w*s.box.h,0)>262144)return invalid();
 const charge=()=>{if(work.exhausted)return false;if(++work.checks>4000000){work.exhausted=true;return false;}return true;};
 /** @param {number} x @param {number} y */
 const pixel=(x,y)=>{
  const strip=strips.find(s=>x>=s.box.x&&y>=s.box.y&&x<s.box.x+s.box.w&&y<s.box.y+s.box.h);
  if(!strip)return null;
  const i=((y-strip.box.y)*strip.box.w+x-strip.box.x)*4;
  const p=[0,1,2,3].map(c=>strip.rgba[i+c]??0);return p[3]!==undefined&&p[3]>=240?p:null;
 };
 /** @param {number} x @param {number} y */
 return (x,y)=>{
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>=16384||y>=16384)return false;
  if(!charge())return false;
  const p=pixel(x,y);if(!p)return false;
  const nearX=[hint.x,hint.x+hint.w].some(a=>Math.abs(x-a)<=margin),nearY=[hint.y,hint.y+hint.h].some(a=>Math.abs(y-a)<=margin);
  // Oblique normals are useful only near both measured proposal edges. They
  // do not scan a new window or allow an arbitrary interior texture to vote.
  for(const [dx,dy]of[[0,1],[1,0],[1,1],[1,-1]]){
   if(dx===undefined||dy===undefined)continue;
   if(dx&&dy?!(nearX&&nearY):dx?!nearX:!nearY)continue;
   let supported=true;
   for(const sign of[-1,1]){
    /** @type {number[][]} */const colors=[];
    for(const step of[3,4,5]){
     if(!charge())return false;
     const color=pixel(x+sign*step*dx,y+sign*step*dy);if(!color){supported=false;break;}colors.push(color);
    }
    if(!supported)break;
    const a=colors[0],b=colors[1],c=colors[2];if(!a||!b||!c)return false;
    const slopes=[0,1,2].map(k=>((c[k]??0)-(a[k]??0))/2);
    const noise=Math.max(...[0,1,2].map(k=>Math.abs((b[k]??0)-((a[k]??0)+(c[k]??0))/2)));
    if(noise>3||slopes.some(s=>Math.abs(s)>3)){supported=false;break;}
    const background=[0,1,2].map(k=>((a[k]??0)+(b[k]??0)+(c[k]??0))/3-(slopes[k]??0)*4);
    if(!background.every((v,k)=>v>=(p[k]??Infinity))||Math.max(...background.map((v,k)=>v-(p[k]??Infinity)))<Math.max(6,2*noise+2)){
     supported=false;break;
    }
   }
   if(supported)return true;
  }
  return false;
 };
}
module.exports={createSourceFrameLocalRidge};
