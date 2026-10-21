// @ts-check
"use strict";
const {types}=require('node:util');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** A search frame is geometry, never pixel ownership. The original component,
 * text-collision and crop-boundary checks must still run on its unmodified pixels.
 * @param {{width:number,height:number}} image @param {Box} seed @param {unknown} frame
 * @returns {Box} */
function sceneIconSearchWindow(image,seed,frame){
 if(frame===undefined){
  const padding=Math.max(2,Math.ceil(Math.min(seed.w,seed.h)*.35));
  const x=Math.max(0,Math.floor(seed.x-padding)),y=Math.max(0,Math.floor(seed.y-padding));
  return {x,y,w:Math.min(image.width,Math.ceil(seed.x+seed.w+padding))-x,h:Math.min(image.height,Math.ceil(seed.y+seed.h+padding))-y};
 }
 if(frame===null||typeof frame!=='object'||types.isProxy(frame)||Array.isArray(frame)
  ||![Object.prototype,null].includes(Object.getPrototypeOf(frame)))throw new TypeError('Scene icon search frame is invalid');
 const descriptors=Object.getOwnPropertyDescriptors(frame);
 if(Reflect.ownKeys(descriptors).length!==4||!['x','y','w','h'].every(k=>{
  const p=descriptors[k];return p&&'value'in p&&typeof p.value==='number'&&Number.isFinite(p.value);
 }))throw new TypeError('Scene icon search frame is invalid');
 const {x,y,w,h}=/** @type {Box} */(frame);
 if(x<0||y<0||w<=0||h<=0||x+w>image.width||y+h>image.height
  ||seed.x<x||seed.y<y||seed.x+seed.w>x+w||seed.y+seed.h>y+h)throw new RangeError('Scene icon search frame does not contain its seed');
 const left=Math.floor(x),top=Math.floor(y),width=Math.ceil(x+w)-left,height=Math.ceil(y+h)-top;
 if(width*height>262144)throw new RangeError('Scene icon search frame exceeds the window budget');
 return {x:left,y:top,w:width,h:height};
}
module.exports={sceneIconSearchWindow};
