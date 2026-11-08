// @ts-check
'use strict';
const {parseBandBackground}=require('./source-scene-band-geometry');
const {primitiveSourceRaster}=require('./source-scene-primitive-raster');
const {isolateClosedSourceCage}=require('./source-closed-cage');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{x:number,y:number}} Point */
/** @param {Point[]} points @param {Box} bounds */
function components(points,bounds){
 const pending=new Map(points.map(p=>[(p.y-bounds.y)*bounds.w+p.x-bounds.x,p]));
 /** @type {Point[][]} */const result=[];
 while(pending.size){const first=pending.entries().next().value;if(!first)break;
  const queue=[first[0]],component=[first[1]];pending.delete(first[0]);
  for(let i=0;i<queue.length;i++){const n=queue[i];if(n===undefined)throw new TypeError('Cage traversal is invalid');
   const x=n%bounds.w,y=Math.floor(n/bounds.w);
   for(const next of [x?n-1:-1,x<bounds.w-1?n+1:-1,y?n-bounds.w:-1,y<bounds.h-1?n+bounds.w:-1]){
    const p=pending.get(next);if(p){pending.delete(next);queue.push(next);component.push(p);}
   }
  }if(component.length>=12)result.push(component);
 }return result;
}
/** Observe the complete charged window, without granting any native receipt.
 * Both planning and compilation must use the same source/cache budget.
 * @param {unknown} input */
function observeSceneSourceCage(input){
 const {image,budget,textMasks,hint}=parseBandBackground(input);
 const x=Math.max(0,Math.floor(hint.x-12)),y=Math.max(0,Math.floor(hint.y-12)),
  bounds={x,y,w:Math.min(image.width,Math.ceil(hint.x+hint.w+12))-x,h:Math.min(image.height,Math.ceil(hint.y+hint.h+12))-y};
 if(bounds.w*bounds.h>262144)return {failure:'cage-native-capacity'};
 const raster=primitiveSourceRaster(image,bounds,budget);if(!raster)return {failure:'cage-source-budget'};
 /** @type {Point[]} */const points=[];
 for(let yy=y;yy<y+bounds.h;yy++)for(let xx=x;xx<x+bounds.w;xx++){
  const c=raster.pixel(xx,yy);if(c&&c[0]*.2126+c[1]*.7152+c[2]*.0722<132)points.push({x:xx,y:yy});
 }
 const cages=components(points,bounds).map(cells=>isolateClosedSourceCage({bounds,hint,points:cells})).filter(c=>c!==null);
 if(cages.length!==1||!cages[0])return {failure:'cage-source-isolation'};
 const cage=cages[0];
 // Unknown source cells and OCR intersections cannot support a topology change.
 // The compiler additionally validates actual generated faces and source paint.
 return {failure:/** @type {null} */(null),cage,raster,textMasks};
}
module.exports={observeSceneSourceCage};
