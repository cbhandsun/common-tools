// @ts-check
"use strict";
/** Scan a window already validated and charged by the relation boundary.
 * Optional colors come only from private admitted node-body measurements;
 * they exclude paint using the existing 18-channel source color tolerance.
 * @param {{image:{width:number,height:number,rgba:Uint8Array},horizontal:boolean,lo:number,hi:number,axis:number,radius:number,background:number[],centerColor:boolean,bodyColors?:number[][],bodyPixels?:Set<number>}} input */
function sourceShaftProfile({image,horizontal,lo,hi,axis,radius,background,centerColor,bodyColors=[],bodyPixels}){
 /** @param {number} along @param {number} across */
 const pixel=(along,across)=>{const x=horizontal?along:across,y=horizontal?across:along,i=(y*image.width+x)*4;
  return [image.rgba[i]??0,image.rgba[i+1]??0,image.rgba[i+2]??0,image.rgba[i+3]??0];};
 /** @type {number[]} */const widths=[];
 /** @type {number[][]} */const colors=[];
 /** @type {(number|null)[]} */const centers=[];
 for(let along=lo;along<=hi;along++){
  let upper=axis,lower=axis;
  /** @param {number} across */
  const ink=across=>{const p=pixel(along,across),x=horizontal?along:across,y=horizontal?across:along;return (p[3]??0)>=240
   &&!bodyPixels?.has(y*image.width+x)
   &&bodyColors.every(color=>Math.max(...color.map((v,c)=>Math.abs(v-(p[c]??0))))>18)
   &&Math.max(...p.slice(0,3).map((v,c)=>Math.abs(v-(background[c]??0))))>=42;};
  if(!ink(axis)){widths.push(0);centers.push(null);continue;}
  while(upper>axis-radius&&ink(upper-1))upper--;
  while(lower<axis+radius&&ink(lower+1))lower++;
  if(upper===axis-radius||lower===axis+radius)return {widths,colors,centers,reason:"shaft-window-boundary"};
  const center=(upper+lower)/2;centers.push(center);widths.push(lower-upper+1);
  colors.push(pixel(along,centerColor?Math.round(center):axis).slice(0,3));
 }
 return {widths,colors,centers,reason:null};
}
module.exports={sourceShaftProfile};
