// @ts-check
'use strict';
const LIMIT=4000000;
/** @typedef {import('./source-route-core-backdrop').Field} Field
 * @typedef {import('./source-route-antialias-background').Raster} Raster
 * @typedef {import('./source-route-antialias-background').Box} Box */
/** Reuse only negative source evidence within one immutable observer. A prior
 * conflict grants no acceptance: its exact physical cell must still be inside
 * the new field and contradict that field's original row arithmetic. Source
 * cores remain excluded, just as in the full exterior verifier.
 * @param {{image:Raster,window:Box,component:Uint8Array,blocked:Uint8Array,halo:Uint8Array,work:{checks:number},
 * colorAt:(field:Field,x:number,y:number)=>number[]}} input */
function createCoreBackgroundConflicts({image,window,component,blocked,halo,work,colorAt}){
 if(![image.width,image.height,window.x,window.y,window.w,window.h].every(Number.isSafeInteger)
  ||image.width<1||image.height<1||window.x<0||window.y<0||window.w<1||window.h<1
  ||window.x+window.w>image.width||window.y+window.h>image.height
  ||!Number.isSafeInteger(image.width*image.height*4)||image.rgba.length!==image.width*image.height*4
  ||[component,blocked,halo].some(mask=>mask.length!==window.w*window.h))throw new RangeError('Background conflict dimensions are invalid');
 if(typeof colorAt!=='function')throw new TypeError('Background conflict predictor is invalid');
 /** @type {number[]} */const cells=[];
 /** @param {number} count */const charge=count=>{
  if(!Number.isSafeInteger(work.checks)||work.checks<0)throw new RangeError('Background conflict budget is invalid');
  work.checks+=count;return work.checks<=LIMIT;
 };
 return {
  /** Called only after the full verifier finds a hard source refusal.
   * @param {number} cell */
  remember(cell){
   if(!Number.isSafeInteger(cell)||cell<0||cell>=component.length)throw new RangeError('Background conflict cell is invalid');
   if(!charge(10)||cells.includes(cell))return;
   const offset=((window.y+Math.floor(cell/window.w))*image.width+window.x+cell%window.w)*4;
   if(component[cell]&&!blocked[cell]&&image.rgba[offset+3]===255)return;
   cells.unshift(cell);if(cells.length>8)cells.pop();
  },
  /** @param {{field:Field,radius:number,verticalRadius:number}} query */
  rejects({field,radius,verticalRadius}){
   if(![field.cx,field.cy,radius,verticalRadius].every(Number.isSafeInteger)||radius<3||verticalRadius<3
    ||field.cx-radius<0||field.cy-verticalRadius<0||field.cx+radius>=window.w||field.cy+verticalRadius>=window.h
    ||field.flank!==radius-2||field.verticalFlank!==verticalRadius-2||field.corners.length!==4
    ||[0,1,2,3].some(i=>{const corner=field.corners[i];return !corner||corner.length!==3
     ||[0,1,2].some(c=>!Number.isFinite(corner[c])||(corner[c]??-1)<0||(corner[c]??256)>255);}))
    throw new RangeError('Background conflict field is invalid');
   for(let i=0;i<cells.length;i++){
    if(!charge(1))return false;
    const n=cells[i]??-1,x=n%window.w,y=Math.floor(n/window.w);
    if(x<field.cx-radius||x>field.cx+radius||y<field.cy-verticalRadius||y>field.cy+verticalRadius)continue;
    if(!charge(2))return false;
    const offset=((window.y+y)*image.width+window.x+x)*4;
    if(blocked[n]||image.rgba[offset+3]!==255){
     if(!charge(8))return false;cells.splice(i,1);cells.unshift(n);return true;
    }
    if(!charge(85))return false;
    const left=colorAt(field,field.cx-radius,y),right=colorAt(field,field.cx+radius,y);
    const step=right.map((value,c)=>(value-(left[c]??0))/(2*radius));
    const delta=left.map((value,c)=>Math.abs((image.rgba[offset+c]??0)-(value+(step[c]??0)*(x-(field.cx-radius)))));
    if(halo[n]?delta.some(value=>value>=42):delta.some(value=>value>18)){
     if(!charge(8))return false;cells.splice(i,1);cells.unshift(n);return true;
    }
   }
   return false;
  }
 };
}
module.exports={createCoreBackgroundConflicts};
