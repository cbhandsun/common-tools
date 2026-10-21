// @ts-check
'use strict';
const {readSceneFillRaster,sceneFillRasterReadCost}=require('./source-scene-fill-raster-cache');
const {record}=require('./source-scene-group-containment');
/** Read a complete construction window through bounded source-cache strips.
 * The 262144-cell per-read cap and shared 4M charge both remain unchanged.
 * Preflight the disjoint strips together, so an insufficient allowance cannot
 * publish a partial program or charge only its convenient successful faces.
 * @param {{width:number,height:number,rgba:Uint8Array}} image
 * @param {import('./source-scene-plan').Box} window @param {{used:number}} budget */
function primitiveSourceRaster(image,window,budget){
 if(!record(image)||!record(window)||Reflect.ownKeys(window).some(k=>typeof k!=='string'||!['x','y','w','h'].includes(k))
  ||![window.x,window.y,window.w,window.h].every(Number.isSafeInteger)||window.x<0||window.y<0||window.w<1||window.h<1
  ||window.w>16384||window.h>16384||window.w*window.h>40000000||window.x+window.w>image.width||window.y+window.h>image.height)
  throw new TypeError('Scene primitive raster window is invalid');
 const stripHeight=Math.max(1,Math.floor(262144/window.w));
 /** @type {import('./source-scene-plan').Box[]} */const windows=[];
 for(let y=window.y;y<window.y+window.h;y+=stripHeight)windows.push({...window,y,h:Math.min(stripHeight,window.y+window.h-y)});
 const cost=windows.reduce((total,b)=>total+sceneFillRasterReadCost(image,b,budget),0);
 if(budget.used+cost>4000000)return null;
 const rasters=windows.map(b=>readSceneFillRaster(image,b,budget));
 /** @param {number} x @param {number} y @returns {[number,number,number]|null} */
 const pixel=(x,y)=>{
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<window.x||y<window.y||x>=window.x+window.w||y>=window.y+window.h)return null;
  const index=Math.floor((y-window.y)/stripHeight),raster=rasters[index],strip=windows[index];
  if(!raster||!strip)throw new TypeError('Scene primitive raster binding is invalid');
  const at=((y-strip.y)*strip.w+x-strip.x)*4,a=raster.rgba[at+3],r=raster.rgba[at],g=raster.rgba[at+1],b=raster.rgba[at+2];
  return a!==undefined&&a>=240&&r!==undefined&&g!==undefined&&b!==undefined?[r,g,b]:null;
 };
 return {pixel};
}
module.exports={primitiveSourceRaster};
